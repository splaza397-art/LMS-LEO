# 10 · Auditoría técnica (Fase 1)

**Fecha:** 24/11/2026 · **Entorno:** DEV en una PC (Windows 11, Docker Desktop) · **Alcance:** repositorio completo, sin cambios de código.

Este informe separa tres cosas:

- **Confirmado:** se comprobó leyendo el código o ejecutando algo, y se indica cómo.
- **Recomendación:** mejora razonable que no corrige un defecto comprobado.
- **No verificado:** no se pudo comprobar en este entorno.

---

## 1. Resumen ejecutivo

La plataforma funciona de extremo a extremo y su base de seguridad es sólida:
- BFF con cookies cifradas y tokens fuera del navegador.
- Roles leídos de PostgreSQL en cada solicitud.
- SQL siempre parametrizado.
- Auditoría inalterable.
- Sincronización idempotente con Moodle.
- Moodle Core sin modificar.

El código es pequeño: unas **8,200 líneas** en total, de las cuales unas 1,600 son del backend.

Lo más importante que hay que atender:

0. **Integridad de datos, confirmado por una prueba que falló:** dos sincronizaciones simultáneas de la misma persona pueden crear la **misma cohorte dos veces** en Moodle (sección 6, I1).
1. **Seguridad, confirmado:** cambiando el encabezado `X-Forwarded-For` se evita por completo el límite de registros y de solicitudes de información (sección 5.1).
2. **Seguridad, confirmado:** `nodemailer` tiene una vulnerabilidad alta según `npm audit`, y el código no lo usa.
3. **Mantenibilidad, confirmado:** `admin.controller.ts` mezcla 29 endpoints con SQL directo. `admin-panel.tsx` tiene 566 líneas con 8 pestañas, y `AppRoot.kt` tiene 346 líneas con todas las pantallas.
4. **Operación, confirmado:**
   - No hay Git, CI, Dockerfiles para el portal y el backend, ni entornos STAGING/PRODUCTION.
   - Keycloak arranca en modo `start-dev`.
5. **Funcionalidad faltante, confirmado:** no existe consulta de **calificaciones** en ninguna capa (portal, backend, plugin de Moodle ni app). No es algo por mejorar: hay que construirlo.

---

## 2. Estado del repositorio

| Aspecto | Estado | Cómo se verificó |
|---|---|---|
| Git | **No es un repositorio Git** | `git status` responde "not a git repository" |
| AGENTS.md, CLAUDE.md, CHANGELOG.md, .editorconfig, .github/ | No existen | `ls` en la raíz |
| Archivos `.env.example` | No existen. La configuración se genera con `infrastructure/scripts/generate-env.mjs` | `find` |
| Secretos en el código | Ninguno. Los 3 `.env` están en `.gitignore` | Búsqueda de los 14 valores reales en los archivos incluidos en el .zip entregado |

### Tamaño por carpeta (sin dependencias ni compilados)

| Carpeta | Contenido | Archivos más grandes |
|---|---|---|
| `backend/` | NestJS 11: 3 controladores, 5 servicios de dominio, 2 integraciones, 3 migraciones SQL | `api/admin.controller.ts` (326), `core/admissions.service.ts` (205), `core/accounts.service.ts` (160) |
| `frontend/` | Next.js 16.4: 22 páginas, 4 rutas API propias (BFF, registro, información, estado), `proxy.ts` | `components/admin-panel.tsx` (566), `components/portal-forms.tsx` (279), `app/mi-iinicia/page.tsx` (175) |
| `android/` | Kotlin + Compose, 10 archivos | `ui/AppRoot.kt` (346), `auth/AuthManager.kt` (153) |
| `moodle-custom/` | `local_iinicia` (7 servicios web, SSO, CLI) y `theme_iinicia` | `cli/setup.php` (165), `external/upsert_user.php` (142) |
| `infrastructure/` | Docker Compose (Postgres, Keycloak, Moodle, cron, Mailpit), Dockerfile de Moodle, realm, temas, respaldo | `docker-compose.yml` (116) |
| `e2e/` | Playwright: 7 archivos de pruebas, carga, limpieza | `tests/admin.spec.ts` (168) |

