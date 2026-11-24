import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { session, sql } from "./helpers";

const PUBLIC = ["/", "/universidad", "/universidad/quienes-somos", "/universidad/docentes", "/universidad/autoridades", "/oferta",
  "/oferta/base-de-datos", "/admisiones", "/noticias", "/contacto", "/registro"];

async function audit(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
}

for (const width of [360, 1280]) {
  test(`accesibilidad y responsive de páginas públicas a ${width}px`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
    for (const path of PUBLIC) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await audit(page, `${path}@${width}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `desborde horizontal en ${path}`).toBeLessThanOrEqual(0);
      await expect(page.locator("h1"), `un solo h1 en ${path}`).toHaveCount(1);
    }
  });
}

test("accesibilidad de Mi IINICIA y de cada pestaña del panel", async ({ browser }) => {
  const student = await session(browser, "estudiante");
  await expect(student.getByRole("heading", { name: "Mis cursos" })).toBeVisible();
  await audit(student, "mi-iinicia");

  const root = await session(browser, "superadmin", "/admin");
  await root.setViewportSize({ width: 360, height: 800 });
  for (const tab of ["Solicitudes", "Usuarios", "Programas", "Contenidos", "Información", "Avisos", "Reportes", "Auditoría"]) {
    await root.getByRole("tab", { name: tab }).click();
    await audit(root, `admin/${tab}`);
    const overflow = await root.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `desborde en ${tab}`).toBeLessThanOrEqual(0);
  }
});

test("se puede saltar al contenido con teclado", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
});

test("SEO: metadatos, canonical, sitemap y robots", async ({ page, request }) => {
  await page.goto("/oferta/base-de-datos");
  await expect(page).toHaveTitle(/Base de Datos \| IINICIA/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/oferta\/base-de-datos$/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /almacenamiento y gestión de datos/);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.headers()["content-type"]).toContain("xml");
  const xml = await sitemap.text();
  for (const path of ["/oferta/base-de-datos", "/universidad/quienes-somos", "/universidad/docentes"]) expect(xml).toContain(path);
  expect(xml).not.toContain("/admin");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain("sitemap.xml");
  expect((await request.get("/no-existe-esta-pagina")).status()).toBe(404);
});

test("redirecciones 301 de URLs del WordPress anterior", async ({ request }) => {
  for (const [old, target] of [["/?page_id=1172", "/universidad/quienes-somos"], ["/?sfwd-courses=geografia-2", "/oferta/base-de-datos"], ["/?page_id=1202", "/oferta"]]) {
    const response = await request.get(old, { maxRedirects: 0 });
    expect(response.status(), old).toBe(301);
    expect(new URL(response.headers().location, "http://localhost:3000").pathname, old).toBe(target);
  }
});

test("redirección 301 de una URL heredada", async ({ request }) => {
  const source = `/legado-${Date.now()}`;
  sql("portal", `insert into redirects values ('${source}', '/oferta')`);
  try {
    await expect.poll(async () => (await request.get(source, { maxRedirects: 0 })).status(), { timeout: 75_000, intervals: [5000] }).toBe(301);
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.headers().location).toMatch(/\/oferta$/);
  } finally {
    sql("portal", `delete from redirects where source_path = '${source}'`);
  }
});
