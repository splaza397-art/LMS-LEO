"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ErrorMessage } from "@/components/feedback/status";
import { ApiError, postPublic } from "@/lib/api/client";

/** Solicitud de información de Admisiones (pública, con límite de intentos en el backend). */
export function InfoRequestForm({ programs }: { programs: { id: string; name: string }[] }) {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    try {
      await postPublic("/api/informacion", {
        name: f.get("name"), email: f.get("email"), phone: f.get("phone") || undefined,
        programId: f.get("programId") || undefined, message: f.get("message"),
        consent: f.get("consent") === "on", website: f.get("website") || undefined,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p role="status" className="card font-semibold text-green-800">Recibimos tu solicitud. El área de admisiones te contactará.</p>;
  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="info-name" className="label">Nombre completo</label><input id="info-name" name="name" required minLength={2} maxLength={120} autoComplete="name" className="input" /></div>
        <div><label htmlFor="info-email" className="label">Correo electrónico</label><input id="info-email" name="email" type="email" required autoComplete="email" className="input" /></div>
        <div><label htmlFor="info-phone" className="label">Teléfono (opcional)</label><input id="info-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" className="input" /></div>
        <div>
          <label htmlFor="info-program" className="label">Programa de interés</label>
          <select id="info-program" name="programId" className="input">
            <option value="">Aún no lo decido</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div><label htmlFor="info-message" className="label">¿En qué podemos ayudarte?</label><textarea id="info-message" name="message" required minLength={5} maxLength={2000} rows={4} className="input" /></div>
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="info-website">No llenar</label><input id="info-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input name="consent" type="checkbox" required className="mt-0.5 size-5" />
        <span>Acepto el <Link href="/universidad/aviso-privacidad" className="font-semibold text-blue-700 underline">aviso de privacidad</Link>.</span>
      </label>
      <ErrorMessage message={error} className="" />
      <button disabled={busy} className="btn-primary">{busy ? "Enviando..." : "Solicitar información"}</button>
    </form>
  );
}
