// Regresión del defecto S1 (auditoría): el límite de intentos no se evade cambiando X-Forwarded-For.
// Los datos enviados son inválidos a propósito: llegan al backend (400) sin crear cuentas.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { API, ORIGIN } from "./helpers";

const randomIp = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

async function viaPortal(request: APIRequestContext, xff: string) {
  return request.post("/api/registro", { headers: { origin: ORIGIN, "x-forwarded-for": xff }, data: {} });
}

async function direct(request: APIRequestContext, base: string, xff: string) {
  return (await request.post(`${base}/auth/register`, { headers: { "x-forwarded-for": xff }, data: {} })).status();
}

test("portal: cambiar X-Forwarded-For en cada intento no evita el límite de registros", async ({ request }) => {
  const codes: number[] = [];
  let retryAfter = 0;
  for (let i = 0; i < 7; i++) {
    const response = await viaPortal(request, `198.18.${i}.${i + 1}`);
    codes.push(response.status());
    if (response.status() === 429) {
      retryAfter = Number(response.headers()["retry-after"] ?? 60);
      break;
    }
  }
  // Las solicitudes normales llegan al backend (400 por datos inválidos) hasta que el límite bloquea.
  expect(codes[0]).toBe(400);
  expect(codes).toContain(429);
  expect(codes.filter((c) => c !== 400 && c !== 429)).toEqual([]);
  // Otras pruebas registran cuentas desde el portal: se espera a que venza el bloqueo antes de seguir.
  await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
});

test("backend: un proxy de confianza conserva la IP del cliente y el límite se aplica por IP", async ({ request }) => {
  // Desde la misma máquina (loopback, proxy de confianza en DEV) se simula al portal o a Nginx.
  const [a, b] = [randomIp(), randomIp()];
  const codes: number[] = [];
  for (let i = 0; i < 6; i++) codes.push(await direct(request, API, a));
  expect(codes).toEqual([400, 400, 400, 400, 400, 429]);
  // Otra IP legítima no queda afectada por el bloqueo de la primera.
  expect(await direct(request, API, b)).toBe(400);
});

test("varias instancias del backend comparten el mismo límite", async ({ request }) => {
  const second = spawn(process.execPath, ["dist/main.js"], {
    cwd: resolve(__dirname, "../../backend"),
    env: { ...process.env, PORT: "4001" },
    stdio: "ignore",
  });
  try {
    await expect.poll(async () => (await request.get("http://127.0.0.1:4001/api/estado").catch(() => null))?.status() ?? 0,
      { timeout: 60_000 }).toBe(200);
    const ip = randomIp();
    const codes: number[] = [];
    // Los intentos se reparten entre las dos instancias; el sexto debe bloquearse igual.
    for (let i = 0; i < 6; i++) codes.push(await direct(request, i % 2 ? "http://127.0.0.1:4001/api/v1" : API, ip));
    expect(codes).toEqual([400, 400, 400, 400, 400, 429]);
  } finally {
    second.kill();
  }
});
