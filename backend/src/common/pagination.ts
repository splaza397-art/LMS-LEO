import { BadRequestException } from '@nestjs/common';
import { config } from '../config';

/**
 * Paginación compatible con los consumidores actuales (Fase 2):
 *  - Sin `page` ni `pageSize`: la respuesta sigue siendo un arreglo con el mismo límite de antes.
 *  - Con cualquiera de los dos: { items, total, page, pageSize }.
 * El orden se elige de una lista cerrada por endpoint (nunca se interpola texto del cliente en el SQL) y
 * siempre lleva un desempate por id para que el orden sea determinista entre páginas.
 */
export interface PageRequest {
  paged: boolean;
  page: number;
  pageSize: number;
  offset: number;
  /** Expresión SQL de ordenamiento, tomada de la lista permitida. */
  orderBy: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageQuery {
  page?: string;
  pageSize?: string;
  sort?: string;
  order?: string;
}

export interface SortSpec {
  /** Columnas permitidas: nombre público -> expresión SQL. */
  columns: Record<string, string>;
  /** Columna y dirección por omisión (las del comportamiento anterior). */
  default: string;
  defaultOrder: 'asc' | 'desc';
  /** Desempate determinista, normalmente la llave primaria. */
  tieBreaker: string;
  /** Límite del modo anterior (sin paginar). */
  legacyLimit: number;
}

const DEFAULT_PAGE_SIZE = 20;

function positiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  if (!/^\d{1,9}$/.test(value) || Number(value) < 1) throw new BadRequestException(`${name} debe ser un entero mayor que 0`);
  return Number(value);
}

export function parsePage(query: PageQuery, spec: SortSpec): PageRequest {
  const page = positiveInt(query.page, 'page');
  const pageSize = positiveInt(query.pageSize, 'pageSize');
  const max = config.pagination.maxPageSize;
  if (pageSize !== undefined && pageSize > max) throw new BadRequestException(`pageSize no puede ser mayor que ${max}`);

  const sort = query.sort ?? spec.default;
  const column = spec.columns[sort];
  if (!column) throw new BadRequestException(`sort debe ser uno de: ${Object.keys(spec.columns).join(', ')}`);
  const order = (query.order ?? spec.defaultOrder).toLowerCase();
  if (order !== 'asc' && order !== 'desc') throw new BadRequestException('order debe ser asc o desc');
  const direction = order.toUpperCase();
  const orderBy = `${column} ${direction}, ${spec.tieBreaker} ${direction}`;

  const paged = page !== undefined || pageSize !== undefined;
  if (!paged) return { paged, page: 1, pageSize: spec.legacyLimit, offset: 0, orderBy };
  const size = pageSize ?? Math.min(DEFAULT_PAGE_SIZE, max);
  return { paged, page: page ?? 1, pageSize: size, offset: ((page ?? 1) - 1) * size, orderBy };
}

/** Convierte filas con la columna `_total` (count(*) OVER ()) en la respuesta del modo elegido. */
export function toPageResult<T extends { _total?: string | number }>(rows: T[], request: PageRequest): Omit<T, '_total'>[] | Page<Omit<T, '_total'>> {
  const total = rows.length ? Number(rows[0]._total) : 0;
  const items = rows.map(({ _total, ...rest }) => rest);
  return request.paged ? { items, total, page: request.page, pageSize: request.pageSize } : items;
}

/** Texto de búsqueda normalizado; vacío si no hay. Limitado para no permitir patrones enormes. */
export function searchTerm(q: string | undefined): string {
  const term = (q ?? '').trim();
  if (term.length > 100) throw new BadRequestException('q no puede tener más de 100 caracteres');
  return term;
}

/** Valida que un filtro pertenezca a una lista cerrada de valores. */
export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], name: string): T | null {
  if (value === undefined || value === '') return null;
  if (!(allowed as readonly string[]).includes(value)) throw new BadRequestException(`${name} debe ser uno de: ${allowed.join(', ')}`);
  return value as T;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function optionalUuid(value: string | undefined, name: string): string | null {
  if (value === undefined || value === '') return null;
  if (!UUID.test(value)) throw new BadRequestException(`${name} debe ser un UUID`);
  return value;
}

export function optionalDate(value: string | undefined, name: string): string | null {
  if (value === undefined || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`${name} debe ser una fecha ISO 8601`);
  }
  return value;
}
