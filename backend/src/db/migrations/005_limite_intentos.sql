-- Fase 1.5 (defecto S1): contador de intentos compartido entre instancias del backend.
-- UNLOGGED: datos efímeros; si PostgreSQL se reinicia de forma abrupta los contadores vuelven a cero.
CREATE UNLOGGED TABLE IF NOT EXISTS throttle_counters (
  key text NOT NULL,
  throttler text NOT NULL,
  hits integer NOT NULL,
  window_ends_at timestamptz NOT NULL,
  blocked_until timestamptz,
  PRIMARY KEY (key, throttler)
);
