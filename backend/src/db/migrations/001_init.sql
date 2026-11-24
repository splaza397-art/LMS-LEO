CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oidc_sub uuid UNIQUE,
  email text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'aspirante'
    CHECK (status IN ('aspirante', 'admitido', 'activo', 'suspendido')),
  moodle_user_id bigint UNIQUE,
  moodle_sync_status text NOT NULL DEFAULT 'none'
    CHECK (moodle_sync_status IN ('none', 'pending', 'synced', 'error')),
  moodle_sync_error text,
  moodle_synced_at timestamptz,
  consent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE INDEX users_sync_idx ON users (moodle_sync_status) WHERE moodle_sync_status IN ('pending', 'error');

CREATE TABLE programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  level text NOT NULL CHECK (level IN ('licenciatura', 'diplomado', 'certificacion', 'curso')),
  summary text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration text NOT NULL DEFAULT '',
  modality text NOT NULL DEFAULT 'En línea',
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('superadmin', 'admin_tecnico', 'admin_academico', 'coordinador',
                                     'profesor', 'estudiante', 'aspirante', 'soporte')),
  program_id uuid REFERENCES programs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_roles_unique ON user_roles (user_id, role, COALESCE(program_id, '00000000-0000-0000-0000-000000000000'));

CREATE TABLE cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date,
  ends_on date,
  UNIQUE (program_id, name)
);

CREATE TABLE program_courses (
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  moodle_course_id bigint NOT NULL,
  PRIMARY KEY (program_id, moodle_course_id)
);

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id),
  cohort_id uuid REFERENCES cohorts(id),
  status text NOT NULL DEFAULT 'enviada' CHECK (status IN ('enviada', 'admitida', 'rechazada')),
  notes text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, program_id)
);

CREATE TABLE enrolments (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  moodle_course_id bigint NOT NULL,
  program_id uuid REFERENCES programs(id),
  moodle_role text NOT NULL DEFAULT 'student',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, moodle_course_id)
);

CREATE TABLE content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('noticia', 'pagina', 'faq', 'docente', 'contacto')),
  slug text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  image_url text,
  seo_title text,
  seo_description text,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'publicado')),
  published_at timestamptz,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type, slug)
);

CREATE TABLE redirects (
  source_path text PRIMARY KEY,
  target_path text NOT NULL
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE devices (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'android',
  notifications_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  detail jsonb NOT NULL DEFAULT '{}',
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);

-- La auditoria es de solo insercion, incluso para la aplicacion.
CREATE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log es de solo insercion';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
