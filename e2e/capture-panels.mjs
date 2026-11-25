// Fase 3: capturas del panel y de Mi IINICIA refactorizados, solo con datos ficticios.
// Uso (servicios, backend y portal encendidos): node capture-panels.mjs
// - Cuentas demo @iinicia.test y 230 solicitudes "Interesada N" que se insertan y se borran al terminar.
// - Cualquier fila con un correo que no sea @iinicia.test se cubre con una máscara (igual que privacyMask).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '../backend/.env'), quiet: true });
const out = '../documentation/evidencias/capturas';
mkdirSync(out, { recursive: true });
const COMPOSE = ['compose', '-f', '../infrastructure/docker-compose.yml', '--env-file', '../infrastructure/.env'];
const sql = (q) => execFileSync('docker', [...COMPOSE, 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'portal', '-tAc', q],
  { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).trim();
const mask = (page) => [page.locator('tr, li').filter({ hasText: /@/ }).filter({ hasNotText: /@iinicia\.test/ })];

const browser = await chromium.launch();
async function session(who, path, width) {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  await page.goto(`http://localhost:3000/auth/login?returnTo=${encodeURIComponent(path)}`);
  await page.waitForURL(/localhost:8180/);
  await page.fill('#username', `${who}@iinicia.test`);
  await page.fill('#password', process.env.DEMO_PASSWORD);
  await page.click('#kc-login');
  await page.waitForURL(/localhost:3000/);
  await page.waitForLoadState('networkidle');
  return page;
}
async function shot(page, name) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true, mask: mask(page) });
  await page.context().close();
}

sql(`INSERT INTO info_requests (name, email, message, consent_at, created_at)
  SELECT 'Interesada ' || n, 'interesada' || n || '@iinicia.test', 'Mensaje de prueba ' || n, now(), now() - (n || ' minutes')::interval
    FROM generate_series(1, 230) AS n`);
try {
  let page = await session('academico', '/admin?seccion=informacion&q=Interesada', 1280);
  await page.getByText(/Mostrando 1–20 de 230/).waitFor();
  await shot(page, '50-admin-informacion-paginada');

  page = await session('superadmin', '/admin?seccion=usuarios&q=iinicia.test', 1280);
  await page.getByText(/Mostrando/).first().waitFor();
  await shot(page, '51-admin-usuarios-filtrados');

  page = await session('superadmin', '/admin?seccion=usuarios&q=iinicia.test', 360);
  await page.getByText(/Mostrando/).first().waitFor();
  await shot(page, '52-admin-usuarios-movil');

  page = await session('coordinador', '/mi-iinicia', 1440);
  await shot(page, '53-mi-iinicia-coordinador');

  page = await session('profesor', '/mi-iinicia', 360);
  await shot(page, '54-mi-iinicia-profesor-movil');
} finally {
  sql(`DELETE FROM info_requests WHERE name ~ '^Interesada [0-9]+$'`);
  await browser.close();
}
console.log('ok');
