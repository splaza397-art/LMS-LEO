// Fase 5: sesiones por dispositivo. Cada sesión de Moodle abierta con un comprobante queda asociada a la sesión de
// Keycloak (sid) que lo pidió; cerrar sesión en un dispositivo cierra solo esa, y un reintento antiguo de cierre no toca
// una sesión nueva. Solo cuentas demo.
import { expect, test, type Page } from "@playwright/test";
import { bff, session, sql } from "./helpers";

const MOODLE = "http://localhost:8081";

async function openCampus(page: Page) {
  let url: string = (await bff(page, "GET", "me/campus-link")).body.url;
  await page.goto(url);
  await page.waitForLoadState("load");
}

async function moodleIdentity(page: Page): Promise<string> {
  await page.goto(`${MOODLE}/user/profile.php`);
  await page.waitForLoadState("load");
  if (!page.url().startsWith(`${MOODLE}/user/profile.php`)) return "sin sesión";
  return (await page.locator(".page-header-headings h1, .page-context-header h2, h1").first().innerText()).trim();
}

async function logout(page: Page) {
  await page.goto("/mi-iinicia");
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL((url) => url.origin === "http://localhost:3000" && !url.pathname.startsWith("/mi-iinicia"), { timeout: 30_000 });
}

test("cerrar sesión en un dispositivo no cierra el campus abierto en otro", async ({ browser }) => {
  const phone = await session(browser, "estudiante");
  const laptop = await session(browser, "estudiante");
  await openCampus(phone);
  await openCampus(laptop);
  expect(await moodleIdentity(phone)).toBe("Demo Estudiante");
  expect(await moodleIdentity(laptop)).toBe("Demo Estudiante");
  await logout(phone);
  expect(await moodleIdentity(phone), "el dispositivo que cerró sesión ya no tiene campus").toBe("sin sesión");
  expect(await moodleIdentity(laptop), "el otro dispositivo conserva su campus").toBe("Demo Estudiante");
  await phone.context().close();
  await laptop.context().close();
});

test("un reintento antiguo de cierre no cierra la sesión nueva de la misma persona", async ({ browser }) => {
  // Sesión anterior (sid antiguo) con campus abierto.
  const old = await session(browser, "estudiante");
  await openCampus(old);
  expect(await moodleIdentity(old)).toBe("Demo Estudiante");
  const oldMoodle = (await old.context().cookies(MOODLE)).find((c) => c.name === "MoodleSession")!.value;
  const oldSid = sql("moodle", `select kcsid from mdl_local_iinicia_session_link where sid = '${oldMoodle.replace(/'/g, "")}'`);
  expect(oldSid, "la sesión de Moodle quedó asociada a su sesión de Keycloak").toMatch(/^[0-9a-f-]{36}$/);
  // La misma persona entra de nuevo en otro navegador (sid nuevo) y abre el campus.
  const fresh = await session(browser, "estudiante");
  await openCampus(fresh);
  expect(await moodleIdentity(fresh)).toBe("Demo Estudiante");
  // Llega tarde el cierre pendiente de la sesión anterior (como cuando Moodle estuvo caído): lo procesa el reintento.
  const userId = sql("portal", "select id from users where email = 'estudiante@iinicia.test'");
  sql("portal", `insert into moodle_logout_queue (user_id, scope, kc_sid, requested_at) values ('${userId}', 'device', '${oldSid}', now())`);
  await expect.poll(() => sql("portal", `select count(*) from moodle_logout_queue where kc_sid = '${oldSid}'`), { timeout: 45_000 }).toBe("0");
  expect(await moodleIdentity(old), "la sesión anterior se cerró").toBe("sin sesión");
  expect(await moodleIdentity(fresh), "la sesión nueva sigue abierta").toBe("Demo Estudiante");
  await old.context().close();
  await fresh.context().close();
});

