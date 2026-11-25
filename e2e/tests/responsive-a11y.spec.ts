// Fase 3 (etapa 3.7): accesibilidad automática (axe, WCAG 2.2 AA) y diseño adaptable en más tamaños y roles.
// Complementa a a11y-seo.spec.ts (públicas a 360/1280 y panel a 360). No sustituye una auditoría manual.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { session } from "./helpers";

const WIDTHS = [{ name: "tableta", width: 768 }, { name: "laptop", width: 1024 }, { name: "escritorio", width: 1440 }];

async function audit(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const { name, width } of WIDTHS) {
  test(`páginas públicas en ${name} (${width}px)`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    for (const path of ["/", "/oferta", "/oferta/base-de-datos", "/admisiones", "/registro"]) {
      await page.goto(path);
      await audit(page, `${path}@${width}`);
      expect(await overflow(page), `desborde en ${path}@${width}`).toBeLessThanOrEqual(0);
    }
  });

  test(`panel de gestión con tablas en ${name} (${width}px)`, async ({ browser }) => {
    const page = await session(browser, "superadmin", "/admin");
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ["Solicitudes", "Usuarios", "Programas", "Contenidos", "Información", "Avisos", "Reportes", "Auditoría"]) {
      await page.getByRole("tab", { name: tab }).click();
      await audit(page, `admin/${tab}@${width}`);
      expect(await overflow(page), `desborde en ${tab}@${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("Mi IINICIA de cada rol en teléfono y escritorio", async ({ browser }) => {
  for (const who of ["profesor", "coordinador", "aspirante", "soporte", "tecnico"]) {
    const page = await session(browser, who, "/mi-iinicia");
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await audit(page, `mi-iinicia/${who}@${width}`);
      expect(await overflow(page), `desborde en mi-iinicia/${who}@${width}`).toBeLessThanOrEqual(0);
    }
    await page.context().close();
  }
});

test("teclado: pestañas del panel con flechas y foco visible", async ({ browser }) => {
  const page = await session(browser, "superadmin", "/admin");
  const first = page.getByRole("tab", { name: "Solicitudes" });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Usuarios" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Usuarios" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Auditoría" })).toBeFocused();
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline, "el foco debe ser visible").not.toBe("none");
  // Tab sale de la lista de pestañas hacia el contenido (solo la activa está en el orden de tabulación).
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).not.toBe("tab");
});

test("menú móvil: se abre, se recorre con teclado y se cierra con Escape", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 360, height: 800 } })).newPage();
  await page.goto("/");
  await page.locator('summary[aria-label="Menú"]').click();
  const nav = page.getByRole("navigation", { name: "Móvil" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Oferta académica" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
});
