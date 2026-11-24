# 13 · Fase 2: Refactorización del backend en 12 módulos

**Rama:** `refactor/backend-modular-architecture` (desde `main` en `62b45da`) · **Fecha:** 24/11/2026 · **Entorno:** DEV local. Sin despliegues ni servicios externos.

## 1. Estado inicial

| Aspecto | Antes de la Fase 2 |
|---|---|
| Controladores | 3 archivos: `api/admin.controller.ts` con 29 endpoints y SQL directo, `api/me.controller.ts` con 13 y `api/public.controller.ts` con 10 |
| DTO | Un solo `api/dto.ts` con 16 clases |
| Servicios | `core/` con `AccountsService`, `AdmissionsService` (que además asignaba profesores, gestionaba matrículas y aplicaba el ámbito del coordinador), `NotificationsService` y `SyncService` |
| Módulos Nest | Uno: `AppModule` con los 4 controladores y todos los servicios |
| Listas administrativas | Sin paginación: cortadas en 200 o 300 registros |
| Pruebas de referencia | Unitarias 26/26, integración 8/8, E2E 56/56 (Fase 1.5) |

## 2. Arquitectura anterior

```
AppModule
 ├─ AdminController (29) ─┐
 ├─ MeController (13) ────┼─► AccountsService · AdmissionsService · NotificationsService · SyncService ─► DbService (SQL)
 ├─ PublicController (10) ┘                                   └──────────────► KeycloakService · MoodleService
 └─ StatusController (1)          (además, SQL directo en los controladores)
```

## 3. Arquitectura nueva

```
AppModule (solo importa y configura)
 ├─ DbModule (global) · ThrottlerModule (contador en PostgreSQL) · guards globales: límite de intentos → autenticación
 ├─ AuthModule ─────────► UsersModule (identidad y roles para el guard)
 ├─ HealthModule ───────► IntegrationsModule
 ├─ UsersModule ────────► AuditModule, IntegrationsModule, SynchronizationModule, EnrollmentsModule
 ├─ AdmissionsModule ───► AuditModule, IntegrationsModule, SynchronizationModule, EnrollmentsModule, UsersModule, ProgramsModule, NotificationsModule
 ├─ ProgramsModule ─────► AuditModule, IntegrationsModule, SynchronizationModule, EnrollmentsModule, UsersModule
 ├─ EnrollmentsModule ──► AuditModule, SynchronizationModule
 ├─ DashboardModule ────► IntegrationsModule, UsersModule, EnrollmentsModule
 ├─ ContentModule ──────► AuditModule, ProgramsModule
 ├─ NotificationsModule ► AuditModule, UsersModule
 ├─ ReportsModule
 ├─ AuditModule
 └─ SynchronizationModule ► AuditModule, IntegrationsModule
```

Las dependencias van en un solo sentido. Se comprobó que la aplicación se construye sin dependencias circulares y sin `forwardRef`, creando la aplicación completa con `NestFactory`.

Cada capa tiene una responsabilidad:
- **Controlador:** recibe, valida, autoriza y responde.
- **Servicio:** reglas de negocio, transacciones y auditoría.
- **Repositorio:** SQL parametrizado de las tablas del módulo.

## 4. Estructura final de carpetas (`backend/src`)

```
main.ts · app.module.ts · app.setup.ts (configuración HTTP común) · config.ts · seed.ts · migrate-wordpress.ts
common/        openapi.ts · pagination.ts · sql.ts · validation.ts
db/            db.module.ts · db.service.ts (pool, transacciones, bloqueos consultivos) · migrations/001…006
integrations/  integrations.module.ts · keycloak/keycloak.service.ts · moodle/{moodle.service.ts, moodle.types.ts}
security/      trusted-proxies.ts · pg-throttler.storage.ts · write-throttler.guard.ts
tools/         route-inventory.ts · inventory.cli.ts
content/       iinicia-wordpress.ts (contenido migrado, lo usa migrate-wordpress)
modules/
  auth/            auth.module · auth.guard · auth.decorators · permissions · program-scope
  users/           module · controller · service · repository · dto
  admissions/      module · controller · service · repository · dto
  programs/        module · controller · service · repository · dto
  enrollments/     module · controller · service · repository · dto
  dashboard/       module · controller · service
  content/         module · controller · service · repository · dto · image
  notifications/   module · controller · service · repository · dto
  reports/         module · controller · service · repository
  audit/           module · controller · service · repository
  synchronization/ module · controller · sync.service · repository
  health/          module · controller · service
```

