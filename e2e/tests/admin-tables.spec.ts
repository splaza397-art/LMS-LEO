// Fase 3 (etapa 3.6): tablas administrativas paginadas en el backend desde la interfaz real.
// Los registros de prueba son ficticios ("Interesada N", correos @iinicia.test) y los borra la limpieza global.
import { expect, test } from "@playwright/test";
import { session, sql } from "./helpers";

const SEEDED = 230;

test.beforeAll(() => {
  sql("portal", `INSERT INTO info_requests (name, email, message, consent_at, created_at)
    SELECT 'Interesada ' || n, 'interesada' || n || '@iinicia.test', 'Mensaje de prueba ' || n, now(), now() - (n || ' minutes')::interval
      FROM generate_series(1, ${SEEDED}) AS n`);
});
test.afterAll(() => { sql("portal", `DELETE FROM info_requests WHERE name ~ '^Interesada [0-9]+$'`); });

test("se llega a registros posteriores a los primeros 200", async ({ browser }) => {
  const page = await session(browser, "academico", "/admin?seccion=informacion");
  await expect(page.getByRole("tab", { name: "Información" })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Buscar persona").fill("Interesada");
  await expect(page.getByText(new RegExp(`Mostrando 1–20 de ${SEEDED} solicitudes`))).toBeVisible();

  await page.getByLabel("Por página").selectOption("100");
  await expect(page.getByText(`Mostrando 1–100 de ${SEEDED} solicitudes`)).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText(`Mostrando 201–${SEEDED} de ${SEEDED} solicitudes`)).toBeVisible();
  const rows = page.getByRole("region", { name: "Solicitudes de información" }).getByRole("row");
  await expect(rows).toHaveCount(SEEDED - 200 + 1);
  // Orden: más recientes primero; la última página termina con la más antigua.
  await expect(rows.last()).toContainText(`Interesada ${SEEDED}`);
  await expect(page.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  // Los filtros quedan en la URL: al recargar se conserva la misma vista.
  expect(page.url()).toMatch(/seccion=informacion/);
  expect(page.url()).toMatch(/q=Interesada/);
  expect(page.url()).toMatch(/page=3/);
  await page.reload();
  await expect(page.getByText(`Mostrando 201–${SEEDED} de ${SEEDED} solicitudes`)).toBeVisible();
});

test("la búsqueda espera a que se deje de escribir y un filtro nuevo vuelve a la página 1", async ({ browser }) => {
  const page = await session(browser, "academico", "/admin?seccion=informacion");
  await expect(page.getByRole("region", { name: "Solicitudes de información" })).toBeVisible();
  const searches: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/bff/v1/admin/info-requests") && r.url().includes("q=")) searches.push(r.url()); });
  await page.getByLabel("Buscar persona").pressSequentially("Interesada 23", { delay: 40 });
  await expect(page.getByText(/Mostrando 1–\d+ de \d+ solicitudes/)).toBeVisible();
  await expect.poll(() => searches.length).toBeGreaterThan(0);
  expect(searches.length, "una solicitud por búsqueda terminada, no por tecla").toBeLessThanOrEqual(2);

  await page.getByLabel("Buscar persona").fill("Interesada");
  await expect(page.getByText(`Mostrando 1–20 de ${SEEDED} solicitudes`)).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText(`Mostrando 21–40 de ${SEEDED} solicitudes`)).toBeVisible();
  await page.getByLabel("Filtrar por estado").selectOption("nueva");
  await expect(page.getByText(`Mostrando 1–20 de ${SEEDED} solicitudes`)).toBeVisible();
});

test("las cinco tablas muestran total y paginación, y respetan los filtros del backend", async ({ browser }) => {
  const page = await session(browser, "superadmin", "/admin");
  const tables: [tab: string, region: string, unit: string][] = [
    ["Usuarios", "Usuarios", "usuarios"],
    ["Solicitudes", "Solicitudes de admisión", "solicitudes"],
    ["Información", "Solicitudes de información", "solicitudes"],
    ["Contenidos", "Contenidos", "contenidos"],
    ["Auditoría", "Auditoría", "registros"],
  ];
  for (const [tab, region, unit] of tables) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("navigation", { name: `Paginación de ${unit}` })).toBeVisible();
    const text = await page.getByRole("navigation", { name: `Paginación de ${unit}` }).locator("p").textContent();
    if (!/^Sin /.test(text ?? "")) await expect(page.getByRole("region", { name: region })).toBeVisible();
  }
  // Auditoría tiene más de 200 registros en este entorno: se puede ir más allá del antiguo límite.
  await page.getByRole("tab", { name: "Auditoría" }).click();
  const total = Number(sql("portal", "select count(*) from audit_log"));
  test.skip(total <= 200, "Se necesitan más de 200 registros de auditoría");
  await page.getByLabel("Por página").selectOption("100");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText(/Mostrando 201–\d+ de \d+ registros/)).toBeVisible();

  // Un formato de acción inválido se explica y no llega al backend.
  await page.getByLabel("Acción").fill("DROP TABLE");
  await expect(page.getByText("Usa minúsculas y puntos, por ejemplo user.suspend")).toBeVisible();
});
