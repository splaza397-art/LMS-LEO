// Fase 4.10: comprobante de entrada al campus y cierre de sesión coordinado (sin red: servicios simulados).
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { signCampusTicket, TICKET_LIFETIME_SECONDS } from '../src/modules/dashboard/campus-ticket';
import { SessionService } from '../src/modules/synchronization/session.service';
import type { AuthUser } from '../src/modules/auth/auth.decorators';

const SECRET = 'x'.repeat(64);
const decode = (ticket: string) => JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString());

describe('Comprobante de entrada al campus', () => {
  const input = { uid: 5, uuid: '6f1b3c2a-0000-4000-8000-000000000001', sub: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', want: '/course/view.php?id=3' };

  it('lleva la identidad, el destino, 60 s de vida y un identificador aleatorio', () => {
    const data = decode(signCampusTicket(input, SECRET, 1_000));
    assert.deepEqual({ uid: data.uid, uuid: data.uuid, sub: data.sub, want: data.want }, input);
    assert.equal(data.v, 1);
    assert.equal(data.exp - data.iat, TICKET_LIFETIME_SECONDS);
    assert.match(data.jti, /^[A-Za-z0-9_-]{32}$/);
  });

  it('la firma es HMAC-SHA256 del contenido: cambiar un campo la invalida', () => {
    const [payload, signature] = signCampusTicket(input, SECRET).split('.');
    assert.equal(signature, createHmac('sha256', SECRET).update(payload).digest('base64url'));
    const forged = Buffer.from(JSON.stringify({ ...decode(`${payload}.x`), uid: 6 })).toString('base64url');
    assert.notEqual(createHmac('sha256', SECRET).update(forged).digest('base64url'), signature);
  });

  it('cada comprobante es distinto (uso único)', () => {
    assert.notEqual(decode(signCampusTicket(input, SECRET)).jti, decode(signCampusTicket(input, SECRET)).jti);
  });

  it('no acepta destinos fuera de Moodle (redirección abierta)', () => {
    for (const want of ['https://otro.example/', '//otro.example/', '/\\otro', 'javascript:alert(1)', 'course/view.php']) {
      assert.throws(() => signCampusTicket({ ...input, want }, SECRET), /Destino no local/, want);
    }
  });

  it('no incluye tokens ni el secreto', () => {
    const ticket = signCampusTicket(input, SECRET);
    assert.ok(!ticket.includes(SECRET));
    assert.deepEqual(Object.keys(decode(ticket)).sort(), ['exp', 'iat', 'jti', 'sub', 'uid', 'uuid', 'v', 'want']);
  });
});

describe('Cierre de sesión coordinado', () => {
  const user: AuthUser = { id: 'u1', sub: 's1', email: 'ana@ejemplo.test', status: 'activo', roles: ['estudiante'], programIds: [], sid: '11111111-2222-4333-8444-555555555555' };

  function service(opts: { keycloak?: () => Promise<boolean>; moodle?: () => Promise<number>; moodleUserId?: string | null }) {
    const pending: Record<string, boolean> = {};
    const audits: unknown[] = [];
    const s = new SessionService(
      { endSession: opts.keycloak ?? (async () => true) } as never,
      { logoutUser: opts.moodle ?? (async () => 1) } as never,
      {
        snapshot: async () => ({ moodle_user_id: opts.moodleUserId === undefined ? '9' : opts.moodleUserId }),
        setMoodleLogoutPending: async (id: string, value: boolean) => { pending[id] = value; },
        pendingMoodleLogouts: async () => Object.entries(pending).filter(([, v]) => v).map(([id]) => ({ id, moodle_user_id: '9' })),
      } as never,
      { log: async (entry: unknown) => { audits.push(entry); } } as never,
    );
    return { s, pending, audits };
  }

  it('cierre normal: Keycloak y Moodle confirman', async () => {
    const { s, audits } = service({});
    assert.deepEqual(await s.logout(user), { keycloak: 'ok', moodle: 'ok', complete: true });
    assert.equal(audits.length, 1);
  });

  it('Moodle no responde: queda pendiente y no se informa un cierre completo', async () => {
    const { s, pending } = service({ moodle: async () => { throw new Error('caído'); } });
    assert.deepEqual(await s.logout(user), { keycloak: 'ok', moodle: 'pendiente', complete: false });
    assert.equal(pending.u1, true);
  });

  it('el reintento cierra después las sesiones de Moodle pendientes', async () => {
    let down = true;
    const { s, pending } = service({ moodle: async () => { if (down) throw new Error('caído'); return 2; } });
    await s.logout(user);
    down = false;
    await s.retryPendingMoodleLogouts();
    assert.equal(pending.u1, false);
  });

  it('Keycloak no responde: no se informa un cierre completo', async () => {
    const { s } = service({ keycloak: async () => { throw new ServiceUnavailableException(); } });
    assert.deepEqual(await s.logout(user), { keycloak: 'error', moodle: 'ok', complete: false });
  });

  it('sin sid en el token no se puede confirmar el cierre en Keycloak', async () => {
    const { s } = service({});
    assert.equal((await s.logout({ ...user, sid: undefined })).complete, false);
  });

  it('persona sin cuenta en Moodle (aspirante): basta con Keycloak', async () => {
    const { s } = service({ moodleUserId: null });
    assert.deepEqual(await s.logout(user), { keycloak: 'ok', moodle: 'sin_sesion', complete: true });
  });
});
