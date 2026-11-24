import 'dotenv/config';
import { parseTrustedProxies } from './security/trusted-proxies';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** Interfaz de escucha. En DEV solo la máquina local; en contenedores, 0.0.0.0 dentro de una red interna. */
  host: process.env.HOST ?? '127.0.0.1',
  /** Proxies de confianza para X-Forwarded-For. Ver src/security/trusted-proxies.ts. */
  trustedProxies: parseTrustedProxies(process.env.TRUSTED_PROXIES),
  production: process.env.NODE_ENV === 'production',
  databaseUrl: required('DATABASE_URL'),
  corsOrigins: required('CORS_ORIGINS').split(',').map((o) => o.trim()),
  /** URL pública del portal; por omisión, el primer origen permitido. */
  portalUrl: (process.env.PORTAL_PUBLIC_URL ?? required('CORS_ORIGINS').split(',')[0]).trim().replace(/\/$/, ''),
  keycloak: {
    url: required('KEYCLOAK_URL').replace(/\/$/, ''),
    realm: required('KEYCLOAK_REALM'),
    clientId: required('KEYCLOAK_BACKEND_CLIENT_ID'),
    clientSecret: required('KEYCLOAK_BACKEND_CLIENT_SECRET'),
  },
  moodle: {
    url: required('MOODLE_URL').replace(/\/$/, ''),
    token: required('MOODLE_WS_TOKEN'),
  },
  /** Paginación de listas administrativas: tamaño máximo de página (entre 1 y 500; por omisión 100). */
  pagination: {
    maxPageSize: Math.min(500, Math.max(1, Number(process.env.PAGINATION_MAX_PAGE_SIZE ?? 100) || 100)),
  },
  /** MFA obligatoria para roles privilegiados. Solo se desactiva de forma explicita (entornos de prueba). */
  mfaPrivilegedRoles: process.env.MFA_PRIVILEGED_ROLES !== 'false',
};
