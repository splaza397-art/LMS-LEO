import { isIP } from "node:net";

/**
 * Encabezado X-Forwarded-For que el portal envía al backend (defecto S1 de la auditoría).
 *
 * Next.js conserva el X-Forwarded-For que manda el navegador y solo lo completa si falta, así que por sí solo
 * no distingue uno real de uno inventado. Por eso el portal únicamente lo usa si sabe cuántos proxies propios
 * tiene delante (TRUSTED_PROXY_HOPS):
 *  - 0 (DEV, sin proxy): no reenvía ninguna IP. El backend cuenta los intentos por la conexión del portal.
 *  - 1 (Nginx delante): toma la última dirección de la cadena, la que agregó Nginx. Lo que haya inventado el
 *    cliente queda a la izquierda y se descarta. El portal no debe ser accesible sin pasar por Nginx.
 */
export function forwardedFor(headers: Headers, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0)): Record<string, string> {
  if (!Number.isInteger(hops) || hops <= 0) return {};
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  const ip = chain[chain.length - hops];
  return ip && isIP(ip) ? { "x-forwarded-for": ip } : {};
}
