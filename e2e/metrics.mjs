// Métricas del portal para comparar antes y después de la Fase 3. Uso: node metrics.mjs <etiqueta>
// Mide, con caché vacía, el JavaScript descargado, el número de solicitudes y los tiempos de navegación.
// Son mediciones de una PC de desarrollo: sirven para comparar, no como valores absolutos.
import { chromium } from '@playwright/test';
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../backend/.env'), quiet: true });
const label = process.argv[2] ?? 'medicion';
const BASE = 'http://localhost:3000';
const RUNS = 5;
const pages = [
  { name: 'inicio', path: '/' },
  { name: 'oferta', path: '/oferta' },
  { name: 'programa', path: '/oferta/base-de-datos' },
  { name: 'mi-iinicia (estudiante)', path: '/mi-iinicia', who: 'estudiante' },
  { name: 'panel (superadmin)', path: '/admin', who: 'superadmin', ready: 'role=tab' },
];

async function login(page, who, path) {
  await page.goto(`${BASE}/auth/login?returnTo=${encodeURIComponent(path)}`);
  await page.waitForURL(/localhost:8180/);
  await page.fill('#username', `${who}@iinicia.test`);
  await page.fill('#password', process.env.DEMO_PASSWORD);
  await page.click('#kc-login');
  await page.waitForURL((u) => u.href.startsWith(BASE));
}

const browser = await chromium.launch();
const results = [];
for (const target of pages) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    if (target.who) await login(page, target.who, '/');
    // JS propio de la página: scripts pedidos antes del evento load. Lo que llega después son, sobre todo,
    // precargas de Next.js de los enlaces visibles, que dependen del momento y no son código de la página.
    let jsBytes = 0;
    let jsTotalBytes = 0;
    let requests = 0;
    let loaded = false;
    page.on('load', () => { loaded = true; });
    page.on('request', (req) => { req.beforeLoad = !loaded; });
    page.on('response', async (r) => {
      requests++;
      if (r.request().resourceType() !== 'script') return;
      // Bytes transferidos (comprimidos); lo que sale de la caché del navegador cuenta 0.
      const size = Math.max(0, (await r.request().sizes().catch(() => ({ responseBodySize: 0 }))).responseBodySize);
      jsTotalBytes += size;
      if (r.request().beforeLoad) jsBytes += size;
    });
    const started = Date.now();
    await page.goto(`${BASE}${target.path}`, { waitUntil: 'load' });
    if (target.ready) await page.locator(target.ready).first().waitFor();
    await page.waitForLoadState('networkidle');
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      return { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) };
    });
    runs.push({ ...nav, jsKB: Math.round(jsBytes / 1024), jsTotalKB: Math.round(jsTotalBytes / 1024), requests, readyMs: Date.now() - started });
    await context.close();
  }
  const median = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(RUNS / 2)];
  results.push({ page: target.name, path: target.path, jsKB: median('jsKB'), jsTotalKB: median('jsTotalKB'), requests: median('requests'), ttfbMs: median('ttfb'), domContentLoadedMs: median('domContentLoaded'), loadMs: median('load'), readyMs: median('readyMs') });
}
await browser.close();
const out = resolve(import.meta.dirname, `../documentation/evidencias/rendimiento-frontend-${label}.json`);
writeFileSync(out, JSON.stringify({ fecha: new Date().toISOString(), corridas: RUNS, nota: `Mediana de ${RUNS} cargas con caché vacía, PC de desarrollo. jsKB: JS pedido antes de load (propio de la página); jsTotalKB: incluye precargas de enlaces hasta networkidle`, resultados: results }, null, 2) + '\n');
console.table(results);
