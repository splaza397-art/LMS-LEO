// Prueba de concepto obligatoria (seccion 21): registro -> admision -> Moodle -> SSO, sin duplicados.
import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { privacyMask } from "./helpers";

config({ path: resolve(__dirname, "../../backend/.env"), quiet: true });
const PASSWORD = process.env.DEMO_PASSWORD!;
const SHOTS = resolve(__dirname, "../../documentation/evidencias/capturas");
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, mask: privacyMask(page) });

async function keycloakLogin(page: Page, email: string, password = PASSWORD) {
  await page.waitForURL(/localhost:8180/);
  await page.locator("#username").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
}

async function portalLogin(page: Page, email: string, password = PASSWORD, path = "/mi-iinicia") {
  await page.goto(`/auth/login?returnTo=${encodeURIComponent(path)}`);
  await keycloakLogin(page, email, password);
}

async function confirmEmail(page: Page, email: string) {
  const list = await (await page.request.get(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
  expect(list.messages.length).toBeGreaterThan(0);
  const message = await (await page.request.get(`http://localhost:8025/api/v1/message/${list.messages[0].ID}`)).json();
  expect(message.Subject).toBe("Confirma tu correo para activar tu cuenta IINICIA");
  expect(message.HTML).toContain("Confirmar mi correo");
  const link = String(message.Text).match(/http:\/\/localhost:8180\S+/)?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!.replace(/&amp;/g, "&"));
  await page.getByRole("link", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Listo, ya puedes iniciar sesión." })).toBeVisible();
  // «Ir a IINICIA» vuelve al portal (Mi IINICIA), que pide iniciar sesión.
  await page.getByRole("link", { name: "Ir a IINICIA" }).click();
  await page.waitForURL(/localhost:8180.*openid-connect\/auth/);
}

test("POC: registro, admisión, Moodle y SSO con una sola identidad", async ({ browser }) => {
  const email = `poc.${Date.now()}@iinicia.test`;
  const password = "PruebaSegura123";

  const student = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  student.on("pageerror", (e) => errors.push(e.message));

  // 1-3. Portal y registro
  await student.goto("/estado");
  await expect(student.getByText("Todos los servicios operan correctamente")).toBeVisible({ timeout: 20_000 });
  await student.goto("/");
  await expect(student.getByRole("heading", { name: "Tu educación comienza hoy, estés donde estés." })).toBeVisible();
  await shot(student, "01-portal-inicio");
  await student.getByRole("banner").getByRole("link", { name: "Registrarme" }).click();
  await student.getByLabel("Nombre", { exact: true }).fill("Prueba");
  await student.getByLabel("Apellidos").fill("Concepto");
  await student.getByLabel("Correo electrónico").fill(email);
  await student.getByLabel("Contraseña").fill(password);
  await student.getByRole("checkbox").check();
  await shot(student, "02-registro");
  await student.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(student.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible({ timeout: 30_000 });

  // 4. Identidad creada, correo confirmado. Aspirante: sin cursos.
  await confirmEmail(student, email);
  await portalLogin(student, email, password);
  await student.waitForURL(/\/mi-iinicia/);
  await expect(student.getByRole("heading", { name: "Hola, Prueba" })).toBeVisible();
  await expect(student.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible();
  await expect(student.getByRole("button", { name: "Entrar al Campus" })).toHaveCount(0);
  await shot(student, "03-aspirante-sin-cursos");

  await student.goto("/oferta/base-de-datos");
  await student.getByRole("button", { name: "Solicitar admisión" }).click();
  await student.waitForURL(/\/mi-iinicia/);
  await expect(student.getByText("En revisión")).toBeVisible();

  // 5-6. Administrador autoriza: se crea el usuario Moodle y se matricula
  const admin = await (await browser.newContext()).newPage();
  await portalLogin(admin, "academico@iinicia.test", PASSWORD, "/admin");
  await admin.waitForURL(/\/admin/);
  const row = admin.getByRole("row", { name: new RegExp(email.replace(/\./g, "\\.")) });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await shot(admin, "04-admin-solicitudes");
  await row.getByRole("button", { name: "Admitir" }).click();
  await expect(row).toHaveCount(0, { timeout: 40_000 });

  // 7-8. El estudiante ve su curso. La nueva autorizacion aplica sin volver a iniciar sesion.
  await student.goto("/mi-iinicia");
  await expect(student.getByRole("heading", { name: "Base de Datos", exact: true })).toBeVisible({ timeout: 30_000 });
  await shot(student, "05-estudiante-mi-iinicia");

  // 9. SSO: entra a Moodle sin capturar una segunda contraseña
  await student.getByRole("button", { name: "Entrar al curso" }).click();
  await student.waitForURL(/localhost:8081\/course\/view\.php/, { timeout: 60_000 });
  await expect(student.locator("#username")).toHaveCount(0);
  await expect(student.getByRole("heading", { name: /Base de Datos/ }).first()).toBeVisible();
  await shot(student, "06-moodle-sso-curso");
  expect(errors).toEqual([]);
});

test("Roles: un aspirante no accede al panel y la API rechaza sin sesión", async ({ browser, request }) => {
  expect((await request.get("http://localhost:4000/api/v1/me")).status()).toBe(401);
  expect((await request.get("http://localhost:4000/api/v1/admin/users")).status()).toBe(401);

  const page = await (await browser.newContext()).newPage();
  await portalLogin(page, "aspirante@iinicia.test");
  await page.waitForURL(/\/mi-iinicia/);
  expect((await page.request.get("/api/bff/v1/admin/users")).status()).toBe(403);
  expect((await page.request.get("/api/bff/v1/me/campus-link")).status()).toBe(403);
  expect(await (await page.request.get("/api/bff/v1/me/courses")).json()).toEqual([]);
  await page.goto("/admin");
  await page.waitForURL(/\/mi-iinicia/);
});

test("Roles: coordinador limitado, estudiante sin acceso a cursos ajenos", async ({ browser }) => {
  const coord = await (await browser.newContext()).newPage();
  await portalLogin(coord, "coordinador@iinicia.test", PASSWORD, "/admin");
  await coord.waitForURL(/\/admin/);
  expect((await coord.request.get("/api/bff/v1/admin/audit")).status()).toBe(403);
  const programs = await (await coord.request.get("/api/bff/v1/admin/programs")).json();
  expect(programs).toHaveLength(1);

  const student = await (await browser.newContext()).newPage();
  await portalLogin(student, "estudiante@iinicia.test");
  await student.waitForURL(/\/mi-iinicia/);
  expect((await student.request.get("/api/bff/v1/me/courses/1")).status()).toBe(404);
  expect((await student.request.get("/api/bff/v1/me/campus-link?courseId=1")).status()).toBe(403);
  expect((await student.request.get("/api/bff/v1/admin/users")).status()).toBe(403);
});

test("Seguridad: el navegador no recibe secretos ni tokens legibles", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await portalLogin(page, "estudiante@iinicia.test");
  await page.waitForURL(/\/mi-iinicia/);
  const cookies = await context.cookies("http://localhost:3000");
  const session = cookies.filter((c) => c.name.startsWith("iin_"));
  expect(session.length).toBeGreaterThan(0);
  for (const cookie of session) expect(cookie.httpOnly).toBe(true);
  const html = await page.content();
  expect(html).not.toContain(process.env.MOODLE_WS_TOKEN!);
  expect(html).not.toContain(process.env.KEYCLOAK_BACKEND_CLIENT_SECRET!);
  const blocked = await page.request.post("/api/bff/v1/me/applications", {
    headers: { origin: "https://sitio-malicioso.example" }, data: {},
  });
  expect(blocked.status()).toBe(403);
});
