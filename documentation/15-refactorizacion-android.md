# 15 · Fase 4: Refactorización de la app Android

Rama: `refactor/android-modular-architecture`, creada desde `main` después de integrar la Fase 3 (`1a4c9dc`). Etapas 4.1 a 4.8, un commit por etapa: ninguna comparte commit.

**Resumen de lo verificado.** No es lo mismo que algo compile, que pase sus pruebas automáticas o que se haya probado a mano:

| Nivel | Qué | Dónde |
|---|---|---|
| Compila | `assembleDebug` y `assembleRelease` (sin firmar) | PC de desarrollo |
| Pruebas automáticas | 56 unitarias (JVM) y 12 de interfaz Compose | JVM y emulador Pixel 7 con Android 17 (API 37) |
| Probado a mano con servicios reales | Inicio de sesión con Keycloak, cursos, detalle, avisos, perfil, cierre de sesión, *deep link*, Moodle detenido y recuperación, entrada al campus | Emulador, con `adb reverse` contra el backend, Keycloak y Moodle de DEV |
| Teléfono físico | **Fase 4.9:** instalado y probado en un ZTE con Android 10. Se encontró un defecto crítico de la plataforma (sesión de Moodle de la cuenta anterior). **Fase 4.10:** corregido y verificado en el mismo teléfono (documento 15b) | Teléfono con `adb reverse` |

## 1. Estado inicial

El inventario completo de la etapa 4.1 está en [api/inventario-android.md](api/inventario-android.md).

- **Código:** 11 archivos Kotlin (1 034 líneas).
  - `ui/AppRoot.kt` (346 líneas): navegación, *deep links*, fábrica de ViewModels y las 6 pantallas.
  - `ui/AppViewModels.kt` (81 líneas).
  - Un solo `Repository`.
- **Sin pruebas:** no había `src/test` ni `src/androidTest`.
- **Lint:** 0 errores y 35 avisos.
- **Seguridad de partida (bien resuelta):**
  - AppAuth con PKCE S256 obligatorio en Keycloak;
  - tokens cifrados con Android Keystore;
  - respaldos desactivados;
  - HTTP solo hacia `localhost` en debug;
  - ningún secreto en el APK.
- **Hallazgos A1 a A16:**
  - Tablero "todo o nada" si Moodle no responde (A3).
  - Mensajes de error genéricos (A4).
  - **Notificaciones que nunca se mostraban en Android 8 a 12** (A5).
  - Permiso pedido antes del inicio de sesión (A6).
  - **Posible paso de datos entre cuentas** (A13).
  - Navegación rota tras un *deep link* (A14).

## 2. Inventario de funcionalidades

| Funcionalidad | Antes | Después |
|---|---|---|
| Inicio de sesión con Keycloak (AppAuth, PKCE, Custom Tab) | Sí | Sí, igual. Cerrar el navegador ya no se trata como error |
| Inicio: saludo, campus, próximas actividades, cursos | Sí, todo o nada | Sí, por secciones: si Moodle falla, el resto se ve |
| Cursos y detalle con secciones y actividades | Sí | Sí, con el nombre del curso en la barra superior |
| Abrir curso o actividad en Moodle (enlace SSO del backend) | Sí | Sí |
| Avisos y marcar como leído | Sí; recargaba el tablero completo (4 solicitudes) | Sí; recarga solo los avisos. Si falla, se avisa |
| Perfil, interruptor de notificaciones, cerrar sesión | Sí | Sí. El estado aparece traducido y cerrar sesión pide confirmación |
| Avisos en segundo plano (WorkManager) | Sí; **en Android 8 a 12 nunca se mostraban** | Sí, en todas las versiones |
| Sin conexión: última copia cifrada | Sí; sin fecha, sin dueño, sin caducidad | Sí; con fecha visible, dueño y caducidad de 7 días |
| *Deep links* `iinicia://curso/{id}` y `iinicia://notificaciones` | Sí | Sí, validados con una función probada |

**No implementado, y fuera del alcance de esta fase:**
- calificaciones (Fase 5.5);
- edición del perfil;
- notificaciones *push* con Firebase;
- vistas de profesor o administración: la app sigue orientada a estudiantes.

No se agregaron botones de funciones inexistentes.

## 3. Arquitectura anterior

- `MainActivity` creaba la interfaz y manejaba AppAuth, el permiso de notificaciones y los *deep links*.
- `AppRoot.kt` lo contenía casi todo. `ProfileScreen` escribía preferencias y programaba WorkManager desde la interfaz.
- Un único `DashboardViewModel`, creado fuera del `NavHost` (en la `Activity`), servía a las 4 pestañas con una sola carga de 4 solicitudes.
- Los ViewModels recibían `IiniciaApp` completo, así que no se podían probar sin dispositivo.

## 4. Nueva arquitectura MVVM

```
Pantalla (Compose) ──eventos──► ViewModel ──► Repositorio ──► IiniciaApi (HTTP) ──► backend /api/v1
      ▲                            │               │
      └──── StateFlow<UiState> ◄───┘               └──► OfflineCache (almacén cifrado)
                                   └──► UiEvent (abrir URL, mensaje) vía Channel
```

- **Flujo unidireccional:**
  - Cada pantalla observa un estado inmutable (`ScreenState<T>`, `HomeUiState`) y envía acciones al ViewModel.
  - Las acciones de una sola vez, como abrir el campus o mostrar un mensaje, llegan como `UiEvent`.
