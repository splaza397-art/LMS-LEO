import { expect, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../backend/.env"), quiet: true });
export const PASSWORD = process.env.DEMO_PASSWORD!;
export const API = "http://localhost:4000/api/v1";
export const ORIGIN = "http://localhost:3000";
export const NEW_PASSWORD = "PruebaSegura123";

const COMPOSE = ["compose", "-f", resolve(__dirname, "../../infrastructure/docker-compose.yml"),
  "--env-file", resolve(__dirname, "../../infrastructure/.env")];

/** Consulta de solo verificacion directamente en PostgreSQL. */
export function sql(database: "moodle" | "portal", query: string): string {
  return execFileSync("docker", [...COMPOSE, "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", database, "-tAc", query], {
    encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  }).trim();
}

export async function login(page: Page, email: string, password = PASSWORD, path = "/mi-iinicia") {
  await page.goto(`/auth/login?returnTo=${encodeURIComponent(path)}`);
  await page.waitForURL(/localhost:8180/);
  await page.locator("#username").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
  await page.waitForURL((url) => url.href.startsWith(ORIGIN + path.split("?")[0]) || url.pathname === "/mi-iinicia");
}

export async function session(browser: Browser, who: string, path = "/mi-iinicia") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, `${who}@iinicia.test`, PASSWORD, path);
  return page;
}

/** Llamada por el BFF con la sesion de la pagina, igual que el navegador. */
export async function bff(page: Page, method: string, path: string, data?: unknown) {
  const response = await page.request.fetch(`/api/bff/v1/${path}`, {
    method,
    headers: { origin: ORIGIN, ...(data ? { "content-type": "application/json" } : {}) },
    ...(data ? { data } : {}),
  });
  const text = await response.text();
  let body: any = text; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { body = JSON.parse(text); } catch { /* respuesta no JSON */ }
  return { status: response.status(), body };
}

let ipCounter = 0;
export const uniqueIp = () => `198.51.100.${(Date.now() % 200) + (ipCounter++ % 50) + 1}`;

/** Registra una cuenta real, confirma su correo y devuelve una sesion iniciada. */
export async function newAccount(browser: Browser, prefix: string) {
  const email = `${prefix}.${Date.now()}@iinicia.test`;
  const context = await browser.newContext();
  const page = await context.newPage();
  const created = await page.request.post(`${API}/auth/register`, {
    headers: { "x-forwarded-for": uniqueIp() },
    data: { email, password: NEW_PASSWORD, firstName: "Prueba", lastName: prefix, consent: true },
  });
  expect(created.status()).toBe(201);
  const list = await (await page.request.get(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
  expect(list.messages.length).toBeGreaterThan(0);
  const message = await (await page.request.get(`http://localhost:8025/api/v1/message/${list.messages[0].ID}`)).json();
  const link = String(message.Text).match(/http:\/\/localhost:8180\S+/)?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!.replace(/&amp;/g, "&"));
  const proceed = page.getByRole("link", { name: /aquí|here|continuar|proceed/i }).first();
  if (await proceed.isVisible().catch(() => false)) await proceed.click();
  await login(page, email, NEW_PASSWORD);
  const id = sql("portal", `select id from users where email = '${email}'`);
  return { email, id, page };
}

/** PNG valido de 1x1 pixel. */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
