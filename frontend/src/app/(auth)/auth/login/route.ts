import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, cookieOptions, oidcEndpoint, seal, unseal } from "@/lib/session-core";
import { loginPrompt, REAUTH_COOKIE, REAUTH_MAX_AGE, reauthStep } from "@/lib/logout-policy";

const b64 = (bytes: Buffer) => bytes.toString("base64url");
const safePath = (value: string | null) =>
  value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/mi-iinicia";

export async function GET(request: NextRequest) {
  const state = b64(randomBytes(24));
  const nonce = b64(randomBytes(24));
  const verifier = b64(randomBytes(48));
  const challenge = b64(createHash("sha256").update(verifier).digest());
  const returnTo = safePath(request.nextUrl.searchParams.get("returnTo"));

  // Fase 5: tras un cierre no confirmado, se cierra primero en Keycloak la sesión que quedó en el navegador (con el
  // id_token_hint guardado) y se vuelve aquí. La cookie se marca como usada antes, para no repetirlo.
  const reauthRaw = request.cookies.get(REAUTH_COOKIE)?.value;
  const reauth = reauthRaw ? ((await unseal<{ hint?: string }>(reauthRaw)) ?? {}) : null;
  if (reauthStep(reauth) === "cerrar_sesion_anterior") {
    const logout = new URL(oidcEndpoint("logout"));
    logout.searchParams.set("client_id", process.env.OIDC_CLIENT_ID!);
    logout.searchParams.set("id_token_hint", reauth!.hint!);
    logout.searchParams.set("post_logout_redirect_uri", `${process.env.PORTAL_URL}/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
    const response = NextResponse.redirect(logout);
    response.cookies.set(REAUTH_COOKIE, await seal({}, REAUTH_MAX_AGE), { ...cookieOptions, maxAge: REAUTH_MAX_AGE });
    return response;
  }

  const url = new URL(oidcEndpoint("auth"));
  url.search = new URLSearchParams({
    client_id: process.env.OIDC_CLIENT_ID!,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: `${process.env.PORTAL_URL}/auth/callback`,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ui_locales: "es",
    // Si el último cierre de sesión no se confirmó, Keycloak pide credenciales aunque quede una sesión en el navegador.
    ...loginPrompt(request.cookies.has(REAUTH_COOKIE)),
  }).toString();

  const response = NextResponse.redirect(url);
  response.cookies.set(COOKIES.tx, await seal({ state, nonce, verifier, returnTo }, 600), { ...cookieOptions, maxAge: 600 });
  return response;
}
