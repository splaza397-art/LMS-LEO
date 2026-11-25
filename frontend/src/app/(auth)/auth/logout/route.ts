import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, cookieOptions, oidcEndpoint, refreshTokens, unseal } from "@/lib/session-core";
import { logoutPlan, REAUTH_COOKIE, REAUTH_MAX_AGE, type LogoutResult } from "@/lib/logout-policy";

/** Token de acceso vigente de la sesión del portal (lo renueva si ya venció). */
async function currentAccessToken(request: NextRequest): Promise<string | null> {
  const access = await unseal<{ t: string; e: number }>(request.cookies.get(COOKIES.access)?.value);
  if (access && access.e > Date.now() / 1000 + 10) return access.t;
  const refresh = await unseal<{ t: string }>(request.cookies.get(COOKIES.refresh)?.value);
  return refresh ? ((await refreshTokens(refresh.t))?.access_token ?? null) : null;
}

/** Cierre coordinado en el backend (Keycloak y Moodle), desde el servidor: no depende del navegador. */
async function backendLogout(token: string | null): Promise<LogoutResult | null> {
  if (!token) return null;
  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/v1/me/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
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
  const plan = logoutPlan(await backendLogout(await currentAccessToken(request)));

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
  if (plan.requireCredentialsNextTime) response.cookies.set(REAUTH_COOKIE, "1", { ...cookieOptions, maxAge: REAUTH_MAX_AGE });
  return response;
}
