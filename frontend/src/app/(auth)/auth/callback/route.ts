import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, cookieOptions, REFRESH_MAX_AGE, requestTokens, sealTokens, unseal } from "@/lib/session-core";
import { REAUTH_COOKIE } from "@/lib/logout-policy";

const jwks = createRemoteJWKSet(new URL(`${process.env.OIDC_ISSUER}/protocol/openid-connect/certs`));
const portal = (path: string) => new URL(path, process.env.PORTAL_URL);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tx = await unseal<{ state: string; nonce: string; verifier: string; returnTo: string }>(
    request.cookies.get(COOKIES.tx)?.value,
  );
  const fail = () => {
    const response = NextResponse.redirect(portal("/?error=login"));
    response.cookies.delete(COOKIES.tx);
    return response;
  };
  const code = params.get("code");
  if (!tx || !code || params.get("state") !== tx.state) return fail();

  const tokens = await requestTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${process.env.PORTAL_URL}/auth/callback`,
    code_verifier: tx.verifier,
  });
  if (!tokens?.id_token) return fail();
  try {
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: process.env.OIDC_ISSUER,
      audience: process.env.OIDC_CLIENT_ID,
    });
    if (payload.nonce !== tx.nonce) return fail();
  } catch {
    return fail();
  }

  const sealed = await sealTokens(tokens);
  const response = NextResponse.redirect(portal(tx.returnTo));
  response.cookies.delete(COOKIES.tx);
  response.cookies.delete(REAUTH_COOKIE);
  response.cookies.set(COOKIES.access, sealed.access, { ...cookieOptions, maxAge: sealed.accessMaxAge });
  response.cookies.set(COOKIES.refresh, sealed.refresh, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });
  if (sealed.id) response.cookies.set(COOKIES.id, sealed.id, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });
  return response;
}
