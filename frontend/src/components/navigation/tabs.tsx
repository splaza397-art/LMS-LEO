"use client";

import { useRef, type KeyboardEvent } from "react";

export interface TabItem { id: string; label: string }

/**
 * Pestañas accesibles (patrón WAI-ARIA): solo la pestaña activa está en el orden de tabulación y las flechas,
 * Inicio y Fin mueven el foco entre pestañas.
 */
export function Tabs({ items, active, onChange, label, panelId }: { items: TabItem[]; active: string; onChange: (id: string) => void; label: string; panelId: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = items.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next].id);
  }
  return (
    <div role="tablist" aria-label={label} className="mb-6 flex flex-wrap gap-2">
      {items.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`tab-${t.id}`} aria-controls={panelId}
          aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1} onKeyDown={(e) => onKeyDown(e, i)} onClick={() => onChange(t.id)}
          className={active === t.id ? "btn-primary" : "btn-outline"}>{t.label}</button>
      ))}
    </div>
  );
}
