import { createHash, createHmac, randomBytes } from 'node:crypto';

/** Vida del comprobante: suficiente para volver del navegador, demasiado corta para reutilizarlo. */
export const TICKET_LIFETIME_SECONDS = 60;
export const TICKET_ISSUER = 'iinicia-backend';
export const TICKET_PURPOSE = 'campus-entry';
/** Valor de vinculación que Moodle guarda en una cookie del navegador: 32 bytes en base64url. */
export const BIND_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface CampusTicket {
  v: 2;
  iss: typeof TICKET_ISSUER;
  /** Destinatario: la URL pública de Moodle. */
  aud: string;
  purpose: typeof TICKET_PURPOSE;
  /** Usuario Moodle (de la base del portal, nunca del cliente). */
  uid: number;
  /** UUID institucional (users.id), que Moodle guarda como idnumber. */
  uuid: string;
  /** sub de Keycloak, que Moodle guarda en el acceso vinculado OAuth2. */
  sub: string;
  /** Sesión de Keycloak de la que sale el comprobante (el backend ya comprobó que no está cerrada). */
  sid: string;
  /** SHA-256 (base64url) del valor de vinculación: solo sirve en el navegador que tiene la cookie con ese valor. */
  bnd: string;
  /** Ruta local de Moodle a la que se entra. */
  want: string;
  iat: number;
  exp: number;
  /** Identificador aleatorio: Moodle acepta cada comprobante una sola vez. */
  jti: string;
}

export type TicketInput = Pick<CampusTicket, 'aud' | 'uid' | 'uuid' | 'sub' | 'sid' | 'want'> & { bind: string };

/**
 * Comprobante firmado de entrada al campus: base64url(JSON) "." base64url(HMAC-SHA256).
 * Fase 4.11: está vinculado al navegador que inició la entrada (bnd), así que copiar el enlace no da acceso.
 * No contiene tokens ni credenciales; Moodle lo verifica con el mismo secreto (local_iinicia\sso_ticket).
 */
export function signCampusTicket(input: TicketInput, secret: string, now = Math.floor(Date.now() / 1000)): string {
  // Solo rutas locales: empieza con "/", no con "//", y sin barras invertidas ni espacios.
  if (!/^\/(?!\/)[^\\\s]*$/.test(input.want)) throw new Error('Destino no local');
  if (!BIND_PATTERN.test(input.bind)) throw new Error('Vinculación inválida');
  const { bind, ...rest } = input;
  const ticket: CampusTicket = {
    v: 2, iss: TICKET_ISSUER, purpose: TICKET_PURPOSE, ...rest,
    bnd: createHash('sha256').update(bind).digest('base64url'),
    iat: now, exp: now + TICKET_LIFETIME_SECONDS, jti: randomBytes(24).toString('base64url'),
  };
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
