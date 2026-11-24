import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Me } from "@/types/api";
import { COOKIES, unseal } from "../session-core";

/**
 * Lecturas del backend desde componentes de servidor. Devuelven null si el backend falla o responde error:
 * cada página decide qué mostrar (por ejemplo, "El campus no está disponible por el momento").
 */
const base = () => `${process.env.BACKEND_URL}/api/v1`;

export async function publicGet<T>(path: string): Promise<T | null> {
  await connection();
  try {
    const response = await fetch(`${base()}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Con la sesión de la persona (token del lado del servidor; nunca llega al navegador). */
export async function privateGet<T>(path: string): Promise<T | null> {
  const store = await cookies();
  const access = await unseal<{ t: string }>(store.get(COOKIES.access)?.value);
  if (!access) return null;
  try {
    const response = await fetch(`${base()}${path}`, {
      headers: { authorization: `Bearer ${access.t}` },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export const getMe = () => privateGet<Me>("/me");
