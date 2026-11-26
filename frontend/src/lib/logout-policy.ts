// Fases 4.10 y 5: cierre de sesión coordinado del portal. Lógica pura (sin Next.js) para poder probarla.

/** Respuesta del backend a POST /api/v1/me/logout. */
export interface LogoutResult {
  keycloak: string;
  moodle: string;
  complete: boolean;
}

/** Cookie que obliga a pedir credenciales en el siguiente inicio de sesión (el cierre no se pudo confirmar). */
export const REAUTH_COOKIE = "iin_reauth";
export const REAUTH_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Qué hacer después de pedir el cierre al backend:
 * - Confirmado por todos los servicios: basta con borrar la sesión local; Keycloak ya cerró la sesión del navegador.
 * - No confirmado (o sin respuesta): además de borrar la sesión local, se intenta el cierre en Keycloak por el
 *   navegador y se marca que el siguiente inicio de sesión debe pedir credenciales, para que una sesión residual
 *   no entre sola a la cuenta anterior.
 */
export function logoutPlan(result: LogoutResult | null) {
  const confirmed = result?.complete === true;
  return { requireCredentialsNextTime: !confirmed, browserLogout: !confirmed };
}

/** Parámetros extra de la solicitud de inicio de sesión a Keycloak. */
export function loginPrompt(reauthPending: boolean): Record<string, string> {
  return reauthPending ? { prompt: "login" } : {};
}

/** Alcance pedido en el formulario de cierre: "all" solo si se pidió de forma explícita. */
export function logoutScope(value: FormDataEntryValue | null | undefined): "device" | "all" {
  return value === "all" ? "all" : "device";
}

/**
 * Fase 5: qué hacer al iniciar sesión si el último cierre no se confirmó.
 * - Con el token de identidad guardado (cifrado) del cierre anterior: primero se cierra en Keycloak, con ese
 *   id_token_hint, la sesión que quedó en el navegador, y se vuelve a iniciar sesión. Así Keycloak no muestra la
 *   cuenta anterior aunque el reintento del backend todavía no haya llegado.
 * - Sin token (o ya usado): se pide la contraseña (prompt=login), como en la Fase 4.10.
 */
export function reauthStep(pending: { hint?: string } | null | undefined): "sin_pendiente" | "cerrar_sesion_anterior" | "pedir_credenciales" {
  if (!pending) return "sin_pendiente";
  return pending.hint ? "cerrar_sesion_anterior" : "pedir_credenciales";
}