---

## 3. Dependencias

| Proyecto | Versiones principales | Hallazgo |
|---|---|---|
| Backend | NestJS 11.2, pg 8.16, jose 6, helmet 8, class-validator 0.14, TypeScript 5.9 | **Confirmado:** `npm audit --omit=dev` reporta 1 vulnerabilidad **alta** en `nodemailer` 7.0.13 (8 avisos GHSA). Ningún archivo importa `nodemailer` ni usa `config.mail`: es una dependencia muerta. NestJS 12 ya existe; la actualización no es urgente |
| Frontend | Next.js 16.4.6, React 19.3, Tailwind 4.3, jose 6 | `npm audit`: 0 vulnerabilidades |
| E2E | Playwright 1.56, axe-core 4.14, autocannon 8 | `npm audit`: 0 vulnerabilidades |
| Android | Compose BOM 2026.09, AppAuth 0.11.1, OkHttp 5.1, WorkManager 2.10 | Lint: 0 errores y 35 avisos (12 `UseKtx`, 8 `GradleDependency`, 5 `IconLauncherShape`, otros menores). **No hay dependencias ni carpetas de pruebas** (`src/test` y `src/androidTest` no existen) |
| Backend (lint) | — | **No hay ESLint en el backend**: solo `tsc --noEmit` |

---

## 4. Arquitectura y responsabilidades

### 4.1 Backend

- **Confirmado:** `AdminController` concentra 29 endpoints de 9 áreas: usuarios, admisiones, programas, cohortes, profesores, reportes, información, medios, contenidos, avisos y auditoría. Contiene SQL directo en 13 métodos.
- `MeController` tiene 13 endpoints y `PublicController` 10, más `StatusController`.
- **Confirmado:** `AdmissionsService` mezcla admisiones, asignación de profesores, matrículas y la regla de ámbito del coordinador (`assertProgramScope`), que usan otros controladores.
- **Confirmado:** el SQL vive en controladores y servicios, sin capa de repositorio. Siempre está parametrizado.
- **Confirmado:** no hay filtro de excepciones para errores de PostgreSQL. Un `slug` duplicado al crear un programa o contenido viola el índice único y termina en **HTTP 500** genérico, en lugar de un 409 con mensaje. Se dedujo del código: no hay `ExceptionFilter` ni manejo del código `23505`. No se reprodujo.
- **Confirmado:** las listas administrativas están cortadas con `LIMIT 200` o `300` y no tienen paginación: usuarios, solicitudes, información, auditoría y contenidos. Con más registros, los más antiguos dejan de verse en el panel.
- **Recomendación:** dividir en módulos funcionales. Ver el plan en la sección 9.

**Endpoints:** 52 en total, 51 bajo `/api/v1` más `/api/estado`. Swagger se publica en `/api/docs` solo fuera de producción.

### 4.2 Frontend

- **Confirmado:** `admin-panel.tsx` contiene las 8 pestañas, sus formularios, tablas y llamadas a la API en un solo componente cliente de 566 líneas.
- **Confirmado:** `portal-forms.tsx` reúne la función `bff()`, el registro, la solicitud de información, el perfil y otros formularios.
- **Confirmado:** las rutas no usan grupos (`(public)`, `(auth)`, `(protected)`). Las URL actuales funcionan y deben conservarse.
- **Confirmado:** el panel duplica las etiquetas de roles (`ROLES`) que también existen en `lib/api.ts` (`ROLE_LABELS`). La duplicación se debe a que `lib/api.ts` es `server-only`.

### 4.3 Android

- **Confirmado:** `AppRoot.kt` contiene la navegación, el inicio de sesión, Inicio, Cursos, Detalle de curso, Avisos y Perfil.
- `AppViewModels.kt` (81 líneas) contiene 2 ViewModels.
- Ya existe caché cifrada (AES-GCM con Android Keystore) para el uso sin conexión.
- **Confirmado:** no hay pruebas unitarias ni de interfaz.
- **Confirmado:** la app no tiene calificaciones (ver sección 7).

