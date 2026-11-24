// Captura paginas publicas para revision visual. Uso: node capture.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = '../documentation/evidencias/capturas';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [name, path, width] of [
  ['20-inicio-escritorio', '/', 1280], ['21-inicio-movil', '/', 390], ['22-oferta', '/oferta', 1280],
  ['23-curso-base-de-datos', '/oferta/base-de-datos', 1280], ['24-mision-vision', '/universidad/mision-vision', 1280],
]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`http://localhost:3000${path}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log('ok');
