// Fase 4.10: cambio de cuenta después de un cierre de sesión con Moodle o Keycloak detenidos.
// Detiene y vuelve a iniciar contenedores (docker compose stop/start, sin recrearlos), así que no forma parte de la
// suite normal. Uso, con servicios, backend y portal encendidos: node session-failures.mjs
// Solo cuentas demo; no imprime contraseñas ni tokens.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../backend/.env'), quiet: true });
const COMPOSE = ['compose', '-f', '../infrastructure/docker-compose.yml', '--env-file', '../infrastructure/.env'];
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).trim();
const sql = (q) => docker(...COMPOSE, 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'portal', '-tAc', q);
const health = (svc) => docker('inspect', '-f', '{{.State.Health.Status}}', `iinicia-${svc}-1`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitHealthy(svc) { for (let i = 0; i < 120 && health(svc) !== 'healthy'; i++) await sleep(3000); return health(svc); }
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? ` (${detail})` : ''}`); };

const browser = await chromium.launch();
async function portalLogin(page, who) {
  await page.goto('http://localhost:3000/auth/login?returnTo=/mi-iinicia');
  await page.waitForURL((u) => u.port === '8180' || u.pathname.startsWith('/mi-iinicia'));
  if (!page.url().includes(':8180')) return false;
  // Sesión residual de Keycloak (cierre sin confirmar) + prompt=login: Keycloak pide la contraseña de la cuenta
  // anterior y ofrece reiniciar. Se registra y se reinicia para entrar con la cuenta nueva.
  if (await page.locator('#kc-attempted-username').count()) {
    check(`${who}: Keycloak no entra solo; pide la contraseña de la cuenta anterior y ofrece reiniciar`, (await page.locator('#password').count()) === 1 && (await page.locator('#reset-login').count()) === 1);
    await page.click('#reset-login');
    await page.waitForSelector('#username');
  }
  await page.fill('#username', `${who}@iinicia.test`); await page.fill('#password', process.env.DEMO_PASSWORD); await page.click('#kc-login');
  await page.waitForURL(/localhost:3000\/mi-iinicia/);
  return true;
}
async function campus(page) {
  const r = await page.request.get('http://localhost:3000/api/bff/v1/me/campus-link', { headers: { origin: 'http://localhost:3000' } });
  await page.goto((await r.json()).url); await page.waitForLoadState('load');
}
async function moodleIdentity(page) {
  await page.goto('http://localhost:8081/user/profile.php').catch(() => {}); await page.waitForLoadState('load').catch(() => {});
  if (!page.url().startsWith('http://localhost:8081/user/profile.php')) return 'sin sesión';
  return (await page.locator('.page-header-headings h1, .page-context-header h2, h1').first().innerText()).trim();
}
async function logoutClick(page) {
  await page.goto('http://localhost:3000/mi-iinicia');
  await Promise.all([page.waitForEvent('framenavigated').catch(() => {}), page.getByRole('button', { name: 'Salir' }).click()]);
  await sleep(4000);
}
const reauthCookie = async (page) => (await page.context().cookies('http://localhost:3000')).some((c) => c.name === 'iin_reauth');

// --- Escenario 1: Moodle detenido al cerrar sesión
{
  const page = await (await browser.newContext()).newPage();
  await portalLogin(page, 'estudiante'); await campus(page);
  check('M1 antes: Moodle con la sesión del estudiante', (await moodleIdentity(page)) === 'Demo Estudiante');
  docker(...COMPOSE, 'stop', 'moodle');
  await logoutClick(page);
  check('M2 cierre con Moodle detenido: queda pendiente en el backend', sql("select moodle_logout_pending_at is not null from users where email='estudiante@iinicia.test'") === 't');
  check('M3 el portal marca reautenticación (cierre no confirmado)', await reauthCookie(page));
  check('M4 entra el profesor: Keycloak pide credenciales', await portalLogin(page, 'profesor'));
  docker(...COMPOSE, 'start', 'moodle');
  check('M5 Moodle vuelve', (await waitHealthy('moodle')) === 'healthy');
  let pending = 't';
  for (let i = 0; i < 40 && pending === 't'; i++) { await sleep(5000); pending = sql("select moodle_logout_pending_at is not null from users where email='estudiante@iinicia.test'"); }
  check('M6 el reintento cierra las sesiones de Moodle pendientes', pending === 'f');
  check('M7 acceso directo a Moodle ya no es del estudiante', (await moodleIdentity(page)) !== 'Demo Estudiante');
  await campus(page);
  check('M8 el campus abre con el profesor', (await moodleIdentity(page)) === 'Demo Docente');
  await page.context().close();
}

// --- Escenario 2: Keycloak detenido al cerrar sesión
{
  const page = await (await browser.newContext()).newPage();
  await portalLogin(page, 'estudiante'); await campus(page);
  check('K1 antes: Moodle con la sesión del estudiante', (await moodleIdentity(page)) === 'Demo Estudiante');
  docker(...COMPOSE, 'stop', 'keycloak');
  await logoutClick(page);
  check('K2 el portal marca reautenticación (Keycloak no confirmó)', await reauthCookie(page));
  check('K3 Moodle sí cerró: acceso directo ya no es del estudiante', (await moodleIdentity(page)) !== 'Demo Estudiante');
  docker(...COMPOSE, 'start', 'keycloak');
  check('K4 Keycloak vuelve', (await waitHealthy('keycloak')) === 'healthy');
  check('K5 entra el profesor: Keycloak pide credenciales aunque quede la sesión del estudiante en el navegador', await portalLogin(page, 'profesor'));
  const me = await page.request.get('http://localhost:3000/api/bff/v1/me', { headers: { origin: 'http://localhost:3000' } });
  check('K6 el portal es del profesor', (await me.json()).email === 'profesor@iinicia.test');
  await campus(page);
  check('K7 el campus abre con el profesor', (await moodleIdentity(page)) === 'Demo Docente');
  check('K8 la cookie de reautenticación se borró tras entrar', !(await reauthCookie(page)));
  await page.context().close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} de ${results.length} comprobaciones correctas`);
process.exit(failed ? 1 : 0);