---

## 5. Seguridad

### 5.1 Problemas confirmados

| # | Severidad | Problema | Evidencia | Corrección propuesta |
|---|---|---|---|---|
| S1 | **Media** | **Se evita el límite de intentos falsificando `X-Forwarded-For`.** El portal reenvía al backend el encabezado tal como lo manda el navegador (`api/registro`, `api/bff`, `api/informacion`). El backend confía en él porque la conexión llega desde `loopback` (`trust proxy`) | Prueba real contra `/api/registro` con datos inválidos, sin crear cuentas. Con la misma IP: `400 ×5`, luego `429 429`. Con IP distinta en cada intento: `400 ×10`, nunca `429` | El portal debe enviar la IP real de la conexión, o la que fije un proxy de confianza (Nginx), nunca el encabezado del cliente. Agregar una prueba E2E que lo compruebe |
| S2 | **Alta (latente)** | `nodemailer` vulnerable y sin uso | `npm audit`; `grep` sin usos | Quitar la dependencia y `config.mail` (requiere tu autorización) |
| S3 | Baja | `setRealmRoles` no revisa la respuesta de Keycloak al leer ni al quitar o agregar roles. Si Keycloak falla, el portal queda con el rol nuevo y Keycloak con el anterior, sin aviso | `keycloak.service.ts` | Revisar `response.ok` y registrar o reintentar. La autorización del backend no se ve afectada porque lee los roles de PostgreSQL |
| S4 | Baja | `GET /admin/teachers` (permiso `programs:manage`) devuelve **todos** los profesores con su correo, también al coordinador, que tiene ámbito de programa | `admin.controller.ts` | Mantenerlo, porque el coordinador necesita elegir profesor, o limitar los datos. Decisión de negocio |
| S5 | Baja | Un aviso por programa también llega a profesores y coordinadores matriculados en ese programa, aunque el manual dice "a todos los estudiantes activos" | El SQL de `broadcast` no filtra `moodle_role` | Filtrar por estudiantes o corregir el manual |
| S6 | Baja (latente) | `BroadcastDto.link` acepta `/\dominio.com`, que los navegadores interpretan como enlace externo. Hoy no hay riesgo: el portal no muestra el enlace y Android solo acepta rutas de curso | Expresión `^\/[^/]`, distinta de la de `imageUrl` | Usar la misma validación que `imageUrl` |
| S7 | Media (operación) | Keycloak corre con `start-dev`: HTTP, caché de temas desactivada y configuración de desarrollo | `docker-compose.yml` | Configuración de producción con `start`, hostname, proxy y TLS (Fase 6) |
| S8 | Baja | La CSP permite `script-src 'unsafe-inline'` | `next.config.ts` | Nonces de Next.js. Requiere validar que no se rompa el renderizado parcial |
| S9 | Baja | Keycloak no registra eventos de inicio de sesión ni administrativos (`eventsEnabled` y `adminEventsEnabled` vacíos) | Realm exportado | Activarlos con retención limitada |

### 5.2 Controles que funcionan bien (confirmados)

- **OIDC:** código con PKCE S256 en el portal y en Android. El cliente del portal es confidencial. Los flujos directos están desactivados en todos los clientes.
- **Tokens:** el backend valida firma RS256, emisor y audiencia `iinicia-api`. El navegador solo recibe cookies `httpOnly` cifradas (A256GCM). Keycloak rota los refresh tokens (`revokeRefreshToken`) y el BFF comparte una sola renovación entre solicitudes simultáneas.
- **RBAC:**
  - Hay una matriz única (`permissions.ts`).
  - Los roles se leen de PostgreSQL en cada solicitud, de modo que una suspensión aplica de inmediato.
  - El ámbito del coordinador se aplica en solicitudes, programas, matrículas, reportes y avisos.
  - El último superadministrador está protegido.