- **Inyección manual** con `di/AppContainer`, sin Hilt: son pocas piezas. El constructor recibe las 4 fronteras con el exterior, así que las pruebas arman la app completa con dobles:
  - `Authenticator` (sesión);
  - `IiniciaApi`;
  - `KeyValueStore`;
  - `NoticeScheduler`.
- **Sin capa `domain/` ni casos de uso.** Las reglas son pocas y viven en los repositorios (red primero, copia solo ante errores pasajeros) y en los ViewModels. Agregar casos de uso que solo reenvían llamadas sería una capa vacía.
- **Un solo módulo Gradle (`:app`):** con 2 300 líneas no hay una necesidad técnica de varios módulos.
- **Corrutinas:**
  - Cada carga nueva cancela la anterior (`Job`).
  - Al cerrar una pantalla se cancela su `viewModelScope`, y con él la solicitud HTTP (`Call.cancel()`).

## 5. Estructura final de carpetas (`android/app/src`)

```
main/java/org/iinicia/app/
  IiniciaApp.kt, MainActivity.kt         inicialización; la Activity solo lanza intents y presenta AppRoot
  di/AppContainer.kt                     dependencias y borrado de datos al cerrar sesión
  core/common/                           ScreenState, Outcome, SharedValue, UiEvent, mensajes, fechas
  core/network/                          ApiClient, AppError, AppJson
  core/security/                         Session, Authenticator, AuthManager (AppAuth)
  core/storage/                          KeyValueStore, SecureStore (Android Keystore), MemoryStore
  data/models/                           modelos de la API y etiquetas
  data/remote/IiniciaApi.kt              endpoints de /api/v1 usados por la app
  data/local/OfflineCache.kt             copia cifrada con dueño y caducidad
  data/repositories/                     Profile, Course, Notification, Settings, networkFirst
  features/auth/                         LoginScreen, AuthViewModel
  features/home/                         HomeScreen, HomeViewModel (HomeUiState)
  features/courses/                      CoursesScreen, CourseDetailScreen, ViewModels, tarjetas
  features/notifications/                NotificationsScreen, ViewModel, NoticeWorker, NoticeScheduler
  features/profile/                      ProfileScreen, ProfileViewModel
  navigation/                            AppRoot (puerta de sesión), MainScaffold, Routes
  ui/components/                         estados (carga, error, vacío, sin conexión), ConfirmDialog
  ui/theme/                              colores IINICIA
main/res/                                mipmap/ic_launcher.xml (adaptativo), xml/network_security_config.xml
debug/res/xml/network_security_config.xml   solo debug: HTTP hacia localhost
test/            56 pruebas locales (JVM)
androidTest/     12 pruebas de interfaz Compose
sharedTest/      dobles de prueba compartidos (sesión, API, programador) y datos ficticios
```

`features/activities` no existe como carpeta propia: las actividades se muestran dentro de Inicio (próximas) y del detalle del curso, que es donde vive esa información. Una pestaña nueva sería una funcionalidad nueva, no una refactorización.

## 6. Pantallas y navegación

- **Puerta de sesión (`navigation/AppRoot.kt`):**
  - Sin sesión, solo existe `LoginScreen`.
  - Al cerrar o vencer la sesión, el área protegida sale de la composición y "Atrás" desde el login sale de la app.
  - Ninguna pantalla protegida es alcanzable sin sesión.
  - Lo cubre la prueba `sinSesionSoloSeVeElInicioDeSesion`.
- **Rutas con tipos (`navigation/Routes.kt`):** `HomeRoute`, `CoursesRoute`, `NoticesRoute`, `ProfileRoute` y `CourseRoute(id, title)`.
- **Pestañas:** conservan su estado. "Atrás" desde una pestaña vuelve a Inicio (verificado en el emulador).
- **Deep links:**
  - `deepLinkRoute()` solo acepta `iinicia://curso/{número positivo}` e `iinicia://notificaciones`.
  - Sin sesión quedan pendientes hasta iniciarla.
  - Los que abren una pestaña navegan igual que la barra inferior (corrige A14).
- **Callbacks de AppAuth:** `org.iinicia.app:/oauth2redirect` y `org.iinicia.app:/logout` sin cambios.

## 7. ViewModels y repositorios

| ViewModel | Estado | Repositorios |
|---|---|---|
| `AuthViewModel` (Activity) | `signedIn`, `loginError`; eventos `endSession` y `askNotifications` | `Authenticator`, `NoticeScheduler` |
| `HomeViewModel` | `HomeUiState`: perfil, cursos y actividades por separado, `academicError`, `savedAt` | Profile, Course |
| `CoursesViewModel` | `ScreenState<List<Course>>` | Course |
| `CourseDetailViewModel` | `ScreenState<Course>`; eventos para abrir el campus | Course |
| `NotificationsViewModel` | `ScreenState<List<Notice>>`; mensaje si marcar como leído falla | Notification |
| `ProfileViewModel` | `ScreenState<Profile>`, interruptor de notificaciones | Profile, Settings, `NoticeScheduler` |

- **ViewModels por sesión:** viven en un `ViewModelStore` propio de la sesión (`SessionViewModels`). Sobreviven a la rotación, pero se destruyen al cerrar sesión. Así se corrige A13.
- **`SharedValue`:** Inicio y Cursos comparten una sola solicitud de cursos, y las llamadas simultáneas esperan a la primera. Nunca reutiliza el valor de otra persona.

## 8. Comunicación con el backend

