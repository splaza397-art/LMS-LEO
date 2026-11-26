// Fases 4.10 y 4.11: comprobante de entrada al campus y cierre de sesión coordinado (sin red: servicios simulados).
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { BIND_PATTERN, signCampusTicket, TICKET_LIFETIME_SECONDS } from '../src/modules/dashboard/campus-ticket';
import { SessionService } from '../src/modules/synchronization/session.service';
import type { AuthUser } from '../src/modules/auth/auth.decorators';

const SECRET = 'x'.repeat(64);
const BIND = 'b'.repeat(43);
const decode = (ticket: string) => JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString());

describe('Comprobante de entrada al campus', () => {
  const input = {
    aud: 'http://localhost:8081', uid: 5, uuid: '6f1b3c2a-0000-4000-8000-000000000001',
    sub: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', sid: '11111111-2222-4333-8444-555555555555', want: '/course/view.php?id=3', bind: BIND,
  };

  it('lleva emisor, destinatario, propósito, identidad, sesión, destino, 60 s de vida y un identificador aleatorio', () => {
    const data = decode(signCampusTicket(input, SECRET, 1_000));
    assert.deepEqual(
      { aud: data.aud, uid: data.uid, uuid: data.uuid, sub: data.sub, sid: data.sid, want: data.want },
      { aud: input.aud, uid: input.uid, uuid: input.uuid, sub: input.sub, sid: input.sid, want: input.want },
    );
    assert.equal(data.v, 2);
    assert.equal(data.iss, 'iinicia-backend');
    assert.equal(data.purpose, 'campus-entry');
    assert.equal(data.exp - data.iat, TICKET_LIFETIME_SECONDS);
    assert.match(data.jti, /^[A-Za-z0-9_-]{32}$/);
  });

  it('está vinculado al navegador: lleva el SHA-256 del valor de vinculación, no el valor', () => {
    const ticket = signCampusTicket(input, SECRET);
    assert.equal(decode(ticket).bnd, createHash('sha256').update(BIND).digest('base64url'));
    assert.ok(!ticket.includes(BIND));
  });

  it('no firma sin un valor de vinculación válido', () => {
    for (const bind of ['', 'corto', 'b'.repeat(44), `${'b'.repeat(42)}=`]) {
      assert.equal(BIND_PATTERN.test(bind), false, bind);
      assert.throws(() => signCampusTicket({ ...input, bind }, SECRET), /Vinculación inválida/);
    }
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
    assert.deepEqual(Object.keys(decode(ticket)).sort(), ['aud', 'bnd', 'exp', 'iat', 'iss', 'jti', 'purpose', 'sid', 'sub', 'uid', 'uuid', 'v', 'want']);
  });
});