- **CSRF:** las escrituras del BFF exigen `Origin` igual al portal, las cookies son `SameSite=Lax` y la lista de rutas del BFF solo admite `me` y `admin`.
- **Inyección SQL:** todas las consultas usan parámetros (`$1`). No hay concatenación de entrada del usuario.
- **Validación:** `ValidationPipe` con `whitelist` y `forbidNonWhitelisted`, y DTO con límites.
- **Archivos:** el tipo de imagen se detecta por su contenido real (PNG, JPG o WebP), con límite de 5 MB y `nosniff`. No se aceptan SVG.
- **Auditoría:** `audit_log` tiene un disparador que impide UPDATE y DELETE.
- **Moodle:**
  - El token de servicio nunca sale del backend.
  - El rol de servicio tiene capacidades mínimas.
  - `sso.php` solo acepta URL locales (`PARAM_LOCALURL`).
  - Moodle no permite crear cuentas ni entrar con contraseña propia.
- **Puertos:** todos los servicios de Docker escuchan solo en `127.0.0.1`.
- **Contraseñas:** política de Keycloak de 10 caracteres con mayúscula, minúscula y número, y bloqueo tras 5 intentos fallidos.

### 5.3 Recomendaciones de seguridad

- **Rate limiting:** se guarda en memoria. Con más de una instancia del backend habrá que moverlo a PostgreSQL o a Nginx. Hoy no hace falta Redis.
- **Cookies:** usar el prefijo `__Host-` en producción.
- **Datos personales:**
  - No hay política de retención para `info_requests` ni para notificaciones.
  - No hay forma de que una persona solicite la exportación o eliminación de sus datos (derechos ARCO).
  - Depende del aviso de privacidad, que sigue pendiente.
- **MFA:** el código lo exige a los roles privilegiados, pero está desactivado en DEV (`MFA_PRIVILEGED_ROLES=false`). Debe quedar activado en STAGING y PRODUCTION.

---

## 6. Integración con Moodle

| Aspecto | Estado |
|---|---|
| Alta y vinculación | **Confirmado:** idempotente. La clave es el UUID IINICIA (`idnumber`) y la transacción es de Moodle. El vínculo OIDC es por `sub` |
| Matrículas, cohortes y rol de sistema | Idempotentes, mediante servicios web propios |
| Reintentos | **Confirmado:** cada 60 s, 25 usuarios por vuelta, **sin espera progresiva ni límite de intentos**. Una cuenta con error permanente se reintenta indefinidamente |
| **I1 · Cohortes duplicadas** | **Confirmado (defecto, severidad media).** `local_iinicia_set_cohort_member` busca la cohorte por `idnumber` y, si no existe, la crea, sin ningún bloqueo entre ambos pasos. Moodle no exige que `idnumber` sea único. Al admitir a una persona, la sincronización de la admisión y el reintento automático (cada 60 s) pueden ejecutarse a la vez y crear dos cohortes iguales, cada una con la persona como miembro. La prueba `admin.spec.ts` lo detectó en esta auditoría: 2 membresías en lugar de 1. **Corrección:** bloqueo en Moodle (`\core\lock\lock_config::get_lock_factory`) alrededor de "buscar o crear" en `set_cohort_member` y `upsert_user`, más bloqueo por usuario en el backend. Agregar una prueba que lance dos sincronizaciones simultáneas |
| Concurrencia | **Confirmado:** el bloqueo `running` existe solo en memoria. Una sincronización manual, una admisión y el reintento automático pueden sincronizar a la misma persona a la vez. Moodle impide los duplicados (username único y búsqueda por `idnumber`), pero una de las llamadas puede fallar y quedar en `error` hasta el siguiente reintento. Con 2 o más instancias del backend se duplicaría el trabajo. **Recomendación:** bloqueo por usuario con `pg_try_advisory_xact_lock` |
| Rendimiento | **Confirmado:** `/me/courses`, `/me/upcoming`, `/me/courses/:id` y `/me/campus-link` llaman cada vez a `student_overview` de Moodle, sin caché. **Recomendación:** caché por usuario de 30 a 60 s |
| Calificaciones | **Confirmado: no existe.** No hay servicio web, endpoint ni pantalla. Hace falta un nuevo servicio web en `local_iinicia` que use las API de Moodle `gradereport_user` y `core_grades`, más endpoint y pantallas |
| Acceso directo a la base de Moodle desde NestJS | **Confirmado: no existe.** Solo las pruebas E2E consultan la base de Moodle para verificar resultados |

