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

`local/iinicia/sso.php?wantsurl=<ruta>` inicia el login OAuth2 con el emisor "IINICIA" configurado por `setup.php`. Moodle tiene desactivada la creación automática de cuentas (`authpreventaccountcreation`), así que solo entran las personas que el backend sincronizó. El backend genera el enlace solo para cursos o actividades del propio usuario.
