import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, cookieOptions, oidcEndpoint, seal } from "@/lib/session-core";

const b64 = (bytes: Buffer) => bytes.toString("base64url");
const safePath = (value: string | null) =>
  value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/mi-iinicia";

export async function GET(request: NextRequest) {
  const state = b64(randomBytes(24));
  const nonce = b64(randomBytes(24));
  const verifier = b64(randomBytes(48));
  const challenge = b64(createHash("sha256").update(verifier).digest());
  const returnTo = safePath(request.nextUrl.searchParams.get("returnTo"));

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
  }).toString();

  const response = NextResponse.redirect(url);
  response.cookies.set(COOKIES.tx, await seal({ state, nonce, verifier, returnTo }, 600), { ...cookieOptions, maxAge: 600 });
  return response;
}
