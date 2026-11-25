"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ErrorMessage } from "@/components/feedback/status";
import { ApiError, postPublic } from "@/lib/api/client";
import { missingRules, PASSWORD_RULES } from "./password-rules";

/** Registro de aspirantes. Crear la cuenta no inscribe a ningún curso. */
export function RegisterForm() {
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const missing = missingRules(password);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDuplicate(false);
    if (missing.length) {
      setError(`A tu contraseña le falta: ${missing.join(", ")}.`);
      document.getElementById("password")?.focus();
      return;
    }
    setBusy(true);
    const f = new FormData(event.currentTarget);
    const email = String(f.get("email")).trim();
    try {
      await postPublic("/api/registro", {
        firstName: f.get("firstName"), lastName: f.get("lastName"), email,
        password, consent: f.get("consent") === "on", website: f.get("website") || undefined,
      });
      setSentTo(email);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setDuplicate(true);
      else setError(e instanceof ApiError ? e.message : "No se pudo crear la cuenta. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="card" role="status">
        <h2 className="h2">Revisa tu correo</h2>
        <p className="mt-3">Te enviamos un enlace de confirmación a <strong className="[overflow-wrap:anywhere]">{sentTo}</strong>.</p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm muted">
          <li>Abre el correo «Confirma tu correo para activar tu cuenta IINICIA».</li>
          <li>Pulsa <strong>Confirmar mi correo</strong>.</li>
          <li>Inicia sesión con tu correo y tu contraseña.</li>
        </ol>
        <p className="mt-4 text-sm muted">¿No te llegó? Revisa la carpeta de correo no deseado. Si intentas iniciar sesión sin confirmar, podrás pedir que te lo enviemos de nuevo.</p>
        <a href="/auth/login" className="btn-primary mt-5">Iniciar sesión</a>
      </div>
    );
  }
  return (
    <>
      <form onSubmit={submit} className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="firstName" className="label">Nombre</label><input id="firstName" name="firstName" required minLength={2} maxLength={80} autoComplete="given-name" className="input" /></div>
          <div><label htmlFor="lastName" className="label">Apellidos</label><input id="lastName" name="lastName" required minLength={2} maxLength={80} autoComplete="family-name" className="input" /></div>
        </div>
        <div><label htmlFor="email" className="label">Correo electrónico</label><input id="email" name="email" type="email" required maxLength={254} autoComplete="email" className="input" /></div>
        <div>
          <label htmlFor="password" className="label">Contraseña</label>
          <div className="relative">
            <input
              id="password" name="password" type={showPassword ? "text" : "password"} required minLength={10} maxLength={128}
              autoComplete="new-password" aria-describedby="password-help" className="input pr-24"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-controls="password"
              className="absolute inset-y-0 right-0 min-w-20 rounded-r-lg px-3 text-sm font-semibold text-blue-700 hover:bg-slate-100"
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <ul id="password-help" className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs" aria-live="polite">
            {PASSWORD_RULES.map(([rule, label]) => {
              const ok = rule.test(password);
              return (
                <li key={label} className={ok ? "text-green-700" : "text-slate-600"}>
                  <span aria-hidden="true">{ok ? "✓" : "○"}</span> {label}<span className="sr-only">{ok ? ": cumplido" : ": pendiente"}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <label htmlFor="website">No llenar</label><input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input name="consent" type="checkbox" required className="mt-0.5 size-5" />
          <span>Acepto el <Link href="/universidad/aviso-privacidad" className="font-semibold text-blue-700 underline">aviso de privacidad</Link>.</span>
        </label>
        <ErrorMessage message={error} className="" />
        {duplicate && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Ya existe una cuenta con ese correo.{" "}
            <a href="/auth/login" className="font-semibold underline">Inicia sesión</a> o, si no recuerdas tu contraseña, usa «¿Olvidaste tu contraseña?» en la pantalla de acceso.
          </div>
        )}
        <button disabled={busy} className="btn-primary w-full">{busy ? "Creando cuenta..." : "Crear cuenta"}</button>
      </form>
      <p className="mt-5 text-center text-sm">
        ¿Ya tienes cuenta? <a href="/auth/login" className="font-semibold text-blue-700 underline">Inicia sesión</a>
      </p>
    </>
  );
}
