/**
 * Cliente HTTP del navegador. Todo pasa por el BFF (/api/bff/v1/*) o por las rutas públicas del portal
 * (/api/registro, /api/informacion): el navegador nunca ve tokens. Un solo lugar decide cómo se informan
 * los errores, para que todas las pantallas digan lo mismo ante la misma situación.
 *
 * No hay reintentos automáticos: repetir un POST/PUT/PATCH/DELETE podría duplicar efectos (por ejemplo,
 * admitir dos veces o enviar dos avisos). La persona decide si vuelve a intentar.
 */
export type ApiErrorKind =
  | "validation" // 400, 409, 422: datos inválidos o conflicto; el mensaje del backend explica qué corregir
  | "session" // 401: la sesión terminó
  | "forbidden" // 403: sin permiso
  | "not_found" // 404
  | "rate_limit" // 429: límite de intentos (Fase 1.5)
  | "unavailable" // 502, 503, 504: el campus u otro servicio no responde
  | "server" // 500 y otros
  | "network"; // sin conexión con el portal

export class ApiError extends Error {
  constructor(message: string, readonly kind: ApiErrorKind, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  validation: "Revisa los datos e intenta de nuevo.",
  session: "Tu sesión terminó. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para esta acción.",
  not_found: "No encontramos lo que buscas.",
  rate_limit: "Demasiados intentos. Espera un minuto y vuelve a intentarlo.",
  unavailable: "El servicio no está disponible por el momento. Intenta más tarde.",
  server: "Ocurrió un error en el servidor. Intenta de nuevo en unos minutos.",
  network: "No hay conexión con el servidor. Revisa tu conexión e intenta de nuevo.",
};

export function kindOf(status: number): ApiErrorKind {
  if (status === 401) return "session";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  if (status >= 400 && status < 500) return "validation";
  return "server";
}

/** Mensaje para la persona: el del backend cuando es útil (siempre en español), o uno genérico. */
export function errorFromResponse(status: number, body: unknown): ApiError {
  const kind = kindOf(status);
  const raw = (body as { message?: unknown } | null)?.message;
  const backend = Array.isArray(raw) ? raw.join(". ") : typeof raw === "string" ? raw : "";
  // Para sesión, límite y errores internos el texto genérico es más claro que el técnico.
  const useBackend = backend && !["session", "rate_limit", "server"].includes(kind);
  return new ApiError(useBackend ? backend : DEFAULT_MESSAGES[kind], kind, status);
}

/** Al vencer la sesión se lleva a iniciar sesión y se vuelve a la misma página. */
export let onSessionExpired = () => {
  if (typeof window === "undefined") return;
  // /auth/login es una ruta del servidor que lleva a Keycloak: requiere navegación completa, no del enrutador.
  const back = window.location.pathname + window.location.search;
  window.location.assign(new URL(`/auth/login?returnTo=${encodeURIComponent(back)}`, window.location.origin).href);
};
/** Solo para pruebas. */
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

async function send<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError(DEFAULT_MESSAGES.network, "network", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorFromResponse(response.status, data);
    if (error.kind === "session") onSessionExpired();
    throw error;
  }
  return data as T;
}

/** Llamada a /api/v1 a través del BFF con la sesión de la persona. */
export function bff<T = unknown>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  return send<T>(`/api/bff/v1/${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
}

/** Formularios públicos del portal (registro, información). */
export function postPublic<T = unknown>(url: "/api/registro" | "/api/informacion", body: unknown): Promise<T> {
  return send<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Sube una imagen. El backend vuelve a validar su contenido real; aquí solo se evita un envío inútil. */
export async function uploadImage(file: File): Promise<{ id: string; url: string }> {
  if (!IMAGE_TYPES.includes(file.type)) throw new ApiError("Usa una imagen PNG, JPG o WebP.", "validation", 0);
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError("La imagen supera 5 MB.", "validation", 0);
  return send(`/api/bff/v1/admin/media`, { method: "POST", headers: { "content-type": file.type }, body: file });
}

/** Construye la consulta omitiendo valores vacíos. */
export function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : "";
}