- **Contratos:** los mismos endpoints de `/api/v1`, sin cambios en el backend:
  - `me`, `me/courses`, `me/courses/:id`, `me/upcoming`, `me/notifications`;
  - `POST me/notifications/:id/read`;
  - `me/campus-link`.
- **`AppError`:** clasifica cada falla y da un mensaje claro en español.

| Situación | Mensaje | ¿Muestra la copia guardada? |
|---|---|---|
| Sin red | "Sin conexión. Revisa tu internet e intenta de nuevo." | Sí |
| Tiempo agotado | "El servidor tardó demasiado en responder. Intenta de nuevo." | Sí |
| 400 o 422 | El mensaje del backend (validación) | No |
| 401 | Cierra la sesión y vuelve al inicio de sesión | — |
| 403 | "No tienes permiso para esta acción." | No |
| 404 | "Contenido no disponible." | No |
| 429 | "Demasiadas solicitudes. Espera un momento e intenta de nuevo." | No |
| 502 (Moodle) | "El campus no responde en este momento. Intenta más tarde." | Sí |
| 503 o 504 | "El servicio no está disponible en este momento. Intenta más tarde." | Sí |
| Otro 5xx | "Ocurrió un error en el servidor. Intenta más tarde." | Sí |

- **Errores definitivos:** no se ocultan con datos guardados. Un 403 nunca muestra datos viejos.
- **Sin reintentos propios:** OkHttp solo reabre una conexión vieja que falló antes de recibir respuesta. La única escritura de la app (marcar un aviso como leído) es idempotente.
- **Tiempos de espera sin cambios:** 15 s de conexión y 30 s de lectura. No se aumentaron.
- **Renovación del token:** `AuthManager` usa un `Mutex`, así que nunca hay dos renovaciones a la vez; Keycloak rota el *refresh token*. Si falla por red, se trata como "sin conexión" en vez de "error inesperado".

## 9. Integración con Moodle

- **Moodle sigue siendo la fuente académica.** La app no tiene tokens ni credenciales de Moodle. Solo pide al backend el enlace de inicio de sesión único (`me/campus-link`), que valida que el curso o la actividad sean de la persona.
- **Moodle detenido** (probado en el emulador con `docker compose stop moodle`):
  - Inicio mostró el saludo y la copia guardada con su fecha.
  - Un curso sin copia mostró "El campus no responde en este momento".
  - Tras volver a iniciar Moodle, "Reintentar" cargó el curso.
  - El primer reintento falló por el arranque en frío de Moodle, ya documentado para la Fase 6.
- **Entrada al campus desde la app:**
  - "Abrir en el campus" abrió en Custom Tab la página del curso en Moodle ("Curso: Base de Datos | IINICIA").
  - En el emulador, Keycloak pidió la contraseña otra vez, también con el APK anterior. Ver el riesgo R5.
- **Sin cambios:** no se modificó Moodle Core ni se lee su base de datos, y no se implementaron calificaciones.

## 10. Autenticación y seguridad

| Control | Estado |
|---|---|
| Keycloak, AppAuth, código y PKCE S256 | Sin cambios. `state` lo valida AppAuth |
| Tokens | Solo en `SecureStore` (AES-256-GCM, llave no exportable de Android Keystore). Nunca en texto plano ni en registros: el código no registra nada, y en logcat no aparece ningún *access token* ni *refresh token* (verificado). Ver A15 sobre el token de identidad en el cierre de sesión |
| Mensajes de error | Nunca incluyen el token (prueba `ningun mensaje de error contiene el token`) |
| Red | Release solo HTTPS (`network_security_config` en `src/main`). Debug permite HTTP solo hacia `localhost` (`src/debug`, que sobrescribe). `AppContainer` además rechaza una URL de API que no sea HTTPS, salvo `localhost` en debug. La validación de certificados no se modifica |
| Respaldos | `allowBackup=false`, `fullBackupContent=false`, reglas de extracción que excluyen `sharedpref` |
| Componentes exportados | Solo `MainActivity` (lanzador y *deep links*) y `RedirectUriReceiverActivity` (AppAuth). Los de WorkManager y ProfileInstaller están protegidos por permisos del sistema |
| Permisos | `INTERNET`, `ACCESS_NETWORK_STATE` y `POST_NOTIFICATIONS`. Este último se pide después de iniciar sesión o al activar las notificaciones, no al abrir la app (A6) |
| Secretos | El APK no contiene secretos de backend, Moodle ni Keycloak (cliente público `iinicia-android`) |
| Cierre de sesión | Revoca el *refresh token*, borra el almacén cifrado y la memoria, cancela el *worker* y abre el cierre de Keycloak |
| Cambio de cuenta | ViewModels y valores en memoria por sesión y por dueño, y caché con dueño. Lo cubre la prueba `otraCuentaNoVeLosDatosDeLaAnterior` (A13) |

## 11. Almacenamiento local

- **Sin Room ni Firebase:** el almacén cifrado existente basta para unas pocas copias JSON.
- **Caché de datos académicos** (perfil, cursos, actividades, avisos, detalle de curso):
  - Se lee solo ante fallas pasajeras.
  - Cada copia guarda su dueño (`sub` del token de identidad) y su fecha.
  - Caduca a los 7 días, y otra cuenta nunca la ve.
  - Todo el almacén se vacía al cerrar o vencer la sesión.
  - La clave de la versión anterior (`cache_dashboard`) se borra al iniciar.
- **No hay modo sin conexión completo:** solo se muestra la última información conocida, con un aviso y su fecha.
- **Preferencias** (notificaciones activadas, último aviso notificado): en el mismo almacén. Se borran al cerrar sesión.

