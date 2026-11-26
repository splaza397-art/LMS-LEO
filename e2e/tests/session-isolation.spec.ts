// Fase 4.10: aislamiento de sesiones entre cuentas en un mismo navegador (computadora o teléfono compartido).
// Cada cambio de cuenta comprueba tres identidades: la del portal (/me), la de Keycloak (si pide credenciales) y la
// de Moodle (página de perfil propio, generada por el servidor para la sesión de Moodle), además del acceso directo a
// un curso protegido. Solo cuentas demo y una cuenta ficticia creada por la prueba.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { API, bff, NEW_PASSWORD, newAccount, PASSWORD, session, sql } from "./helpers";

const MOODLE = "http://localhost:8081";

type Who = { email: string; password: string; name: string };
const demo = (user: string, name: string): Who => ({ email: `${user}@iinicia.test`, password: PASSWORD, name });
const ESTUDIANTE = demo("estudiante", "Demo Estudiante");
const PROFESOR = demo("profesor", "Demo Docente");
const SUPERADMIN = demo("superadmin", "Demo Superadmin");
let SEGUNDO: Who;

/** Segundo estudiante ficticio, admitido en Base de Datos (tiene cuenta y matrícula en Moodle). */
test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const account = await newAccount(browser, "alumnob");
  const programs = await (await account.page.request.get(`${API}/programs`)).json();
  const program = programs.find((p: { slug: string }) => p.slug === "base-de-datos");
  expect((await bff(account.page, "POST", "me/applications", { programId: program.id })).status).toBe(201);
  const admin = await session(browser, "academico", "/admin");
  const applicationId = sql("portal", `select a.id from applications a join users u on u.id = a.user_id where u.email = '${account.email}'`);
  expect((await bff(admin, "POST", `admin/applications/${applicationId}/decision`, { decision: "admitida" })).status).toBeLessThan(300);
  await expect.poll(() => sql("portal", `select coalesce(moodle_user_id::text, '') from users where email = '${account.email}'`), { timeout: 60_000 }).not.toBe("");
  SEGUNDO = { email: account.email, password: NEW_PASSWORD, name: "Prueba alumnob" };
  await account.page.context().close();
  await admin.context().close();
});

/** Inicia sesión en el portal. Devuelve false si entró sin pedir credenciales (sesión residual de Keycloak). */
async function portalLogin(page: Page, who: Who): Promise<boolean> {
  await page.goto("/auth/login?returnTo=/mi-iinicia");
  await page.waitForURL((url) => url.port === "8180" || url.pathname.startsWith("/mi-iinicia"));
  if (!page.url().includes(":8180")) return false;
  await page.locator("#username").fill(who.email);
  await page.locator("#password").fill(who.password);
  await page.locator("#kc-login").click();
  await page.waitForURL(/localhost:3000\/mi-iinicia/);
  return true;
}

/** Cierre de sesión real del portal: el botón "Salir" (POST /auth/logout). */
async function portalLogout(page: Page) {
  await page.goto("/mi-iinicia");
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL((url) => url.origin === "http://localhost:3000" && !url.pathname.startsWith("/mi-iinicia"), { timeout: 30_000 });
}

async function portalEmail(page: Page) {
  const me = await bff(page, "GET", "me");
  return me.status === 200 ? me.body.email : `sin sesión (${me.status})`;
}

/** Abre el campus con el enlace que da el backend a la persona con sesión en el portal. */
async function openCampus(page: Page) {
  const link = await bff(page, "GET", "me/campus-link");
  expect(link.status).toBe(200);
  await page.goto(link.body.url);
  await page.waitForLoadState("load");
}

/** Identidad de la sesión de Moodle según el servidor: el perfil propio muestra el nombre de quien tiene la sesión. */
async function moodleIdentity(page: Page): Promise<string> {
  await page.goto(`${MOODLE}/user/profile.php`);
  await page.waitForLoadState("load");
  if (page.url().includes(":8180") || page.url().includes("/login/")) return "sin sesión";
  return (await page.locator(".page-header-headings h1, .page-context-header h2, h1").first().innerText()).trim();
}

async function switchAccount(browser: Browser, from: Who, to: Who) {
  const page = await (await browser.newContext()).newPage();
  expect(await portalLogin(page, from), "la primera cuenta inicia sesión con credenciales").toBe(true);
  await openCampus(page);
  expect(await moodleIdentity(page)).toBe(from.name);

  await portalLogout(page);
  // Tras salir, la sesión de Moodle de la cuenta anterior ya no debe servir (acceso directo, marcadores, historial).
  expect(await moodleIdentity(page), "acceso directo a Moodle tras cerrar sesión").not.toBe(from.name);

  expect(await portalLogin(page, to), "tras cerrar sesión, Keycloak pide credenciales").toBe(true);
  expect(await portalEmail(page)).toBe(to.email);
  await openCampus(page);
  expect(await moodleIdentity(page), "Moodle corresponde a la cuenta actual").toBe(to.name);
  await page.context().close();
}


