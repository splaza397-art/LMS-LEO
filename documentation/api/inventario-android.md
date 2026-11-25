# Inventario de la app Android (Fase 4, etapa 4.1)

Estado de `android/` en `main` (`1a4c9dc`), antes de modificar código. Las cifras son de ejecuciones reales del 24/11/2026.

## Proyecto y compilación

| Elemento | Valor |
|---|---|
| Paquete | `org.iinicia.app`. Un solo módulo Gradle (`:app`) |
| Herramientas | Gradle 9.5.0, Android Gradle Plugin 9.3.3, Kotlin 2.4.0 (plugins `compose` y `serialization`), Java 17 |
| SDK | `minSdk 26` (Android 8.0), `targetSdk 36`, `compileSdk 37` |
| Dependencias | Compose BOM 2026.09.00 (ui, material3, iconos extendidos), activity-compose 1.11.0, core-ktx 1.17.0, lifecycle 2.9.4, navigation-compose 2.9.5, browser 1.9.0 (Custom Tabs), work-runtime 2.10.5, AppAuth 0.11.1, OkHttp 5.1.0, kotlinx-serialization 1.9.0, coroutines 1.10.2 |
| Dependencias de prueba | **Ninguna.** No hay `src/test` ni `src/androidTest` |
| `debug` | `API_URL=http://localhost:4000/api/v1`, `ISSUER_URL=http://localhost:8180/realms/iinicia` y `ALLOW_HTTP=true`. Se usa con `adb reverse` |
| `release` | URL de `gradle.properties` (`https://api.iinicia.org/api/v1`, `https://auth.iinicia.org/realms/iinicia`), `ALLOW_HTTP=false`, R8 con `minify` y `shrinkResources`. Sin configuración de firma |
| APK debug | `app/build/outputs/apk/debug/app-debug.apk`, 21 224 589 bytes |

## Archivos (1 034 líneas de Kotlin)

| Archivo | Líneas | Responsabilidades |
|---|---|---|
| `IiniciaApp.kt` | 29 | Crea a mano `SecureStore`, `AuthManager`, `ApiClient` y `Repository`, y el canal de notificaciones |
| `MainActivity.kt` | 72 | Lanzadores de inicio y cierre de sesión, permiso de notificaciones, *deep links*, Custom Tabs del campus y programación del *worker* |
| `auth/AuthManager.kt` | 153 | AppAuth: solicitud con PKCE, intercambio de código, renovación con `Mutex`, revocación del *refresh token*, fin de sesión en Keycloak y conexión HTTP solo a `localhost` en debug |
| `auth/SecureStore.kt` | 64 | AES-GCM con llave no exportable en Android Keystore, sobre `SharedPreferences` |
| `data/ApiClient.kt` | 49 | OkHttp (15 s de conexión, 30 s de lectura), token Bearer y traducción de 401, 403, 404 y el resto a mensajes |
| `data/Models.kt` | 62 | `Profile`, `Course`, `Section`, `Activity`, `Notice`, `CampusLink`, `Dashboard` |
| `data/Repository.kt` | 64 | Tablero (4 llamadas en paralelo), curso, avisos, marcar leído, enlace al campus, caché cifrada y preferencias |
| `notifications/NoticeWorker.kt` | 88 | WorkManager cada 15 min: avisos nuevos como notificaciones del sistema, con *deep link* al curso |
| `ui/AppRoot.kt` | **346** | Login, `Scaffold`, barra superior e inferior, navegación, *deep links*, fábrica de ViewModels, `Loadable` y las 6 pantallas |
| `ui/AppViewModels.kt` | 81 | `UiState`, mensajes de error, `DashboardViewModel` y `CourseViewModel` |
| `ui/theme/Theme.kt` | 26 | Colores IINICIA (azul marino y azul) sobre Material 3 claro |

## Funcionalidades

**Implementadas:**

