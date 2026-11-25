import { createHmac, randomBytes } from 'node:crypto';

/** Vida del comprobante: suficiente para abrir el navegador, demasiado corta para reutilizarlo. */
export const TICKET_LIFETIME_SECONDS = 60;

export interface CampusTicket {
  v: 1;
  /** Usuario Moodle (de la base del portal, nunca del cliente). */
  uid: number;
  /** UUID institucional (users.id), que Moodle guarda como idnumber. */
  uuid: string;
  /** sub de Keycloak, que Moodle guarda en el acceso vinculado OAuth2. */
  sub: string;
  /** Ruta local de Moodle a la que se entra. */
  want: string;
  iat: number;
  exp: number;
  /** Identificador aleatorio: Moodle acepta cada comprobante una sola vez. */
  jti: string;
}

/**
 * Comprobante firmado de entrada al campus (Fase 4.10): base64url(JSON) "." base64url(HMAC-SHA256).
 * No contiene tokens ni credenciales; Moodle lo verifica con el mismo secreto (local_iinicia\sso_ticket).
 */
export function signCampusTicket(input: Pick<CampusTicket, 'uid' | 'uuid' | 'sub' | 'want'>, secret: string, now = Math.floor(Date.now() / 1000)): string {
  // Solo rutas locales: empieza con "/", no con "//", y sin barras invertidas ni espacios.
  if (!/^\/(?!\/)[^\\\s]*$/.test(input.want)) throw new Error('Destino no local');
  const ticket: CampusTicket = {
    v: 1, ...input, iat: now, exp: now + TICKET_LIFETIME_SECONDS, jti: randomBytes(24).toString('base64url'),
  };
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
