# AGENTS.md · Reglas para asistentes de IA en IINICIA

Plataforma digital del Instituto de Innovación y Ciencias Aplicadas. Sustituye el portal WordPress y conecta el portal, la identidad, el campus Moodle y la app Android. La documentación completa está en [`documentation/`](documentation/README.md).

## Arquitectura

```
Navegador ──► Portal Next.js (BFF, cookies cifradas) ──► API NestJS ──► PostgreSQL
                     │                                      ├──► Keycloak (API de administración)
App Android ─────────┼──────────────────────────────────────┘└──► Moodle (servicios web local_iinicia)
                     └──► Keycloak (OIDC + PKCE)          Moodle ◄── SSO OIDC con Keycloak
```

- **Keycloak** es el único proveedor de identidad. No se programan contraseñas, sesiones ni MFA propios.
- **Moodle** es la fuente académica (cursos, actividades, progreso y, en la Fase 5.5, calificaciones). El backend solo habla con Moodle por los servicios web del plugin `local_iinicia`; **nunca** lee su base de datos.
- **PostgreSQL** del portal guarda personas, roles, solicitudes, matrículas, contenidos y auditoría.
- **El navegador nunca recibe tokens.** El portal (BFF) guarda los tokens en cookies `httpOnly` cifradas y llama a la API por el servidor.

## Carpetas

| Carpeta | Responsabilidad |
|---|---|
| `backend/` | API NestJS 11 en 12 módulos (`src/modules/*`), migraciones SQL (`src/db/migrations`) y pruebas (`test/`) |
| `frontend/` | Portal Next.js 16 (App Router), por funcionalidad en `src/features/*`. BFF en `src/app/api/*`, sesión en `src/lib/session-core.ts`, `src/proxy.ts` |
| `android/` | App Kotlin y Compose con AppAuth (PKCE), MVVM por funcionalidad. Ver la sección Android |
| `moodle-custom/` | Plugin `local_iinicia` (servicios web, SSO, CLI) y tema `theme_iinicia`. **Moodle Core no se modifica** |
| `infrastructure/` | Docker Compose, realm y temas de Keycloak, imagen de Moodle, scripts de configuración y respaldo |
| `e2e/` | Pruebas Playwright contra los servicios reales |
| `documentation/` | Arquitectura, operación, seguridad, API, manuales, auditoría y plan de desarrollo |

## Backend: 12 módulos

`auth`, `users`, `admissions`, `programs`, `enrollments`, `dashboard`, `content`, `notifications`, `reports`, `audit`, `synchronization` y `health`, más las piezas transversales `db`, `integrations` (Keycloak y Moodle), `security` y `common`. El detalle está en [`documentation/13-refactorizacion-backend.md`](documentation/13-refactorizacion-backend.md).

**Convenciones:**

- Cada módulo tiene `*.module.ts`, `*.controller.ts`, `*.service.ts` y `*.repository.ts` cuando hace falta; DTO en `*.dto.ts`. No crear capas vacías.
- **Controlador:** recibe, valida (DTO o parámetros), declara el permiso con `@RequirePermission` o `@Public` y llama al servicio. Sin SQL ni reglas de negocio.
- **Servicio:** reglas de negocio, transacciones (`db.tx`) y auditoría.
- **Repositorio:** todo el SQL del módulo, siempre parametrizado (`$1`, o `SqlConditions` de `src/common/sql.ts`). Nunca concatenar texto del cliente. Las operaciones que participan en una transacción reciben el `client`.
- **Un módulo solo escribe sus tablas.** Si necesita otra, usa el repositorio o servicio del dueño. Excepciones documentadas: `reports` y `synchronization`, que leen varias tablas.
- **Sin dependencias circulares y sin `forwardRef`.** El orden de dependencias está en el documento 13.
- **Rutas:** las de `/api/v1` no cambian. Cualquier cambio debe pasar `npm run test:contracts`. Un parámetro de consulta nuevo debe ser opcional y estar en la lista permitida de la prueba de contrato. Para documentarlo en OpenAPI se usa `@ApiOptionalQueries`.
- **Listas administrativas:** usar `parsePage` y `toPageResult` (`src/common/pagination.ts`). Sin `page` ni `pageSize` se responde el arreglo de siempre.
- Comentarios y mensajes al usuario en español; nombres de código en inglés.