| Pantalla o función | Detalle | Endpoints |
|---|---|---|
| Inicio de sesión | Custom Tab con Keycloak (OIDC, código y PKCE S256), alcance `offline_access` | Keycloak |
| Inicio | Saludo, botón "Entrar al Campus" si hay `campus:access`, 3 próximas actividades, mis cursos | `GET me`, `me/courses`, `me/upcoming`, `me/notifications` |
| Cursos | Lista con avance | (datos del tablero) |
| Detalle de curso | Secciones y actividades con fecha y completado; abrir el curso o una actividad en el campus | `GET me/courses/:id`, `me/campus-link` |
| Avisos | Lista; tocar uno lo marca como leído | `POST me/notifications/:id/read` |
| Perfil | Nombre, correo, estado, interruptor de notificaciones, cerrar sesión | — |
| Cierre de sesión | Revoca el *refresh token*, borra el almacén y abre el fin de sesión de Keycloak | Keycloak |
| Avisos en segundo plano | *Worker* cada 15 min, con notificación que abre el curso o los avisos | `GET me/notifications` |
| Sin conexión | Tablero y curso desde caché cifrada, con aviso "Sin conexión" | — |
| *Deep links* | `iinicia://curso/{id}`, `iinicia://notificaciones` | — |

**No implementadas, y fuera del alcance de esta fase:**
- calificaciones (Fase 5.5);
- edición del perfil (el portal la tiene);
- registro de dispositivos para notificaciones *push* (`POST me/devices` existe; no hay Firebase);
- vistas de profesor o coordinador, y solicitudes del aspirante: la app es para estudiantes.

## Navegación

- `AppRoot` muestra `LoginScreen` o `MainScaffold` según `signedIn` (un `StateFlow` de `AuthManager`). **Al cerrar sesión o al vencer la sesión, el árbol protegido desaparece entero**, y "Atrás" desde el login sale de la app.
- `NavHost` con `inicio`, `cursos`, `avisos`, `perfil` y `curso/{id}`. Las 4 pestañas conservan su estado (`saveState` y `restoreState`).
- **Callbacks:**
  - `org.iinicia.app:/oauth2redirect` y `org.iinicia.app:/logout` los recibe `RedirectUriReceiverActivity` de AppAuth.
  - Los *deep links* propios llegan a `MainActivity` (`singleTask`) por `onCreate` y `onNewIntent`. Solo navegan dentro de la app (el ID se valida con `toIntOrNull`) y quedan pendientes hasta iniciar sesión.

## Seguridad (lo que ya está bien)

- **Autenticación:**
  - Cliente público `iinicia-android` en Keycloak, con PKCE `S256` obligatorio, sin contraseña directa (`directAccessGrantsEnabled=false`) y con rotación del *refresh token*.
  - AppAuth valida `state` en el *callback*.
  - La app nunca ve la contraseña.
- **Tokens:**
  - Solo en `SecureStore` (AES-256-GCM con llave de Android Keystore).
  - No hay registro HTTP (`HttpLoggingInterceptor`) ni `Log` con datos.
  - Los errores nunca incluyen el token.
- **Respaldos:** `allowBackup=false`, `fullBackupContent=false` y reglas de extracción que excluyen `sharedpref`.
- **Red:**
  - En release, solo HTTPS.
  - En debug se permite HTTP solo hacia `localhost` (`network_security_debug.xml`). AppAuth además rechaza HTTP a otro host.
  - La validación de certificados no se modifica.
- **Secretos:** el APK no contiene ninguno, ni del backend, Moodle o Keycloak. El token de Moodle se queda en el backend.
- **Componentes exportados** (manifiesto combinado):
  - `MainActivity`: lanzador y *deep links*.
  - `RedirectUriReceiverActivity`: AppAuth.
  - `DiagnosticsReceiver` y `ProfileInstallReceiver`: protegidos con `DUMP`.
  - `SystemJobService`: con `BIND_JOB_SERVICE`.
  - Ningún otro.

## Hallazgos

