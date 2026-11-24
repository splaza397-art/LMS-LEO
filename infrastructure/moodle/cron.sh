#!/bin/bash
set -u
cd /var/www/html
while true; do
  runuser -u www-data --preserve-environment -- php admin/cli/cron.php --keep-alive=0 || echo "[cron] fallo la ejecucion"
  sleep 60
done
