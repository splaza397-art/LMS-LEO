// Clientes de integración con respuestas simuladas (sin red): traducción de errores y protección del token.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { BadGatewayException, ConflictException, Logger } from '@nestjs/common';
import { config } from '../src/config';
import { KeycloakService } from '../src/integrations/keycloak/keycloak.service';
import { MoodleService } from '../src/integrations/moodle/moodle.service';

const realFetch = globalThis.fetch;
const logs: string[] = [];
afterEach(() => { globalThis.fetch = realFetch; logs.length = 0; });

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => handler(String(input), init)) as typeof fetch;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const capture = (m: unknown) => { logs.push(String(m)); };
Logger.overrideLogger({ log: capture, warn: capture, error: capture, debug: capture, verbose: capture });

describe('MoodleService', () => {
  it('envía el token del backend solo en el cuerpo de la petición y devuelve los datos', async () => {
    let body = '';
    stubFetch((url, init) => {
      assert.ok(!url.includes(config.moodle.token), 'el token no debe ir en la URL');
      body = String(init.body);
      return json({ courses: [{ id: 3, fullname: 'Base de Datos', shortname: 'BD-101', visible: true }] });
    });
    const courses = await new MoodleService().listCourses();
    assert.equal(courses[0].shortname, 'BD-101');
    assert.match(body, /wsfunction=local_iinicia_list_courses/);
  });

  it('una excepción de Moodle se traduce a 502 sin exponer detalles internos ni el token', async () => {
    stubFetch(() => json({ exception: 'dml_write_exception', errorcode: 'dmlwriteexception', message: 'detalle interno' }));
    await assert.rejects(new MoodleService().upsertUser({ uuid: 'u', sub: 's', email: 'e@iinicia.test', firstName: 'A', lastName: 'B', suspended: false }),
      (e: unknown) => e instanceof BadGatewayException && /dmlwriteexception/.test((e as Error).message) && !/detalle interno/.test((e as Error).message));
    assert.ok(logs.length > 0, 'el error debe quedar registrado');
    assert.ok(logs.every((l) => !l.includes(config.moodle.token)), 'el token no debe aparecer en los registros');
  });

  it('si Moodle no responde, el error es 502 "El campus no está disponible"', async () => {
    stubFetch(() => { throw new TypeError('fetch failed'); });
    await assert.rejects(new MoodleService().overview(5), (e: unknown) => e instanceof BadGatewayException && /no está disponible/.test((e as Error).message));
  });

  it('health() devuelve false cuando Moodle falla, sin lanzar', async () => {
    stubFetch(() => { throw new TypeError('fetch failed'); });
    assert.equal(await new MoodleService().health(), false);
  });
});

describe('KeycloakService', () => {
  const withToken = (next: (url: string, init: RequestInit) => Response) => stubFetch((url, init) =>
    url.endsWith('/protocol/openid-connect/token') ? json({ access_token: 'tok', expires_in: 300 }) : next(url, init));

  it('un correo ya registrado en Keycloak (409) se informa como conflicto', async () => {
    withToken(() => new Response(null, { status: 409 }));
    await assert.rejects(new KeycloakService().createUser({ email: 'x@iinicia.test', firstName: 'A', lastName: 'B', password: 'Segura12345' }),
      (e: unknown) => e instanceof ConflictException);
  });

  it('crea la identidad con verificación de correo pendiente y devuelve su id', async () => {
    let sent: Record<string, unknown> = {};
    withToken((url, init) => {
      sent = JSON.parse(String(init.body));
      return new Response(null, { status: 201, headers: { location: `${url}/abc-123` } });
    });
    assert.equal(await new KeycloakService().createUser({ email: 'Nuevo@IINICIA.test', firstName: 'A', lastName: 'B', password: 'Segura12345' }), 'abc-123');
    assert.equal(sent.email, 'nuevo@iinicia.test');
    assert.deepEqual(sent.requiredActions, ['VERIFY_EMAIL']);
    assert.equal(sent.emailVerified, false);
  });

  it('reutiliza el token de servicio mientras no venza', async () => {
    let tokens = 0;
    stubFetch((url) => {
      if (url.endsWith('/token')) { tokens++; return json({ access_token: 'tok', expires_in: 300 }); }
      return json([]);
    });
    const kc = new KeycloakService();
    await kc.findByEmail('a@iinicia.test');
    await kc.findByEmail('b@iinicia.test');
    assert.equal(tokens, 1);
  });
});