`dashboard` y `health` no tienen repositorio: `dashboard` usa los de `users` y `enrollments` y lee Moodle, y `health` solo comprueba conexiones. No se crearon archivos vacíos.

## 5 y 6. Los 12 módulos y sus responsabilidades

| Módulo | Responsabilidad | Tablas propias |
|---|---|---|
| `auth` | Guard global (token RS256 de Keycloak, cuenta suspendida, permiso), matriz RBAC, decoradores, ámbito del coordinador | — |
| `users` | Registro con compensación en Keycloak, perfil, lista con búsqueda y filtros, suspensión, roles (protege al último superadministrador) | `users`, `user_roles` |
| `admissions` | Solicitudes de admisión, decisión (transacción: solicitud, rol, matrículas y auditoría) y solicitudes de información | `applications`, `info_requests` |
| `programs` | Programas, cohortes, cursos vinculados y asignación de profesores | `programs`, `cohorts`, `program_courses` |
| `enrollments` | Matrículas: consulta, suspensión y reactivación | `enrolments` |
| `dashboard` | Mi IINICIA: cursos, actividades próximas, enlace SSO al campus y grupos del profesor | — |
| `content` | Contenido del portal, imágenes (validadas por su contenido real), redirecciones de WordPress y datos del sitemap | `content_items`, `media`, `redirects` |
| `notifications` | Avisos por persona, avisos masivos (con ámbito) y dispositivos | `notifications`, `devices` |
| `reports` | Indicadores y reportes por programa (consultas de solo lectura que cruzan tablas) | — |
| `audit` | Registro inalterable y su consulta | `audit_log` |
| `synchronization` | Sincronización con Moodle: bloqueo por persona, reintentos con espera progresiva y auditoría de fallos | columnas `moodle_sync_*` de `users` |
| `health` | Estado de la base, Keycloak y Moodle | — |

**Regla de propiedad:** un módulo solo escribe en sus tablas. Las operaciones que abarcan varios módulos dentro de una transacción (admisión, asignación de profesor, cambio de matrícula, registro) pasan el `client` de la transacción a los repositorios dueños, así que **cada transacción conserva exactamente los mismos pasos y el mismo orden**.

Excepciones de lectura documentadas:
- `reports`;
- `synchronization`;
- consultas de presentación con `JOIN` a otras tablas, como el nombre del programa en una solicitud.

## 7. Diagrama de dependencias

Ver la sección 3. Las dependencias de cada módulo hacia las piezas transversales:

- `DbModule` es global.
- `IntegrationsModule` es el único acceso a Keycloak y Moodle.
- `AuditModule` lo importan los módulos que auditan.

## 8. Endpoints antes y después

**Rutas:**
- Son las mismas **52** rutas: 51 en `/api/v1` más `/api/estado`.
- Tienen los mismos métodos, permisos, códigos HTTP, límites de intentos, DTO del cuerpo y parámetros de ruta.
- La lista completa, generada desde el código, está en [api/inventario-endpoints.md](api/inventario-endpoints.md).

Cada endpoint pasó, sin cambios de contrato, del controlador anterior a su módulo:

| Antes | Ahora (módulo) |
|---|---|
| `AdminController` | `users` (lista, suspensión, roles), `admissions` (solicitudes, información), `programs` (programas, cohortes, cursos, profesores, cursos de Moodle), `enrollments` (matrículas), `content` (contenidos, medios), `notifications` (avisos), `reports` (stats, reportes), `audit` (auditoría), `synchronization` (sincronización manual) |
| `MeController` | `users` (`GET`/`PATCH /me`), `dashboard` (cursos, próximas, enlace al campus, grupos), `admissions` (mis solicitudes), `notifications` (avisos, dispositivos) |
| `PublicController` | `users` (registro), `programs` (programas publicados), `content` (contenidos, medios, sitemap, redirecciones), `admissions` (solicitud de información) |
| `StatusController` | `health` |

**Únicos cambios visibles, todos compatibles:**

1. **Parámetros de consulta opcionales nuevos** en 5 listas (sección 10). Sin ellos, la respuesta es idéntica.
2. **OpenAPI:**
   - Los parámetros de consulta opcionales ahora se documentan como opcionales. Antes Swagger marcaba como obligatorios `q`, `status`, `type`, `courseId` y `cmid` aunque nunca lo fueron; era un error de documentación heredado.
   - Las etiquetas de Swagger ahora corresponden a cada módulo.