describe('Cierre de sesión coordinado', () => {
  const user: AuthUser = { id: 'u1', sub: 's1', email: 'ana@ejemplo.test', status: 'activo', roles: ['estudiante'], programIds: [], sid: '11111111-2222-4333-8444-555555555555' };

  function service(opts: { keycloak?: (sid: string) => Promise<boolean>; moodle?: (id: number, before: number) => Promise<number>; moodleUserId?: string | null }) {
    const pending: Record<string, Date | null> = {};
    const revoked: Record<string, { userId: string; confirmed: boolean }> = {};
    const moodleCalls: { id: number; before: number }[] = [];
    const keycloakCalls: string[] = [];
    const audits: unknown[] = [];
    const s = new SessionService(
      { endSession: async (sid: string) => { keycloakCalls.push(sid); return (opts.keycloak ?? (async () => true))(sid); } } as never,
      { logoutUser: async (id: number, before: number) => { moodleCalls.push({ id, before }); return (opts.moodle ?? (async () => 1))(id, before); } } as never,
      {
        snapshot: async () => ({ moodle_user_id: opts.moodleUserId === undefined ? '9' : opts.moodleUserId }),
        setMoodleLogoutPending: async (id: string, value: boolean, at?: Date) => {
          const current = pending[id];
          pending[id] = value ? (current && at && current > at ? current : at ?? new Date()) : null;
        },
        pendingMoodleLogouts: async () => Object.entries(pending).filter(([, v]) => v)
          .map(([id, at]) => ({ id, moodle_user_id: '9', before: Math.floor(at!.getTime() / 1000) })),
        revokeSession: async (sid: string, userId: string, confirmed: boolean) => {
          revoked[sid] = { userId, confirmed: revoked[sid]?.confirmed || confirmed };
        },
        pendingKeycloakLogouts: async () => Object.entries(revoked).filter(([, v]) => !v.confirmed).map(([sid, v]) => ({ sid, user_id: v.userId })),
        confirmKeycloakLogout: async (sid: string) => { revoked[sid].confirmed = true; },
        pruneSessionRevocations: async () => {},
      } as never,
      { log: async (entry: unknown) => { audits.push(entry); } } as never,
    );
    return { s, pending, revoked, moodleCalls, keycloakCalls, audits };
  }

  it('cierre normal: Keycloak y Moodle confirman, y la sesión queda registrada como cerrada', async () => {
    const { s, audits, revoked } = service({});
    assert.deepEqual(await s.logout(user), { keycloak: 'ok', moodle: 'ok', complete: true });
    assert.equal(audits.length, 1);
    assert.deepEqual(revoked[user.sid!], { userId: 'u1', confirmed: true });
  });

  it('Moodle recibe la hora del cierre para no tocar sesiones posteriores', async () => {
    const { s, moodleCalls } = service({});
    const now = Math.floor(Date.now() / 1000);
    await s.logout(user);
    assert.ok(Math.abs(moodleCalls[0].before - now) <= 1);
  });

  it('cierre pendiente de la app: se usa su hora, nunca una futura ni de hace más de 30 días', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { s, moodleCalls } = service({});
    await s.logout(user, now - 600);
    await s.logout(user, now + 3600);
    await s.logout(user, 0);
    assert.equal(moodleCalls[0].before, now - 600);
    assert.ok(moodleCalls[1].before <= now + 1, 'no se acepta una hora futura');
    assert.ok(moodleCalls[2].before >= now - 30 * 24 * 3600 - 1, 'no se acepta una hora demasiado antigua');
  });

  it('Moodle no responde: queda pendiente y no se informa un cierre completo', async () => {
    const { s, pending } = service({ moodle: async () => { throw new Error('caído'); } });
    assert.deepEqual(await s.logout(user), { keycloak: 'ok', moodle: 'pendiente', complete: false });
    assert.ok(pending.u1);
  });

  it('el reintento cierra en Moodle solo lo anterior al cierre pendiente', async () => {
    let down = true;
    const { s, pending, moodleCalls } = service({ moodle: async () => { if (down) throw new Error('caído'); return 2; } });
    await s.logout(user);
    const cutoff = moodleCalls[0].before;
    down = false;
    await s.retryPendingLogouts();
    assert.equal(pending.u1, null);
    assert.equal(moodleCalls[1].before, cutoff, 'el reintento usa la hora del cierre, no la del reintento');
  });

  it('Keycloak no responde: queda pendiente, no se informa un cierre completo y el reintento cierra solo esa sesión', async () => {
    let down = true;
    const { s, revoked, keycloakCalls } = service({ keycloak: async () => { if (down) throw new ServiceUnavailableException(); return true; } });
    assert.deepEqual(await s.logout(user), { keycloak: 'pendiente', moodle: 'ok', complete: false });
    assert.deepEqual(revoked[user.sid!], { userId: 'u1', confirmed: false }, 'la sesión ya cuenta como cerrada para el campus');
    await s.retryPendingLogouts();
    assert.equal(revoked[user.sid!].confirmed, false, 'sigue pendiente mientras Keycloak no responda');
    down = false;
    await s.retryPendingLogouts();
    assert.equal(revoked[user.sid!].confirmed, true);
    assert.deepEqual([...new Set(keycloakCalls)], [user.sid], 'una sesión nueva (otro sid) nunca se cierra por el reintento');
  });

  it('repetir el cierre es inofensivo (idempotente)', async () => {
    const { s } = service({});
    assert.equal((await s.logout(user)).complete, true);
    assert.equal((await s.logout(user)).complete, true);
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

describe('Conexiones a PostgreSQL', () => {
  it('un error en una conexión inactiva no termina el proceso (el pool tiene manejador de error)', async () => {
    const { DbService } = await import('../src/db/db.service');
    const db = new DbService();
    const pools = [db.pool, (db as unknown as { lockPool: import('pg').Pool }).lockPool];
    for (const pool of pools) {
      assert.ok(pool.listenerCount('error') > 0, 'falta el manejador de error del pool');
      assert.doesNotThrow(() => pool.emit('error', new Error('terminating connection due to administrator command'), {} as never));
    }
    await Promise.all(pools.map((p) => p.end()));
  });
});
