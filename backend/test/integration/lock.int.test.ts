// Integracion contra el PostgreSQL local (backend/.env). Simula dos instancias del backend con dos DbService.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Client } from 'pg';
import { config } from '../../src/config';
import { DbService } from '../../src/db/db.service';

const a = new DbService();
const b = new DbService();
after(async () => { await Promise.all([a.onModuleDestroy(), b.onModuleDestroy()]); });

const key = () => `prueba-bloqueo:${process.pid}:${Math.random()}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('dos instancias no ejecutan a la vez el trabajo de la misma persona', async () => {
  const k = key();
  let inside = 0;
  let maxInside = 0;
  const work = async () => { inside++; maxInside = Math.max(maxInside, inside); await sleep(150); inside--; return true; };
  const results = await Promise.all([a, b, a, b, a, b].map((db) => db.withLock(k, 10_000, work)));
  assert.equal(maxInside, 1);
  assert.ok(results.every((r) => r.acquired));
});

test('sin espera, la segunda instancia se rinde si la primera tiene el bloqueo', async () => {
  const k = key();
  let release!: () => void;
  const held = a.withLock(k, 0, () => new Promise<void>((r) => { release = r; }));
  await sleep(100);
  assert.deepEqual(await b.withLock(k, 0, async () => 'no'), { acquired: false });
  release();
  assert.equal((await held).acquired, true);
  assert.deepEqual(await b.withLock(k, 0, async () => 'si'), { acquired: true, result: 'si' });
});

test('si el proceso que tenía el bloqueo muere, el bloqueo se libera', async () => {
  const k = key();
  const crashed = new Client({ connectionString: config.databaseUrl });
  await crashed.connect();
  await crashed.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [k]);
  assert.deepEqual(await a.withLock(k, 0, async () => 1), { acquired: false });
  await crashed.end(); // equivale a que la instancia se caiga
  assert.deepEqual(await a.withLock(k, 2_000, async () => 1), { acquired: true, result: 1 });
});

test('un error dentro del trabajo libera el bloqueo', async () => {
  const k = key();
  await assert.rejects(a.withLock(k, 0, async () => { throw new Error('falla'); }), /falla/);
  assert.deepEqual(await b.withLock(k, 0, async () => 'ok'), { acquired: true, result: 'ok' });
});
