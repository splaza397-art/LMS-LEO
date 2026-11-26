-- Fase 4.10: cierre de sesión coordinado. Si Moodle no responde al cerrar sesión en IINICIA, queda pendiente y el
-- reintento periódico cierra las sesiones de Moodle de esa persona cuando vuelva a estar disponible.
-- Solo agrega una columna; no modifica ni borra datos existentes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS moodle_logout_pending_at timestamptz;
CREATE INDEX IF NOT EXISTS users_moodle_logout_pending_idx ON users (moodle_logout_pending_at) WHERE moodle_logout_pending_at IS NOT NULL;
