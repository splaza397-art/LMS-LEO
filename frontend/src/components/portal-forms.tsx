"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export async function bff<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/bff/v1/${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(data.message) ? data.message.join(". ") : data.message;
    throw new Error(message ?? "No se pudo completar la acción");
  }
  return data as T;
}

const PASSWORD_RULES: [RegExp, string][] = [
  [/.{10,}/, "10 caracteres o más"],
  [/[A-Z]/, "una mayúscula"],
  [/[a-z]/, "una minúscula"],
  [/\d/, "un número"],
];

export function RegisterForm() {
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const missing = PASSWORD_RULES.filter(([rule]) => !rule.test(password)).map(([, label]) => label);

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
      const response = await fetch("/api/registro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: f.get("firstName"), lastName: f.get("lastName"), email,
          password, consent: f.get("consent") === "on", website: f.get("website") || undefined,
        }),
      });
      if (response.status === 409) {
        setDuplicate(true);
        return;
      }
      if (response.status === 429) throw new Error("Demasiados intentos. Espera un minuto y vuelve a intentarlo.");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(Array.isArray(data.message) ? data.message.join(". ") : data.message ?? "No se pudo crear la cuenta. Intenta de nuevo.");
      }
      setSentTo(email);
    } catch (e) {
      setError((e as Error).message);
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
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
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
      const response = await fetch("/api/informacion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"), email: f.get("email"), phone: f.get("phone") || undefined,
          programId: f.get("programId") || undefined, message: f.get("message"),
          consent: f.get("consent") === "on", website: f.get("website") || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(response.status === 429 ? "Demasiados intentos. Espera un minuto." : Array.isArray(data.message) ? data.message.join(". ") : data.message ?? "No se pudo enviar");
      }
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
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
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="btn-primary">{busy ? "Enviando..." : "Solicitar información"}</button>
    </form>
  );
}

export function ApplyButton({ programId }: { programId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function apply() {
    setBusy(true);
    try {
      await bff("me/applications", "POST", { programId });
      router.push("/mi-iinicia");
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div>
      <button onClick={apply} disabled={busy} className="btn-primary">{busy ? "Enviando..." : "Solicitar admisión"}</button>
      {message && <p role="alert" className="mt-2 text-sm text-red-700">{message}</p>}
    </div>
  );
}

export function CampusButton({ courseId, cmid, label, primary = true }: { courseId?: number; cmid?: number; label: string; primary?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    setError("");
    try {
      const query = cmid ? `?cmid=${cmid}` : courseId ? `?courseId=${courseId}` : "";
      const { url } = await bff<{ url: string }>(`me/campus-link${query}`);
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <span>
      <button onClick={open} disabled={busy} className={primary ? "btn-primary" : "btn-outline"}>{busy ? "Abriendo..." : label}</button>
      {error && <span role="alert" className="ml-2 text-sm text-red-700">{error}</span>}
    </span>
  );
}

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
      setMessage((e as Error).message);
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
