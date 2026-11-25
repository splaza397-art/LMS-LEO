# 12 · Plan general de desarrollo

Este plan reemplaza al de la sección 9 de la [auditoría](10-auditoria-tecnica.md) e incorpora las decisiones del 24/11/2026:

- Git local.
- 12 módulos en el backend.
- Eliminación de `nodemailer`.
- Fase 1.5 de estabilización.
- Fase 5.5 de calificaciones.

## Reglas para todas las fases

- **Antes:** explicar qué archivos cambian y qué riesgos hay. **Después:** pruebas, compilación, documentación y errores pendientes.
- Commits pequeños en una rama por fase. No hay subidas a servidores externos ni despliegues.
- Se conservan:
  - las URL y endpoints de `/api/v1`;
  - los 8 roles y la matriz RBAC;
  - las migraciones SQL y el acceso a datos con `pg`;
  - las integraciones con Moodle y Keycloak;
  - los controles de seguridad.
- No se eliminan datos, migraciones, archivos ni funcionalidades sin autorización.
- No se debilitan pruebas. Los resultados se reportan tal como salen.

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Auditoría y diagnóstico | Terminada ([10-auditoria-tecnica.md](10-auditoria-tecnica.md)) |
| **1.5** | **Estabilización y seguridad:** Git; cohortes duplicadas (I1); límite de intentos (S1); `nodemailer` (S2) | Terminada e integrada en `main` (24/11/2026), con limpieza de datos personales del historial ([11-estabilizacion-pre-refactorizacion.md](11-estabilizacion-pre-refactorizacion.md)) |
| 2 | Backend (rama `refactor/backend-modular-architecture`): 12 módulos, controladores, servicios y repositorios SQL separados. Paginación, búsqueda, filtrado, ordenamiento controlado y límites máximos, con compatibilidad total | Terminada e integrada en `main` (`2f69fbc`, 24/11/2026) ([13-refactorizacion-backend.md](13-refactorizacion-backend.md)) |
| 3 | Frontend (rama `refactor/frontend-modular-architecture`): grupos de rutas, carpetas por funcionalidad, componentes compartidos, cliente de API único, paneles por rol, tablas paginadas en el backend, accesibilidad, SEO y pruebas del portal. Misma identidad visual y mismas URL | Implementada en la rama (etapas 3.1 a 3.8), pendiente de tu autorización para integrarla a `main` ([14-refactorizacion-frontend.md](14-refactorizacion-frontend.md)) |
| 4 | Android: dividir `AppRoot.kt` con MVVM; pantallas y navegación separadas; pruebas de ViewModels, repositorios y Compose; revisar los 35 avisos de lint; compilar el APK. Prueba en teléfono físico cuando esté disponible | Pendiente |
| 5 | Integraciones y seguridad: revisión integral de Moodle y Keycloak, permisos, auditoría de la sincronización, sesiones y cuentas administrativas | Pendiente |
| **5.5** | **Calificaciones** con Moodle como fuente oficial (ver abajo) | Pendiente; solo documentada |
| 6 | Infraestructura: arranque en frío de Moodle (calentamiento tras purgar cachés, *healthcheck* de disponibilidad, primer ciclo de `moodle-cron`; ver la sección 15 del documento 14); Dockerfiles del portal y del backend; entornos DEV, STAGING y PRODUCTION; Keycloak en modo producción; HTTPS con Nginx; redes privadas; respaldos; secretos; monitoreo y logs | Pendiente |
| 7 | Automatización: GitHub Actions con pruebas, análisis de dependencias, detección de secretos y compilaciones reproducibles | Pendiente |
| 8 | Validación final: documentación, manuales, diagramas, resultados reales, registro de cambios, riesgos y pendientes | Pendiente |

---

## Fase 2 · Diseño de los 12 módulos del backend

Cada módulo de NestJS tendrá su controlador, servicio, repositorio (las consultas SQL actuales, sin cambiarlas), DTO y tipos. Las piezas transversales no son módulos funcionales: se comparten.

| Pieza transversal | Contenido |
|---|---|
| `db` | `DbModule`: un solo pool, migraciones, transacciones y bloqueos consultivos. Ya existe desde la Fase 1.5 |
| `integrations` | Clientes de Keycloak y de Moodle. Son el único punto de contacto con cada sistema externo |
| `security` | Proxies de confianza y almacén del límite de intentos (Fase 1.5) |
| `config` | Variables de entorno validadas al arrancar |

### Módulos, responsabilidades y endpoints

Las rutas no cambian. Cada endpoint se mueve, sin modificarse, al módulo que le corresponde.

