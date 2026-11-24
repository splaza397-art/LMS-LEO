// Defecto S1: el límite de intentos se cuenta en PostgreSQL y lo comparten todas las instancias del backend.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DbService } from '../../src/db/db.service';
import { PgThrottlerStorage } from '../../src/security/pg-throttler.storage';

const dbA = new DbService();
const dbB = new DbService();
const instanceA = new PgThrottlerStorage(dbA);
const instanceB = new PgThrottlerStorage(dbB);
after(async () => {
  await dbA.query(`DELETE FROM throttle_counters WHERE key LIKE 'prueba-limite:%'`);
  await Promise.all([dbA.onModuleDestroy(), dbB.onModuleDestroy()]);
});

const key = () => `prueba-limite:${process.pid}:${Math.random()}`;

test('dos instancias comparten el contador: el sexto intento se bloquea aunque se repartan', async () => {
  const k = key();
  const results = [];
  for (let i = 0; i < 6; i++) results.push(await (i % 2 ? instanceB : instanceA).increment(k, 60_000, 5, 60_000, 'default'));
  assert.deepEqual(results.map((r) => r.isBlocked), [false, false, false, false, false, true]);
  assert.deepEqual(results.map((r) => r.totalHits), [1, 2, 3, 4, 5, 6]);
  assert.ok(results[5].timeToBlockExpire > 0 && results[5].timeToBlockExpire <= 60);
});

test('intentos simultáneos no se pierden (incremento atómico)', async () => {
  const k = key();
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? instanceB : instanceA).increment(k, 60_000, 5, 60_000, 'default')));
  assert.equal(Math.max(...results.map((r) => r.totalHits)), 20);
  assert.equal(results.filter((r) => !r.isBlocked).length, 5);
});

test('claves distintas (IP distintas) tienen contadores independientes', async () => {
  const [k1, k2] = [key(), key()];
  for (let i = 0; i < 5; i++) await instanceA.increment(k1, 60_000, 5, 60_000, 'default');
  assert.equal((await instanceB.increment(k2, 60_000, 5, 60_000, 'default')).isBlocked, false);
  assert.equal((await instanceB.increment(k1, 60_000, 5, 60_000, 'default')).isBlocked, true);
});

test('al vencer la ventana y el bloqueo, se vuelve a permitir', async () => {
  const k = key();
  for (let i = 0; i < 3; i++) await instanceA.increment(k, 300, 2, 300, 'default');
  assert.equal((await instanceB.increment(k, 300, 2, 300, 'default')).isBlocked, true);
  await new Promise((r) => setTimeout(r, 700));
  const fresh = await instanceB.increment(k, 300, 2, 300, 'default');
  assert.equal(fresh.isBlocked, false);
  assert.equal(fresh.totalHits, 1);
});
