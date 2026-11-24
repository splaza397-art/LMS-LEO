#!/bin/bash
# Crea una base y un usuario aislados por servicio. Ningun servicio accede a la base de otro.
set -euo pipefail

create_db() {
  local name="$1" password="$2"
  psql -v ON_ERROR_STOP=1 -v name="$name" -v password="$password" --username postgres <<'SQL'
CREATE ROLE :"name" LOGIN PASSWORD :'password';
CREATE DATABASE :"name" OWNER :"name" ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE :"name" FROM PUBLIC;
SQL
}

create_db portal "$PORTAL_DB_PASSWORD"
create_db keycloak "$KEYCLOAK_DB_PASSWORD"
create_db moodle "$MOODLE_DB_PASSWORD"