## Frontend

Detalle en [`documentation/14-refactorizacion-frontend.md`](documentation/14-refactorizacion-frontend.md).

- **Rutas:**
  - `app/(public)`, `app/(auth)` y `app/(protected)` son grupos que no cambian las URL.
  - Las páginas solo componen. La lógica va en `src/features/<funcionalidad>`, una carpeta por módulo del backend.
  - **No cambiar URL públicas:** hay redirecciones 301 de WordPress y SEO que dependen de ellas.
- **Componentes compartidos** en `src/components/{ui,forms,tables,feedback,navigation,layout}`, sin reglas de negocio. Etiquetas en `src/config/labels.ts` y tipos de la API en `src/types/api.ts`.
- **Datos del servidor:** `lib/api/server.ts` (`server-only`). Un componente `"use client"` nunca lo importa. Las constantes que comparten servidor y cliente van en `src/config/`.
- **Datos del navegador:**
  - Solo a través de `lib/api/client.ts` (`bff`, `postPublic`, `uploadImage`), que lanza `ApiError`. Un 401 lleva a iniciar sesión.
  - **Sin reintentos automáticos**, y menos en escrituras.
  - Lecturas con `useApiData` y listas con `usePagedList`: paginación del backend, espera de 350 ms, página 1 al filtrar y estado en la URL.
  - Ninguna lista nueva del panel debe usar el modo de arreglo truncado.
- **Paneles por rol:**
  - Las pestañas salen de `config/admin-sections.ts` y Mi IINICIA de `features/dashboard/dashboard-sections.ts`, ambas a partir de `me.permissions`.
  - Al cambiar la matriz RBAC, `test/features.test.tsx` debe seguir pasando para los 8 roles.
  - Ocultar algo en la interfaz no sustituye la validación del backend.
- **Sin `NEXT_PUBLIC_*` con secretos.** Los tokens solo existen en cookies `httpOnly`.
- **Accesibilidad:**
  - Cada campo usa los componentes de `components/forms`, con etiqueta y error conectado.
  - Las tablas usan `Table`, con nombre de región.
  - Las E2E de axe (`a11y-seo`, `responsive-a11y`) deben quedar en 0 violaciones y sin desborde a 360, 768, 1024 y 1440 px.
- **Compilador de React:** no usar `useCallback` ni `useMemo` manuales, ni `setState` síncrono en efectos (ESLint lo marca).

## Android

Detalle en [`documentation/15-refactorizacion-android.md`](documentation/15-refactorizacion-android.md). Paquete `org.iinicia.app`, un solo módulo Gradle.

- **Capas:**
  - `features/<funcionalidad>` contiene Screen, ViewModel y estado inmutable.
  - `data/repositories` usa `data/remote/IiniciaApi` (solo endpoints de `/api/v1`) y `data/local/OfflineCache`.
  - `core/` reúne red, sesión, almacén y utilidades.
  - `di/AppContainer` arma todo a mano (sin Hilt).
  - No agregar capas `domain/` ni casos de uso vacíos.
- **Interfaz sin red ni credenciales:** las pantallas no hacen solicitudes ni tocan tokens, preferencias o WorkManager; lo hacen sus ViewModels y repositorios. Las acciones de una sola vez van como `UiEvent`.
- **Errores:** usar `AppError` y `friendlyMessage`. Solo los errores pasajeros (`transient`) muestran la copia guardada; un 403 o un 404 nunca se ocultan con datos viejos. Sin reintentos automáticos de escrituras y sin aumentar tiempos de espera.
- **Sesión:**
  - Los tokens solo existen en `SecureStore` (Android Keystore). Nunca registrar tokens ni incluirlos en mensajes.
  - La caché y los valores en memoria llevan dueño (`Session.userId`), y los ViewModels del área protegida viven en el `ViewModelStore` de la sesión: otra cuenta nunca debe ver datos de la anterior.