3. **Validaciones más estrictas,** solo con valores que antes no tenían sentido:
   - En `GET /admin/users`, una búsqueda `q` de más de 100 caracteres responde `400`. Antes buscaba igual.
   - En `GET /admin/applications`, un `status` con caracteres no válidos responde `400`. Un estado desconocido pero bien formado sigue devolviendo lista vacía, como antes.

### Pruebas de contrato

`npm run test:contracts` compara el código con la referencia tomada **antes** de refactorizar (`test/contracts/routes.baseline.json` y `openapi.baseline.json`). Comprueba:

- las mismas rutas;
- por cada ruta: permiso, si es pública, código HTTP, límite, DTO y parámetros de ruta;
- que los parámetros de consulta nuevos estén en la lista permitida;
- que no haya parámetros obligatorios nuevos;
- que el esquema de cada cuerpo de solicitud sea igual.

Se verificó que la prueba falla si se cambia un permiso.

## 9. Cambios en servicios y repositorios

| Antes | Ahora |
|---|---|
| `core/accounts.service.ts` | `users/users.service.ts` y `users/users.repository.ts` |
| `core/admissions.service.ts` | `admissions/admissions.service.ts` (admisiones e información); `programs/programs.service.ts` (profesores); `enrollments/enrollments.service.ts` (matrículas); `auth/program-scope.ts` (ámbito, ahora función pura) |
| `core/notifications.service.ts` | `notifications/notifications.service.ts` (incluye el aviso masivo) y `notifications.repository.ts` |
| `core/sync.service.ts` | `synchronization/sync.service.ts` y `synchronization.repository.ts`, con las mismas garantías de la Fase 1.5 |
| `core/audit.service.ts` | `audit/audit.service.ts` y `audit.repository.ts` |
| SQL en los controladores | Repositorio del módulo correspondiente |
| `integrations/*.service.ts` | `integrations/keycloak/` y `integrations/moodle/`, con los tipos de Moodle en `moodle.types.ts` |
| `api/image.ts` | `content/image.ts` |

**Sin cambios de comportamiento:** el texto SQL se trasladó idéntico a los repositorios. Las únicas consultas reescritas son las 5 listas paginadas (sección 10). Las 7 transacciones conservan sus pasos y su orden.

## 10. Paginación, búsqueda y filtros

| Endpoint | Filtros nuevos | Orden permitido (`sort`) | Orden por omisión | Límite anterior |
|---|---|---|---|---|
| `GET /admin/users` | `q` (ya existía), `status`, `role`, `programId` | `createdAt`, `email`, `lastName`, `status` | `createdAt` desc | 200 |
| `GET /admin/applications` | `status` (ya existía), `programId`, `q` | `createdAt`, `status`, `programName` | `createdAt` desc | 200 |
| `GET /admin/info-requests` | `status`, `programId`, `q` | `createdAt`, `status`, `name` | `createdAt` desc | 200 |
| `GET /admin/audit` | `action`, `q` (correo del actor), `from`, `to` | `createdAt`, `action` | `createdAt` desc | 200 |
| `GET /admin/content` | `type` (ya existía), `status`, `q` | `updatedAt`, `title`, `sortOrder`, `publishedAt` | `updatedAt` desc | 300 |

**Modos de respuesta:**

| Modo | Cuándo | Respuesta |
|---|---|---|
| Compatible | Sin `page` ni `pageSize` | Arreglo con el mismo límite de antes. El portal y Android no necesitan cambios |
| Paginado | Con `page` o `pageSize` | `{ items, total, page, pageSize }`. `pageSize` por omisión es 20 y el máximo se configura con `PAGINATION_MAX_PAGE_SIZE` (100 por omisión, tope absoluto 500). No hay consultas sin límite |

**Validación:**
- `page` y `pageSize` deben ser enteros mayores que 0.
- `sort` solo acepta los nombres de la lista; nunca se interpola en el SQL.
- `order` es `asc` o `desc`.
- `status` y `role` solo aceptan valores conocidos.
- `programId` debe ser un UUID y las fechas, ISO 8601.
- `q` admite hasta 100 caracteres.
- Un valor inválido responde `400`.

**Determinismo:** todo orden lleva un desempate por la llave primaria, así que las páginas no se solapan ni cambian entre consultas iguales.

**Seguridad:** el ámbito del coordinador se aplica también en el modo paginado. Los valores del cliente viajan siempre como parámetros (`SqlConditions`).

