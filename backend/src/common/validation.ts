import { Transform } from 'class-transformer';

/** Quita espacios al inicio y al final de los textos antes de validarlos. */
export const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