---

## 7. Base de datos y migraciones

- **Confirmado:** hay 3 migraciones SQL (`001_init`, `002_portal_completo`, `003_migracion_wordpress`). Se aplican al arrancar el backend, con un bloqueo de PostgreSQL (`pg_advisory_xact_lock`) y la tabla `schema_migrations`.
- **Confirmado:** no hay migraciones de reversión ni control de cambios en una migración ya aplicada (checksum).
- **Recomendación:** agregar índices en `applications (program_id, status)` y `enrolments (program_id)`, que usan los reportes y los filtros del coordinador. Hoy el volumen es pequeño.
- **Recomendación:** las imágenes se guardan en PostgreSQL (`media.data bytea`). Sirve para el volumen actual. Con muchas imágenes conviene moverlas a un almacenamiento de archivos.

---

## 8. Pruebas ejecutadas en esta auditoría

| Prueba | Resultado real (24/11/2026) |
|---|---|
| Typecheck del backend (`tsc --noEmit`) | Aprobado |
| Typecheck del frontend | Aprobado |
| ESLint del frontend | Aprobado, sin avisos |
| Unitarias del backend (`npm test`) | **19 de 19** aprobadas |
| Extremo a extremo (Playwright, corrida completa) | **50 de 51** aprobadas (13.7 min). Falló `admin.spec.ts` › "admisión con cohorte, idempotencia…": esperaba 1 membresía de cohorte en Moodle y encontró **2**. Es el defecto I1 (sección 6), no un fallo de la prueba. La misma prueba pasó en corridas anteriores: el error es intermitente porque depende de que coincidan dos sincronizaciones |
| Android: `assembleDebug`, `testDebugUnitTest`, `lintDebug` | Compilación correcta (APK debug de 21 MB). **Sin pruebas unitarias que ejecutar.** Lint con 0 errores y 35 avisos |
| `npm audit` (dependencias de producción) | Backend: 1 alta (`nodemailer`). Frontend y E2E: 0 |
| Prueba manual de límite de intentos | Se confirmó el problema S1 |

**No verificado:**
- Prueba en teléfono físico de la versión actual de la app (la anterior sí se probó).
- Lectores de pantalla (NVDA, TalkBack).
- Carga sobre un servidor real.
- Comportamiento con varias instancias del backend.
- Envío de correo real (SMTP).
- Configuración HTTPS.

---

## 9. Plan de refactorización propuesto

### Criterios

- Cada fase deja **todas las pruebas en verde** y los **mismos URL y endpoints** (`/api/v1`).
- No se cambia el acceso a datos (`pg` con SQL). Los repositorios solo agrupan las consultas existentes.
- No se agregan dependencias nuevas, salvo ESLint en el backend y herramientas de prueba en Android, ya justificadas.

### Fase 2 · Backend (riesgo medio)

**Módulos propuestos:** 12 en lugar de 17. Algunas áreas tienen 1 o 2 endpoints, y separarlas solo agregaría archivos sin beneficio.

| Módulo | Contenido |
|---|---|
| `auth` | Guard, permisos y decoradores |
| `users` | Incluye roles y perfil |
| `admissions` | Solicitudes y decisiones |
| `programs` | Incluye cohortes, cursos vinculados y profesores |
| `enrollments` | Matrículas |
| `dashboard` | Los endpoints `/me` |
| `content` | Incluye medios y redirecciones |
| `notifications` | Avisos |
| `reports` | Reportes |
| `audit` | Auditoría |
| `synchronization` | Sincronización con Moodle |
| `health` | Estado del sistema |

