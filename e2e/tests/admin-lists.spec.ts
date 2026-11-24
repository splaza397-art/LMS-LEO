// Fase 2 (etapas 2.6 y 2.7): listas administrativas con paginación, búsqueda, filtros y ordenamiento,
// compatibilidad con el formato anterior, validación de parámetros, ámbito del coordinador y autorización.
import { expect, test, type Page } from "@playwright/test";
import { bff, session, sql } from "./helpers";

const LISTS = ["admin/users", "admin/applications", "admin/info-requests", "admin/audit", "admin/content"];
type Paged = { items: Record<string, unknown>[]; total: number; page: number; pageSize: number };

async function paged(page: Page, path: string): Promise<Paged> {
  const r = await bff(page, "GET", path);
  expect(r.status, `${path}: ${JSON.stringify(r.body).slice(0, 200)}`).toBe(200);
  return r.body as Paged;
}

test("compatibilidad: sin page ni pageSize las listas siguen siendo arreglos", async ({ browser }) => {
  const root = await session(browser, "superadmin", "/admin");
  for (const path of LISTS) {
    const r = await bff(root, "GET", path);
    expect(r.status, path).toBe(200);
    expect(Array.isArray(r.body), `${path} debe seguir devolviendo un arreglo`).toBe(true);
  }
});

test("paginación: estructura, páginas sin solaparse y orden determinista", async ({ browser }) => {
  const root = await session(browser, "superadmin", "/admin");
  for (const path of LISTS) {
    const first = await paged(root, `${path}?page=1&pageSize=2`);
    expect(first.page).toBe(1);
    expect(first.pageSize).toBe(2);
    expect(first.items.length).toBeLessThanOrEqual(2);
    expect(first.total).toBeGreaterThanOrEqual(first.items.length);
    expect(first.items.every((i) => !("_total" in i)), "no debe filtrarse la columna interna _total").toBe(true);
    if (first.total > 2) {
      const second = await paged(root, `${path}?page=2&pageSize=2`);
      const ids = new Set(first.items.map((i) => String(i.id)));
      expect(second.items.some((i) => ids.has(String(i.id))), `${path}: las páginas no deben repetir registros`).toBe(false);
    }
    const again = await paged(root, `${path}?page=1&pageSize=2`);
    expect(again.items.map((i) => i.id)).toEqual(first.items.map((i) => i.id));
  }
  const beyond = await paged(root, "admin/users?page=9999&pageSize=10");
  expect(beyond.items).toEqual([]);
  expect(beyond.total).toBe(0);
});

test("búsqueda, filtros y ordenamiento", async ({ browser }) => {
  const root = await session(browser, "superadmin", "/admin");
  const byEmail = await paged(root, "admin/users?pageSize=50&sort=email&order=asc");
  // Mismo orden que PostgreSQL (misma intercalación), con el desempate por id.
  const expected = sql("portal", "select email from users order by email asc, id asc limit 50").split(/\r?\n/);
  expect(byEmail.items.map((u) => u.email)).toEqual(expected);

  const teachers = await paged(root, "admin/users?pageSize=50&role=profesor");
  expect(teachers.items.length).toBeGreaterThan(0);
  expect(teachers.items.every((u) => (u.roles as string[]).includes("profesor"))).toBe(true);

  const search = await paged(root, "admin/users?q=estudiante%40iinicia.test&pageSize=10");
  expect(search.items.map((u) => u.email)).toEqual(["estudiante@iinicia.test"]);

  const registrations = await paged(root, "admin/audit?action=user.register&pageSize=20");
  expect(registrations.items.every((l) => l.action === "user.register")).toBe(true);

  const pages = await paged(root, "admin/content?type=pagina&status=publicado&pageSize=50");
  expect(pages.items.every((c) => c.type === "pagina" && c.status === "publicado")).toBe(true);

  const recent = await paged(root, `admin/audit?from=${new Date(Date.now() - 86_400_000).toISOString()}&pageSize=5`);
  expect(recent.items.every((l) => Date.parse(String(l.createdAt)) >= Date.now() - 86_400_000 - 60_000)).toBe(true);
});

