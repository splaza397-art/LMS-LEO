-- Fase 2 (etapa 2.6): índices para el ordenamiento y los filtros de las listas administrativas paginadas.
-- Solo agrega índices; no modifica datos. IF NOT EXISTS permite volver a ejecutarla sin efectos.
CREATE INDEX IF NOT EXISTS users_created_idx ON users (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS applications_created_idx ON applications (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS applications_program_status_idx ON applications (program_id, status);
CREATE INDEX IF NOT EXISTS enrolments_program_idx ON enrolments (program_id);
CREATE INDEX IF NOT EXISTS content_items_updated_idx ON content_items (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action, created_at DESC);
