"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Confirmación en la misma pantalla para acciones destructivas (rechazar, suspender, eliminar).
 * Al pedir confirmación el foco pasa al botón de confirmar; Escape o "Cancelar" vuelven al botón original.
 */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled }: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean }) {
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);

  useEffect(() => {
    if (asking) confirmRef.current?.focus();
    else if (wasAsking.current) triggerRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  if (!asking) {
    return <button ref={triggerRef} type="button" className="btn-danger" disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <span className="inline-flex flex-wrap gap-2" onKeyDown={(e) => { if (e.key === "Escape") setAsking(false); }}>
      <button ref={confirmRef} type="button" className="btn-danger" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn-outline" onClick={() => setAsking(false)}>Cancelar</button>
    </span>
  );
}
