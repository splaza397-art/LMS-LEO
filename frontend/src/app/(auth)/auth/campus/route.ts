import { NextResponse, type NextRequest } from "next/server";
import { currentAccessToken } from "@/lib/server-session";

/** Valor de vinculación que Moodle puso en una cookie de este navegador (32 bytes en base64url). */
const BIND = /^[A-Za-z0-9_-]{43}$/;
const ID = /^[1-9][0-9]{0,9}$/;
const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function notice(status: number, message: string) {
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Campus IINICIA</title>`
    + `<main style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>No se pudo abrir el campus</h1>`
    + `<p role="alert">${escape(message)}</p><p><a href="/mi-iinicia">Volver a Mi IINICIA</a></p></main></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE } });
}

/**
 * Paso intermedio de la entrada al campus desde el portal (Fase 4.11).
 * Moodle (sso.php?start) puso una cookie de vinculación en este navegador y lo manda aquí con el mismo valor. El
 * servidor del portal pide al backend, con el token de la sesión (nunca expuesto al navegador), un comprobante para
 * esta persona y ese valor, y redirige a Moodle. Un comprobante obtenido así solo sirve en este navegador.
 * No hace falta protección CSRF: una página ajena que traiga aquí a alguien solo consigue un comprobante para la
 * propia persona, vinculado a una cookie que el atacante no tiene en su navegador, y que se consume al intentarlo.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const bind = params.get("bind") ?? "";
  const courseId = params.get("courseId");
  const cmid = params.get("cmid");
  if (!BIND.test(bind) || (courseId !== null && !ID.test(courseId)) || (cmid !== null && !ID.test(cmid))) {
    return notice(400, "El enlace al campus no es válido. Vuelve a entrar desde IINICIA.");
  }
  const token = await currentAccessToken(request);
  if (!token) {
    // Sin sesión en el portal: se inicia sesión y se vuelve aquí (la cookie de vinculación dura 5 minutos).
    const login = new URL("/auth/login", process.env.PORTAL_URL);
    login.searchParams.set("returnTo", `/auth/campus?${params}`);
    return NextResponse.redirect(login, { status: 303, headers: NO_STORE });
  }
  const query = new URLSearchParams({ bind, ...(cmid ? { cmid } : courseId ? { courseId } : {}) });
  try {
    const upstream = await fetch(`${process.env.BACKEND_URL}/api/v1/me/campus-link?${query}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      const body = (await upstream.json().catch(() => ({}))) as { message?: string };
      return notice(upstream.status === 401 ? 401 : 403, body.message ?? "No tienes acceso a ese curso.");
    }
    const { url } = (await upstream.json()) as { url: string };
    return NextResponse.redirect(url, { status: 303, headers: NO_STORE });
  } catch {
    return notice(502, "El servicio no está disponible. Intenta de nuevo en unos minutos.");
  }
}
