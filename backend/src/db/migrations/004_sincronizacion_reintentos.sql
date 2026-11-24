-- Fase 1.5 (defecto I1): reintentos con espera progresiva para la sincronizacion con Moodle.
-- Solo agrega columnas; no modifica ni borra datos existentes.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS moodle_sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moodle_sync_next_at timestamptz;
