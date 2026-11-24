import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
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
  /** MFA obligatoria para roles privilegiados. Solo se desactiva de forma explicita (entornos de prueba). */
  mfaPrivilegedRoles: process.env.MFA_PRIVILEGED_ROLES !== 'false',
  mail: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    from: process.env.MAIL_FROM ?? 'IINICIA <no-responder@iinicia.local>',
  },
};
