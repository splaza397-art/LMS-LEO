"use client";

export const PAGE_SIZES = [20, 50, 100];

/**
 * Navegación entre páginas de una lista paginada en el backend. Muestra el rango y el total, y anuncia los
 * cambios a lectores de pantalla.
 */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, label = "registros" }: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label={`Paginación de ${label}`} className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p aria-live="polite">{total === 0 ? `Sin ${label}` : `Mostrando ${from}–${to} de ${total} ${label}`}</p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2">
            <span>Por página</span>
            <select className="input w-auto" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="btn-outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</button>
        <span>Página {Math.min(page, pages)} de {pages}</span>
        <button type="button" className="btn-outline" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Siguiente</button>
      </div>
    </nav>
  );
}
