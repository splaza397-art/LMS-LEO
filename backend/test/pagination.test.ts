// Paginación, ordenamiento y filtros (Fase 2, etapa 2.6): validación de parámetros y compatibilidad.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { oneOf, optionalDate, optionalUuid, parsePage, searchTerm, SortSpec, toPageResult } from '../src/common/pagination';
import { SqlConditions } from '../src/common/sql';

const SPEC: SortSpec = {
  columns: { createdAt: 'u.created_at', email: 'u.email' },
  default: 'createdAt', defaultOrder: 'desc', tieBreaker: 'u.id', legacyLimit: 200,
};
const bad = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof BadRequestException);

describe('parsePage', () => {
  it('sin page ni pageSize conserva el modo anterior: arreglo con el límite de siempre', () => {
    const r = parsePage({}, SPEC);
    assert.deepEqual(r, { paged: false, page: 1, pageSize: 200, offset: 0, orderBy: 'u.created_at DESC, u.id DESC' });
  });

  it('con page o pageSize activa la paginación con valores por omisión', () => {
    assert.deepEqual(parsePage({ page: '3' }, SPEC), { paged: true, page: 3, pageSize: 20, offset: 40, orderBy: 'u.created_at DESC, u.id DESC' });
    assert.equal(parsePage({ pageSize: '50' }, SPEC).offset, 0);
  });

  it('el orden solo acepta columnas de la lista y siempre desempata por id', () => {
    assert.equal(parsePage({ sort: 'email', order: 'asc' }, SPEC).orderBy, 'u.email ASC, u.id ASC');
    bad(() => parsePage({ sort: 'password' }, SPEC));
    bad(() => parsePage({ sort: 'u.email; DROP TABLE users' }, SPEC));
    bad(() => parsePage({ order: 'sideways' }, SPEC));
  });

  it('rechaza páginas y tamaños inválidos y respeta el máximo configurado (100)', () => {
    for (const page of ['0', '-1', 'abc', '1.5', '9999999999']) bad(() => parsePage({ page }, SPEC));
    bad(() => parsePage({ pageSize: '101' }, SPEC));
    assert.equal(parsePage({ pageSize: '100' }, SPEC).pageSize, 100);
  });
});

describe('toPageResult', () => {
  const rows = [{ id: 1, _total: '42' }, { id: 2, _total: '42' }];
  it('modo anterior: devuelve solo las filas, sin la columna interna _total', () => {
    assert.deepEqual(toPageResult(rows, parsePage({}, SPEC)), [{ id: 1 }, { id: 2 }]);
  });
  it('modo paginado: devuelve items, total, page y pageSize', () => {
    assert.deepEqual(toPageResult(rows, parsePage({ page: '2', pageSize: '2' }, SPEC)), { items: [{ id: 1 }, { id: 2 }], total: 42, page: 2, pageSize: 2 });
    assert.deepEqual(toPageResult([], parsePage({ page: '9' }, SPEC)), { items: [], total: 0, page: 9, pageSize: 20 });
  });
});

describe('filtros', () => {
  it('oneOf acepta solo valores permitidos', () => {
    assert.equal(oneOf(undefined, ['a', 'b'] as const, 'x'), null);
    assert.equal(oneOf('a', ['a', 'b'] as const, 'x'), 'a');
    bad(() => oneOf('c', ['a', 'b'] as const, 'x'));
  });
  it('UUID, fecha y búsqueda se validan', () => {
    assert.equal(optionalUuid('3f1c2b9a-1d2e-4c3b-9a8f-0123456789ab', 'id'), '3f1c2b9a-1d2e-4c3b-9a8f-0123456789ab');
    bad(() => optionalUuid("1' OR '1'='1", 'id'));
    assert.equal(optionalDate('2026-11-24', 'from'), '2026-11-24');
    bad(() => optionalDate('ayer', 'from'));
    assert.equal(searchTerm('  ana  '), 'ana');
    bad(() => searchTerm('x'.repeat(101)));
  });
});

describe('SqlConditions', () => {
  it('numera los parámetros y nunca interpola valores en el texto', () => {
    const malicious = "x'); DROP TABLE users; --";
    const w = new SqlConditions().add('a = ?', 1).addIf(false, 'b = ?', 2).add('c ILIKE ? OR d ILIKE ?', malicious, malicious);
    assert.equal(w.where(), 'WHERE (a = $1) AND (c ILIKE $2 OR d ILIKE $3)');
    assert.equal(w.param(10), '$4');
    assert.deepEqual(w.params, [1, malicious, malicious, 10]);
    assert.ok(!w.where().includes('DROP'));
  });
  it('sin condiciones no genera WHERE; detecta valores faltantes o de más', () => {
    assert.equal(new SqlConditions().where(), '');
    assert.throws(() => new SqlConditions().add('a = ? AND b = ?', 1));
    assert.throws(() => new SqlConditions().add('a = ?', 1, 2));
  });
});
