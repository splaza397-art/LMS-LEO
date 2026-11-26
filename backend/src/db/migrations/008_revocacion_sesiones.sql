-- Fase 4.11: sesiones de Keycloak cerradas desde IINICIA.
-- 1. El backend no emite comprobantes de entrada al campus para una sesión que ya se cerró.
-- 2. Si Keycloak no respondió al cerrar sesión, keycloak_confirmed_at queda vacío y el reintento periódico cierra esa
--    sesión (solo esa: una sesión nueva tiene otro sid y no se toca).
-- Solo agrega una tabla; no modifica ni borra datos existentes.
CREATE TABLE IF NOT EXISTS session_revocations (
  sid text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  keycloak_confirmed_at timestamptz
);
CREATE INDEX IF NOT EXISTS session_revocations_pending_idx ON session_revocations (requested_at) WHERE keycloak_confirmed_at IS NULL;