| # | Módulo | Responsabilidad | Endpoints actuales que absorbe |
|---|---|---|---|
| 1 | `auth` | Guard global (token, cuenta suspendida, permiso), matriz RBAC, decoradores `@Public`, `@RequirePermission` y `@CurrentUser`, y ámbito del coordinador (`assertProgramScope`) | Ninguno propio; protege a todos |
| 2 | `users` | Registro, perfil, lista de usuarios, suspensión y roles, incluido el control del último superadministrador | `POST /auth/register`, `GET` y `PATCH /me`, `GET /admin/users`, `PATCH /admin/users/:id/suspension`, `PUT /admin/users/:id/roles` |
| 3 | `admissions` | Solicitudes de admisión y su decisión. También las solicitudes de información, que son contactos previos a la admisión | `GET` y `POST /me/applications`, `GET /admin/applications`, `POST /admin/applications/:id/decision`, `POST /info-requests`, `GET /admin/info-requests`, `PATCH /admin/info-requests/:id` |
| 4 | `programs` | Programas, cohortes, cursos vinculados y profesores asignados | `GET /programs`, `GET /programs/:slug`, `GET` y `POST /admin/programs`, `PUT /admin/programs/:id`, `POST /admin/programs/:id/cohorts`, `POST /admin/programs/:id/courses`, `DELETE /admin/programs/:id/courses/:courseId`, `GET` y `PUT /admin/programs/:id/teachers`, `GET /admin/teachers`, `GET /admin/moodle/courses` |
| 5 | `enrollments` | Matrículas: consulta, suspensión y reactivación | `GET /admin/users/:id/enrolments`, `PATCH /admin/users/:id/enrolment` |
| 6 | `dashboard` | Lo que ve cada persona en Mi IINICIA: cursos, actividades próximas, enlace al campus y grupos del profesor o coordinador | `GET /me/courses`, `GET /me/courses/:id`, `GET /me/upcoming`, `GET /me/campus-link`, `GET /me/teaching` |
| 7 | `content` | Contenido del portal: noticias, páginas, preguntas, docentes, autoridades, contacto; también imágenes, redirecciones de WordPress y datos del sitemap | `GET /content/:type`, `GET /content/:type/:slug`, `GET /media/:id`, `GET /sitemap-data`, `GET /redirects`, `GET` y `POST /admin/content`, `PUT` y `DELETE /admin/content/:id`, `POST /admin/media` |
| 8 | `notifications` | Avisos por persona, avisos masivos por programa y dispositivos de la app | `GET /me/notifications`, `POST /me/notifications/:id/read`, `POST /me/devices`, `DELETE /me/devices/:token`, `POST /admin/notifications` |
| 9 | `reports` | Indicadores y reportes por programa | `GET /admin/stats`, `GET /admin/reports` |
| 10 | `audit` | Registro inalterable y su consulta | `GET /admin/audit` |
| 11 | `synchronization` | Sincronización con Moodle: alta, roles, matrículas y cohortes; bloqueo por persona; reintentos con espera progresiva | `POST /admin/users/:id/sync` |
| 12 | `health` | Estado del sistema | `GET /api/estado` |

Total: **52 endpoints**, 51 bajo `/api/v1` más `/api/estado`. Se comprobará que el OpenAPI generado antes y después de la Fase 2 sea idéntico en rutas, métodos y parámetros.

### Dependencias entre módulos

Las dependencias van en un solo sentido, sin ciclos. `audit` y `auth` las usan casi todos.

```
health ──► integrations, db
auth ──► db
audit ──► db
users ──► auth, audit, synchronization, integrations(keycloak)
admissions ──► auth, audit, users(roles), enrollments, synchronization, notifications, integrations(keycloak)
programs ──► auth, audit, enrollments(asignar profesor), synchronization, integrations(moodle)
enrollments ──► auth, audit, synchronization
dashboard ──► auth, integrations(moodle)
content ──► auth, audit
notifications ──► auth, audit
reports ──► auth
synchronization ──► audit, integrations(moodle), db(bloqueos)
```

**Regla:** un módulo no lee las tablas de otro. Si necesita un dato ajeno, llama al servicio del dueño.

Excepción: las consultas de `reports`, que son de solo lectura y cruzan varias tablas a propósito. Quedan documentadas en su repositorio.

### Mejoras incluidas en la Fase 2

- **Paginación** en usuarios, solicitudes, información, contenidos y auditoría.
  - Parámetros: `page`, `pageSize` (máximo 100), `sort` (solo columnas permitidas) y `order`.
  - Sin parámetros, la respuesta es idéntica a la actual, para no romper el portal ni la app hasta la Fase 3.
- **Búsqueda y filtros:** texto, estado, rol y programa, según la lista.
- **Errores de unicidad:** un filtro de errores de PostgreSQL convierte un duplicado en `409` con mensaje, en lugar de `500`.

---

## Fase 5.5 · Calificaciones

**Fuente oficial:** el libro de calificaciones de Moodle. IINICIA **no guardará calificaciones propias**: el portal y la app las consultan a Moodle mediante el backend. Los profesores califican en Moodle, o desde el portal mediante servicios web que escriben en el mismo libro de Moodle.

### Análisis previo obligatorio (al iniciar la fase)

Funciones nativas de Moodle que hay que evaluar antes de escribir código:

- `gradereport_user_get_grade_items`: calificaciones por actividad de un estudiante, con retroalimentación.
- `gradereport_overview_get_course_grades`: calificación de cada curso.
- `core_grades_get_gradeitems` y `core_grades_update_grades`: lectura y escritura de elementos del libro.
- `mod_assign_save_grade`: calificar una tarea con retroalimentación.
- Configuración de agregación del curso (promedio, ponderado, etc.) y visibilidad (elementos ocultos y fechas de publicación).

### Requisitos

| Requisito | Detalle |
|---|---|
| Registro por profesores autorizados | Solo `editingteacher` del curso. Se valida en el backend y otra vez en Moodle |
| Consulta por el estudiante | Solo sus propias calificaciones. El ID de Moodle sale de la base, nunca del cliente |
| Por actividad y por curso | Detalle por actividad y total del curso |
| Promedios | Los calcula Moodle según la agregación del curso; IINICIA no recalcula |
| Retroalimentación | Comentarios del profesor por actividad |
| Supervisión | El coordinador ve las calificaciones de los cursos de su programa, en solo lectura |
| Portal y Android | Pantallas "Calificaciones" en Mi IINICIA y en la app |
| Protección de datos | Respetar elementos ocultos y fechas de publicación. Sin caché compartida entre personas |
| Control de acceso | Por rol, por usuario y por curso, con pruebas que intenten leer calificaciones ajenas |
| Auditoría | Cada calificación registrada desde IINICIA queda en `audit_log` |
| Pruebas | Autorización (estudiante A no ve las de B; un profesor no califica cursos ajenos) y funcionamiento en web y Android |
