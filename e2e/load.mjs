// Prueba de carga de rutas publicas. Uso: node load.mjs [conexiones] [segundos]
import autocannon from 'autocannon';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const connections = Number(process.argv[2] ?? 25);
const duration = Number(process.argv[3] ?? 20);
const routes = ['/', '/oferta', '/noticias'];

const results = [];
for (const path of routes) {
  const r = await autocannon({ url: `http://localhost:3000${path}`, connections, duration });
  results.push({
    ruta: path, conexiones: connections, segundos: duration, peticiones: r.requests.total,
    porSegundo: Math.round(r.requests.average), latenciaP50ms: r.latency.p50, latenciaP99ms: r.latency.p99,
    errores: r.errors + r.timeouts, no2xx: r.non2xx,
  });
  console.log(results.at(-1));
}
const output = resolve(dirname(fileURLToPath(import.meta.url)), '../documentation/evidencias/carga.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ fecha: new Date().toISOString(), entorno: 'PC local con todos los servicios', results }, null, 2));
process.exit(results.some((r) => r.errores > 0 || r.no2xx > 0) ? 1 : 0);