- **Red:** release solo HTTPS (`src/main/res/xml/network_security_config.xml`). HTTP solo hacia `localhost` en `src/debug`. No desactivar la validación de certificados.
- **Pruebas:**
  - `./gradlew testDebugUnitTest` (JVM). Los dobles están en `src/sharedTest`, con datos ficticios.
  - Pruebas de interfaz en `src/androidTest`. Si hay un teléfono conectado, ejecutarlas solo en el emulador: `adb -s emulator-5554 install` de los dos APK y `am instrument -w org.iinicia.app.test/androidx.test.runner.AndroidJUnitRunner`.
  - Lint sin supresiones.
- **Dispositivos:** no instalar nada en un teléfono físico sin autorización.

## Seguridad (no negociable)

- Los 8 roles y la matriz RBAC viven en `backend/src/modules/auth/permissions.ts`. Los roles se leen de PostgreSQL en cada solicitud.
- El ámbito del coordinador (`assertProgramScope`, `isProgramScoped`) se aplica en toda consulta o acción por programa, también en las listas paginadas.
- **IP del cliente:**
  - `TRUSTED_PROXIES` en el backend nunca es `true` ni `0.0.0.0/0`.
  - `TRUSTED_PROXY_HOPS` en el portal es 0 sin proxy propio.
  - El backend escucha en `HOST=127.0.0.1` fuera de contenedores.
  - Ver el documento 11.
- **Sincronización con Moodle:** no quitar el bloqueo por persona (`DbService.withLock`), la espera progresiva, ni los bloqueos de `local_iinicia\lock` en Moodle.
- **Secretos:** nunca en el código ni en Git. Los `.env` reales están ignorados; solo se versiona `.env.example`. No registrar tokens ni contraseñas en logs.
- Las imágenes se validan por su contenido real. `audit_log` es solo de inserción.
- No reducir controles para que una prueba pase.

## Base de datos

- Migraciones SQL numeradas en `backend/src/db/migrations`. Se aplican solas al arrancar, con bloqueo, y quedan en `schema_migrations`.
- **Nunca editar una migración ya aplicada.** Crear una nueva.
- Solo migraciones **no destructivas**, salvo autorización explícita: nada de `DROP`, borrar columnas o borrar datos.
- Sin ORM: se usa `pg` con SQL.

## Comandos

```bash
# Servicios (PostgreSQL, Keycloak, Moodle, Mailpit)
cd infrastructure && docker compose --env-file .env up -d
# Backend
cd backend && npm run build && npm start        # http://127.0.0.1:4000/api, Swagger en /api/docs
npm test                                        # unitarias
npm run test:integration                        # con PostgreSQL real
npm run test:contracts                          # compatibilidad de la API con la referencia previa
npm run inventory                               # regenera documentation/api/inventario-endpoints.* y openapi.json
# Portal
cd frontend && npm run build && npm start       # http://localhost:3000
npm test && npm run typecheck && npx eslint .   # node --test y Vitest (componentes)
# Extremo a extremo (servicios, backend y portal encendidos)
cd e2e && npx playwright test
# Android
cd android && ./gradlew assembleDebug lintDebug testDebugUnitTest
```

## Restricciones para asistentes de IA

- Trabajar por fases y en ramas. Hacer commits pequeños. **No integrar a `main` ni subir a remotos sin autorización.**
- No desplegar, no tocar servidores reales ni el WordPress en producción, no modificar Moodle Core.
- No eliminar datos, migraciones, archivos importantes ni funcionalidades sin autorización.
- No inventar resultados de pruebas: reportar lo que se ejecutó, y si algo no se pudo ejecutar, decirlo.
- No exponer datos personales. Las capturas de evidencia usan solo datos ficticios y ocultan a personas reales (`privacyMask` en `e2e/tests/helpers.ts`, `e2e/capture-panels.mjs`).
- No actualizar dependencias de forma masiva ni usar `npm audit fix --force`.
- Las cuentas demo (`*@iinicia.test`) son solo para DEV; su contraseña está en `backend/.env` (`DEMO_PASSWORD`).
