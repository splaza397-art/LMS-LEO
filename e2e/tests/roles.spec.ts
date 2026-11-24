// Verifica en la API real cada rol contra la matriz RBAC.
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { bff, session } from "./helpers";

const USERS = ["superadmin", "tecnico", "academico", "coordinador", "profesor", "estudiante", "aspirante", "soporte"] as const;
const MATRIX: Record<string, readonly (typeof USERS)[number][]> = {
  "admin/users": ["superadmin", "tecnico", "academico", "coordinador", "soporte"],
  "admin/applications": ["superadmin", "academico", "coordinador"],
  "admin/programs": ["superadmin", "academico", "coordinador"],
  "admin/teachers": ["superadmin", "academico", "coordinador"],
  "admin/content": ["superadmin", "academico"],
  "admin/info-requests": ["superadmin", "academico"],
  "admin/reports": ["superadmin", "academico", "coordinador"],
  "admin/audit": ["superadmin", "tecnico"],
  "me/campus-link": ["superadmin", "academico", "coordinador", "profesor", "estudiante"],
};

for (const who of USERS) {
  test(`matriz RBAC: ${who}`, async ({ browser }) => {
    const page = await session(browser, who);
    for (const [path, allowed] of Object.entries(MATRIX)) {
      const { status } = await bff(page, "GET", path);
      expect(status, `${who} -> ${path}`).toBe(allowed.includes(who) ? 200 : 403);
    }
    expect((await bff(page, "GET", "me")).body.roles).toHaveLength(1);
    await page.context().close();
  });
}

for (const who of ["superadmin", "academico", "coordinador", "profesor", "estudiante"]) {
  test(`SSO a Moodle sin segunda contraseña: ${who}`, async ({ browser }) => {
    const page = await session(browser, who);
    await page.getByRole("button", { name: "Entrar al Campus" }).click();
    await page.waitForURL(/localhost:8081\/my\/(courses\.php)?$/, { timeout: 60_000 });
    await expect(page.locator("#username")).toHaveCount(0);
    await expect(page.locator(".usermenu, #user-menu-toggle").first()).toBeVisible();
    if (who === "estudiante") await page.screenshot({ path: resolve(__dirname, "../../documentation/evidencias/capturas/07-moodle-area-personal.png") });
    await page.context().close();
  });
}

test("solo superadmin cambia roles y no puede quedar el sistema sin superadmin", async ({ browser }) => {
  const academic = await session(browser, "academico");
  const target = (await bff(academic, "GET", "admin/users?q=aspirante@")).body[0];
  expect((await bff(academic, "PUT", `admin/users/${target.id}/roles`, { roles: ["superadmin"] })).status).toBe(403);

  const root = await session(browser, "superadmin");
  const self = (await bff(root, "GET", "me")).body;
  expect((await bff(root, "PUT", `admin/users/${self.id}/roles`, { roles: ["soporte"] })).status).toBe(400);
  expect((await bff(root, "PATCH", `admin/users/${self.id}/suspension`, { suspended: true })).status).toBe(400);
  expect((await bff(root, "PUT", `admin/users/${target.id}/roles`, { roles: ["coordinador"] })).status).toBe(400);
});

test("el coordinador no actúa fuera de su programa", async ({ browser }) => {
  const root = await session(browser, "superadmin");
  const programs = (await bff(root, "GET", "admin/programs")).body;
  const coordinator = await session(browser, "coordinador");
  const own = (await bff(coordinator, "GET", "admin/programs")).body;
  expect(own).toHaveLength(1);
  const foreign = programs.find((p: { id: string }) => p.id !== own[0].id);

  expect((await bff(coordinator, "POST", `admin/programs/${foreign.id}/cohorts`, { name: "No permitida" })).status).toBe(403);
  expect((await bff(coordinator, "GET", `admin/programs/${foreign.id}/teachers`)).status).toBe(403);
  expect((await bff(coordinator, "POST", "admin/notifications", { programId: foreign.id, title: "Aviso", body: "No permitido" })).status).toBe(403);
  expect((await bff(coordinator, "POST", "admin/programs", { slug: "no-permitido", name: "No permitido", level: "curso", summary: "No permitido", published: false })).status).toBe(403);
  expect((await bff(coordinator, "GET", "admin/reports")).body).toHaveLength(1);
});