## 12. Accesibilidad

- **Tarjetas:** las tocables anuncian su acción ("Abrir curso", "Abrir en el campus", "Marcar como leído") y su rol de botón.
- **Avisos no leídos:** llevan la etiqueta visible "Nuevo" y la descripción de estado "No leído", no solo negritas.
- **Encabezados:** el título de la barra superior y los títulos de sección se anuncian como encabezados.
- **Estados:** carga, error y error en línea usan regiones vivas (`liveRegion`). El indicador de carga se describe como "Cargando".
- **Letra ampliada:** Login y Perfil se desplazan. La prueba `letraAmpliadaSigueSiendoUsable` comprueba, con escala de fuente 2x, que "Entrar al Campus" y "Cerrar sesión" siguen alcanzables.
- **Áreas táctiles:** botones e interruptor con 48 dp como mínimo.
- **Pendiente:** no se hizo una revisión manual con TalkBack.

## 13. Revisión de los 35 avisos de lint

Resultado: **35 → 16 avisos, 0 errores**, sin supresiones ni configuraciones globales. De los 35 originales se corrigieron 22. Quedan 13, más 3 nuevos del mismo tipo (versiones más recientes disponibles) en las dependencias de prueba agregadas, que se fijaron a las mismas versiones que la app (BOM de Compose, `kotlinx-coroutines-test` 1.10.2 y `mockwebserver3` 5.1.0).

| Aviso | Cantidad | Categoría | Resolución |
|---|---|---|---|
| `InlinedApi` (`POST_NOTIFICATIONS`) | 1 | Compatibilidad, funcionamiento | **Corregido:** era el defecto A5. En Android 8 a 12 se usa `areNotificationsEnabled()` |
| `IntentFilterUniqueDataAttributes` | 2 | Mantenibilidad | Corregido: un atributo por `<data>` |
| `UseKtx` (`toUri`, `SharedPreferences.edit`) | 12 | Mantenibilidad | Corregido |
| `UnusedResources` (`network_security_release`) | 1 | Recursos | Corregido: un `network_security_config.xml` por variante, sin *placeholders* |
| `ObsoleteSdkInt` (`mipmap-anydpi-v26`) | 1 | Recursos | Corregido: ícono adaptativo en `mipmap/` |
| `IconLauncherShape` | 5 | Recursos, usabilidad | Corregido: se quitaron los PNG por densidad, que con `minSdk 26` nunca se usan. `frontend/scripts/brand-assets.mjs` ya no los genera. `aapt2` confirma que todas las densidades usan `res/mipmap/ic_launcher.xml` |
| `OldTargetApi` (36 frente a 37) | 1 | Compatibilidad | **Pendiente, justificado:** subir `targetSdk` cambia el comportamiento del sistema y exige una prueba propia en Android 17 |
| `GradleDependency` (8), `NewerVersionAvailable` (3), `AndroidGradlePluginVersion` (1) | 12 | Código obsoleto | **Pendiente, justificado:** no actualizar dependencias principales de forma masiva. Se propone para la Fase 7, con CI |
| Nuevos en dependencias de prueba: `GradleDependency` (1, BOM de `androidTest`) y `NewerVersionAvailable` (2) | 3 | Código obsoleto | Mismo criterio: se mantienen alineadas con las versiones de la app |

Durante la etapa apareció y se corrigió un error nuevo: `MissingPermission`, porque lint no reconocía la comprobación hecha en una función auxiliar.

## 14. Pruebas unitarias

`./gradlew testDebugUnitTest`: **56 de 56**, en la JVM, sin dispositivo. Dependencias de prueba:
- JUnit 4.13.2;
- `kotlinx-coroutines-test` 1.10.2;
- `mockwebserver3` 5.1.0, la misma versión que OkHttp.

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `ApiClientTest` | 10 | Contra un servidor HTTP local real: `Authorization` y `Accept`; 401 como sesión vencida; mensajes de NestJS (texto y lista); cada estado HTTP; un 500 no expone detalles; tiempo agotado; sin servidor; **cancelar la corrutina cancela la solicitud**; ningún mensaje contiene el token; sin sesión no se envía nada |
| `AppErrorTest` | 4 | Errores pasajeros frente a definitivos, red y tiempo, mensajes en español |
| `SharedValueTest` | 5 | Reutilización, forzado, caducidad, carga compartida entre llamadas simultáneas, nunca el valor de otra persona |
| `OfflineCacheTest` | 5 | Fecha de la copia, otra cuenta, caducidad de 7 días, sin dueño, formato anterior |
| `RepositoryTest` | 8 | Copia solo ante errores pasajeros, 403 propagado, solicitud compartida, enlaces al campus, marcar como leído sin reintento, preferencias |
| `ViewModelsTest` | 19 | Inicio (datos, carga, Moodle caído, copia sin conexión, error, sesión vencida, aspirante, campus); cursos vacíos; detalle y errores; avisos (actualización y falla sin reintento); perfil; inicio de sesión (éxito, cancelado, sin red); cierre de sesión |
| `RoutesTest` | 3 | *Deep links* válidos e inválidos, etiquetas de estado |
| `AppContainerTest` | 2 | Borrado de memoria al cerrar sesión con otra cuenta después, borrado de claves antiguas |

Todos los datos son ficticios (`sharedTest/.../Fakes.kt`: "Ana Prueba", "Curso Ficticio", correos `@ejemplo.test`).

