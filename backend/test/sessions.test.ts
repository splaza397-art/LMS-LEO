// Fases 4.10, 4.11 y 5: comprobante de entrada al campus y cierre de sesión coordinado (sin red: servicios simulados).
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
  const admin: AuthUser = { id: 'a1', sub: 'sa', email: 'admin@ejemplo.test', status: 'activo', roles: ['admin_academico'], programIds: [] };

  type Target = { scope: 'device'; kcsid: string } | { scope: 'all' };
  function service(opts: {
    keycloak?: (sid: string) => Promise<boolean>;
    keycloakAll?: (sub: string) => Promise<void>;
    moodle?: (id: number, before: number, target: Target) => Promise<number>;
    moodleUserId?: string | null;
    targetRoles?: string[];
    sessions?: { id: string }[];
  }) {
    const queue: { id: string; user_id: string; scope: 'device' | 'all'; kc_sid: string | null; at: Date }[] = [];
    const revoked: Record<string, { userId: string; confirmed: boolean }> = {};
    const revokeAll: Record<string, { at: Date; pending: boolean }> = {};
    const moodleCalls: { id: number; before: number; target: Target }[] = [];
    const keycloakCalls: string[] = [];
    const audits: { action: string }[] = [];
    const s = new SessionService(
      {
        endSession: async (sid: string) => { keycloakCalls.push(sid); return (opts.keycloak ?? (async () => true))(sid); },
        logoutAll: async (sub: string) => { keycloakCalls.push(`all:${sub}`); return (opts.keycloakAll ?? (async () => {}))(sub); },
        listSessions: async () => (opts.sessions ?? []).map((x) => ({ ...x, kind: 'offline', started: 0, lastAccess: 0, clients: [] })),
      } as never,
      { logoutUser: async (id: number, before: number, target: Target) => { moodleCalls.push({ id, before, target }); return (opts.moodle ?? (async () => 1))(id, before, target); } } as never,
      {
        snapshot: async (id: string) => ({ id, oidc_sub: `sub-${id}`, moodle_user_id: opts.moodleUserId === undefined ? '9' : opts.moodleUserId }),
        roles: async () => opts.targetRoles ?? ['estudiante'],
        queueMoodleLogout: async (userId: string, scope: 'device' | 'all', kcSid: string | null, at: Date) => { queue.push({ id: String(queue.length + 1), user_id: userId, scope, kc_sid: kcSid, at }); },
        pendingMoodleLogouts: async () => queue.map((q) => ({ ...q, moodle_user_id: '9', before: Math.floor(q.at.getTime() / 1000) })),
        doneMoodleLogout: async (id: string) => { queue.splice(queue.findIndex((q) => q.id === id), 1); },
        revokeSession: async (sid: string, userId: string, confirmed: boolean) => { revoked[sid] = { userId, confirmed: revoked[sid]?.confirmed || confirmed }; },
        pendingKeycloakLogouts: async () => Object.entries(revoked).filter(([, v]) => !v.confirmed).map(([sid, v]) => ({ sid, user_id: v.userId })),
        confirmKeycloakLogout: async (sid: string) => { revoked[sid].confirmed = true; },
        revokeAllSessions: async (userId: string, at: Date, pending: boolean) => { revokeAll[userId] = { at, pending: (revokeAll[userId]?.pending ?? false) || pending }; },
        pendingRevokeAll: async () => Object.entries(revokeAll).filter(([, v]) => v.pending).map(([id]) => ({ id, oidc_sub: `sub-${id}` })),
        doneRevokeAll: async (id: string) => { revokeAll[id].pending = false; },
        pruneSessionRevocations: async () => {},
      } as never,
      { log: async (entry: { action: string }) => { audits.push(entry); } } as never,
    );
    return { s, queue, revoked, revokeAll, moodleCalls, keycloakCalls, audits };
  }

  it('cierre normal (este dispositivo): Keycloak cierra su sid y Moodle solo las sesiones de ese sid', async () => {
    const { s, audits, revoked, moodleCalls } = service({});
    assert.deepEqual(await s.logout(user), { keycloak: 'ok', moodle: 'ok', complete: true });
    assert.equal(audits.length, 1);
    assert.deepEqual(revoked[user.sid!], { userId: 'u1', confirmed: true });
    assert.deepEqual(moodleCalls[0].target, { scope: 'device', kcsid: user.sid });
  });

  it('Moodle recibe la hora del cierre del servidor', async () => {
    const { s, moodleCalls } = service({});
    const now = Math.floor(Date.now() / 1000);
    await s.logout(user);
    assert.ok(Math.abs(moodleCalls[0].before - now) <= 1);
  });

  it('el corte es siempre la hora del servidor: una hora del cliente (reloj atrasado) se ignora', async () => {
    // Defecto encontrado en el teléfono (Fase 4.11): con el reloj del teléfono 77 s atrasado, un corte enviado por la
    // app dejaba viva la sesión de Moodle abierta justo antes de salir.
    const { s, moodleCalls } = service({});
    const now = Math.floor(Date.now() / 1000);
    await (s.logout as (u: AuthUser, scope?: unknown) => Promise<unknown>)(user, now - 77);
    assert.ok(moodleCalls[0].before >= now, 'el corte no puede ser anterior a la hora del servidor');
  });

  it('sin sid no se identifica el dispositivo: Moodle cierra todo y no se confirma el cierre en Keycloak', async () => {
    const { s, moodleCalls } = service({});
    assert.equal((await s.logout({ ...user, sid: undefined })).complete, false);
    assert.deepEqual(moodleCalls[0].target, { scope: 'all' });
  });

  it('Moodle no responde: queda en la cola con su sid y no se informa un cierre completo', async () => {
    const { s, queue } = service({ moodle: async () => { throw new Error('caído'); } });
    assert.deepEqual(await s.logout(user), { keycloak: 'ok', moodle: 'pendiente', complete: false });
    assert.equal(queue.length, 1);
    assert.equal(queue[0].scope, 'device');
    assert.equal(queue[0].kc_sid, user.sid);
  });

  it('un reintento antiguo solo cierra en Moodle la sesión del sid original, con su hora original', async () => {
    let down = true;
    const { s, queue, moodleCalls } = service({ moodle: async () => { if (down) throw new Error('caído'); return 2; } });
    await s.logout(user);
    const original = moodleCalls[0];
    down = false;
    await s.retryPendingLogouts();
    assert.equal(queue.length, 0);
    assert.deepEqual(moodleCalls[1].target, { scope: 'device', kcsid: user.sid }, 'el reintento lleva el sid antiguo: una sesión nueva tiene otro');
    assert.equal(moodleCalls[1].before, original.before, 'el reintento usa la hora del cierre, no la del reintento');
  });

  it('Keycloak no responde: queda pendiente, no se informa un cierre completo y el reintento cierra solo esa sesión', async () => {
    let down = true;
    const { s, revoked, keycloakCalls } = service({ keycloak: async () => { if (down) throw new ServiceUnavailableException(); return true; } });
    assert.deepEqual(await s.logout(user), { keycloak: 'pendiente', moodle: 'ok', complete: false });
    assert.deepEqual(revoked[user.sid!], { userId: 'u1', confirmed: false }, 'la sesión ya cuenta como cerrada para la API y el campus');
    await s.retryPendingLogouts();
    assert.equal(revoked[user.sid!].confirmed, false, 'sigue pendiente mientras Keycloak no responda');
    down = false;
    await s.retryPendingLogouts();
    assert.equal(revoked[user.sid!].confirmed, true);
    assert.deepEqual([...new Set(keycloakCalls)], [user.sid], 'una sesión nueva (otro sid) nunca se cierra por el reintento');
  });

  it('cerrar todas las sesiones: Keycloak cierra todo, Moodle todo, y los tokens anteriores dejan de valer', async () => {
    const { s, keycloakCalls, moodleCalls, revokeAll, audits } = service({});
    assert.deepEqual(await s.logout(user, 'all'), { keycloak: 'ok', moodle: 'ok', complete: true });
    assert.deepEqual(keycloakCalls, ['all:s1']);
    assert.deepEqual(moodleCalls[0].target, { scope: 'all' });
    assert.ok(revokeAll.u1 && !revokeAll.u1.pending);
    assert.equal(audits[0].action, 'auth.logout_all');
  });

  it('cerrar todas con Keycloak caído: los tokens dejan de valer ya y el reintento cierra en Keycloak después', async () => {
    let down = true;
    const { s, revokeAll } = service({ keycloakAll: async () => { if (down) throw new ServiceUnavailableException(); } });
    assert.equal((await s.logout(user, 'all')).complete, false);
    assert.equal(revokeAll.u1.pending, true);
    down = false;
    await s.retryPendingLogouts();
    assert.equal(revokeAll.u1.pending, false);
  });

  it('administración: revocar una sesión comprometida exige que sea de esa persona', async () => {
    const sid = '99999999-2222-4333-8444-555555555555';
    const { s, moodleCalls, audits } = service({ sessions: [{ id: sid }] });
    assert.equal((await s.revokeSession(admin, 'u2', sid)).complete, true);
    assert.deepEqual(moodleCalls[0].target, { scope: 'device', kcsid: sid });
    assert.equal(audits[0].action, 'security.session_revoked');
    await assert.rejects(s.revokeSession(admin, 'u2', '00000000-2222-4333-8444-555555555555'), /no existe/);
  });

  it('administración: solo un superadministrador revoca las sesiones de otro superadministrador', async () => {
    const { s } = service({ targetRoles: ['superadmin'] });
    await assert.rejects(s.revokeAll(admin, 'u2'), /superadministrador/);
    assert.equal((await s.revokeAll({ ...admin, roles: ['superadmin'] }, 'u2')).complete, true);
  });

  it('repetir el cierre es inofensivo (idempotente)', async () => {
    const { s } = service({});
    assert.equal((await s.logout(user)).complete, true);
    assert.equal((await s.logout(user)).complete, true);
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
