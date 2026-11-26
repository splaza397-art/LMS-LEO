-- Fase 5: cierres de sesión por dispositivo y revocación de todas las sesiones.
-- 1. moodle_logout_queue: cada cierre de Moodle pendiente guarda su alcance (device o all) y la sesión de Keycloak (sid)
--    a la que pertenece. El reintento cierra solo las sesiones de Moodle asociadas a ese sid: una sesión nueva de la
--    misma persona (otro sid) nunca se toca. Sustituye a users.moodle_logout_pending_at (Fase 4.10), que se conserva sin
--    uso; sus pendientes se copian aquí con alcance "all", que era su significado.
-- 2. users.sessions_revoked_at y sessions_revoke_pending: "cerrar todas las sesiones" o revocación por seguridad. Los tokens emitidos hasta esa
--    hora dejan de valer en la API aunque aún no venzan.
-- Solo agrega una tabla y dos columnas; los pendientes se copian antes de limpiarlos. No borra datos institucionales.
CREATE TABLE IF NOT EXISTS moodle_logout_queue (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('device', 'all')),
  kc_sid text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope = 'all' OR kc_sid IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS moodle_logout_queue_requested_idx ON moodle_logout_queue (requested_at);

INSERT INTO moodle_logout_queue (user_id, scope, requested_at)
  SELECT id, 'all', moodle_logout_pending_at FROM users WHERE moodle_logout_pending_at IS NOT NULL;
UPDATE users SET moodle_logout_pending_at = NULL WHERE moodle_logout_pending_at IS NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_revoked_at timestamptz;
-- Cierre de todas las sesiones que Keycloak no pudo confirmar: el reintento lo repite cuando vuelva.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_revoke_pending boolean NOT NULL DEFAULT false;