test("estudiante → profesor: Moodle no conserva al estudiante", async ({ browser }) => switchAccount(browser, ESTUDIANTE, PROFESOR));
test("profesor → estudiante", async ({ browser }) => switchAccount(browser, PROFESOR, ESTUDIANTE));
test("superadmin → estudiante", async ({ browser }) => switchAccount(browser, SUPERADMIN, ESTUDIANTE));
test("estudiante → superadmin", async ({ browser }) => switchAccount(browser, ESTUDIANTE, SUPERADMIN));
test("estudiante A → estudiante B", async ({ browser }) => switchAccount(browser, ESTUDIANTE, SEGUNDO));

test("una sesión de Moodle de otra cuenta no se reutiliza aunque no se haya cerrado sesión en el portal", async ({ browser }) => {
  const context = await browser.newContext();
  const a = await context.newPage();
  expect(await portalLogin(a, ESTUDIANTE)).toBe(true);
  await openCampus(a);
  expect(await moodleIdentity(a)).toBe(ESTUDIANTE.name);
  // 1. El profesor obtiene su enlace en otro navegador y lo pega en este. Fase 4.11: el enlace no lleva la identidad
  //    de quien lo pidió (no es una credencial al portador); en este navegador sigue entrando quien tiene aquí la sesión.
  const other = await session(browser, "profesor");
  const link = await bff(other, "GET", "me/campus-link");
  await a.goto(link.body.url);
  await a.waitForLoadState("load");
  expect(await moodleIdentity(a), "un enlace pegado no convierte este navegador en la cuenta de quien lo pidió").toBe(ESTUDIANTE.name);
  // 2. La sesión del portal cambia sin que Moodle se entere (se borran las cookies del portal y de Keycloak, no la de
  //    Moodle) y entra el profesor: Moodle cierra la sesión del estudiante y abre la del profesor (no la deja a medias).
  const moodleCookie = (await context.cookies(MOODLE)).filter((c) => c.name === "MoodleSession");
  await context.clearCookies();
  await context.addCookies(moodleCookie);
  expect(await moodleIdentity(a), "Moodle conserva todavía la sesión del estudiante").toBe(ESTUDIANTE.name);
  expect(await portalLogin(a, PROFESOR)).toBe(true);
  await openCampus(a);
  expect(await moodleIdentity(a), "la sesión de Moodle del estudiante se reemplaza por la del profesor").toBe(PROFESOR.name);
  await context.close();
  await other.context().close();
});

/** Sigue el flujo real (Moodle start → portal → comprobante) sin abrir el enlace final (Fase 4.11). */
async function ticketUrl(page: Page): Promise<string> {
  let url: string = (await bff(page, "GET", "me/campus-link")).body.url;
  for (let i = 0; i < 4 && !new URL(url).searchParams.has("ticket"); i++) {
    url = new URL((await page.request.get(url, { maxRedirects: 0 })).headers()["location"], url).toString();
  }
  return url;
}

test("un enlace al campus es de un solo uso", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const link = await ticketUrl(owner);
  await owner.goto(link);
  expect(await moodleIdentity(owner)).toBe(ESTUDIANTE.name);
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(link);
  await stranger.waitForLoadState("load");
  expect(await moodleIdentity(stranger), "un enlace ya usado no abre la sesión de nadie").not.toBe(ESTUDIANTE.name);
  await owner.context().close();
  await stranger.context().close();
});

test("un enlace manipulado o vencido no abre una sesión", async ({ browser }) => {
  // En el navegador de quien pidió el enlace (Fase 4.11: tiene la cookie de vinculación), para que el rechazo solo
  // pueda deberse a la manipulación o al vencimiento.
  const owner = await session(browser, "estudiante");
  const link = new URL(await ticketUrl(owner));
  const ticket = link.searchParams.get("ticket");
  expect(ticket, "el enlace lleva un comprobante firmado").toBeTruthy();
  // 1. Se cambia el usuario dentro del comprobante sin poder firmarlo.
  const [payload, signature] = ticket!.split(".");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  const forged = Buffer.from(JSON.stringify({ ...data, uid: data.uid + 1 })).toString("base64url");
  await owner.goto(`${MOODLE}/local/iinicia/sso.php?ticket=${forged}.${signature}`);
  expect(await moodleIdentity(owner)).toBe("sin sesión");
  // 2. Un comprobante bien firmado pero vencido, con la vinculación de un navegador nuevo del dueño.
  const fresh = new URL(await ticketUrl(owner));
  const freshData = JSON.parse(Buffer.from(fresh.searchParams.get("ticket")!.split(".")[0], "base64url").toString());
  const secret = process.env.MOODLE_SSO_SECRET!;
  const old = Buffer.from(JSON.stringify({ ...freshData, iat: freshData.iat - 600, exp: freshData.exp - 600, jti: `${freshData.jti}x` })).toString("base64url");
  const oldSig = createHmac("sha256", secret).update(old).digest("base64url");
  await owner.goto(`${MOODLE}/local/iinicia/sso.php?ticket=${old}.${oldSig}`);
  expect(await moodleIdentity(owner)).toBe("sin sesión");
  await owner.context().close();
});