test("validación: parámetros inválidos responden 400 y la búsqueda no permite inyección", async ({ browser }) => {
  const root = await session(browser, "superadmin", "/admin");
  for (const path of [
    "admin/users?page=0", "admin/users?pageSize=1000", "admin/users?sort=password", "admin/users?order=sideways",
    "admin/users?role=hacker", "admin/users?status=x", "admin/users?programId=1%27%20OR%201%3D1",
    "admin/audit?from=ayer", "admin/audit?action=DROP%20TABLE", "admin/content?status=oculto",
    "admin/info-requests?status=x", "admin/applications?status=x%27--", `admin/users?q=${"x".repeat(101)}`,
  ]) {
    expect((await bff(root, "GET", path)).status, path).toBe(400);
  }
  const injection = await bff(root, "GET", `admin/users?q=${encodeURIComponent("' OR 1=1 --")}&pageSize=10`);
  expect(injection.status).toBe(200);
  expect(injection.body.items).toEqual([]);
  expect(Number(sql("portal", "select count(*) from users"))).toBeGreaterThan(0);
});

test("ámbito del coordinador también en el modo paginado", async ({ browser }) => {
  const coordinator = await session(browser, "coordinador", "/admin");
  const root = await session(browser, "superadmin", "/admin");
  const programs = (await bff(root, "GET", "admin/programs")).body as { id: string; slug: string }[];
  const own = programs.find((p) => p.slug === "base-de-datos")!;
  const other = programs.find((p) => p.slug !== "base-de-datos")!;

  const apps = await paged(coordinator, "admin/applications?pageSize=100");
  expect(apps.items.every((a) => a.programId === own.id)).toBe(true);
  const otherApps = await paged(coordinator, `admin/applications?pageSize=100&programId=${other.id}`);
  expect(otherApps.items).toEqual([]);

  // Los usuarios visibles para el coordinador son solo los que tienen solicitud en su programa.
  const visible = await paged(coordinator, "admin/users?pageSize=100");
  for (const u of visible.items) {
    expect(sql("portal", `select count(*) from applications where user_id = '${u.id}' and program_id = '${own.id}'`)).not.toBe("0");
  }
});

test("autorización por rol en las listas paginadas", async ({ browser }) => {
  const expectations: [string, string, number][] = [
    ["estudiante", "admin/users?page=1", 403],
    ["aspirante", "admin/audit?page=1", 403],
    ["soporte", "admin/audit?page=1", 403],
    ["soporte", "admin/users?page=1", 200],
    ["profesor", "admin/applications?page=1", 403],
    ["coordinador", "admin/info-requests?page=1", 403],
    ["coordinador", "admin/content?page=1", 403],
    ["tecnico", "admin/audit?page=1", 200],
    ["academico", "admin/info-requests?page=1", 200],
  ];
  for (const [who, path, status] of expectations) {
    const page = await session(browser, who, "/mi-iinicia");
    expect((await bff(page, "GET", path)).status, `${who} ${path}`).toBe(status);
    await page.context().close();
  }
});

test("recursos ajenos: un estudiante no puede marcar como leído el aviso de otra persona", async ({ browser }) => {
  const root = await session(browser, "superadmin", "/admin");
  const studentId = sql("portal", "select id from users where email = 'estudiante@iinicia.test'");
  const teacherId = sql("portal", "select id from users where email = 'profesor@iinicia.test'");
  expect((await bff(root, "POST", "admin/notifications", { userId: teacherId, title: "Privado", body: "Privado" })).status).toBe(201);
  const noticeId = sql("portal", `select id from notifications where user_id = '${teacherId}' and title = 'Privado' order by created_at desc limit 1`);

  const student = await session(browser, "estudiante");
  expect((await bff(student, "POST", `me/notifications/${noticeId}/read`)).status).toBe(201);
  expect(sql("portal", `select read_at is null from notifications where id = '${noticeId}'`)).toBe("t");
  const mine = (await bff(student, "GET", "me/notifications")).body as { id: string }[];
  expect(mine.some((n) => n.id === noticeId)).toBe(false);
  expect(studentId).not.toBe(teacherId);
});