**Además:**
- Integraciones `keycloak` y `moodle` en `integrations/`.
- Filtro global de errores de PostgreSQL (duplicados → 409).
- `dto.ts` dividido por módulo.

**Riesgos:** cambiar por error una ruta o un permiso. Se mitiga comparando el OpenAPI antes y después; debe ser idéntico salvo las etiquetas.

### Fase 3 · Frontend (riesgo medio)

- Grupos de rutas sin cambiar URL.
- `admin-panel.tsx` dividido en 8 componentes, uno por pestaña, más tablas y estados compartidos.
- `portal-forms.tsx` dividido por formulario.
- `lib/` separado en `api/`, `session/` y `types/`.

**Riesgos:** rotura del renderizado parcial (`cacheComponents`) y del BFF. Se mitiga con la compilación y las pruebas E2E en cada paso.

### Fase 4 · Android (riesgo medio)

- Paquetes por funcionalidad (`auth`, `home`, `courses`, `notifications`, `profile`, `navigation`, `ui/components`) y un ViewModel por pantalla.
- Estados de carga, error y reconexión uniformes.
- Pruebas unitarias de ViewModels y repositorio (JUnit, coroutines-test) y una prueba de interfaz de Compose.
- **Calificaciones:** es funcionalidad nueva y requiere también Moodle y backend. Ver la pregunta 4.

**Riesgos:** no hay pruebas previas. Se compila en cada paso y la prueba en tu teléfono queda pendiente de ti.

### Fase 5 · Integraciones y seguridad (riesgo bajo a medio)

- S1: IP real.
- S2: quitar `nodemailer`.
- S3: revisar respuestas de Keycloak.
- S6: validación de enlaces.
- Bloqueo por usuario y espera progresiva en la sincronización.
- Caché de `student_overview`.
- Eventos de Keycloak.
- Prefijo `__Host-` en producción.
- Validación de la CSP con nonces.

### Fase 6 · Infraestructura (riesgo medio, solo local)

- Dockerfiles del backend y del portal.
- `docker-compose.yml` base más los archivos `dev`, `staging` y `prod`.
- Nginx con HTTPS documentado.
- Keycloak en modo `start`.
- Mailpit solo en DEV.
- Redes internas y logs JSON.
- Archivos `.env.example`.
- **Sin desplegar en servidores reales.**

### Fase 7 · Automatización (riesgo bajo)

- GitHub Actions: instalación con `npm ci`, lint, typecheck, pruebas unitarias, compilaciones, Android, `npm audit` y detección de secretos.
- Las pruebas E2E en CI necesitan levantar Docker (Moodle tarda unos 3 minutos). Propongo un flujo aparte que se ejecute bajo demanda.

### Fase 8 · Documentación

- AGENTS.md, CLAUDE.md, CHANGELOG.md y .editorconfig.
- Diagrama, matriz de roles, instalación y API actualizados.
- Resultados reales de las pruebas.

---

## 10. Decisiones que necesito antes de la Fase 2

1. **Git.** El proyecto no está bajo control de versiones. Propongo `git init` y un primer commit con el estado actual antes de refactorizar, para poder volver atrás en cualquier fase. No se subiría a ningún servidor.
2. **Módulos del backend.** ¿Uso los 12 propuestos o los 17 exactos de tu lista?
3. **Quitar `nodemailer`.** No se usa y es vulnerable. ¿Autorizas eliminarlo?
4. **Calificaciones.** Es funcionalidad nueva en Moodle, backend, portal y app. ¿La incluyo en este trabajo, o la dejo fuera de la refactorización?
5. **Correcciones urgentes.** ¿Adelanto antes de la Fase 2 estas dos? Ambas son cambios pequeños, cada uno con su prueba:
   - **I1**, cohortes duplicadas: bloqueo en el plugin de Moodle y en la sincronización.
   - **S1**, límite de intentos: IP real en 3 rutas del portal.
