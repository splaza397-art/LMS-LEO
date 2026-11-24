// Nucleo de sesion compartido por proxy.ts y route handlers. Los tokens viajan cifrados y solo en cookies httpOnly.
import { EncryptJWT, jwtDecrypt } from "jose";

export const COOKIES = { access: "iin_at", refresh: "iin_rt", id: "iin_id", tx: "iin_tx" } as const;

const secure = (process.env.PORTAL_URL ?? "").startsWith("https://");
export const cookieOptions = { httpOnly: true, sameSite: "lax", secure, path: "/" } as const;
export const REFRESH_MAX_AGE = 60 * 60 * 10;

const key = () => {
  const hex = process.env.SESSION_SECRET;
  if (!hex || hex.length < 64) throw new Error("SESSION_SECRET inválido");
  return Buffer.from(hex.slice(0, 64), "hex");
};

export async function seal(payload: Record<string, unknown>, maxAgeSeconds: number): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .encrypt(key());
}

export async function unseal<T>(value: string | undefined): Promise<T | null> {
  if (!value) return null;
  try {
    return (await jwtDecrypt(value, key())).payload as T;
  } catch {
    return null;
  }
}

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
}

export const oidcEndpoint = (name: "auth" | "token" | "logout") =>
  `${process.env.OIDC_ISSUER}/protocol/openid-connect/${name}`;

export async function requestTokens(params: Record<string, string>): Promise<TokenSet | null> {
  try {
    const response = await fetch(oidcEndpoint("token"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.OIDC_CLIENT_ID!,
        client_secret: process.env.OIDC_CLIENT_SECRET!,
        ...params,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? ((await response.json()) as TokenSet) : null;
  } catch {
    return null;
  }
}

// Keycloak rota el refresh token: las solicitudes simultaneas deben compartir una sola renovacion.
const inflight = new Map<string, { promise: Promise<TokenSet | null>; at: number }>();
export function refreshTokens(refreshToken: string): Promise<TokenSet | null> {
  const now = Date.now();
  for (const [k, v] of inflight) if (now - v.at > 15_000) inflight.delete(k);
  const existing = inflight.get(refreshToken);
  if (existing) return existing.promise;
  const promise = requestTokens({ grant_type: "refresh_token", refresh_token: refreshToken });
  inflight.set(refreshToken, { promise, at: now });
  return promise;
}

export async function sealTokens(tokens: TokenSet) {
  const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
  return {
    access: await seal({ t: tokens.access_token, e: expiresAt }, tokens.expires_in),
    refresh: await seal({ t: tokens.refresh_token }, REFRESH_MAX_AGE),
    id: tokens.id_token ? await seal({ t: tokens.id_token }, REFRESH_MAX_AGE) : undefined,
    accessMaxAge: tokens.expires_in,
  };
}
