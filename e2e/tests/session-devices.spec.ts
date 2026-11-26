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
