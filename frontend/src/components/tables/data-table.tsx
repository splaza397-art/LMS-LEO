import type { ReactNode } from "react";

/**
 * Tabla administrativa con desplazamiento horizontal propio: en pantallas angostas se desplaza la tabla,
 * no la página. La región es enfocable para poder desplazarla con el teclado.
 */
export function Table({ head, label, minWidth = 680, children }: { head: string[]; label: string; minWidth?: number; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" tabIndex={0} role="region" aria-label={label}>
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="bg-slate-100"><tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, colSpan, className }: { children?: ReactNode; colSpan?: number; className?: string }) =>
  <td colSpan={colSpan} className={["px-3 py-2 align-middle", className].filter(Boolean).join(" ")}>{children}</td>;
