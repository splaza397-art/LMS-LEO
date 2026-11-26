// Fase 5 (etapa 5.5): pruebas negativas de autorización. La API decide con el token y la base de datos, no con lo que
// muestre la interfaz: identificadores manipulados (IDOR/BOLA), escalamiento vertical y horizontal, acceso directo a
// endpoints y recursos de otro programa o de otra persona. Solo cuentas demo y una cuenta ficticia creada aquí.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { API, bff, newAccount, session, sql } from "./helpers";

const OTHER_PROGRAM_SLUG = "inter-comunicaciones"; // el coordinador demo solo tiene "base-de-datos"
const OTHER_COURSE = 4; // curso de inter-comunicaciones

let otherApplicant: { id: string; applicationId: string };

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  // Aspirante ficticio con una solicitud en un programa que NO es del coordinador.
  const account = await newAccount(browser, "rbacotro");
  const programs = await (await account.page.request.get(`${API}/programs`)).json();
  const program = programs.find((p: { slug: string }) => p.slug === OTHER_PROGRAM_SLUG);
  expect((await bff(account.page, "POST", "me/applications", { programId: program.id })).status).toBe(201);
  otherApplicant = {
    id: account.id,
    applicationId: sql("portal", `select id from applications where user_id = '${account.id}'`),
  };
  await account.page.context().close();
});

async function as(browser: Browser, who: string): Promise<Page> {
  return session(browser, who, who === "aspirante" || who === "estudiante" || who === "profesor" ? "/mi-iinicia" : "/admin");
}

test("coordinador: no decide, no ve ni modifica nada de otro programa (BOLA)", async ({ browser }) => {
  const page = await as(browser, "coordinador");
  const otherProgram = sql("portal", `select id from programs where slug = '${OTHER_PROGRAM_SLUG}'`);
  expect((await bff(page, "POST", `admin/applications/${otherApplicant.applicationId}/decision`, { decision: "admitida" })).status, "decisión en otro programa").toBe(403);
  expect((await bff(page, "PUT", `admin/programs/${otherProgram}`, { name: "x" })).status, "editar otro programa").toBeGreaterThanOrEqual(400);
  expect((await bff(page, "GET", `admin/programs/${otherProgram}/teachers`)).status, "profesores de otro programa").toBe(403);
  // Las matrículas se filtran por el ámbito del coordinador (mismo criterio que sus listas): 403 o lista vacía, nunca datos.
  const enrolments = await bff(page, "GET", `admin/users/${otherApplicant.id}/enrolments`);
  expect([200, 403], "matrículas de alguien de otro programa").toContain(enrolments.status);
  if (enrolments.status === 200) expect(enrolments.body, "sin datos de otro programa").toEqual([]);
  const list = await bff(page, "GET", `admin/applications?programId=${otherProgram}&page=1&pageSize=50`);
  expect([200, 403]).toContain(list.status);
  if (list.status === 200) expect(list.body.items.some((a: { id: string }) => a.id === otherApplicant.applicationId), "no aparece en sus listas").toBe(false);
  expect(sql("portal", `select status from applications where id = '${otherApplicant.applicationId}'`), "la solicitud sigue intacta").not.toBe("admitida");
  await page.context().close();
});

test("coordinador y administrador académico no cambian roles (escalamiento vertical)", async ({ browser }) => {
  const student = sql("portal", "select id from users where email = 'estudiante@iinicia.test'");
  for (const who of ["coordinador", "academico", "soporte"]) {
    const page = await as(browser, who);
    expect((await bff(page, "PUT", `admin/users/${student}/roles`, { roles: ["superadmin"] })).status, who).toBe(403);
    await page.context().close();
  }
  expect(sql("portal", `select string_agg(role, ',') from user_roles where user_id = '${student}'`)).toBe("estudiante");
});

test("soporte consulta sin privilegios de cambio", async ({ browser }) => {
  const page = await as(browser, "soporte");
  const student = sql("portal", "select id from users where email = 'estudiante@iinicia.test'");
  expect((await bff(page, "GET", "admin/users?page=1&pageSize=5")).status).toBe(200);
  for (const [method, path, body] of [
    ["PATCH", `admin/users/${student}/suspension`, { suspended: true }],
    ["POST", `admin/users/${student}/sync`, undefined],
    ["PATCH", `admin/users/${student}/enrolment`, { programId: sql("portal", "select id from programs limit 1"), active: false }],
    ["POST", "admin/notifications", { userId: student, title: "x", body: "x" }],
    ["GET", "admin/audit", undefined],
    ["POST", `admin/users/${student}/sessions/revoke`, undefined],
  ] as const) {
    expect((await bff(page, method, path, body)).status, `${method} ${path}`).toBe(403);
  }
  expect(sql("portal", `select status from users where id = '${student}'`)).not.toBe("suspendido");
  await page.context().close();
});

test("estudiante y profesor: solo sus propios cursos aunque manipulen identificadores (IDOR)", async ({ browser }) => {
  for (const who of ["estudiante", "profesor"]) {
    const page = await as(browser, who);
    expect((await bff(page, "GET", `me/courses/${OTHER_COURSE}`)).status, `${who}: curso ajeno`).toBeGreaterThanOrEqual(403);
    expect((await bff(page, "GET", `me/campus-link?courseId=${OTHER_COURSE}`)).status, `${who}: campus de un curso ajeno`).toBe(403);
    expect((await bff(page, "GET", "me/campus-link?cmid=999999")).status, `${who}: actividad inexistente`).toBe(403);
    expect((await bff(page, "GET", "admin/users")).status, `${who}: panel administrativo`).toBe(403);
    await page.context().close();
  }
});

test("estudiante: no se asigna roles ni cambia su estado al editar su perfil (escalamiento horizontal y vertical)", async ({ browser }) => {
  const page = await as(browser, "estudiante");
  for (const extra of [{ roles: ["superadmin"] }, { status: "activo" }, { email: "otro@ejemplo.test" }, { id: "00000000-0000-4000-8000-000000000000" }]) {
    expect((await bff(page, "PATCH", "me", { firstName: "Demo", lastName: "Estudiante", ...extra })).status, JSON.stringify(extra)).toBe(400);
  }
  expect((await bff(page, "GET", "me")).body.email).toBe("estudiante@iinicia.test");
  await page.context().close();
});

test("aspirante: sin acceso académico ni administrativo", async ({ browser }) => {
  const page = await as(browser, "aspirante");
  expect((await bff(page, "GET", "me/campus-link")).status).toBe(403);
  expect((await bff(page, "GET", "me/courses")).body, "sin cursos").toEqual([]);
  expect((await bff(page, "GET", `me/courses/${OTHER_COURSE}`)).status).toBeGreaterThanOrEqual(403);
  for (const path of ["admin/users", "admin/applications", "admin/reports", "me/teaching"]) {
    const res = await bff(page, "GET", path);
    if (path === "me/teaching") expect(res.body, "sin grupos a cargo").toEqual([]);
    else expect(res.status, path).toBe(403);
  }
  await page.context().close();
});

test("acceso directo a la API sin sesión o con un token ajeno al realm", async ({ request }) => {
  for (const path of ["me", "me/courses", "admin/users", "admin/audit"]) {
    expect((await request.get(`${API}/${path}`)).status(), path).toBe(401);
    expect((await request.get(`${API}/${path}`, { headers: { authorization: "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0." } })).status(), `${path} con alg none`).toBe(401);
  }
});
