#!/bin/bash
# Instala o actualiza Moodle y aplica la configuracion IINICIA de forma idempotente.
set -euo pipefail

cd /var/www/html
chown -R www-data:www-data /var/www/moodledata
rm -f /var/www/moodledata/.iinicia-ready
as_www() { runuser -u www-data --preserve-environment -- "$@"; }

if ! as_www php public/local/iinicia/cli/is_installed.php; then
  echo "[iinicia] Instalando Moodle..."
  as_www php admin/cli/install_database.php \
    --agree-license --lang=es \
    --fullname="Campus IINICIA" --shortname="IINICIA" --summary="Campus virtual IINICIA" \
    --adminuser=admin --adminpass="$MOODLE_ADMIN_PASSWORD" --adminemail=admin@iinicia.local
else
  echo "[iinicia] Verificando actualizaciones..."
  as_www php admin/cli/upgrade.php --non-interactive
fi

as_www php public/local/iinicia/cli/setup.php
as_www php admin/cli/purge_caches.php
touch /var/www/moodledata/.iinicia-ready
chown www-data:www-data /var/www/moodledata/.iinicia-ready
echo "[iinicia] Moodle listo."

exec "$@"