**Índices** (migración `006`): `users (created_at, id)`, `applications (created_at, id)`, `applications (program_id, status)`, `enrolments (program_id)`, `content_items (updated_at, id)` y `audit_log (action, created_at)`. La búsqueda `q` usa `ILIKE`; con mucho volumen convendrá un índice trigram (`pg_trgm`), que no se agregó porque requiere una extensión nueva.

## 11. Cambios en la base de datos

Una migración nueva, **`006_indices_listas.sql`**:
- solo agrega índices, con `CREATE INDEX IF NOT EXISTS`;
- no modifica tablas ni datos.

No se eliminaron tablas, columnas ni registros. Las migraciones 001 a 005 no cambiaron.

## 12. Controles de seguridad

| Control | Estado después de la refactorización | Verificación |
|---|---|---|
| Matriz RBAC de 8 roles | Misma matriz (`permissions.ts`); mismos permisos por ruta | Contratos y `roles.spec` |
| Roles leídos de PostgreSQL en cada solicitud | Sí, ahora con `UsersRepository.findPrincipalBySub` | `security.spec` |
| Ámbito del coordinador | Función pura `assertProgramScope`, usada en `admissions`, `programs`, `enrollments` y `notifications`; también en listas paginadas | `roles.spec`, `admin-lists.spec` |
| Validación de tokens (RS256, emisor, audiencia `iinicia-api`) | Igual | `security.spec` |
| CSRF (origen del BFF) | Sin cambios (portal) | `security.spec` |
| SQL parametrizado | Sí; `SqlConditions` impide interpolar valores; el orden sale de una lista cerrada | Unitarias (`pagination.test`) y `admin-lists.spec` |
| Validación de DTO (`whitelist`, `forbidNonWhitelisted`) | Igual; los 16 DTO son idénticos | Contratos (esquemas OpenAPI) |
| Archivos | Detección por contenido real, igual | `media.test`, `security.spec` |
| Auditoría | Mismos eventos, dentro de las mismas transacciones | `security.spec`, `admin.spec` |
| Límite de intentos (Fase 1.5) | Contador en PostgreSQL, proxies de confianza, `HOST` | `client-ip.spec`, integración |
| Sincronización (Fase 1.5) | Bloqueo por persona, espera progresiva, auditoría de fallos, bloqueos en Moodle | `concurrency.spec`, integración |
| Secretos | Sin cambios: solo variables de entorno; el token de Moodle nunca se registra | `integrations.test` |

**Docker (Fase 6) y conectividad del backend:**
- Dentro de un contenedor, `HOST` debe ser `0.0.0.0` y el puerto no debe publicarse fuera de la red interna.
- `TRUSTED_PROXIES` debe listar las direcciones o la subred interna de Nginx y del portal, nunca `0.0.0.0/0`.
- El portal debe usar `TRUSTED_PROXY_HOPS=1` detrás de Nginx, y Nginx debe escribir `X-Forwarded-For` con la IP real.
- `BACKEND_URL` del portal apuntará al nombre del servicio interno (por ejemplo, `http://backend:4000`).
- La prueba `client-ip.spec` debe repetirse en ese entorno.

## 13. Resultados reales de pruebas

Todas las cifras son de ejecuciones reales del 24/11/2026 en DEV.

| Validación | Antes (Fase 1.5) | Después (Fase 2) |
|---|---|---|
| Backend: unitarias | 26 | **43 de 43**: las 26 anteriores, más 7 de clientes de integración y 10 de paginación y SQL |
| Backend: integración con PostgreSQL | 8 | **8 de 8** (bloqueos y límite de intentos entre instancias) |
| Backend: contratos de API | — | **54 de 54**: 52 rutas más 2 comprobaciones globales, contra la referencia previa a la refactorización |
| Backend: typecheck y compilación | Correctos | Correctos. La aplicación completa se construye sin dependencias circulares |
| Portal: typecheck, ESLint, unitarias y compilación | Correctos, 5 de 5 | Correctos, **5 de 5**. El portal no se modificó |
| E2E completa (Playwright) | 56 de 56 | **63 de 63** en 9.6 min: las 56 anteriores más 7 de listas, paginación, validación, ámbito y autorización |
| Repetición: cohortes duplicadas (`concurrency`) | 20 y 10 de la Fase 1.5 | **10 de 10** (2 pruebas × 5) |
| Repetición: evasión del límite (`client-ip`) | 3 de 3 | **6 de 6** (3 pruebas × 2), incluida la segunda instancia real del backend |
| Diagnóstico de duplicados en Moodle | Sin duplicados | Sin duplicados |
| `npm audit --omit=dev` | 0 | **0** en backend, portal y E2E |
| `npm audit` con herramientas de desarrollo | 6 moderadas | 6 moderadas, sin cambios (`@nestjs/cli` y `autocannon`) |
| Android: `assembleDebug` y `lintDebug` | Compila; 0 errores y 35 avisos | Compila; **0 errores y 35 avisos**. Android no se modificó |

