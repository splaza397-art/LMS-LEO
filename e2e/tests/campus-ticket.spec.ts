// Fase 4.11: el comprobante de entrada al campus es una credencial temporal. Estas pruebas comprueban que solo sirve
// en el navegador de quien lo pidió, una sola vez, mientras su sesión de IINICIA siga abierta, y hacia rutas locales.
// Los casos de Moodle o Keycloak detenidos están en e2e/session-failures.mjs (detienen contenedores).
// Solo cuentas demo; no se imprimen contraseñas, tokens ni comprobantes.
import { devices, expect, request, test, type Browser, type Page } from "@playwright/test";
import { createHmac, randomBytes } from "node:crypto";
import { bff, login, PASSWORD, session } from "./helpers";

const MOODLE = "http://localhost:8081";
const ESTUDIANTE = "Demo Estudiante";
const PROFESOR = "Demo Docente";

/**
 * Sigue el flujo real de "Entrar al campus" hasta obtener el enlace con comprobante, sin abrirlo todavía.
 * Las respuestas intermedias (incluidas sus cookies) quedan en el contexto del navegador, igual que al hacer clic.
 */
async function campusTicket(page: Page, query = ""): Promise<string> {
  const link = await bff(page, "GET", `me/campus-link${query}`);
  expect(link.status, "el backend entrega el enlace al campus").toBe(200);
  let url: string = link.body.url;
  for (let i = 0; i < 4 && !new URL(url).searchParams.has("ticket"); i++) {
    const response = await page.request.get(url, { maxRedirects: 0 });
    const next = response.headers()["location"];
    expect(next, `redirección desde ${new URL(url).pathname}`).toBeTruthy();
    url = new URL(next, url).toString();
  }
  expect(new URL(url).searchParams.get("ticket"), "el enlace final lleva un comprobante").toBeTruthy();
  return url;
}

async function moodleIdentity(page: Page): Promise<string> {
  await page.goto(`${MOODLE}/user/profile.php`);
  await page.waitForLoadState("load");
  if (!page.url().startsWith(`${MOODLE}/user/profile.php`)) return "sin sesión";
  return (await page.locator(".page-header-headings h1, .page-context-header h2, h1").first().innerText()).trim();
}

async function redeem(page: Page, url: string) {
  await page.goto(url).catch(() => { /* destino rechazado */ });
  await page.waitForLoadState("load").catch(() => {});
}

/** Vuelve a firmar el comprobante con cambios (solo posible con el secreto del servidor, como haría el backend). */
function resign(url: string, change: (data: Record<string, unknown>) => Record<string, unknown>): string {
  const u = new URL(url);
  const data = JSON.parse(Buffer.from(u.searchParams.get("ticket")!.split(".")[0], "base64url").toString());
  const payload = Buffer.from(JSON.stringify({ ...change(data), jti: randomBytes(24).toString("base64url") })).toString("base64url");
  u.searchParams.set("ticket", `${payload}.${createHmac("sha256", process.env.MOODLE_SSO_SECRET!).update(payload).digest("base64url")}`);
  return u.toString();
}

async function logout(page: Page) {
  await page.goto("/mi-iinicia");
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL((url) => url.origin === "http://localhost:3000" && !url.pathname.startsWith("/mi-iinicia"), { timeout: 30_000 });
}

async function freshPage(browser: Browser, options = {}) {
  return (await browser.newContext(options)).newPage();
}

test("1. el comprobante abre el campus en el navegador de quien lo pidió", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  await redeem(owner, await campusTicket(owner));
  expect(await moodleIdentity(owner)).toBe(ESTUDIANTE);
  await owner.context().close();
});

test("2. copiado a otro navegador no abre la sesión de su dueño", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const url = await campusTicket(owner);
  const other = await freshPage(browser);
  await redeem(other, url);
  expect(await moodleIdentity(other), "el enlace transferido no es una credencial al portador").not.toBe(ESTUDIANTE);
  // Quemado: ya tampoco sirve en el navegador original.
  await redeem(owner, url);
  expect(await moodleIdentity(owner), "un comprobante intentado en otro navegador queda inutilizado").not.toBe(ESTUDIANTE);
  await owner.context().close();
  await other.context().close();
});

test("3. copiado a otro dispositivo no abre la sesión de su dueño", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const url = await campusTicket(owner);
  const phone = await freshPage(browser, { ...devices["Pixel 7"] });
  await redeem(phone, url);
  expect(await moodleIdentity(phone)).not.toBe(ESTUDIANTE);
  await owner.context().close();
  await phone.context().close();
});

