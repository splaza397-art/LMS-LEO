import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, cookieOptions, oidcEndpoint, seal, unseal } from "@/lib/session-core";
import { logoutPlan, logoutScope, REAUTH_COOKIE, REAUTH_MAX_AGE, type LogoutResult } from "@/lib/logout-policy";
import { currentAccessToken } from "@/lib/server-session";

/** Cierre coordinado en el backend (Keycloak y Moodle), desde el servidor: no depende del navegador. */
async function backendLogout(token: string | null, scope: "device" | "all"): Promise<LogoutResult | null> {
  if (!token) return null;
  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/v1/me/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ scope }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? ((await response.json()) as LogoutResult) : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== process.env.PORTAL_URL) {
    return NextResponse.json({ message: "Origen no permitido" }, { status: 403 });
  }
  const id = await unseal<{ t: string }>(request.cookies.get(COOKIES.id)?.value);
  // "Cerrar sesión en todos los dispositivos" envía scope=all; el botón Salir, solo este dispositivo (Fase 5).
  const scope = logoutScope((await request.formData().catch(() => null))?.get("scope"));
  const plan = logoutPlan(await backendLogout(await currentAccessToken(request), scope));

  let response: NextResponse;
  if (plan.browserLogout) {
    const url = new URL(oidcEndpoint("logout"));
    url.searchParams.set("client_id", process.env.OIDC_CLIENT_ID!);
    url.searchParams.set("post_logout_redirect_uri", `${process.env.PORTAL_URL}/`);
    if (id) url.searchParams.set("id_token_hint", id.t);
    response = NextResponse.redirect(url, 303);
  } else {
    response = NextResponse.redirect(new URL("/", process.env.PORTAL_URL), 303);
  }
  for (const name of [COOKIES.access, COOKIES.refresh, COOKIES.id]) response.cookies.delete(name);
  if (plan.requireCredentialsNextTime) {
    // Fase 5: se guarda (cifrado, httpOnly) el token de identidad para cerrar en Keycloak la sesión que pudo quedar
    // en el navegador antes del siguiente inicio de sesión. No da acceso a la API (es un token de identidad).
    const value = id ? await seal({ hint: id.t }, REAUTH_MAX_AGE) : await seal({}, REAUTH_MAX_AGE);
    response.cookies.set(REAUTH_COOKIE, value, { ...cookieOptions, maxAge: REAUTH_MAX_AGE });
  }
  return response;
}
