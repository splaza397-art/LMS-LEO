// Borra los datos creados por las pruebas en Keycloak, Moodle y el portal. Conserva las 8 cuentas demo.
import { execFileSync } from 'node:child_process';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'backend/.env'), quiet: true });
const compose = ['compose', '-f', resolve(root, 'infrastructure/docker-compose.yml'), '--env-file', resolve(root, 'infrastructure/.env')];
const docker = (...args) => execFileSync('docker', [...compose, ...args], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).trim();
const sql = (query) => docker('exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'portal', '-tAc', query);

const TEST_USERS = `email ~ '^(poc|profesor|alumno|rolmoodle|recorrido)\\.[0-9]+@iinicia\\.test$'`;
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const { KEYCLOAK_URL: kc, KEYCLOAK_REALM: realm, KEYCLOAK_BACKEND_CLIENT_ID: id, KEYCLOAK_BACKEND_CLIENT_SECRET: secret } = process.env;
const tokenResponse = await fetch(`${kc}/realms/${realm}/protocol/openid-connect/token`, {
  method: 'POST',
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
});
if (!tokenResponse.ok) throw new Error('No se pudo obtener token de Keycloak');
const { access_token: token } = await tokenResponse.json();

const subs = sql(`select oidc_sub from users where ${TEST_USERS}`).split('\n').filter(Boolean);
let removed = 0;
for (const sub of subs) {
  const response = await fetch(`${kc}/admin/realms/${realm}/users/${sub}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  if (response.ok || response.status === 404) removed++;
  else throw new Error(`Keycloak rechazó el borrado (HTTP ${response.status})`);
}
console.log(`keycloak: usuarios=${removed}`);
console.log(docker('exec', '-T', '-u', 'www-data', 'moodle', 'php', 'public/local/iinicia/cli/cleanup_e2e.php'));

sql(`delete from users where ${TEST_USERS}`);
sql(`delete from enrolments where program_id in (select id from programs where slug ~ '^(programa-e2e|cohorte)-[0-9]+$')`);
sql(`delete from applications where program_id in (select id from programs where slug ~ '^(programa-e2e|cohorte)-[0-9]+$')`);
sql(`delete from programs where slug ~ '^(programa-e2e|cohorte)-[0-9]+$'`);
sql(`delete from content_items where slug ~ '^noticia-e2e-[0-9]+$'`);
sql(`delete from info_requests where name ~ '^Interesada [0-9]+$'`);
sql(`delete from notifications where title = 'Privado' and body = 'Privado'`);
sql(`delete from media where data = decode('${PNG_1PX}', 'base64')`);
console.log(`portal: usuarios=${sql('select count(*) from users')} programas=${sql('select count(*) from programs')}`);
