ALTER TABLE content_items DROP CONSTRAINT content_items_type_check;
ALTER TABLE content_items ADD CONSTRAINT content_items_type_check
  CHECK (type IN ('noticia', 'pagina', 'faq', 'docente', 'autoridad', 'contacto'));

ALTER TABLE cohorts ADD COLUMN moodle_cohort_id bigint;

CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mime text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes int NOT NULL,
  data bytea NOT NULL,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE info_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  program_id uuid REFERENCES programs(id) ON DELETE SET NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'nueva' CHECK (status IN ('nueva', 'atendida')),
  consent_at timestamptz NOT NULL,
  handled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX info_requests_status_idx ON info_requests (status, created_at DESC);
