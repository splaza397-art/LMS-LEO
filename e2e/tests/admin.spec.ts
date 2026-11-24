// Flujos del panel, comprobando el resultado real dentro de Moodle.
import { expect, test } from "@playwright/test";
import { bff, newAccount, PNG, session, sql } from "./helpers";

const COURSE = () => Number(sql("moodle", "select id from mdl_course where shortname = 'BD-101'"));
const moodleId = (uuid: string) => sql("moodle", `select id from mdl_user where idnumber = '${uuid}' and deleted = 0`);
const hasCourseRole = (userId: string, role: string, course: number) => sql("moodle", `
  select count(*) from mdl_role_assignments ra join mdl_role r on r.id = ra.roleid join mdl_context c on c.id = ra.contextid
   where ra.userid = ${userId} and r.shortname = '${role}' and c.contextlevel = 50 and c.instanceid = ${course}`);

test("panel: crear programa, cohorte, vincular curso y asignar profesor desde la interfaz", async ({ browser }) => {
  const stamp = Date.now();
  const name = `Programa E2E ${stamp}`;
  const teacher = await newAccount(browser, "profesor");
  const root = await session(browser, "superadmin", "/admin");
  expect((await bff(root, "PUT", `admin/users/${teacher.id}/roles`, { roles: ["profesor"] })).status).toBe(200);
  const teacherMoodle = moodleId(teacher.id);
  expect(teacherMoodle, "dar el rol crea la cuenta Moodle").not.toBe("");

  await root.getByRole("tab", { name: "Programas" }).click();
  await root.getByRole("button", { name: "Nuevo programa" }).click();
  await root.getByLabel("Nombre", { exact: true }).first().fill(name);
  await root.getByLabel("Ruta (slug)").fill(`programa-e2e-${stamp}`);
  await root.getByLabel("Resumen").fill("Programa creado por la prueba automática.");
  await root.getByLabel("Publicado en el portal").check();
  await root.getByRole("button", { name: "Guardar programa" }).click();

  const card = root.getByRole("listitem").filter({ has: root.getByRole("heading", { name }) });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByLabel("Vincular curso").selectOption({ label: "Base de Datos" });
  await expect(card.getByRole("button", { name: "Desvincular" })).toBeVisible({ timeout: 15_000 });
  await card.getByLabel("Nombre", { exact: true }).fill("Generación E2E");
  await card.getByRole("button", { name: "Crear cohorte" }).click();
  await expect(card.getByText("Generación E2E")).toBeVisible({ timeout: 10_000 });

  await card.getByLabel(/^Profesor para/).selectOption({ label: `Prueba profesor (${teacher.email})` });
  await card.getByLabel(/^Curso del profesor/).selectOption({ label: "Base de Datos" });
  await card.getByRole("button", { name: "Asignar profesor" }).click();
  await expect(card.getByText("Prueba profesor · Base de Datos")).toBeVisible({ timeout: 30_000 });
  expect(hasCourseRole(teacherMoodle, "editingteacher", COURSE())).toBe("1");

  await teacher.page.goto("/mi-iinicia");
  await expect(teacher.page.getByRole("heading", { name: "Mis grupos" })).toBeVisible({ timeout: 20_000 });
  await expect(teacher.page.getByRole("heading", { name: "Base de Datos", exact: true })).toBeVisible();
});

