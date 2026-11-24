// Genera el inventario de endpoints y el OpenAPI desde el código compilado. Uso: npm run inventory
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../app.module';
import { buildOpenApi, configureApp } from '../app.setup';
import { routeInventory, type RouteEntry } from './route-inventory';

const access = (r: RouteEntry) => (r.public ? 'público' : r.permission ? `\`${r.permission}\`` : 'sesión');
const limit = (r: RouteEntry) => (r.throttle ? `${r.throttle.limit}/${r.throttle.ttl / 1000}s` : '');
const params = (r: RouteEntry) => [...r.params, ...r.query.map((q) => `?${q}`)].join(' ');

async function main() {
  const root = resolve(__dirname, '../../..');
  const routes = routeInventory(AppModule);
  writeFileSync(resolve(root, 'documentation/api/inventario-endpoints.json'), JSON.stringify(routes, null, 2) + '\n');

  const rows = routes.map((r) => `| ${r.method} | \`${r.path}\` | ${access(r)} | ${r.httpCode} | ${limit(r)} | ${r.body ?? ''} | ${params(r)} |`);
  writeFileSync(resolve(root, 'documentation/api/inventario-endpoints.md'), [
    '# Inventario de endpoints',
    '',
    'Generado desde el código con `npm run inventory` (en `backend/`). No editar a mano.',
    '',
    `Total: **${routes.length}** endpoints. "sesión" = requiere sesión válida, sin permiso adicional.`,
    '',
    '| Método | Ruta | Acceso | Código | Límite | Cuerpo | Parámetros |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n'));

  // El OpenAPI no necesita base de datos: se genera sin inicializar los módulos.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureApp(app);
  writeFileSync(resolve(root, 'documentation/api/openapi.json'), JSON.stringify(buildOpenApi(app), null, 2) + '\n');
  await app.close();
  console.log(`Inventario: ${routes.length} endpoints. OpenAPI actualizado.`);
}

void main();
