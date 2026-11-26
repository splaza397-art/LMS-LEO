# 05 · API e integración con Moodle

## API del backend

- Base: `/api/v1`. Especificación completa en `api/openapi.json` y, en desarrollo, en http://localhost:4000/api/docs.
- Autenticación: `Authorization: Bearer <access token de Keycloak>` con audiencia `iinicia-api`. Las rutas públicas no requieren token.
- Errores: JSON `{ statusCode, message }`. 401 sin sesión, 403 sin permiso, 404 recurso inexistente o ajeno, 429 por exceso de peticiones y 502 si Moodle no responde.

| Grupo | Rutas |
|---|---|
| Estado | `GET /api/estado` |
| Público | `POST auth/register`, `POST info-requests`, `GET programs`, `GET programs/{slug}`, `GET content/{type}`, `GET content/{type}/{slug}`, `GET media/{id}`, `GET redirects`, `GET sitemap-data` |
| Mi IINICIA (`me`) | `GET/PATCH me`, `GET me/courses`, `GET me/courses/{id}`, `GET me/upcoming`, `GET me/teaching`, `GET me/campus-link`, `GET/POST me/applications`, `GET me/notifications`, `POST me/notifications/{id}/read`, `POST/DELETE me/devices` |
| Administración (`admin`) | Usuarios (lista, roles, suspensión, matrículas, sincronización), solicitudes y decisiones, programas, cohortes, cursos y profesores, contenidos y medios, solicitudes de información, avisos, reportes, estadísticas y auditoría |

Los permisos de cada ruta de administración siguen la matriz de [04 · Seguridad](04-seguridad.md).

## Servicios web de Moodle (`local_iinicia`)

El backend usa un único servicio externo, `iinicia_backend`, con una cuenta de servicio (`iinicia_ws`) que solo tiene la capacidad `local/iinicia:syncidentity`.

| Función | Uso |
|---|---|
| `local_iinicia_upsert_user` | Crea, vincula o actualiza la cuenta de forma idempotente. La llave es el UUID IINICIA (`idnumber`). Vincula el `sub` de OIDC y aplica la suspensión |
| `local_iinicia_set_enrolment` | Matricula, suspende o reactiva (matriculación manual) sin perder el historial |
| `local_iinicia_set_system_role` | Asigna o retira `manager` de sistema |
| `local_iinicia_set_cohort_member` | Crea la cohorte (por UUID) y gestiona sus miembros |
| `local_iinicia_student_overview` | Cursos, secciones, actividades, fechas y avance visibles **para ese usuario** |
| `local_iinicia_course_progress` | Estudiantes activos de un curso con su avance y último acceso (panel del profesor) |
| `local_iinicia_list_courses` | Catálogo de cursos para vincular a programas |

Scripts de línea de comandos del plugin: `cli/setup.php` (configuración idempotente al arrancar el contenedor), `cli/seed_cursos.php` (cursos Base de Datos e Inter Comunicaciones) y `cli/cleanup_e2e.php` (limpieza de datos de prueba).

## Sincronización e idempotencia

- Repetir un alta o una admisión no duplica la cuenta ni la matrícula. Está verificado por prueba automática.
- Orden de búsqueda de la cuenta: UUID, luego `sub` vinculado, y por último correo de una cuenta sin dueño. Un correo que pertenece a otra identidad produce un conflicto en vez de una fusión silenciosa.
- Cada sincronización aplica en orden: cuenta, rol de sistema, matrículas (incluidas las de supervisión del coordinador), cohortes y auditoría.
- Ante un fallo de Moodle, el usuario queda `moodle_sync_status = error` y se reintenta cada 60 s (25 usuarios por ciclo).

## SSO hacia Moodle

La entrada al campus tiene dos pasos (Fase 4.11). `GET /api/v1/me/campus-link` sin `bind` devuelve el paso `local/iinicia/sso.php?start=1`: Moodle pone una cookie de vinculación en el navegador y lo manda al portal (`/auth/campus`) o a la app (`iinicia://campus`, con el `state` de la app). Con `bind`, el backend devuelve `sso.php?ticket=<comprobante>`: firmado (HMAC-SHA256 con `MOODLE_SSO_SECRET`), de 60 s y un solo uso, con emisor, destinatario, propósito, la sesión de Keycloak (`sid`) y el SHA-256 del valor de vinculación. Moodle solo lo acepta en el navegador que tiene esa cookie, comprueba que coincidan el usuario de Moodle, el UUID institucional y el sub de Keycloak, y si hay abierta una sesión de otra persona, la cierra antes de abrir la correcta. Un enlace copiado a otro navegador no sirve. Sin comprobante, `sso.php` nunca reutiliza una sesión: la cierra y manda al login OAuth2 del emisor "IINICIA", que siempre pide credenciales (`prompt=login`). El comprobante no contiene tokens. Detalle en el [documento 15b](15b-correccion-critica-sesiones.md).

Moodle tiene desactivada la creación automática de cuentas (`authpreventaccountcreation`), así que solo entran las personas que el backend sincronizó. El backend genera el enlace solo para cursos o actividades del propio usuario.

**Cierre de sesión coordinado:** `POST /api/v1/me/logout` cierra la sesión de Keycloak del token (API de administración) y todas las de Moodle (servicio web `local_iinicia_logout_user`). Responde `{keycloak, moodle, complete}`. Si Moodle o Keycloak no responden, el cierre queda pendiente (`users.moodle_logout_pending_at` y `session_revocations`) y se reintenta cada 15 s; el reintento de Keycloak cierra solo esa sesión (`sid`). Al cerrar, Moodle también revoca los comprobantes emitidos hasta esa hora.
