"use client";

import { useState } from "react";
import { ApiError, bff, query } from "@/lib/api/client";

/**
 * Abre el campus con inicio de sesión único. El backend genera el enlace solo si el curso o la actividad
 * pertenecen a la persona; aquí no se construyen URLs de Moodle.
 */
export function CampusButton({ courseId, cmid, label, primary = true }: { courseId?: number; cmid?: number; label: string; primary?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    setError("");
    try {
      const { url } = await bff<{ url: string }>(`me/campus-link${query(cmid ? { cmid } : { courseId })}`);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo abrir el campus");
      setBusy(false);
    }
  }
  return (
    <span>
      <button type="button" onClick={open} disabled={busy} className={primary ? "btn-primary" : "btn-outline"}>{busy ? "Abriendo..." : label}</button>
      {error && <span role="alert" className="ml-2 text-sm text-red-700">{error}</span>}
    </span>
  );
}
