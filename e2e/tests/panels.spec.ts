// Punto 8: cada rol ve un panel distinto en Mi IINICIA.
import { expect, test } from "@playwright/test";
import { session } from "./helpers";

test("profesor: ve sus grupos con estudiantes y avance real de Moodle", async ({ browser }) => {
  const page = await session(browser, "profesor");
  await expect(page.getByRole("heading", { name: "Mis grupos" })).toBeVisible();
  const course = page.getByRole("region", { name: "Estudiantes de Base de Datos" });
  await expect(course.getByRole("row", { name: /Demo Estudiante/ })).toBeVisible({ timeout: 30_000 });
  await expect(course.getByRole("row", { name: /Demo Estudiante/ })).toContainText("%");
  await expect(page.getByRole("heading", { name: "Mis solicitudes" })).toHaveCount(0);
  await page.screenshot({ path: "../documentation/evidencias/capturas/40-panel-profesor.png", fullPage: true });
});

test("estudiante: ve sus cursos, avance y próximas actividades, no grupos", async ({ browser }) => {
  const page = await session(browser, "estudiante");
  await expect(page.getByRole("heading", { name: "Mis cursos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Base de Datos", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Proyecto final")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mis grupos" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Abrir panel" })).toHaveCount(0);
  await page.screenshot({ path: "../documentation/evidencias/capturas/41-panel-estudiante.png", fullPage: true });
});

test("coordinador: supervisa los cursos de su programa y abre el panel de gestión", async ({ browser }) => {
  const page = await session(browser, "coordinador");
  await expect(page.getByRole("heading", { name: "Cursos que supervisas" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Estudiantes de Base de Datos" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Abrir panel" })).toBeVisible();
});

test("aspirante: ve solicitudes y programas, sin campus", async ({ browser }) => {
  const page = await session(browser, "aspirante");
  await expect(page.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Programas disponibles" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar al Campus" })).toHaveCount(0);
});

test("soporte y administrador técnico: panel con sus pestañas permitidas", async ({ browser }) => {
  const support = await session(browser, "soporte", "/admin");
  await expect(support.getByRole("tab")).toHaveText(["Usuarios"]);
  await expect(support.getByRole("button", { name: "Suspender" })).toHaveCount(0);

  const tech = await session(browser, "tecnico", "/admin");
  await expect(tech.getByRole("tab")).toHaveText(["Usuarios", "Auditoría"]);
  await expect(tech.getByRole("button", { name: "Sincronizar" }).first()).toBeVisible();
});