| # | Tipo | Hallazgo |
|---|---|---|
| A1 | Mantenibilidad | `AppRoot.kt` (346 líneas) mezcla navegación, *deep links*, fábrica de ViewModels y 6 pantallas. `ProfileScreen` escribe preferencias y programa WorkManager directamente desde la interfaz |
| A2 | Pruebas | Los ViewModels reciben `IiniciaApp` completo y el repositorio es una clase concreta ligada a Android: no se pueden probar sin dispositivo. No hay ninguna prueba |
| A3 | Funcionamiento | **Tablero "todo o nada".** Las 4 llamadas van juntas: si Moodle no responde (502 en `me/courses` o `me/upcoming`), tampoco se ven el perfil ni los avisos, que no dependen de Moodle. La caché solo se usa con `IOException`, no con un 5xx |
| A4 | Errores | 400, 408, 429, 500, 502 y 503 muestran todos "El servicio no está disponible". Un tiempo agotado se presenta como "Sin conexión". Si la renovación del token falla por red, `AuthorizationException` llega como "error inesperado" y tampoco usa la caché |
| A5 | **Defecto** | **Las notificaciones nunca se muestran en Android 8 a 12.** `NoticeWorker` comprueba `POST_NOTIFICATIONS`, un permiso que no existe antes de Android 13, así que `checkSelfPermission` devuelve "denegado". Es el aviso de lint `InlinedApi` |
| A6 | Experiencia | El permiso de notificaciones se pide al abrir la app, antes de iniciar sesión y sin contexto, en cada arranque hasta que se responde. Verificado en el emulador: el diálogo cubre la pantalla de inicio |
| A7 | Solicitudes | Varios "deslizar para actualizar" seguidos lanzan recargas en paralelo, sin cancelar la anterior. Marcar un aviso como leído recarga el tablero completo (4 llamadas, 2 de ellas a Moodle) |
| A8 | Errores | Si marcar como leído falla, no se avisa |
| A9 | Experiencia | El perfil muestra el estado en crudo (`active`). La barra superior dice "Curso" en el detalle, en vez del nombre |
| A10 | Caché | Sin caducidad: sin conexión se muestra información de cualquier antigüedad y sin fecha. Se borra al cerrar sesión o al vencer la sesión (`store.clear()`), así que no pasa de un usuario a otro. Pero también borra la preferencia de notificaciones |
| A11 | Accesibilidad | Las tarjetas tocables no anuncian su acción (`onClickLabel`). "Leído" y "no leído" se distinguen solo por negritas. El título de cada pantalla no se marca como encabezado |
| A13 | **Privacidad** | **Datos de la cuenta anterior tras cambiar de usuario** (deducido del código; se intentará reproducir en la validación). `DashboardViewModel` se crea con `viewModel()` fuera del `NavHost`, así que pertenece a la `Activity`, no a la sesión. Si alguien cierra sesión y otra persona entra sin que se cierre la app, se reutiliza la misma instancia con los datos de la primera. `init` no vuelve a cargar, y la caché en memoria no se borra |
| A12 | Recursos | Los PNG de `mipmap-*dpi` no se usan nunca: con `minSdk 26` siempre se toma el ícono adaptable de `mipmap-anydpi-v26`. Por eso aparecen 5 avisos de `IconLauncherShape` y 1 de `ObsoleteSdkInt` |

## Los 35 avisos de lint

`lintDebug`: 0 errores y 35 avisos.

| Aviso | Cantidad | Categoría | Plan |
|---|---|---|---|
| `InlinedApi` (`POST_NOTIFICATIONS`) | 1 | Compatibilidad, **funcionamiento** | Corregir: es el defecto A5 |
| `IntentFilterUniqueDataAttributes` | 2 | Mantenibilidad | Corregir: un `<data>` por atributo |
| `ObsoleteSdkInt` (`mipmap-anydpi-v26`) | 1 | Recursos | Corregir: mover a `mipmap-anydpi` |
| `IconLauncherShape` | 5 | Recursos, usabilidad | Corregir: quitar los PNG que nunca se usan (A12) |
| `UnusedResources` (`network_security_release`) | 1 | Recursos | Falso positivo en debug: lo usa release por *placeholder*. Corregir con un archivo por variante (`src/debug` sobrescribe a `src/main`) |
| `UseKtx` (`toUri`, `SharedPreferences.edit`) | 12 | Mantenibilidad | Corregir |
| `OldTargetApi` (36 frente a 37) | 1 | Compatibilidad | **No en esta fase.** Subir `targetSdk` cambia el comportamiento del sistema y exige probar en Android 17. Se documenta |
| `GradleDependency`, `NewerVersionAvailable` y `AndroidGradlePluginVersion` | 12 | Código obsoleto | **No en esta fase** (no actualizar dependencias de forma masiva). Se documenta para la Fase 7 |

Ningún aviso es de seguridad. Se pueden corregir sin riesgo 22, y quedan 13 justificados.

## Estado al empezar

| Comprobación | Resultado |
|---|---|
| `assembleDebug` | Compila |
| `lintDebug` | 0 errores y 35 avisos |
| Pruebas unitarias e instrumentadas | No existen |
| Emulador | `Pixel_7` (Android 17, API 37, x86_64), con aceleración WHPX disponible. Arranca y se instala el APK |
| Teléfono físico | Hay uno conectado por USB. No se usó en esta etapa |
| Arranque en frío en el emulador | 19 a 31 s, con el emulador recién iniciado y el diálogo de permiso. No es una medida válida del código: la comparación se hará al final, con el APK anterior y el nuevo alternados en la misma sesión |
