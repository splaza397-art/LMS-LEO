"use client";

import { useState, type FormEvent } from "react";
import { ApiError, bff } from "@/lib/api/client";

/** Perfil propio: nombre, apellidos y teléfono (el correo lo administra Keycloak). */
export function ProfileForm({ firstName, lastName, phone }: { firstName: string; lastName: string; phone?: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const f = new FormData(event.currentTarget);
    try {
      await bff("me", "PATCH", { firstName: f.get("firstName"), lastName: f.get("lastName"), phone: f.get("phone") || undefined });
      setMessage("Perfil actualizado");
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "No se pudo actualizar el perfil");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><label htmlFor="p-first" className="label">Nombre</label><input id="p-first" name="firstName" defaultValue={firstName} required minLength={2} className="input" /></div>
      <div><label htmlFor="p-last" className="label">Apellidos</label><input id="p-last" name="lastName" defaultValue={lastName} required minLength={2} className="input" /></div>
      <div><label htmlFor="p-phone" className="label">Teléfono</label><input id="p-phone" name="phone" defaultValue={phone ?? ""} maxLength={30} autoComplete="tel" className="input" /></div>
      <button disabled={busy} className="btn-outline">Guardar</button>
      {message && <p role="status" className="text-sm muted">{message}</p>}
    </form>
  );
}
