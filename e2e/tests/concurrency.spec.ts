// Regresión del defecto I1 (auditoría): sincronizaciones simultáneas no deben duplicar cuentas, cohortes ni matrículas.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { bff, newAccount, session, sql } from "./helpers";

const WS = "http://localhost:8081/webservice/rest/server.php";
const PARALLEL = 8;

/** Llamada directa al servicio web de Moodle con el token del backend (solo en el entorno local de pruebas). */
async function ws(request: APIRequestContext, wsfunction: string, params: Record<string, string>) {
  const response = await request.post(WS, {
    form: { wstoken: process.env.MOODLE_WS_TOKEN!, wsfunction, moodlewsrestformat: "json", ...params },
  });
  return response.json();
}

const course = () => sql("moodle", "select id from mdl_course where shortname = 'BD-101'");

test("Moodle: llamadas simultáneas crean una sola cuenta, una sola cohorte y una sola matrícula", async ({ request }) => {
  const uuid = randomUUID();
  const sub = randomUUID();
  const email = `concurrencia.${Date.now()}@iinicia.test`;

  const users = await Promise.all(Array.from({ length: PARALLEL }, () => ws(request, "local_iinicia_upsert_user", {
    uuid, oidcsub: sub, email, firstname: "Prueba", lastname: "Concurrencia", suspended: "0",
  })));
  // Todas las llamadas deben terminar bien (antes, las perdedoras fallaban con un error de clave duplicada).
  for (const u of users) expect(u, JSON.stringify(u)).toHaveProperty("moodleuserid");
  const userId = String(users[0].moodleuserid);
  expect(new Set(users.map((u) => u.moodleuserid)).size).toBe(1);
  expect(users.filter((u) => u.created)).toHaveLength(1);
  expect(sql("moodle", `select count(*) from mdl_user where idnumber = '${uuid}' and deleted = 0`)).toBe("1");

  const cohortId = randomUUID();
  const cohorts = await Promise.all(Array.from({ length: PARALLEL }, () => ws(request, "local_iinicia_set_cohort_member", {
    idnumber: cohortId, name: `Gen ${Date.now()}`, userid: userId, active: "1",
  })));
  for (const c of cohorts) expect(c, JSON.stringify(c)).toHaveProperty("cohortid");
  expect(new Set(cohorts.map((c) => c.cohortid)).size).toBe(1);
  expect(sql("moodle", `select count(*) from mdl_cohort where idnumber = '${cohortId}'`)).toBe("1");
  expect(sql("moodle", `select count(*) from mdl_cohort_members m join mdl_cohort c on c.id = m.cohortid where c.idnumber = '${cohortId}'`)).toBe("1");

  const enrolments = await Promise.all(Array.from({ length: PARALLEL }, () => ws(request, "local_iinicia_set_enrolment", {
    userid: userId, courseid: course(), role: "student", active: "1",
  })));
  for (const e of enrolments) expect(e, JSON.stringify(e)).toHaveProperty("enrolled", true);
  expect(sql("moodle", `select count(*) from mdl_user_enrolments ue join mdl_enrol e on e.id = ue.enrolid where ue.userid = ${userId} and e.courseid = ${course()}`)).toBe("1");
});

test("backend: admisión y sincronizaciones manuales simultáneas dejan una sola cohorte y una sola matrícula", async ({ browser }) => {
  const stamp = Date.now();
  const academic = await session(browser, "academico", "/admin");
  const root = await session(browser, "superadmin", "/admin");
  const { body: program } = await bff(academic, "POST", "admin/programs", {
    slug: `cohorte-${stamp}`, name: `Cohorte ${stamp}`, level: "curso", summary: "Programa para probar concurrencia.", published: true,
  });
  expect((await bff(academic, "POST", `admin/programs/${program.id}/courses`, { moodleCourseId: Number(course()) })).status).toBe(201);
  const { body: cohort } = await bff(academic, "POST", `admin/programs/${program.id}/cohorts`, { name: `Gen ${stamp}` });

  const student = await newAccount(browser, "alumno");
  const { body: application } = await bff(student.page, "POST", "me/applications", { programId: program.id });

  // La admisión y varias sincronizaciones manuales compiten por la misma persona.
  const [decision, ...syncs] = await Promise.all([
    bff(academic, "POST", `admin/applications/${application.id}/decision`, { decision: "admitida", cohortId: cohort.id }),
    ...Array.from({ length: 4 }, () => bff(root, "POST", `admin/users/${student.id}/sync`)),
  ]);
  expect(decision.status).toBe(201);
  for (const s of syncs) expect(s.status).toBe(201);

  // Una sincronización final converge al estado correcto aunque alguna anterior hubiera esperado o fallado.
  expect((await bff(root, "POST", `admin/users/${student.id}/sync`)).body.synced).toBe(true);

  const moodleUser = sql("moodle", `select id from mdl_user where idnumber = '${student.id}' and deleted = 0`);
  expect(moodleUser.split("\n")).toHaveLength(1);
  expect(sql("moodle", `select count(*) from mdl_cohort where idnumber = '${cohort.id}'`)).toBe("1");
  expect(sql("moodle", `select count(*) from mdl_cohort_members m join mdl_cohort c on c.id = m.cohortid where m.userid = ${moodleUser} and c.idnumber = '${cohort.id}'`)).toBe("1");
  expect(sql("moodle", `select count(*) from mdl_user_enrolments ue join mdl_enrol e on e.id = ue.enrolid where ue.userid = ${moodleUser} and e.courseid = ${course()}`)).toBe("1");
  expect(sql("portal", `select moodle_sync_status from users where id = '${student.id}'`)).toBe("synced");
});
