/**
 * CSV para Excel. Escapa comillas y antepone un apóstrofo a los textos que empiezan con = + - @, tabulador o
 * retorno, para que la hoja de cálculo no los interprete como fórmulas (inyección de fórmulas en CSV).
 */
export function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}

export function toCsv<T extends Record<string, unknown>>(columns: [key: keyof T & string, header: string][], rows: T[]): string {
  return [columns.map(([, header]) => csvCell(header)).join(","), ...rows.map((r) => columns.map(([key]) => csvCell(r[key])).join(","))].join("\r\n");
}

/** Descarga el CSV con BOM UTF-8 para que Excel muestre bien los acentos. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