**Incidencia durante la validación:** la primera corrida completa de la suite E2E dio 62 de 63. Falló la prueba de concepto (`poc.spec`) al esperar 60 s la página del curso en Moodle después del inicio de sesión único.
- **Contexto:** Docker Desktop acababa de reiniciarse, y Moodle compila sus cachés y su tema en las primeras solicitudes.
- **Resultado al repetir:** la prueba pasó sola (4 de 4, 28.8 s), y después la suite completa pasó **63 de 63**.
- **Relación con la refactorización:** el enlace al campus (`GET /me/campus-link`) conserva el mismo código y su contrato no cambió.
- **Pendiente:** queda registrado como sensibilidad de la prueba a un Moodle recién iniciado.

**No verificado en esta fase:** prueba en teléfono físico (Android no cambió) y pruebas en entornos STAGING o PRODUCTION (no existen todavía).

## 14. Commits

| Commit | Etapa | Contenido |
|---|---|---|
| `b12eaf6` | 2.1 | Inventario de endpoints, referencia de contratos y pruebas de contrato |
| `164ed37` | 2.2 | Módulos base: `auth`, `audit`, `integrations`; guard de límite en `security/` |
| `ed41227` | 2.3 a 2.6 | Controladores, servicios y repositorios por módulo; integraciones; paginación, búsqueda y filtros; migración `006` |
| `9b3358a` | 2.7 | Pruebas de paginación, integraciones, contratos y listas E2E; capturas regeneradas |
| Commit de documentación | 2.8 | Este documento, AGENTS.md, CLAUDE.md, README, arquitectura, plan, inventario y OpenAPI |

La rama no se ha integrado en `main`: espera tu autorización.

## 15. Riesgos pendientes

1. **E2E en CI:** la referencia de contratos y las pruebas de integración necesitan `backend/.env` y PostgreSQL. Las E2E necesitan todos los servicios. Se resolverá en la Fase 7.
2. **Búsqueda con `ILIKE`** sin índice trigram: suficiente para el volumen actual.
3. **Portal sin paginación visual:** las tablas del panel siguen usando el modo compatible (máximo 200 o 300 filas) hasta la Fase 3.
4. **`synchronization` y `reports` leen varias tablas:** excepción documentada. Si crecen, convendrá exponer consultas de solo lectura desde los módulos dueños.
5. **Pendientes de la auditoría:** S3 (respuestas de Keycloak sin revisar al cambiar roles) y la creación de cuenta de Moodle al sincronizar manualmente a un aspirante quedan para la Fase 5.
6. **Sin cambios en esta fase, siguen pendientes:**
   - 6 vulnerabilidades moderadas en herramientas de desarrollo (`@nestjs/cli` → `glob` y `minimatch`; `autocannon` → `uuid`);
   - 35 avisos del lint de Android.
7. **Commits de etapas:** las etapas 2.3 a 2.6 se entregan en un solo commit de código, porque comparten los mismos archivos. Cada etapa se validó por separado:
   - 2.3: contratos 54/54 y E2E 56/56;
   - 2.4: contratos 54/54, integración 8/8 y construcción sin ciclos;
   - 2.5 y 2.6: unitarias y contratos.
   
   La suite E2E completa se ejecutó sobre el conjunto.

## 16. Procedimiento de recuperación

- **Volver al backend anterior:** `main` no tiene la Fase 2. Basta con `git switch main`, compilar y reiniciar el backend.
- **Base de datos:**
  - La migración `006` solo agrega índices y el código anterior no los necesita. Puede quedarse sin efecto alguno.
  - Si se quisiera quitarla: `DROP INDEX IF EXISTS users_created_idx, applications_created_idx, applications_program_status_idx, enrolments_program_idx, content_items_updated_idx, audit_log_action_idx;` y `DELETE FROM schema_migrations WHERE name = '006_indices_listas.sql';`. Solo con autorización.
- **Deshacer una parte:** `git revert <commit>` en la rama, y después `npm run test:contracts` y la suite E2E.
- **Portal y Android:** no se modificaron en esta fase. No requieren cambios para volver atrás.
