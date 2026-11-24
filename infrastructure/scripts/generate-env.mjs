// Genera infrastructure/.env, backend/.env y frontend/.env.local con secretos aleatorios.
// No sobrescribe archivos existentes: rotar secretos es una decision explicita.
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const secret = (bytes = 24) => randomBytes(bytes).toString('hex');

const urls = {
  PORTAL_PUBLIC_URL: 'http://localhost:3000',
  MOODLE_PUBLIC_URL: 'http://localhost:8081',
  KEYCLOAK_PUBLIC_URL: 'http://localhost:8180',
};
const s = {
  POSTGRES_PASSWORD: secret(),
  PORTAL_DB_PASSWORD: secret(),
  MOODLE_DB_PASSWORD: secret(),
  KEYCLOAK_DB_PASSWORD: secret(),
  KEYCLOAK_ADMIN_PASSWORD: secret(),
  MOODLE_ADMIN_PASSWORD: `Aa1!${secret(12)}`,
  MOODLE_WS_TOKEN: secret(16),
  KC_PORTAL_CLIENT_SECRET: secret(),
  KC_MOODLE_CLIENT_SECRET: secret(),
  KC_BACKEND_CLIENT_SECRET: secret(),
  SESSION_SECRET: secret(32),
};

const toEnv = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
const files = {
  'infrastructure/.env': toEnv({ ...urls, ...s, SESSION_SECRET: undefined }).replace('SESSION_SECRET=undefined\n', ''),
  'backend/.env': toEnv({
    PORT: 4000,
    // Solo la maquina local. En contenedores: 0.0.0.0 dentro de una red interna.
    HOST: '127.0.0.1',
    // Proxies cuyo X-Forwarded-For se acepta. Nunca "true" ni 0.0.0.0/0 (ver src/security/trusted-proxies.ts).
    TRUSTED_PROXIES: 'loopback',
    NODE_ENV: 'development',
    DATABASE_URL: `postgres://portal:${s.PORTAL_DB_PASSWORD}@localhost:5434/portal`,
    CORS_ORIGINS: urls.PORTAL_PUBLIC_URL,
    KEYCLOAK_URL: urls.KEYCLOAK_PUBLIC_URL,
    KEYCLOAK_REALM: 'iinicia',
    KEYCLOAK_BACKEND_CLIENT_ID: 'iinicia-backend',
    KEYCLOAK_BACKEND_CLIENT_SECRET: s.KC_BACKEND_CLIENT_SECRET,
    MOODLE_URL: urls.MOODLE_PUBLIC_URL,
    MOODLE_WS_TOKEN: s.MOODLE_WS_TOKEN,
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    MAIL_FROM: 'IINICIA <no-responder@iinicia.local>',
    DEMO_PASSWORD: `Demo-${secret(6)}A1`,
    // DEV: las cuentas demo y las pruebas automaticas no tienen autenticador. En STAGING/PROD dejar en true.
    MFA_PRIVILEGED_ROLES: 'false',
  }),
  'frontend/.env.local': toEnv({
    BACKEND_URL: 'http://localhost:4000',
    PORTAL_URL: urls.PORTAL_PUBLIC_URL,
    MOODLE_URL: urls.MOODLE_PUBLIC_URL,
    OIDC_ISSUER: `${urls.KEYCLOAK_PUBLIC_URL}/realms/iinicia`,
    OIDC_CLIENT_ID: 'iinicia-portal',
    OIDC_CLIENT_SECRET: s.KC_PORTAL_CLIENT_SECRET,
    SESSION_SECRET: s.SESSION_SECRET,
    // Proxies propios delante del portal. 0 en DEV (sin Nginx): no se reenvia ninguna IP al backend.
    TRUSTED_PROXY_HOPS: 0,
  }),
};

const existing = Object.keys(files).filter((f) => existsSync(resolve(root, f)));
if (existing.length) {
  console.error(`Ya existen: ${existing.join(', ')}. No se modifico nada.`);
  process.exit(existing.length === Object.keys(files).length ? 0 : 1);
}
for (const [file, content] of Object.entries(files)) writeFileSync(resolve(root, file), content, { flag: 'wx' });
console.log(`Generados: ${Object.keys(files).join(', ')}`);