**Defecto encontrado por las pruebas:** `SharedValue` decidía con el reloj si "otra llamada ya cargó el dato". Una actualización forzada en el mismo milisegundo que la carga anterior se omitía. Ahora usa un contador de cargas.

## 15. Pruebas instrumentadas

`androidTest/.../AppUiTest.kt`: 12 pruebas de la app completa (AppRoot, navegación y ViewModels reales) con dobles de la sesión y de la API. No usan Keycloak, el backend ni cuentas reales.

**Ejecución:** en el emulador Pixel 7 (Android 17, API 37), **12 de 12**. Se instalaron los APK con `adb -s emulator-5554` y se ejecutaron con `am instrument`, para no tocar el teléfono conectado.

**Cubren:**
- puerta de sesión;
- Inicio con datos y botón al campus;
- estado de carga;
- error de conexión y "Reintentar";
- Moodle caído;
- cursos vacíos;
- detalle de curso, apertura de una actividad y "Volver";
- avisos "Nuevo" y marcar como leído;
- perfil y cierre de sesión con confirmación;
- **cambio de cuenta sin datos de la anterior (A13)**;
- sesión vencida;
- letra ampliada 2x.

**Dependencias solo de prueba:**
- Compose UI Test, del mismo BOM 2026.09.00;
- `espresso-core` 3.7.0, `runner` 1.7.0 y `ext-junit` 1.3.0.

Con Espresso 3.5, el que trae Compose UI Test, las 12 pruebas fallaban en Android 17 antes de llegar a la app (`InputManager.getInstance` ya no existe). No entran en el APK de la app.

**Defecto encontrado al escribirlas:** el borrado de memoria al cerrar sesión era asíncrono, así que un cambio de cuenta muy rápido podía reutilizar el valor anterior. Ahora cada valor en memoria guarda su dueño.

**No ejecutado:**
- pruebas en el teléfono físico;
- pruebas en Android 8 a 12, porque solo hay una imagen de Android 17. La corrección de A5 está cubierta por revisión y por lint, no por una prueba en esas versiones.

## 16. Resultados reales de compilación y validación

Todas las cifras son de ejecuciones reales del 24 y 25/11/2026 en la PC de desarrollo.

| Validación | Al empezar (Fase 3) | Al terminar la Fase 4 |
|---|---|---|
| Android: `assembleDebug` | Compila | **Compila.** `app-debug.apk`: 21 224 589 → 21 976 140 bytes. El debug incluye ahora `ui-test-manifest`, que es solo de depuración |
| Android: `assembleRelease` (sin firmar, R8) | — | **Compila.** Se comparó con `main` compilado en un *worktree* temporal: 2 239 682 → 2 268 150 bytes (+28 KB, +1,3 %). No se instaló: un APK sin firmar no se puede instalar |
| Android: `lintDebug` | 0 errores y 35 avisos | **0 errores y 16 avisos** (sección 13) |
| Android: pruebas unitarias (JVM) | No existían | **56 de 56** |
| Android: pruebas instrumentadas (emulador Android 17) | No existían | **12 de 12** |
| Backend: unitarias, integración y contratos | 43, 8 y 54 | **43 de 43, 8 de 8 y 54 de 54**. El backend no se modificó |
| Backend: typecheck y compilación | Correctos | Correctos |
| Portal: `node --test` y Vitest | 5 y 50 | **5 de 5 y 50 de 50**. Typecheck y ESLint correctos |
| E2E completa (Playwright) | 81 de 81 | **81 de 81** en 16,5 min |
| `npm audit --omit=dev` | 0 | **0** en backend, portal y E2E |

**Arranque en frío** (`am start -W`, `TotalTime`). Pixel 7 con Android 17 en el emulador, APK debug, con sesión iniciada. Se alternaron los APK anterior y nuevo en dos rondas: 8 mediciones de cada uno, después de un arranque de calentamiento tras cada instalación.

| APK | Mediana | Mínimo | Máximo |
|---|---|---|---|
| Anterior | 17 623 ms | 17 176 ms | 20 525 ms |
| Nuevo | 16 870 ms | 15 008 ms | 19 715 ms |

- Los rangos se superponen: **no hay una diferencia de arranque demostrable**.
- Los valores absolutos son altos por el emulador: renderizado por software, 2 GB de RAM y un APK debug sin compilar.
- **Por estructura, no por medición:** al abrir Inicio se piden 3 recursos en vez de 4 (los avisos se cargan al abrir su pestaña). Marcar un aviso como leído hace 2 solicitudes en vez de 5.

**Probado a mano en el emulador con los servicios de DEV** (`adb reverse`):
- inicio de sesión con Keycloak;
- Inicio con datos reales de la cuenta demo;
- Cursos y detalle;
- Avisos y Perfil;
- *deep link* a Avisos y cambio de pestaña;
- confirmación y cierre de sesión;
- cambio de cuenta de aspirante a estudiante;
- Moodle detenido y recuperación;
- entrada a la página del curso en Moodle.

**No hay *access token* ni *refresh token* en logcat.** Solo el token de identidad en el registro *verbose* del sistema al cerrar sesión (A15).

## 17. Capturas con datos ficticios

En `evidencias/capturas/`, tomadas en el emulador con la cuenta demo `estudiante@iinicia.test` ("Demo Estudiante") y el curso demo "Base de Datos". Se revisaron una por una: no contienen personas reales, tokens ni credenciales.

