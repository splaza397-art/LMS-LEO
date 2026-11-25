"use client";

import { useState, type FormEvent } from "react";
import { useApiData } from "@/hooks/use-api-data";
import { ApiError, bff } from "@/lib/api/client";
import type { AdminProgram } from "@/types/api";

/** Aviso a las personas activas de un programa. El coordinador solo ve (y puede usar) su programa. */
export function BroadcastForm() {
  const { data: programs } = useApiData<AdminProgram[]>("admin/programs");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setBusy(true);
    try {
      const { recipients } = await bff<{ recipients: number }>("admin/notifications", "POST", f);
      setMessage(`Aviso enviado a ${recipients} persona(s).`);
      form.reset();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "No se pudo enviar el aviso");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send} className="card max-w-xl space-y-3">
      <div><label className="label" htmlFor="b-program">Programa</label>
        <select id="b-program" name="programId" required className="input"><option value="">Selecciona</option>{programs?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="label" htmlFor="b-title">Título</label><input id="b-title" name="title" required minLength={3} maxLength={120} className="input" /></div>
      <div><label className="label" htmlFor="b-body">Mensaje</label><textarea id="b-body" name="body" required minLength={3} maxLength={500} rows={4} className="input" /></div>
      <button disabled={busy} className="btn-primary">{busy ? "Enviando..." : "Enviar aviso"}</button>
      {message && <p role="status" className="text-sm muted">{message}</p>}
    </form>
  );
}
