import type { NextRequest } from "next/server";
import { COOKIES, refreshTokens, unseal } from "@/lib/session-core";

/** Token de acceso vigente de la sesión del portal, solo en el servidor (lo renueva si ya venció). */
export async function currentAccessToken(request: NextRequest): Promise<string | null> {
  const access = await unseal<{ t: string; e: number }>(request.cookies.get(COOKIES.access)?.value);
  if (access && access.e > Date.now() / 1000 + 10) return access.t;
  const refresh = await unseal<{ t: string }>(request.cookies.get(COOKIES.refresh)?.value);
  return refresh ? ((await refreshTokens(refresh.t))?.access_token ?? null) : null;
}
