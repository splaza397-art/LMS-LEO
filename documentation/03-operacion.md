# 03 · Operación y respaldos

## Arranque y apagado

```bash
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d --no-build   # servicios
cd backend && npm start          # API
cd frontend && npm start         # portal
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env stop                # apagar conservando datos
```

`docker compose down -v` **borra las bases y los archivos de Moodle.** No usarlo fuera de un entorno desechable.

## Estado del sistema

- `GET /api/estado` devuelve `operativo` o `degradado` y el estado de la base, la identidad y el LMS. El portal lo muestra en `/estado`, enlazado desde el pie de página.
- `docker compose ps` debe mostrar `healthy` en `postgres`, `keycloak` y `moodle`.
- Sincronización pendiente: en el panel, pestaña Usuarios, columna "Moodle" con valor `error` o `pending`. Se reintenta sola cada 60 s, y el administrador técnico puede forzarla con "Sincronizar".

## Registros

| Componente | Cómo verlos |
|---|---|
| Backend | Salida estándar de `npm start`. Nunca incluye tokens ni contraseñas |
| Portal | Salida estándar de `npm start` |
| Moodle, Keycloak, PostgreSQL | `docker compose ... logs <servicio> --tail 100` |
| Auditoría funcional | Panel, pestaña Auditoría, o tabla `audit_log` |

## Respaldo y restauración

```bash
node infrastructure/scripts/backup.mjs            # crea backups/<fecha>/ con portal.dump, moodle.dump, keycloak.dump, moodledata.tar.gz y manifest.json
node infrastructure/scripts/backup.mjs --verify   # además restaura en bases temporales y compara conteos
```

**Prueba de restauración realizada el 24/11/2026.** Las tres bases se restauraron en bases temporales con conteos idénticos al origen, y el archivo de Moodle contenía 2,111 entradas. El resultado está en `evidencias/respaldo-verificado.json`.

**Restauración completa,** con los servicios de aplicación detenidos:

```bash
# por cada base (ejemplo: portal)
docker compose ... exec -T postgres psql -U postgres -c "drop database portal with (force)" -c "create database portal owner portal"
docker compose ... exec -T postgres pg_restore -U postgres --no-owner --role=portal -d portal < backups/<fecha>/portal.dump
# archivos de Moodle
docker run --rm -v iinicia_moodle_data:/data -v "$PWD/backups/<fecha>:/b" postgres:17 sh -c "rm -rf /data/* && tar -C /data -xzf /b/moodledata.tar.gz"
```

**Política recomendada para producción:** respaldo diario, retención de 30 días, copia fuera del servidor y prueba de restauración mensual con `--verify`.

## Acceso de administración a Moodle

La pantalla de acceso de Moodle solo ofrece **Acceder con tu cuenta IINICIA**: el formulario de usuario y contraseña está oculto (`showloginform = 0`), porque ninguna cuenta del campus tiene contraseña propia. Si hace falta entrar con el administrador local de Moodle, se muestra el formulario de forma temporal y después se vuelve a ocultar:

```bash
docker compose exec -u www-data moodle php admin/cli/cfg.php --name=showloginform --set=1
# ... trabajo de administración ...
docker compose exec -u www-data moodle php admin/cli/cfg.php --name=showloginform --set=0
```

## Incidencias frecuentes

| Síntoma | Causa probable | Acción |
|---|---|---|
| `ERR_CONNECTION_REFUSED` en el puerto 3000 | El portal no está iniciado | `cd frontend && npm start` |
| "Estado del sistema: degradado" | Moodle o Keycloak siguen arrancando | Esperar a que estén `healthy` |
| El correo de verificación no llega (DEV) | En DEV los correos se quedan en Mailpit | Abrir http://localhost:8025 |
| Moodle pide contraseña | El usuario no tiene cuenta Moodle sincronizada | Panel, Usuarios, "Sincronizar" |
| Error `EADDRINUSE` al iniciar el backend | Ya hay otro proceso en el puerto 4000 | Cerrar la otra terminal o el proceso |
| La cuenta se bloquea tras varios intentos | Keycloak bloquea tras 5 fallos | Esperar o desbloquear en la consola de Keycloak |
