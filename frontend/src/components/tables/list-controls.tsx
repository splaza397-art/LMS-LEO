"use client";

import type { ReactNode } from "react";
import { SelectField } from "@/components/forms/field";

/** Barra de búsqueda y filtros de una lista: en columna en el teléfono y en fila desde tableta. */
export function ListToolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

/** Orden de la lista. Cada opción es "campo:dirección" y solo se ofrecen los campos que acepta el backend. */
export function SortSelect({ options, sort, order, onChange }: { options: [field: string, order: "asc" | "desc", label: string][]; sort: string; order: string; onChange: (sort: string, order: string) => void }) {
  return (
    <SelectField label="Ordenar por" value={`${sort}:${order}`} placeholder="Más recientes primero"
      options={options.map(([field, dir, text]) => [`${field}:${dir}`, text])}
      onChange={(e) => { const [s = "", o = ""] = e.target.value.split(":"); onChange(s, o); }} />
  );
}
