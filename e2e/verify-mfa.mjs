// Verifica la MFA de roles privilegiados con una cuenta temporal (prefijo poc.*, la borra cleanup.mjs).
// Usa el codigo compilado del backend con MFA_PRIVILEGED_ROLES=true.
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

process.env.MFA_PRIVILEGED_ROLES = 'true';
const backend = resolve(import.meta.dirname, '../backend');
process.chdir(backend);
const require = createRequire(resolve(backend, 'package.json'));
const { KeycloakService } = require('./dist/integrations/keycloak.service.js');

const keycloak = new KeycloakService();
const email = `poc.mfa${Date.now()}@iinicia.test`;
const password = 'PruebaSegura123';
const sub = await keycloak.createUser({ email, firstName: 'Prueba', lastName: 'MFA', password, emailVerified: true });
await keycloak.setRealmRoles(sub, ['admin_tecnico']);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8180/realms/iinicia/account');
await page.locator('#username').fill(email);
await page.locator('#password').fill(password);
await page.locator('#kc-login').click();
await page.waitForLoadState('networkidle');
const otpSetup = await page.locator('#totp').count();
const text = (await page.locator('main, body').first().innerText()).slice(0, 160).replace(/\s+/g, ' ');
await page.screenshot({ path: '../documentation/evidencias/capturas/32-mfa-configurar.png' });
await browser.close();
await keycloak.deleteUser(sub);
console.log(otpSetup > 0 ? 'MFA EXIGIDA: pide configurar autenticador' : 'MFA NO EXIGIDA', '|', text);
process.exit(otpSetup > 0 ? 0 : 1);
