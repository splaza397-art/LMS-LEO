// Fase 3 (etapa 3.5): paneles por rol en el portal real y acceso por URL directa.
import { expect, test } from "@playwright/test";
import { session } from "./helpers";

test("sin sesión, las rutas protegidas llevan a iniciar sesión", async ({ page }) => {
  for (const path of ["/mi-iinicia", "/admin", "/mi-iinicia/cursos/3"]) {
    await page.goto(path);
    await page.waitForURL(/localhost:8180/);
    expect(new URL(page.url()).searchParams.get("redirect_uri")).toContain("/auth/callback");
  }
});

test("quien no tiene permisos de gestión no entra a /admin por URL directa", async ({ browser }) => {
  for (const who of ["profesor", "estudiante", "aspirante"]) {
    const page = await session(browser, who, "/mi-iinicia");
    await page.goto("/admin");
    await page.waitForURL(/\/mi-iinicia$/);
    await expect(page.getByRole("link", { name: "Abrir panel" })).toHaveCount(0);
    await page.context().close();
  }
});

test("cada rol con panel ve solo sus secciones y las anuncia en Mi IINICIA", async ({ browser }) => {
  const expected: Record<string, string[]> = {
    superadmin: ["Solicitudes", "Usuarios", "Programas", "Contenidos", "Información", "Avisos", "Reportes", "Auditoría"],
    academico: ["Solicitudes", "Usuarios", "Programas", "Contenidos", "Información", "Avisos", "Reportes"],
    coordinador: ["Solicitudes", "Usuarios", "Programas", "Avisos", "Reportes"],
    tecnico: ["Usuarios", "Auditoría"],
    soporte: ["Usuarios"],
  };
  for (const [who, tabs] of Object.entries(expected)) {
    const page = await session(browser, who, "/mi-iinicia");
    await expect(page.getByText(`Herramientas disponibles según tu rol: ${tabs.join(", ")}.`)).toBeVisible();
    await page.getByRole("link", { name: "Abrir panel" }).click();
    await page.waitForURL(/\/admin$/);
    await expect(page.getByRole("tab")).toHaveText(tabs);
    await page.context().close();
  }
});

test("soporte consulta usuarios sin acciones de cambio", async ({ browser }) => {
  const page = await session(browser, "soporte", "/admin");
  await expect(page.getByRole("region", { name: "Usuarios" })).toBeVisible();
  for (const name of ["Suspender", "Sincronizar", "Matrículas", "Guardar rol"]) await expect(page.getByRole("button", { name })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /^Rol de / })).toHaveCount(0);
});

test("el coordinador solo ve su programa en programas y reportes", async ({ browser }) => {
  const page = await session(browser, "coordinador", "/admin");
  await page.getByRole("tab", { name: "Programas" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Base de Datos" })).toBeVisible();
  await expect(page.locator("#admin-tabpanel h2")).toHaveText(["Base de Datos"]);
  await expect(page.getByRole("button", { name: "Nuevo programa" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Reportes" }).click();
  const rows = page.getByRole("region", { name: "Reporte por programa" }).getByRole("row");
  await expect(rows).toHaveCount(2); // encabezado + su programa
  await expect(rows.nth(1)).toContainText("Base de Datos");
});

test("profesor y estudiante ven su propio panel", async ({ browser }) => {
  const teacher = await session(browser, "profesor", "/mi-iinicia");
  await expect(teacher.getByRole("heading", { name: "Mis grupos" })).toBeVisible();
  await expect(teacher.getByRole("heading", { name: "Mis cursos" })).toHaveCount(0);
  const student = await session(browser, "estudiante", "/mi-iinicia");
  await expect(student.getByRole("heading", { name: "Mis cursos" })).toBeVisible();
  await expect(student.getByRole("heading", { name: "Mis grupos" })).toHaveCount(0);
  await expect(student.getByRole("heading", { name: "Mis solicitudes" })).toHaveCount(0);
});
