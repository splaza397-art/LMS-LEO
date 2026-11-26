// Pruebas de contrato de la Fase 2: la refactorización no puede cambiar la API que usan el portal y Android.
// Compara el código compilado (dist/) con la referencia tomada ANTES de refactorizar (routes.baseline.json y
// openapi.baseline.json). Uso: npm run test:contracts
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, describe, it } from 'node:test';

const require = createRequire(import.meta.url);
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module');
const { buildOpenApi, configureApp } = require('../../dist/app.setup');
const { routeInventory } = require('../../dist/tools/route-inventory');

const baselineRoutes = require('./routes.baseline.json');
const baselineApi = require('./openapi.baseline.json');

/**
 * Parámetros de consulta agregados a propósito en la Fase 2 (paginación, búsqueda y filtros).
 * Son opcionales: sin ellos la respuesta es la misma de antes.
 */
const ALLOWED_NEW_QUERY = new Set(['page', 'pageSize', 'sort', 'order', 'q', 'status', 'role', 'programId', 'type', 'action', 'from', 'to']);

/**
 * Rutas agregadas después de la referencia, cada una con su contrato completo. Agregar una ruta exige declararla
 * aquí; las rutas de la referencia siguen sin poder cambiar.
 * - Fase 4.10: POST /api/v1/me/logout, cierre de sesión coordinado (Keycloak y Moodle) de la persona del token.
 */
const APPROVED_NEW_ROUTES = {
  'POST /api/v1/me/logout': { permission: null, public: false, httpCode: 200, throttle: null, body: null, params: [], query: [] },
};

/**
 * Parámetros de consulta nuevos aprobados para una ruta concreta (más estricto que ALLOWED_NEW_QUERY).
 * - Fase 4.11: "bind" en GET /api/v1/me/campus-link. Opcional: sin él, la respuesta sigue siendo { url } (ahora el
 *   paso de vinculación de Moodle); con él, el enlace con el comprobante vinculado a ese navegador.
 */
const APPROVED_NEW_QUERY = { 'GET /api/v1/me/campus-link': ['bind'] };

const key = (r) => `${r.method} ${r.path}`;
const current = routeInventory(AppModule);
const byKey = new Map(current.map((r) => [key(r), r]));

describe('contrato de rutas (método, ruta, permiso, código HTTP, límite, cuerpo y parámetros)', () => {
  it('existen todas las rutas de antes y solo se agregaron las rutas nuevas aprobadas', () => {
    const now = current.map(key);
    for (const r of baselineRoutes) assert.ok(now.includes(key(r)), `falta la ruta ${key(r)}`);
    const added = now.filter((k) => !baselineRoutes.some((r) => key(r) === k)).sort();
    assert.deepEqual(added, Object.keys(APPROVED_NEW_ROUTES).sort(), 'ruta nueva no aprobada (agregarla a APPROVED_NEW_ROUTES y documentarla)');
  });

  for (const [route, expected] of Object.entries(APPROVED_NEW_ROUTES)) {
    it(`${route} (nueva)`, () => {
      const now = byKey.get(route);
      assert.ok(now, 'la ruta nueva no existe');
      for (const [field, value] of Object.entries(expected)) assert.deepEqual(now[field], value, `${field} distinto`);
    });
  }

  for (const before of baselineRoutes) {
    it(key(before), () => {
      const now = byKey.get(key(before));
      assert.ok(now, 'la ruta ya no existe');
      assert.equal(now.permission, before.permission, 'permiso distinto');
      assert.equal(now.public, before.public, 'cambió si es pública');
      assert.equal(now.httpCode, before.httpCode, 'código HTTP distinto');
      assert.deepEqual(now.throttle, before.throttle, 'límite de intentos distinto');
      assert.equal(now.body, before.body, 'DTO del cuerpo distinto');
      assert.deepEqual(now.params, before.params, 'parámetros de ruta o validación distintos');
      const name = (q) => q.split(' ')[0];
      for (const q of before.query) assert.ok(now.query.includes(q), `falta el parámetro de consulta ${q}`);
      for (const q of now.query.filter((x) => !before.query.includes(x))) {
        assert.ok(ALLOWED_NEW_QUERY.has(name(q)) || (APPROVED_NEW_QUERY[key(before)] ?? []).includes(name(q)), `parámetro de consulta nuevo no previsto: ${q}`);
      }
    });
  }
});

describe('contrato OpenAPI (cuerpos de solicitud y esquemas)', () => {
  let api;
  let app;
  before(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    api = buildOpenApi(app);
  });
  after(async () => { await app?.close(); });

  const schema = (doc, ref) => ref && doc.components.schemas[ref.split('/').pop()];
  const shape = (s) => s && { required: [...(s.required ?? [])].sort(), properties: Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, v.type ?? v.$ref ?? 'object']).sort()) };

  it('cada operación conserva sus parámetros obligatorios y el esquema de su cuerpo', () => {
    for (const [path, ops] of Object.entries(baselineApi.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        const now = api.paths[path]?.[method];
        assert.ok(now, `${method.toUpperCase()} ${path} desapareció del OpenAPI`);
        // Sin obligaciones nuevas: todo parámetro obligatorio ahora ya lo era antes. Relajar un parámetro de
        // consulta que estaba mal documentado como obligatorio es compatible; los de ruta deben seguir iguales.
        const required = (o) => (o.parameters ?? []).filter((p) => p.required).map((p) => `${p.in}:${p.name}`).sort();
        for (const r of required(now)) assert.ok(required(op).includes(r), `${method} ${path}: parámetro obligatorio nuevo ${r}`);
        const pathParams = (o) => required(o).filter((r) => r.startsWith('path:'));
        assert.deepEqual(pathParams(now), pathParams(op), `${method} ${path}: parámetros de ruta distintos`);
        const ref = (o) => o.requestBody?.content?.['application/json']?.schema?.$ref;
        assert.deepEqual(shape(schema(api, ref(now))), shape(schema(baselineApi, ref(op))), `${method} ${path}: esquema del cuerpo distinto`);
      }
    }
  });
});
