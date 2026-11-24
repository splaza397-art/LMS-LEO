// Respaldo completo: bases portal, moodle y keycloak (pg_dump -Fc) y archivos de Moodle (moodledata).
// Uso:  node infrastructure/scripts/backup.mjs            -> crea backups/<fecha>/
//       node infrastructure/scripts/backup.mjs --verify   -> ademas restaura en bases temporales y compara conteos
import { execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const compose = ['compose', '-f', resolve(root, 'infrastructure/docker-compose.yml'), '--env-file', resolve(root, 'infrastructure/.env')];
const env = { ...process.env, MSYS_NO_PATHCONV: '1' };
const psql = (db, sql) => execFileSync('docker', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8', env }).trim();
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = resolve(root, 'backups', stamp);
mkdirSync(dir, { recursive: true });

/** Copia la salida binaria de un comando a un archivo sin pasar por memoria. */
function toFile(args, file) {
  return new Promise((ok, fail) => {
    const child = spawn('docker', args, { env });
    child.stdout.pipe(createWriteStream(file));
    let error = '';
    child.stderr.on('data', (d) => { error += d; });
    child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${args.slice(-4).join(' ')}: ${error.trim()}`))));
  });
}

const DATABASES = ['portal', 'moodle', 'keycloak'];
const manifest = { fecha: new Date().toISOString(), archivos: {}, conteos: {} };
for (const db of DATABASES) {
  const file = resolve(dir, `${db}.dump`);
  await toFile([...compose, 'exec', '-T', 'postgres', 'pg_dump', '-U', 'postgres', '-Fc', db], file);
  manifest.archivos[`${db}.dump`] = statSync(file).size;
}
await toFile(['run', '--rm', '-v', 'iinicia_moodle_data:/data:ro', 'postgres:17', 'tar', '-C', '/data', '-czf', '-', '.'], resolve(dir, 'moodledata.tar.gz'));
manifest.archivos['moodledata.tar.gz'] = statSync(resolve(dir, 'moodledata.tar.gz')).size;

const COUNTS = {
  portal: ['users', 'programs', 'enrolments', 'content_items', 'audit_log'],
  moodle: ['mdl_user', 'mdl_course', 'mdl_user_enrolments'],
  keycloak: ['user_entity', 'client'],
};
for (const [db, tables] of Object.entries(COUNTS)) {
  for (const t of tables) manifest.conteos[`${db}.${t}`] = Number(psql(db, `select count(*) from ${t}`));
}

if (process.argv.includes('--verify')) {
  // Restauracion real en bases temporales: prueba que el respaldo sirve, no solo que existe.
  manifest.verificacion = {};
  for (const db of DATABASES) {
    const temp = `restore_check_${db}`;
    psql('postgres', `drop database if exists ${temp}`);
    psql('postgres', `create database ${temp}`);
    await new Promise((ok, fail) => {
      const child = spawn('docker', [...compose, 'exec', '-T', 'postgres', 'pg_restore', '-U', 'postgres', '--no-owner', '--no-acl', '-d', temp], { env });
      let error = '';
      child.stderr.on('data', (d) => { error += d; });
      child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`pg_restore ${db}: ${error.trim()}`))));
      const input = spawn(process.platform === 'win32' ? 'cmd' : 'cat', process.platform === 'win32' ? ['/c', 'type', resolve(dir, `${db}.dump`)] : [resolve(dir, `${db}.dump`)]);
      input.stdout.pipe(child.stdin);
    });
    for (const t of COUNTS[db]) {
      const restored = Number(psql(temp, `select count(*) from ${t}`));
      manifest.verificacion[`${db}.${t}`] = restored === manifest.conteos[`${db}.${t}`] ? 'ok' : `diferente (${restored})`;
    }
    psql('postgres', `drop database ${temp}`);
  }
  const tarList = execFileSync('docker', ['run', '--rm', '-v', `${dir}:/b:ro`, 'postgres:17', 'sh', '-c', 'tar -tzf /b/moodledata.tar.gz | wc -l'], { encoding: 'utf8', env }).trim();
  manifest.verificacion['moodledata.archivos'] = Number(tarList) > 0 ? `ok (${tarList} entradas)` : 'vacio';
}

writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
const failed = Object.values(manifest.verificacion ?? {}).some((v) => !String(v).startsWith('ok'));
process.exit(failed ? 1 : 0);
