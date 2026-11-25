"use client";

import { useId } from "react";

/**
 * Campo de búsqueda. Es controlado: quien lo usa decide cuándo consultar (normalmente con useDebouncedValue),
 * así que escribir no dispara una solicitud por cada tecla.
 */
export function SearchInput({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  const id = useId();
  return (
    <div className={className} role="search">
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} type="search" className="input" value={value} maxLength={100} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