test("4. usado desde una cuenta diferente no la cambia por la del dueño", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const url = await campusTicket(owner);
  const teacher = await session(browser, "profesor");
  await redeem(teacher, await campusTicket(teacher));
  expect(await moodleIdentity(teacher)).toBe(PROFESOR);
  await redeem(teacher, url);
  expect(await moodleIdentity(teacher), "el profesor no pasa a ser el estudiante").not.toBe(ESTUDIANTE);
  await owner.context().close();
  await teacher.context().close();
});

test("5. un comprobante vencido no abre sesión", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const url = await campusTicket(owner);
  const expired = resign(url, (d) => ({ ...d, iat: (d.iat as number) - 600, exp: (d.exp as number) - 600 }));
  await redeem(owner, expired);
  expect(await moodleIdentity(owner)).toBe("sin sesión");
  await owner.context().close();
});

test("6. un comprobante usado no sirve una segunda vez", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const url = await campusTicket(owner);
  await redeem(owner, url);
  expect(await moodleIdentity(owner)).toBe(ESTUDIANTE);
  await owner.context().clearCookies({ name: "MoodleSession" });
  await redeem(owner, url);
  expect(await moodleIdentity(owner)).toBe("sin sesión");
  await owner.context().close();
});

test("7. dos canjes simultáneos del mismo comprobante: solo uno entra", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const url = await campusTicket(owner);
  // Mismas cookies del navegador del dueño (salvo la sesión de Moodle), en dos conexiones independientes a la vez.
  const cookie = (await owner.context().cookies(url)).filter((c) => c.name !== "MoodleSession").map((c) => `${c.name}=${c.value}`).join("; ");
  const results = await Promise.all([0, 1].map(async () => {
    const ctx = await request.newContext();
    const response = await ctx.get(url, { maxRedirects: 0, headers: cookie ? { cookie } : {} });
    const location = response.headers()["location"] ?? "";
    await ctx.dispose();
    return location;
  }));
  expect(results.filter((l) => l.startsWith(`${MOODLE}/my/courses.php`)).length, "exactamente un canje").toBe(1);
  await owner.context().close();
});

test("8. un comprobante manipulado no abre sesión", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const u = new URL(await campusTicket(owner));
  const [payload, signature] = u.searchParams.get("ticket")!.split(".");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  u.searchParams.set("ticket", `${Buffer.from(JSON.stringify({ ...data, uid: data.uid + 1 })).toString("base64url")}.${signature}`);
  await redeem(owner, u.toString());
  expect(await moodleIdentity(owner)).toBe("sin sesión");
  await owner.context().close();
});

test("9. un comprobante para otro destinatario no abre sesión", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const url = await campusTicket(owner);
  await redeem(owner, resign(url, (d) => ({ ...d, aud: "http://otro-campus.example" })));
  expect(await moodleIdentity(owner), "Moodle exige ser el destinatario").toBe("sin sesión");
  await redeem(owner, resign(url, (d) => ({ ...d, purpose: "otro-uso" })));
  expect(await moodleIdentity(owner), "Moodle exige el propósito de entrada al campus").toBe("sin sesión");
  await owner.context().close();
});

test("10. un comprobante emitido antes de cerrar sesión no sirve después", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const url = await campusTicket(owner);
  await logout(owner);
  await redeem(owner, url);
  expect(await moodleIdentity(owner)).not.toBe(ESTUDIANTE);
  await owner.context().close();
});

test("11. cambio de cuenta antes de canjear: el comprobante anterior no sirve", async ({ browser }) => {
  const page = await session(browser, "estudiante");
  const url = await campusTicket(page);
  await logout(page);
  await login(page, "profesor@iinicia.test", PASSWORD);
  await redeem(page, url);
  expect(await moodleIdentity(page), "no se entra como la cuenta anterior").not.toBe(ESTUDIANTE);
  await redeem(page, await campusTicket(page));
  expect(await moodleIdentity(page), "la cuenta actual sí entra").toBe(PROFESOR);
  await page.context().close();
});

test("14. no redirige a destinos fuera del campus", async ({ browser }) => {
  const owner = await session(browser, "estudiante");
  const url = await campusTicket(owner);
  for (const want of ["//evil.example/x", "https://evil.example/", "/\\evil.example"]) {
    await redeem(owner, resign(url, (d) => ({ ...d, want })));
    expect(new URL(owner.url()).hostname, want).toBe("localhost");
    expect(await moodleIdentity(owner)).toBe("sin sesión");
  }
  await owner.context().close();
});
