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
const RUNS = 3;
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
    let jsBytes = 0;
    let requests = 0;
    page.on('response', async (r) => {
      requests++;
      if (r.request().resourceType() === 'script') jsBytes += Number(r.headers()['content-length'] ?? (await r.body().catch(() => Buffer.alloc(0))).length);
    });
    const started = Date.now();
    await page.goto(`${BASE}${target.path}`, { waitUntil: 'load' });
    if (target.ready) await page.locator(target.ready).first().waitFor();
    await page.waitForLoadState('networkidle');
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      return { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) };
    });
    runs.push({ ...nav, jsKB: Math.round(jsBytes / 1024), requests, readyMs: Date.now() - started });
    await context.close();
  }
  const median = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(RUNS / 2)];
  results.push({ page: target.name, path: target.path, jsKB: median('jsKB'), requests: median('requests'), ttfbMs: median('ttfb'), domContentLoadedMs: median('domContentLoaded'), loadMs: median('load'), readyMs: median('readyMs') });
}
await browser.close();
const out = resolve(import.meta.dirname, `../documentation/evidencias/rendimiento-frontend-${label}.json`);
writeFileSync(out, JSON.stringify({ fecha: new Date().toISOString(), corridas: RUNS, nota: 'Mediana de 3 cargas con caché vacía, PC de desarrollo', resultados: results }, null, 2) + '\n');
console.table(results);