| Archivo | Contenido |
|---|---|
| `10-android-login.png` | Inicio de sesión. El archivo existía vacío (0 bytes) desde el primer commit y no lo citaba ningún documento: ahora es la captura real |
| `70-android-inicio.png` | Inicio con campus, próximas actividades y cursos |
| `71-android-curso.png` | Detalle de curso con el nombre en la barra superior |
| `72-android-avisos.png` | Avisos vacíos ("Sin avisos.") |
| `73-android-perfil.png` | Perfil con estado traducido ("Activo") |
| `74-android-confirmar-salida.png` | Confirmación al cerrar sesión |
| `75-android-sin-moodle.png` | Moodle detenido: copia guardada con su fecha |

## 18. Instalación del APK

```bash
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
adb devices                    # elegir el dispositivo
adb -s <serie> install -r app/build/outputs/apk/debug/app-debug.apk
```

- El APK `debug` está firmado con la llave de depuración local y apunta a `localhost`. Es solo para DEV.
- No se generó ni publicó una versión firmada de producción.
- `assembleRelease` se compiló sin firmar, solo para comprobar R8 y la configuración HTTPS.

## 19. Prueba en un teléfono físico

En el teléfono, `localhost` es el propio teléfono, no la PC. El backend escucha solo en `127.0.0.1` (Fase 1.5), y eso **no se cambia**: no se expone a la red ni se tocan `TRUSTED_PROXIES`. La conexión se hace con `adb reverse`, que lleva el `localhost` del teléfono al `localhost` de la PC por el cable USB:

1. En el teléfono: Opciones de desarrollador → Depuración USB. Conectarlo y aceptar la huella de la PC.
2. En la PC, con los servicios, el backend y Keycloak encendidos:
   ```bash
   adb devices                                   # anotar la serie del teléfono
   adb -s <serie> reverse tcp:4000 tcp:4000      # API
   adb -s <serie> reverse tcp:8180 tcp:8180      # Keycloak
   adb -s <serie> reverse tcp:8081 tcp:8081      # Moodle
   adb -s <serie> install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
3. **Recorrido de verificación:**
   - iniciar sesión con una cuenta demo (`estudiante@iinicia.test`);
   - Inicio, Cursos y detalle;
   - "Abrir en el campus": debería entrar sin segunda contraseña (ver R5);
   - Avisos;
   - Perfil y cerrar sesión con confirmación;
   - volver a entrar con otra cuenta demo y comprobar que no aparecen datos de la anterior.
4. **Notificaciones:** con la sesión iniciada, crear un aviso desde el portal (Panel → Avisos). Esperar hasta 15 minutos, o activar y desactivar el interruptor de Perfil para forzar una revisión. Tocar la notificación debe abrir el curso o los avisos.
5. Si se reinicia el cable o el teléfono, repetir los `adb reverse`, que no persisten.

**Alternativa sin cable** (no aplicada): exponer el backend por HTTPS con un certificado de confianza en una red controlada. Requiere los cambios de infraestructura de la Fase 6 y no se recomienda abrir el backend en HTTP a la red local.

## 20. Commits

| Commit | Etapa | Contenido |
|---|---|---|
| `72e33bd` | 4.1 | Auditoría e inventario, línea base |
| `6b1de1d` | 4.2 | Paquetes por capa y funcionalidad, contenedor de dependencias |
| `409ac28` | 4.3 | División de `AppRoot.kt` y `AppViewModels.kt`: funcionalidades, repositorios, navegación |
| `a9e8a95` | 4.4 | Navegación con tipos, ViewModels por sesión, componentes, confirmación |
| `980ef7c` | 4.5 | Modelo de errores, cancelación, caché con dueño y caducidad, Inicio por secciones |
| `21bdef5` | 4.6 | Notificaciones en Android 8 a 12, permiso en contexto, accesibilidad, lint |
| `33731ba` | 4.7 | 56 pruebas unitarias y 12 instrumentadas |
| Commit de esta etapa | 4.8 | Documentación, capturas, validación final |

La rama no se ha integrado en `main`: espera tu autorización. La Fase 5 no ha comenzado.

## Fase 4.9 · Validación en teléfono físico (25/11/2026)

**Dispositivo:** ZTE 9000 con Android 10 (API 29), arm64-v8a, 1080x2340.
- Ya tenía IINICIA debug instalada. Se actualizó con `adb install -r`, conservando los datos, con la misma firma (llave de depuración de esta PC).
- APK: el mismo de la rama (`assembleDebug` UP-TO-DATE).
- Conexión: `adb reverse` de 4000 (API), 8180 (Keycloak) y 8081 (Moodle). El backend siguió en `127.0.0.1`; no se expuso nada a la red.
- Las contraseñas de las cuentas demo se inyectaron por ADB, con tu autorización, sin capturas mientras estaban escritas.

**Ajustes temporales del teléfono, todos restaurados al terminar:**
- rotación (`accelerometer_rotation` y `user_rotation`, originales 0 y 0);
- tamaño de fuente (sin valor original; quedó en 1.0, el predeterminado);
- pantalla activa por USB (`stay_on_while_plugged_in`, original 0).

Se usó la interfaz de depuración de Brave por USB solo para leer cookies de `localhost:8180` y el nombre de usuario de la pestaña de Moodle local. Se retiró al terminar.

| Prueba | Resultado en el teléfono |
|---|---|
| Instalación y apertura | Correcto. Arranque en frío de 4,3 s; 988 ms tras cerrar y reabrir. Sin diálogo de permiso al abrir |
| Inicio de sesión con Keycloak (AppAuth, Brave como navegador predeterminado) | Correcto |
| Cursos, detalle, Avisos, Perfil, navegación y "Atrás" | Correcto. En Android 10, uiautomator informa límites vacíos para las etiquetas de las pestañas (limitación de la herramienta; se tocaron por coordenadas) |
| *Deep links* `iinicia://curso/3` e `iinicia://notificaciones`, y cambio de pestaña después | Correcto. Un enlace inválido no navega |
| **Notificaciones en Android 10 (A5)** | **Correcto:** canal `avisos` creado (importancia 3); un aviso ficticio se mostró como notificación y al tocarla abrió el curso. El código anterior nunca las mostraba en esta versión |
| Sin conexión al backend (se quitó el `adb reverse` de 4000) y recuperación | Correcto: copia con fecha y luego datos actuales |
| Moodle detenido y recuperación | Correcto: copia guardada con aviso; tras iniciar Moodle, la primera actualización cargó los datos |
| Segundo plano, y cerrar y reabrir | Correcto. Se conserva la sesión. Hallazgo menor **A17**: las listas no se actualizan solas al volver del segundo plano (también ocurría antes) |
| Rotación a horizontal y de vuelta | Correcto: contenido desplazable y estado conservado |
| Fuente 1,3x | Correcto: Perfil y "Cerrar sesión" visibles |
| Cambio de cuenta en la app (estudiante → aspirante) tras un cierre normal | Correcto: Keycloak pidió credenciales, y el aspirante no vio el curso, el aviso ni el correo del estudiante |
| Acceso a Moodle | Funciona, pero Keycloak pide la contraseña otra vez (ver la causa abajo) |
| **Moodle tras cambiar de cuenta** | **Falla crítica:** ver abajo |
| TalkBack | No ejecutado: se detuvo la validación por el defecto crítico |
| Android 8 o 9, 12 y 13+ en emulador | No disponible: solo hay imagen de Android 17. Android 10 queda verificado en el teléfono |
| Cosmético | La fecha del aviso sin conexión termina en "p. m.." (doble punto) |