test("cerrar sesión en todos los dispositivos cierra el portal y el campus de los demás", async ({ browser }) => {
  const phone = await session(browser, "estudiante");
  const laptop = await session(browser, "estudiante");
  await openCampus(phone);
  await openCampus(laptop);
  await laptop.goto("/mi-iinicia");
  await laptop.getByRole("button", { name: "Cerrar sesión en todos los dispositivos" }).click();
  await laptop.waitForURL((url) => !url.pathname.startsWith("/mi-iinicia"), { timeout: 30_000 });
  expect(await moodleIdentity(laptop)).toBe("sin sesión");
  expect(await moodleIdentity(phone), "el campus del otro dispositivo también se cerró").toBe("sin sesión");
  expect((await bff(phone, "GET", "me")).status, "el portal del otro dispositivo ya no tiene sesión").toBe(401);
  await phone.context().close();
  await laptop.context().close();
});

test("administración: revocar una sesión comprometida o todas, con permiso y auditoría", async ({ browser }) => {
  const userId = sql("portal", "select id from users where email = 'estudiante@iinicia.test'");
  const a = await session(browser, "estudiante");
  const b = await session(browser, "estudiante");
  await openCampus(a);
  await openCampus(b);
  const admin = await session(browser, "academico", "/admin");
  const list = await bff(admin, "GET", `admin/users/${userId}/sessions`);
  expect(list.status).toBe(200);
  expect(list.body.length).toBeGreaterThanOrEqual(2);
  expect(Object.keys(list.body[0]).sort(), "sin IP ni datos del navegador").toEqual(["clients", "id", "kind", "lastAccess", "started"]);
  // Revocar la sesión de A (comprometida): B sigue.
  const aMoodle = (await a.context().cookies("http://localhost:8081")).find((c) => c.name === "MoodleSession")!.value;
  const aSid = sql("moodle", `select kcsid from mdl_local_iinicia_session_link where sid = '${aMoodle.replace(/'/g, "")}'`);
  expect((await bff(admin, "DELETE", `admin/users/${userId}/sessions/${aSid}`)).body.complete).toBe(true);
  expect((await bff(a, "GET", "me")).status, "la sesión revocada ya no sirve en la API").toBe(401);
  expect(await moodleIdentity(a)).toBe("sin sesión");
  expect((await bff(b, "GET", "me")).status, "la otra sesión sigue").toBe(200);
  expect(await moodleIdentity(b)).toBe("Demo Estudiante");
  // Revocar todas por seguridad.
  expect((await bff(admin, "POST", `admin/users/${userId}/sessions/revoke`)).body.complete).toBe(true);
  expect((await bff(b, "GET", "me")).status).toBe(401);
  expect(await moodleIdentity(b)).toBe("sin sesión");
  expect(sql("portal", `select count(*) from audit_log where target_id = '${userId}' and action in ('security.session_revoked','security.sessions_revoked') and created_at > now() - interval '5 minutes'`)).toBe("2");
  await a.context().close();
  await b.context().close();
  await admin.context().close();
});

test("revocar sesiones: sin permiso responde 403, y el administrador académico no actúa sobre un superadministrador", async ({ browser }) => {
  const student = sql("portal", "select id from users where email = 'estudiante@iinicia.test'");
  const superadmin = sql("portal", "select id from users where email = 'superadmin@iinicia.test'");
  for (const who of ["coordinador", "soporte", "profesor", "estudiante"]) {
    const page = await session(browser, who);
    expect((await bff(page, "POST", `admin/users/${student}/sessions/revoke`)).status, who).toBe(403);
    expect((await bff(page, "GET", `admin/users/${student}/sessions`)).status, who).toBe(403);
    await page.context().close();
  }
  const academico = await session(browser, "academico", "/admin");
  expect((await bff(academico, "POST", `admin/users/${superadmin}/sessions/revoke`)).status).toBe(403);
  expect((await bff(academico, "DELETE", `admin/users/${student}/sessions/not-a-uuid`)).status, "sid inválido").toBe(400);
  await academico.context().close();
});
