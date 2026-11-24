import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

/**
 * Documenta parámetros de consulta opcionales. Sin esto, Swagger los marca como obligatorios aunque el
 * endpoint funcione sin ellos (error de documentación heredado, corregido en la Fase 2).
 */
export const ApiOptionalQueries = (...names: string[]) =>
  applyDecorators(...names.map((name) => ApiQuery({ name, required: false, type: String })));

/** Parámetros comunes de las listas paginadas. */
export const PAGE_QUERIES = ['page', 'pageSize', 'sort', 'order'] as const;