### Causa del segundo inicio de sesión en Moodle (R5, confirmada)

**No se debe a la memoria del emulador.** Pasa igual en el teléfono, con Brave vivo (mismo PID durante toda la prueba).

**Evidencia:**
1. AppAuth y el campus usan Brave, el navegador predeterminado, en el mismo contexto de cookies; AppAuth 0.11.1 no usa navegación efímera.
2. Tras el inicio de sesión de la app, Brave sí tiene `KEYCLOAK_IDENTITY`. Brave acepta cookies `Secure` en `http://localhost`.
3. Al abrir el campus, Keycloak **borra** `KEYCLOAK_IDENTITY` y muestra el formulario.
4. Reproducido con `curl` y la cuenta demo:
   - si la app canjea el código con `offline_access`, la siguiente solicitud de Moodle con la misma cookie recibe el formulario (`Set-Cookie: KEYCLOAK_IDENTITY=; Max-Age=0`);
   - sin `offline_access`, Keycloak redirige a Moodle con código, sin contraseña.

**Causa:** canjear el código con `offline_access` deja inválida la sesión del navegador. Moodle no agrega `prompt` y usa el mismo host.

Concuerda con el documento 06: la versión del teléfono anterior a la "sesión larga" entraba sin segunda contraseña. Queda para la Fase 5, sin debilitar la autenticación.

### Defecto crítico: Moodle conserva la sesión de la cuenta anterior

**Reproducido en el teléfono:**
- el estudiante entra al campus;
- se cierra la sesión de la app;
- entra el profesor (Keycloak pide credenciales y la app muestra correctamente al profesor);
- "Entrar al Campus" abre Moodle **con la sesión de "Demo Estudiante"**, sin pedir nada.

**También ocurre en el portal web** (Playwright, mismo navegador): después de que el estudiante sale del portal y entra el profesor, Moodle sigue mostrando "Demo Estudiante".

**Causa:**
- La sesión de Moodle (`MoodleSession` en el navegador) sobrevive al cierre de sesión de IINICIA: el cierre en Keycloak no se propaga a Moodle.
- `local/iinicia/sso.php` redirige a cualquier sesión de Moodle abierta (`isloggedin()`) sin comprobar que sea de la persona que pidió el enlace.

**No es una regresión de la Fase 4:** el código del campus y del cierre de sesión es el mismo que antes. Pero expone información académica de una cuenta a otra en dispositivos compartidos.

**Otro caso relacionado:** un cierre de sesión interrumpido (el teléfono se bloqueó a la mitad) no revocó la sesión *offline* ni cerró la del navegador, y el siguiente "Iniciar sesión" entró sin credenciales a la cuenta anterior. Con un cierre completo, la sesión en línea y la *offline* se eliminan (comprobado en Keycloak: 1 → 0 y 3 → 2).

**Estado:** la integración de la Fase 4 en `main` queda **detenida** hasta tu decisión, según los criterios acordados. No se hizo el diagnóstico de PostgreSQL ni se inició la Fase 5.

## Fase 4.10 · Corrección crítica de sesiones (25/11/2026)

El defecto crítico de la Fase 4.9 se corrigió en la rama `fix/cross-account-session-isolation`, antes de integrar la Fase 4. El detalle completo está en [15b · Corrección crítica de seguridad y sesiones](15b-correccion-critica-sesiones.md). En resumen:

- La entrada al campus usa un comprobante firmado de un solo uso. Moodle comprueba la identidad y nunca reutiliza la sesión de otra cuenta.
- El cierre de sesión es coordinado desde el backend (Keycloak y Moodle) y no usa el navegador. Un cierre no confirmado queda pendiente y se completa al volver la conexión.
- La app siempre pide credenciales (`prompt=login`).
- Se eliminó la segunda contraseña al entrar al campus (R5), sin quitar `offline_access`.
- A17 y el doble punto de la fecha quedaron corregidos.
- El interruptor de notificaciones ahora tiene nombre accesible.

**Corrección a la sección anterior:** la reproducción en el portal de la Fase 4.9 usaba `GET /auth/logout`, que no es el cierre real (un `POST` del botón "Salir"). En la Fase 4.10 se repitió con el botón real y el defecto se confirmó (7 de 8 pruebas fallaron antes de la corrección).

## Fase 4.11 · Validación final de seguridad SSO y accesibilidad (25/11/2026)

Detalle en el [documento 15b, sección Fase 4.11](15b-correccion-critica-sesiones.md). Para la app:

- La entrada al campus usa un `state` propio y un comprobante vinculado al navegador del teléfono (`CampusLinks` y `CampusViewModel`); un enlace copiado no sirve en otro dispositivo.
- Una pestaña, o un deep link a una pestaña, con un curso abierto encima vuelve a su raíz (defecto anterior, de la etapa 4.6).
- **TalkBack probado de verdad** en el teléfono (5 rondas), sin defectos nuevos.
- 76 pruebas unitarias y 15 instrumentadas.

## 21. Riesgos y pendientes

1. **R1 · Teléfono físico:** probado en un ZTE con Android 10 en las Fases 4.9 y 4.10 (documento 15b, sección 12).
2. **R2 · Android 8 a 12:** la corrección de las notificaciones (A5) no se ejecutó en esas versiones; solo hay una imagen de Android 17.
3. **R3 · `targetSdk 36` y 12 avisos de versiones:** pendientes, justificados en la sección 13.
4. **R4 · Rotación estricta del refresh token (A16):** Keycloak no permite reutilizarlo. Si Android mata la app justo durante una renovación (observado al forzar el cierre con `am start -S`), el token nuevo no se guarda y la sesión se cierra en el siguiente arranque. Keycloak registró `Maximum allowed refresh token reuse exceeded`. Ya ocurría antes. Para la Fase 5: valorar `refreshTokenMaxReuse` en el realm o guardar el estado antes de usar el token nuevo.
5. **R5 · Entrada al campus sin segunda contraseña: resuelto en la Fase 4.10.** La causa no era la memoria del emulador: canjear el código con `offline_access` elimina la sesión del navegador en Keycloak. La entrada al campus ahora usa un comprobante firmado y no depende de esa sesión (documento 15b, secciones 7 y 9).
6. **R6 · Token de identidad en el cierre de sesión (A15):** riesgo bajo. Sin acceso a la API (`aud` distinto). Para la Fase 5.
7. **R7 · TalkBack:** probado de verdad en la Fase 4.11 en el ZTE con Android 10 y TalkBack 17.1 (documento 15b, 4.11.11). Otras versiones siguen sin probar.
8. **Heredados, para la Fase 6:**
   - 6 vulnerabilidades moderadas en herramientas de desarrollo;
   - optimización del arranque de Moodle;
   - persistencia de cachés de Moodle;
   - tareas de `moodle-cron` simultáneas al arranque;
   - *healthchecks* incompletos;
   - validar un reinicio completo de Docker Desktop;
   - **el script de liberar puertos detuvo el backend por error** (ver abajo).
9. **Nuevo para la Fase 6 · PostgreSQL bajo carga:**
   - En esta fase, con el emulador, Docker y Moodle a la vez, PostgreSQL entró 3 veces en recuperación: un proceso terminó con código 2 tras `could not send data to client: Broken pipe`.
   - El backend registró `the database system is in recovery mode`, y `student_overview` de Moodle superó los 20 s en esos momentos.
   - Se recuperó solo y las pruebas posteriores pasaron, pero hay que investigar la causa y los límites de recursos.

**Incidente del script de puertos (Fase 3, para la Fase 6):** al liberar el puerto 3000 del portal, un script auxiliar usó su valor por omisión (4000 y 4001) y detuvo el backend. Se reinició al momento. En la Fase 6 conviene un script de servicios que pida el puerto de forma explícita y confirme qué proceso detiene.

## 22. Procedimiento de recuperación

- **Volver a la app anterior:** `main` no tiene la Fase 4. Ejecutar `git switch main`, `cd android && ./gradlew assembleDebug` y reinstalar.
- **Compatibilidad de datos:**
  - Ambas versiones usan el mismo almacén cifrado y la misma clave de sesión (`auth_state`): la sesión se conserva al cambiar de versión, en los dos sentidos.
  - La versión anterior ignora las copias nuevas (`cache_*` con dueño). La nueva borra `cache_dashboard`.
  - No hay migraciones ni cambios de backend.
- **Deshacer una etapa:** `git revert <commit>` en la rama. Después, `./gradlew assembleDebug lintDebug testDebugUnitTest` y las pruebas instrumentadas en el emulador.
- **Script de marca:** si se revierte la etapa 4.6, `frontend/scripts/brand-assets.mjs` vuelve a generar los PNG por densidad. Deben restaurarse junto con `mipmap-anydpi-v26`.
- **Emulador de pruebas:** los cambios de esta fase (Chrome sin pantalla de bienvenida, Gboard desactivado) son solo del AVD `Pixel_7`. Para revertirlos: `adb shell ime enable com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME` y `adb shell am clear-debug-app`.