test("admisión con cohorte, idempotencia y suspensión sin perder historial", async ({ browser }) => {
  const stamp = Date.now();
  const root = await session(browser, "academico", "/admin");
  const { body: program } = await bff(root, "POST", "admin/programs", {
    slug: `cohorte-${stamp}`, name: `Cohorte ${stamp}`, level: "curso", summary: "Programa para probar cohortes.", published: true,
  });
  const course = COURSE();
  expect((await bff(root, "POST", `admin/programs/${program.id}/courses`, { moodleCourseId: course })).status).toBe(201);
  const { body: cohort } = await bff(root, "POST", `admin/programs/${program.id}/cohorts`, { name: `Gen ${stamp}` });

  const student = await newAccount(browser, "alumno");
  const { body: application } = await bff(student.page, "POST", "me/applications", { programId: program.id });
  const first = await bff(root, "POST", `admin/applications/${application.id}/decision`, { decision: "admitida", cohortId: cohort.id });
  expect(first.body.moodleSynced).toBe(true);
  const second = await bff(root, "POST", `admin/applications/${application.id}/decision`, { decision: "admitida", cohortId: cohort.id });
  expect(second.body.moodleSynced).toBe(true);

  const id = moodleId(student.id);
  expect(id.split("\n")).toHaveLength(1);
  expect(sql("moodle", `select count(*) from mdl_user_enrolments ue join mdl_enrol e on e.id = ue.enrolid where ue.userid = ${id} and e.courseid = ${course}`)).toBe("1");
  expect(sql("moodle", `select count(*) from mdl_cohort_members m join mdl_cohort c on c.id = m.cohortid where m.userid = ${id} and c.idnumber = '${cohort.id}'`)).toBe("1");

  // Suspender matricula
  expect((await bff(root, "PATCH", `admin/users/${student.id}/enrolment`, { courseId: course, active: false })).body.moodleSynced).toBe(true);
  expect(sql("moodle", `select ue.status from mdl_user_enrolments ue join mdl_enrol e on e.id = ue.enrolid where ue.userid = ${id} and e.courseid = ${course}`)).toBe("1");
  expect((await bff(student.page, "GET", "me/courses")).body).toEqual([]);
  expect((await bff(root, "PATCH", `admin/users/${student.id}/enrolment`, { courseId: course, active: true })).body.moodleSynced).toBe(true);
  expect((await bff(student.page, "GET", "me/courses")).body).toHaveLength(1);

  // Suspender cuenta: aplica de inmediato en portal y Moodle, y se puede revertir.
  expect((await bff(root, "PATCH", `admin/users/${student.id}/suspension`, { suspended: true })).status).toBe(200);
  expect((await bff(student.page, "GET", "me")).status).toBe(403);
  expect(sql("moodle", `select suspended from mdl_user where id = ${id}`)).toBe("1");
  expect((await bff(root, "PATCH", `admin/users/${student.id}/suspension`, { suspended: false })).status).toBe(200);
  expect(sql("moodle", `select suspended from mdl_user where id = ${id}`)).toBe("0");
});

test("roles en Moodle: administrador académico es manager y coordinador supervisa su programa", async ({ browser }) => {
  const account = await newAccount(browser, "rolmoodle");
  const root = await session(browser, "superadmin");
  const programs = (await bff(root, "GET", "admin/programs")).body;
  const program = programs.find((p: { slug: string }) => p.slug === "base-de-datos");
  const manager = () => sql("moodle", `select count(*) from mdl_role_assignments ra join mdl_role r on r.id = ra.roleid
    join mdl_context c on c.id = ra.contextid where ra.userid = ${moodleId(account.id)} and r.shortname = 'manager' and c.contextlevel = 10`);

  expect((await bff(root, "PUT", `admin/users/${account.id}/roles`, { roles: ["admin_academico"] })).status).toBe(200);
  expect(manager()).toBe("1");
  expect((await bff(root, "PUT", `admin/users/${account.id}/roles`, { roles: ["coordinador"], programId: program.id })).status).toBe(200);
  expect(manager()).toBe("0");
  expect(hasCourseRole(moodleId(account.id), "teacher", COURSE())).toBe("1");
  expect((await bff(root, "PUT", `admin/users/${account.id}/roles`, { roles: ["soporte"] })).status).toBe(200);
  expect(sql("moodle", `select ue.status from mdl_user_enrolments ue join mdl_enrol e on e.id = ue.enrolid where ue.userid = ${moodleId(account.id)} and e.courseid = ${COURSE()}`)).toBe("1");
});

test("CMS: formato, imagen, publicación, HTML neutralizado y eliminación", async ({ browser }) => {
  const stamp = Date.now();
  const slug = `noticia-e2e-${stamp}`;
  const admin = await session(browser, "academico", "/admin");
  await admin.getByRole("tab", { name: "Contenidos" }).click();
  await admin.getByRole("button", { name: "Nuevo contenido" }).click();
  await admin.getByLabel("Estado").selectOption("publicado");
  await admin.getByLabel("Título", { exact: true }).fill(`Noticia E2E ${stamp}`);
  await admin.getByLabel("Ruta (slug)").fill(slug);
  await admin.getByLabel("Resumen").fill("Resumen de la noticia.");
  await admin.getByLabel("Imagen principal").setInputFiles({ name: "portada.png", mimeType: "image/png", buffer: PNG });
  await expect(admin.getByText("Imagen cargada")).toBeVisible({ timeout: 15_000 });
  await admin.getByRole("textbox", { name: "Contenido" }).fill(
    `## Subtítulo\n\nTexto **importante** con [enlace](https://example.org).\n\n- uno\n- dos\n\n<img src=x onerror="window.__xss=1">\n\n[malo](javascript:window.__xss=1)`,
  );
  await admin.getByRole("button", { name: "Vista previa" }).click();
  await expect(admin.getByRole("heading", { name: "Subtítulo" })).toBeVisible();
  await admin.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(admin.getByRole("cell", { name: `Noticia E2E ${stamp}`, exact: true })).toBeVisible({ timeout: 15_000 });

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/noticias/${slug}`);
  await expect(visitor.getByRole("heading", { name: "Subtítulo", level: 2 })).toBeVisible();
  await expect(visitor.locator("strong", { hasText: "importante" })).toBeVisible();
  await expect(visitor.getByRole("listitem").filter({ hasText: "dos" })).toBeVisible();
  const cover = visitor.locator("main img").first();
  await expect.poll(() => cover.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
  expect(await visitor.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(visitor.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(visitor).toHaveTitle(new RegExp(`Noticia E2E ${stamp}`));

  const row = admin.getByRole("row", { name: new RegExp(`Noticia E2E ${stamp}`) });
  await row.getByRole("button", { name: "Eliminar" }).click();
  await row.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(row).toHaveCount(0, { timeout: 10_000 });
  expect((await visitor.request.get(`/noticias/${slug}`)).status()).toBe(404);
});

test("páginas de docentes y autoridades, y solicitud de información hasta el panel", async ({ browser }) => {
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/universidad/docentes");
  await expect(visitor.getByText("Pronto publicaremos esta información.")).toBeVisible();
  await visitor.goto("/universidad/autoridades");
  await expect(visitor.getByText("Pronto publicaremos esta información.")).toBeVisible();

  const name = `Interesada ${Date.now()}`;
  await visitor.goto("/admisiones");
  await visitor.getByLabel("Nombre completo").fill(name);
  await visitor.getByLabel("Correo electrónico").fill("interes@iinicia.test");
  await visitor.getByLabel("¿En qué podemos ayudarte?").fill("Quiero conocer los requisitos.");
  await visitor.getByRole("checkbox").check();
  await visitor.getByRole("button", { name: "Solicitar información" }).click();
  await expect(visitor.getByText("Recibimos tu solicitud")).toBeVisible({ timeout: 10_000 });

  const admin = await session(browser, "academico", "/admin");
  await admin.getByRole("tab", { name: "Información" }).click();
  const row = admin.getByRole("row", { name: new RegExp(name) });
  await row.getByRole("button", { name: "Marcar atendida" }).click();
  await expect(row.getByRole("button", { name: "Reabrir" })).toBeVisible({ timeout: 10_000 });
});

test("reportes y exportación CSV", async ({ browser }) => {
  const admin = await session(browser, "academico", "/admin");
  await admin.getByRole("tab", { name: "Reportes" }).click();
  await expect(admin.getByRole("row", { name: /Base de Datos/ })).toBeVisible({ timeout: 10_000 });
  const [download] = await Promise.all([admin.waitForEvent("download"), admin.getByRole("button", { name: "Exportar CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^reporte-programas-.*\.csv$/);
});
