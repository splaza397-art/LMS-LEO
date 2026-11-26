# 15b · Fase 4.10: Corrección crítica de seguridad y sesiones

Rama `fix/cross-account-session-isolation`, creada desde `7967b80` (Fase 4.9, en `refactor/android-modular-architecture`). Fecha: 25/11/2026.

Es una corrección previa a la integración de la Fase 4 en `main`. No se integró en la rama de Android ni en `main`, y la Fase 5 no ha comenzado.

## 1. Descripción del defecto

En la Fase 4.9 se comprobó en un teléfono físico y en el portal que, tras cerrar la sesión de IINICIA y entrar con otra cuenta, **Moodle seguía abierto con la cuenta anterior**:

1. El estudiante entra al campus.
2. Cierra la sesión de IINICIA.
3. Entra el profesor; Keycloak pide sus credenciales y la app o el portal muestran al profesor.
4. "Entrar al Campus" abre Moodle como "Demo Estudiante", sin pedir nada.

**Caso relacionado:** un cierre de sesión interrumpido en la app (el teléfono se bloqueó a la mitad) dejó viva la sesión del navegador en Keycloak. El siguiente "Iniciar sesión" entró sin credenciales a la cuenta anterior.

## 2. Causa raíz

- **El cierre de IINICIA no llegaba a Moodle.** Moodle tiene su propia sesión (`MoodleSession`) y nadie la cerraba.
- **`local/iinicia/sso.php` reutilizaba cualquier sesión abierta.** Si `isloggedin()` era verdadero, redirigía al curso sin comprobar de quién era la sesión.
- **El cierre en la app dependía del navegador.** Se hacía con una redirección a `end_session` de Keycloak en una pestaña. Si se interrumpía, la sesión del navegador seguía viva, y el siguiente inicio de sesión, sin `prompt=login`, entraba solo.

## 3. Impacto potencial

- En un equipo o teléfono compartido, una persona podía ver y modificar en Moodle los cursos, entregas, mensajes y calificaciones de otra.
- Si la sesión residual era de un profesor o administrador, el acceso era a sus permisos.
- **Severidad: crítica.** Se trata de acceso a recursos de otra cuenta.
- No hay evidencia de que haya ocurrido fuera del entorno de desarrollo; la plataforma no está en producción.

## 4. Escenarios afectados

| Escenario | Antes de la corrección |
|---|---|
| Portal, mismo navegador: estudiante → profesor, profesor → estudiante, superadmin ↔ estudiante, estudiante A → estudiante B | Moodle quedaba con la cuenta anterior (5 de 5 fallaban) |
| Enlace de campus de una cuenta abierto con la sesión de Moodle de otra, sin cerrar sesión | Entraba como la cuenta anterior |
| Enlace del campus | Sin comprobante: cualquier enlace a `sso.php` servía |
| App: cierre normal y cambio de cuenta | Moodle quedaba con la cuenta anterior (reproducido en el teléfono) |
| App: cierre interrumpido (bloqueo, pérdida de conexión, proceso terminado) | El siguiente inicio entraba sin credenciales a la cuenta anterior |
| Acceso directo a Moodle (marcador, historial, pestaña abierta, botón "Atrás") | Mostraba la sesión anterior |

**Corrección sobre la Fase 4.9:** la reproducción en el portal que se describió en el documento 15 usaba `GET /auth/logout`, pero el cierre real del portal es un `POST` (botón "Salir"). En esta fase se repitió con el botón real; el defecto se confirmó (7 de 8 pruebas fallaron antes de la corrección; ver la sección 11).

## 5. Arquitectura anterior de sesiones

| Capa | Sesión | Cierre |
|---|---|---|
| Portal | Cookies httpOnly con tokens (BFF) | Borraba cookies y redirigía a `end_session` de Keycloak |
| App | `AuthState` cifrado, refresh token *offline* | Revocaba el token y abría `end_session` en una pestaña |
| Keycloak | Sesión del navegador (`KEYCLOAK_IDENTITY`) y sesiones *offline* | Solo con la redirección |
| Moodle | `MoodleSession`, abierta por `auth_oauth2` | **Nunca** |
| `sso.php` | Si había sesión, la reutilizaba; si no, mandaba a Keycloak | — |

## 6. Arquitectura corregida

1. **Entrada al campus con comprobante firmado.**
   - El backend firma un comprobante de un solo uso para la persona autenticada.
   - Moodle lo verifica y abre la sesión de esa persona exactamente.
   - Si hay otra sesión abierta, se cierra primero.
2. **Cierre coordinado en el servidor.** `POST /api/v1/me/logout` cierra la sesión de Keycloak y todas las de Moodle de esa persona desde el backend, sin depender del navegador.
3. **Nada se da por cerrado sin confirmación.**
   - Si Moodle no responde, el cierre queda pendiente en la base de datos y se reintenta.
   - Si Keycloak no responde, el portal y la app lo saben y exigen credenciales en el siguiente inicio.
4. **Siempre se piden credenciales.**
   - La app usa `prompt=login`.
   - El acceso directo a Moodle (`auth_oauth2`) también.
   - El portal lo hace tras un cierre no confirmado.

```
App/Portal ──(token)──► Backend ──firma HMAC──► enlace sso.php?ticket=…
                           │                         │
                           │                         ▼
                           │                Moodle verifica firma, vigencia,
                           │                uso único e identidad; cierra la
                           │                sesión ajena; abre la correcta
Cierre:  App/Portal ──► POST /me/logout ──► Keycloak: DELETE sesión (en línea u offline)
                                        └─► Moodle: local_iinicia_logout_user (todas las sesiones)
                                             └─ si falla: users.moodle_logout_pending_at → reintento cada 60 s
```

## 7. Cambios en `sso.php`

Archivos del plugin `moodle-custom/local/iinicia`, versión `2026112500` (0.2.0). **No se modificó Moodle Core.**

**El comprobante** es `base64url(JSON).base64url(HMAC-SHA256)`, con un secreto compartido `MOODLE_SSO_SECRET` (32 bytes aleatorios). El secreto va en los `.env` locales, nunca en el repositorio.
- `uid`: id de usuario de Moodle.
- `uuid`: id institucional (`users.id`, que en Moodle es `idnumber`).
- `sub`: sub de Keycloak (el nombre de usuario vinculado en `auth_oauth2_linked_login`).
- `want`: ruta local de destino.
- `iat`, `exp`: 60 s de vida.
- `jti`: 24 bytes aleatorios.
- No contiene tokens, contraseñas ni credenciales reutilizables.

**`classes/sso_ticket.php` (nuevo) verifica:**
1. la firma, con `hash_equals` (contra manipulación);
2. los tipos de los campos;
3. la vigencia: `exp` no vencido, `iat` con a lo sumo 30 s de adelanto y una vida máxima de 120 s;
4. la forma de `jti` y que `want` sea una ruta local, sin `//` inicial, barras invertidas ni espacios (contra la redirección abierta);
5. que el usuario esté activo (`deleted=0`, `suspended=0`, `auth=oauth2`) y que coincidan los tres identificadores: id de Moodle, `idnumber` = UUID y usuario vinculado = sub (contra la suplantación);
6. el uso único: inserta `jti` en la tabla nueva `local_iinicia_sso_ticket`, con índice único. Un segundo uso falla (contra la repetición). Las filas de más de un día se limpian de forma ocasional.

**Flujo de `sso.php`:**
- **Sin comprobante** (enlaces antiguos, marcadores): si hay una sesión abierta, se cierra, y se manda a Keycloak. Nunca se reutiliza.
- **Con comprobante válido:**
  - Si no hay sesión, o es de otra persona, se cierra la anterior (`require_logout`), se abre una sesión nueva (`\core\session\manager::start()`) y se entra con `complete_user_login`.
  - `complete_user_login` cambia el identificador de sesión, así que una sesión fijada de antemano no sirve (contra la fijación de sesión).
  - Al final se comprueba de nuevo que `$USER->id` sea el del comprobante.
- **Con comprobante inválido, vencido, usado o de otra identidad:** se cierra cualquier sesión y se muestra un error sin detalles.
- **CSRF:** quien abre el enlace no puede elegir la identidad, porque solo la firma del backend la fija. El riesgo de un enlace compartido está en la sección 18.

**Otros cambios del plugin:**
- **Servicio web nuevo `local_iinicia_logout_user`.** Requiere `local/iinicia:syncidentity`, actúa solo sobre usuarios `oauth2` y usa `\core\session\manager::kill_user_sessions`.
- **Proveedor de privacidad** que declara la tabla nueva.
- **`cli/setup.php`:** lee `MOODLE_SSO_SECRET` (error si tiene menos de 32 caracteres) y configura el emisor con `loginparams=prompt=login`.

**Defecto encontrado en el teléfono y corregido (`176f42f`):** sin `manager::start()`, el cambio desde la sesión de otra persona terminaba en la página de acceso de Moodle, porque `require_logout` deja la sesión inactiva.

## 8. Cierre de sesión coordinado

**Backend: `POST /api/v1/me/logout`.** Es la única ruta nueva; está autenticada, sin permiso adicional y responde 200.
- **Keycloak:** borra la sesión del token (`sid`) con la API de administración, `DELETE /admin/realms/iinicia/sessions/{sid}`, en línea y, si no existe, con `?isOffline=true`. Usa la cuenta de servicio del backend, que ya tenía `manage-users`.
- **Moodle:** `local_iinicia_logout_user` cierra todas las sesiones de la persona.
  - Si Moodle no responde, `users.moodle_logout_pending_at` (migración 007) registra el cierre pendiente.
  - `SyncService` lo reintenta cada 60 s.
- **Respuesta:** `{keycloak, moodle, complete}`. `complete` solo es verdadero si los dos confirmaron.
- **Auditoría:** se registra `auth.logout` con el detalle.

**Portal.**
- La ruta de cierre llama al backend desde el servidor.
- Si el cierre se confirmó, va a `/`.
- Si no:
  - guarda la cookie httpOnly `iin_reauth` (30 días), y el siguiente inicio agrega `prompt=login`;
  - redirige a `end_session` de Keycloak con `id_token_hint` como intento adicional.
- Siempre borra las cookies de sesión.
- El *callback* borra `iin_reauth`.

**App Android.**
- Ya no abre el navegador para cerrar sesión.
- `AuthManager.logout` llama al backend.
  - **Si confirmó:** revoca el refresh token, solo como limpieza.
  - **Si no confirmó** (sin red, servidor caído, proceso terminado): guarda cifrado el refresh token como `pending_logout`, sin revocarlo. Si se revocara, el reintento ya no podría pedir al backend que cierre Moodle.
  - En los dos casos, borra la sesión local y la caché.
- `retryPendingLogout`:
  - se ejecuta al abrir la app y después de cada inicio de sesión;
  - renueva con el token pendiente, pide el cierre al backend y revoca;
  - si Keycloak ya no reconoce el token (`invalid_grant`), la sesión ya no existe y se borra el pendiente.
- La pantalla de inicio de sesión avisa: "Cerraste sesión en este teléfono. El cierre en el servidor se completará cuando haya conexión."
- Todo inicio de sesión usa `prompt=login`. Una sesión residual del navegador nunca entra sola.

**Casos cubiertos:**

| Caso | Comportamiento |
|---|---|
| Cierre normal | Keycloak y Moodle confirman; auditoría `{"moodle":"ok","keycloak":"ok"}` |
| Pérdida de conexión, teléfono bloqueado o proceso terminado durante el cierre | La sesión local se borra. El cierre queda pendiente y se completa al volver a abrir la app con conexión. El siguiente inicio pide credenciales |
| Navegador cerrado | No influye: el cierre no usa el navegador |
| Moodle detenido | Keycloak se cierra y Moodle queda pendiente. Al volver Moodle, el reintento cierra sus sesiones (M1 a M8) |
| Keycloak detenido | Moodle se cierra y el cierre no se declara completo. El portal exige credenciales. Keycloak, al volver, pide la contraseña y no entra solo (K1 a K8) |

## 9. Investigación de `offline_access`

Medido en el Keycloak real del proyecto, 26.4.7, realm `iinicia`, con cuentas demo y `curl`:

| | Con `offline_access` (actual) | Sin `offline_access` |
|---|---|---|
| Sesión del navegador tras el canje del código | **Se elimina** (sesiones en línea 5 → 4, *offline* 2 → 3) | Se conserva |
| Tipo de refresh token | `Offline`, sin `exp` (inactividad *offline* de 30 días) | `Refresh`, vence a los 30 min de inactividad (máximo de 10 h) |
| Entrar a Moodle desde la app sin comprobante | Segunda contraseña (causa confirmada de R5) | Sin contraseña, pero reutilizando la sesión del navegador |
| La app sin uso durante más de 30 min | Sigue con sesión | Pide credenciales |

**Otras mediciones:**
- `DELETE /admin/realms/iinicia/sessions/{sid}?isOffline=true` devuelve 204, y la renovación posterior falla con 400.
- Con una sesión residual del navegador y `prompt=login`, Keycloak muestra la reautenticación de la cuenta anterior: solo la contraseña, el nombre visible y "Reiniciar" (`#reset-login`). No entra solo.
- Si otra persona inicia sesión en el mismo navegador, Keycloak termina la sesión anterior.

**Decisión: se conserva `offline_access`.**
- Quitarlo obligaría a iniciar sesión cada 30 min de inactividad, o a ampliar la duración de los tokens, lo que está prohibido.
- No resolvía el defecto: la sesión del navegador seguiría compartida entre cuentas.
- Con el comprobante firmado, la entrada al campus ya no depende de la sesión del navegador de Keycloak. Eso elimina también la segunda contraseña (R5) sin debilitar nada.
- No se cambiaron duraciones, PKCE, MFA, firmas ni rotación.

## 10. Decisiones sobre tokens

- **Ningún token, contraseña ni credencial reutilizable va en una URL.** El comprobante es de un solo uso, dura 60 s, solo abre Moodle y no sirve contra la API ni contra Keycloak.
- La identidad del comprobante la fija el backend a partir del token validado, nunca a partir de datos del navegador.
- El secreto del comprobante está separado de los secretos de OAuth; para rotarlo basta con cambiar `MOODLE_SSO_SECRET` y ejecutar `cli/setup.php`.
- **App:**
  - El refresh token pendiente se guarda con el mismo almacén cifrado (Keystore) que la sesión. No se reutiliza para entrar: solo para completar el cierre.
  - La rotación de refresh tokens sigue estricta. Los tokens usados en el reintento se rotan y se revocan.
- **Proceso terminado durante una renovación (A16, R4):**
  - **Falla de forma segura:** Keycloak rechaza el token anterior, la app borra la sesión y pide credenciales. Nunca entra con otra cuenta.
  - La corrección completa (guardar el estado antes de usar el token nuevo, o valorar `refreshTokenMaxReuse`) queda para la Fase 5.
- No se agregaron dependencias nuevas: ni Room, ni Firebase, ni bibliotecas de terceros.

## 11. Pruebas de aislamiento

**Antes de la corrección** (`30d4710`, `e2e/tests/session-isolation.spec.ts`, mismo contexto de navegador, cierre real con "Salir"): **7 fallaron y 1 pasó**. Evidencia: `evidencias/aislamiento-sesiones-antes.txt`.

**Después** (cada prueba comprueba la identidad real en Moodle, en la página `/user/profile.php`, no solo el nombre del menú):

| Prueba | Resultado |
|---|---|
| Estudiante → profesor | Correcto |
| Profesor → estudiante | Correcto |
| Superadmin → estudiante | Correcto |
| Estudiante → superadmin | Correcto |
| Estudiante A → estudiante B (cuenta de prueba "Prueba alumnob") | Correcto |
| Sin sesión: acceso directo a Moodle no muestra a nadie | Correcto |
| Enlace del profesor con la sesión de Moodle del estudiante abierta, sin cerrar sesión | Correcto: queda exactamente "Demo Docente" |
| Comprobante usado dos veces, manipulado o vencido | Correcto: no abre sesión |

Resultado: **8 de 8** (`evidencias/aislamiento-sesiones-despues.txt`).

**Fallas de servicios** (`e2e/session-failures.mjs`): detiene y arranca contenedores con `docker compose stop/start`, sin recrearlos, por eso no está en la suite normal. Resultado: **17 de 17** (`evidencias/cierre-con-fallas.txt`).
- M1 a M8: cierre con Moodle detenido, cierre pendiente, reintento y cambio a profesor.
- K1 a K8: cierre con Keycloak detenido, reautenticación sin entrada automática, y portal y Moodle con el profesor.
- Una comprobación extra para el formulario de reautenticación.

**Pruebas unitarias nuevas:**
- **Backend** (`test/sessions.test.ts`):
  - comprobante: contenido, firma, uso único, redirección abierta, sin secretos;
  - resultado del cierre: normal, Moodle caído y reintento, Keycloak caído, sin `sid`, aspirante sin Moodle;
  - manejador de error del *pool* de PostgreSQL.
- **Portal** (`test/logout-policy.test.ts`): 4 pruebas de la política de reautenticación.
- **Android** (`SessionIsolationTest`): 11 pruebas.
  - cierre confirmado y no confirmado;
  - pendiente conservado al cambiar de cuenta;
  - reintento correcto, sin red y con sesión inexistente;
  - otra cuenta no ve la caché;
  - `prompt=login`;
  - aviso en pantalla.
- **Android instrumentada:** `interruptorDeNotificacionesConNombre` (sección 13).

**Contratos:** la ruta nueva se agregó a una lista explícita de rutas aprobadas en `test/contracts/api.contract.test.mjs`. Todas las anteriores deben seguir existiendo con el mismo permiso, código y límites. No se cambió ninguna ruta de `/api/v1`.

## 12. Resultados en el teléfono físico

**Dispositivo:** ZTE 9000, Android 10 (API 29), Brave como navegador predeterminado.
- La app IINICIA debug se actualizó con `adb install -r`, conservando los datos, sin desinstalar nada.
- Conexión por `adb reverse` (4000, 8180, 8081 y 3000); el backend siguió en `127.0.0.1`.
- Se usó la depuración de Brave por USB solo para leer la identidad de las pestañas de `localhost`.
- Las contraseñas de las cuentas demo se escribieron por ADB y no se registraron.

| Prueba | Resultado |
|---|---|
| Inicio de sesión | Correcto. Keycloak pide credenciales siempre (`prompt=login`) |
| Campus desde la app (estudiante y profesor) | Correcto, **sin segunda contraseña**; Moodle muestra la identidad correcta |
| Cambio estudiante → profesor → estudiante en la app, con el APK final | Correcto: cada vez, Moodle muestra exactamente a la cuenta actual ("Demo Docente", luego "Demo Estudiante") |
| Enlace del profesor con pestañas de Moodle del estudiante abiertas en Brave | Correcto: todas las pestañas pasan a "Demo Docente" (tras la corrección `176f42f`) |
| Cierre normal | Correcto: auditoría `{"moodle":"ok","keycloak":"ok"}`, sin errores |
| Acceso directo a Moodle en Brave tras cerrar sesión | Sin sesión |
| Cierre interrumpido (backend detenido durante el cierre) | Correcto: aviso en la pantalla de inicio de sesión; al reabrir con conexión, el cierre se completa (auditoría correcta, sesión *offline* de Keycloak eliminada, Moodle sin sesión) |
| Sin sesiones anteriores tras cambiar de cuenta | Correcto: el perfil y los datos son de la cuenta nueva |
| A17: actualizar al volver del segundo plano | Correcto: un aviso nuevo apareció al volver tras 65 s |
| Fecha sin conexión | Correcto: "…guardada el 25 nov 2026 2:43 p. m." (sin doble punto) |
| *Deep links* `iinicia://curso/3` e `iinicia://notificaciones` | Correcto |
| Notificaciones del sistema | Correcto: 2 notificaciones presentes |
| Recuperación tras una falla de conexión | Correcto: al restaurar la conexión, deslizar para actualizar quitó el aviso y cargó los datos actuales |
| Android 8, 12 y 13+ | **Pendiente:** no hay dispositivo ni imagen de esas versiones |

**Defectos que solo aparecieron en el teléfono, ya corregidos:**
1. La primera versión del cierre no confirmado revocaba el refresh token. Al quitar `adb reverse`, las conexiones abiertas siguen vivas, y la revocación llegaba a Keycloak aunque el backend no respondiera. El reintento encontraba la sesión inexistente y nunca cerraba Moodle. Ahora no se revoca sin confirmación del backend (`87d3e1c`).
2. El cambio desde una sesión ajena terminaba en la página de acceso de Moodle (sección 7, `176f42f`).

**Configuración del teléfono restaurada al terminar:**
- pantalla activa por USB: `stay_on_while_plugged_in` volvió a 0;
- se retiraron la redirección de depuración de Brave y todas las reglas de `adb reverse`;
- la accesibilidad no se modificó: `accessibility_enabled=0` y `touch_exploration_enabled=0`, como estaban.

Quedaron abiertas, en Brave, las pestañas de prueba de `localhost`; puedes cerrarlas.

## 13. Resultados de TalkBack

**TalkBack no está instalado en el teléfono.** No existe el paquete `com.google.android.marvin.talkback` (Android Accessibility Suite), y el sistema solo tiene 3 servicios de accesibilidad ajenos a lectores de pantalla.
- Instalarlo requiere instalar una aplicación, algo que no está autorizado, así que **la prueba manual con TalkBack queda pendiente**.
- Para hacerla, se necesita tu autorización para instalar Android Accessibility Suite desde Play Store.
- El emulador tampoco tiene TalkBack.

**Revisión sustituta:** en el teléfono se revisó el árbol de accesibilidad, que es lo que lee TalkBack, con `uiautomator`, pantalla por pantalla:
- inicio de sesión;
- Inicio, Cursos, detalle de curso, Avisos y Perfil;
- barra de navegación.

Se comprobó que cada elemento interactivo tenga un nombre.

| Pantalla | Elementos interactivos | Sin nombre |
|---|---|---|
| Inicio de sesión | 1 | 0 |
| Inicio | 6 | 0 |
| Cursos | 4 | 0 |
| Detalle de curso | 9 | 0 |
| Avisos | 5 | 0 |
| Perfil | 5 | **1 → 0** |

**Defecto encontrado y corregido:** en Perfil, el interruptor de notificaciones no tenía nombre propio. "Notificaciones" era un texto aparte, y TalkBack habría leído solo "Activado, interruptor".
- Ahora toda la fila es el interruptor (`Modifier.toggleable` con `Role.Switch`), y se lee "Notificaciones, activado, interruptor". Además, el área táctil abarca toda la fila.
- Lo cubre la prueba instrumentada `interruptorDeNotificacionesConNombre`.
- Se verificó en el teléfono con el APK nuevo.

**Observación:** la pestaña activa aparece como "seleccionada" y no como pulsable. TalkBack la anuncia como seleccionada; es el comportamiento esperado.

**Pendiente con TalkBack real:** orden del foco, anuncio de los estados de carga y de error (las regiones en vivo ya están declaradas), los diálogos y el aviso de cierre pendiente.

## 14. Diagnóstico de PostgreSQL

Diagnóstico **no destructivo**: no se eliminaron contenedores, volúmenes, bases de datos ni respaldos.

**Lo que se comprobó:**
- **Contenedor:** `RestartCount` 0, `OOMKilled` false, sin límite de memoria, `shm` de 64 MB.
- **Docker:** máquina virtual de 8 GB y 4 CPU, 6,4 GB disponibles, presión de memoria 0.
- **Windows:** 15,9 GB de RAM, con unos 2,4 GB libres durante las pruebas. Android Studio y Gradle ocupaban unos 3,5 GB.
- **Disco:** 262 GB libres.
- **Integridad:** `pg_dump` de `portal`, `keycloak` y `moodle` (12, 13 y 59 MB) terminó sin errores. Los datos están completos: 19 usuarios, 4 programas, 1 490 registros de auditoría y 7 migraciones.
- **Configuración:** `logging_collector` desactivado y `data_checksums` desactivado.

**Causa de las 3 recuperaciones de la Fase 4.9: no se puede determinar.**
- Los registros completos se perdieron: el contenedor se recreó a las 19:28 por un `docker compose up` de esta fase.
- Solo quedan las líneas capturadas entonces: `could not send data to client: Broken pipe` seguida de `server process exited with exit code 2`, tres veces.
- No hay evidencia de falta de memoria (no hubo `OOMKilled`) ni de corrupción.

**Hallazgo y corrección:** al recrearse PostgreSQL, el backend terminó por completo por un error no manejado del *pool* de `pg` ("terminating connection due to administrator command"). Ahora los dos *pools* tienen un manejador de errores, con su prueba. Desde entonces se usa `docker compose up --no-deps` para no recrear PostgreSQL ni Keycloak.

**Recomendaciones para la Fase 6:**
- guardar los registros de PostgreSQL de forma persistente (`logging_collector` o un volumen);
- definir `shm_size` y límites de memoria;
- usar `--no-deps` en los scripts;
- agregar monitoreo;
- fijar la memoria de WSL con `.wslconfig`.

## 15. Correcciones menores

- **A17:** las listas se actualizan al volver del segundo plano si los datos tienen más de 60 s (`Freshness` y `LifecycleEventEffect(ON_RESUME)` en las 5 pantallas).
- **Doble punto en la fecha:** `savedCopyNotice` quita el punto final de "p. m.".
- **Accesibilidad:** el interruptor de notificaciones ahora tiene nombre (sección 13).
- **Backend:** no termina si PostgreSQL cierra conexiones inactivas (sección 14).
- **Acceso directo a Moodle:** siempre pide credenciales (`loginparams=prompt=login`).

## 16. Resultados automatizados

Ejecutados el 25/11/2026 sobre el código final de la rama:

| Conjunto | Resultado | Mínimo de referencia |
|---|---|---|
| Backend: unitarias | 55 de 55 | 43 |
| Backend: integración | 8 de 8 | 8 |
| Backend: contratos | 55 de 55 | 54 |
| Backend: `typecheck` y `build` | Correctos | — |
| Portal: `node --test` y Vitest | 9 de 9 y 50 de 50 | 5 y 50 |
| Portal: `typecheck`, `eslint` y `build` | Correctos (0 errores y 0 avisos de lint) | — |
| E2E (Playwright, suite completa) | 89 de 89 (20,2 min; 81 anteriores y 8 de aislamiento) | 81 |
| E2E de fallas de servicios (`session-failures.mjs`) | 17 de 17 | — |
| Android: unitarias | 67 de 67 | 56 |
| Android: instrumentadas (emulador Pixel 7, Android 17) | 13 de 13 | 12 |
| Android: lint | 0 errores y 16 avisos (sin cambios) | — |
| `npm audit --omit=dev` (backend, portal y e2e) | 0 vulnerabilidades | — |

## 17. Commits realizados

| Commit | Contenido |
|---|---|
| `30d4710` | Pruebas E2E que reproducen el defecto (fallan antes de la corrección) |
| `c9bee8b` | Moodle: comprobante firmado de un solo uso en `sso.php`; nunca reutiliza la sesión de otra cuenta |
| `fc27ba8` | Backend: firma del comprobante y cierre coordinado (`POST /api/v1/me/logout`) |
| `3cc9b31` | Portal: cierre coordinado en el servidor y credenciales obligatorias tras un cierre no confirmado |
| `3e18ffc` | Android: cierre coordinado sin navegador, credenciales siempre, actualización al volver |
| `6e78e45` | Moodle pide credenciales en el acceso directo; el backend sobrevive al cierre de conexiones de PostgreSQL |
| `1b8c950` | E2E: cambio de cuenta tras un cierre con Moodle o Keycloak detenidos (17 de 17) |
| `87d3e1c` | Android: el cierre no confirmado conserva el token para el reintento en lugar de revocarlo |
| `176f42f` | Moodle: el cambio desde la sesión abierta de otra persona abre la nueva |
| `0a55f97` | Android: el interruptor de notificaciones tiene nombre accesible |
| `b099123` | Este documento, documentos 04, 05, 12 y 15, índice, inventario de endpoints y OpenAPI, y capturas regeneradas por la suite E2E |

No se reescribió el historial ni se subió nada a remotos.

## 18. Riesgos pendientes

*Estado al terminar la Fase 4.10. Los riesgos 1, 2, 3 y 6 se revisaron en la Fase 4.11 (sección siguiente).*

1. **Reautenticación con el nombre anterior (baja).** Si Keycloak estaba caído durante el cierre, queda la sesión del navegador. El siguiente inicio muestra la reautenticación de la cuenta anterior: nombre visible, contraseña obligatoria y opción "Reiniciar". No da acceso, pero revela el nombre de usuario anterior en un equipo compartido.
2. **Enlace de campus compartido durante 60 s (baja).** El comprobante identifica a quien lo pidió. Si esa persona lo comparte antes de usarlo, quien lo abra entra como ella (*login CSRF* o entrega voluntaria). Lo mitigan el uso único y los 60 s de vida. Para la Fase 5: valorar ligarlo al navegador o al dispositivo.
3. **Cerrar sesión en un dispositivo cierra Moodle en todos (decisión).** `kill_user_sessions` cierra todas las sesiones de Moodle de la persona. Es lo más seguro; el costo es volver a entrar al campus en los otros dispositivos.
4. **A16 / R4 · Proceso terminado durante una renovación.** Falla de forma segura (pide credenciales). La corrección completa queda para la Fase 5.
5. **Android 8, 12 y 13+ sin probar.** Siguen pendientes, como se acordó.
6. **TalkBack sin probar en el dispositivo.** No está instalado; se necesita autorización para instalar Android Accessibility Suite (sección 13).
7. **PostgreSQL:** la causa de las recuperaciones de la Fase 4.9 no se pudo determinar porque los registros ya no existen. Las recomendaciones están en la sección 14, para la Fase 6.
8. **Integración:** la corrección vive en `fix/cross-account-session-isolation`. Falta integrarla en `refactor/android-modular-architecture` y después en `main`, con tu autorización.

## 19. Procedimiento de recuperación

- **Volver al estado anterior:** `git revert` de los commits de la sección 17, en orden inverso, en la rama. El historial no se reescribe.
- **Moodle:**
  - La versión `2026112500` solo agrega la tabla `local_iinicia_sso_ticket` y un servicio web. Se pueden dejar al revertir el código.
  - Si se revierte `sso.php`, vuelve el defecto crítico. No se recomienda sin otra protección.
  - Después de cambiar el plugin: `docker compose up -d --no-build --no-deps moodle moodle-cron`, la actualización de Moodle y `cli/setup.php`.
- **Base de datos del portal:** la migración 007 solo agrega la columna `users.moodle_logout_pending_at` y un índice parcial. No hace falta revertirla.
- **Secreto `MOODLE_SSO_SECRET`:**
  - para rotarlo, generar uno nuevo en los `.env` del backend y de la infraestructura y ejecutar `cli/setup.php` en Moodle;
  - los enlaces emitidos antes dejan de servir (duran 60 s).
- **App:**
  - una versión anterior ignora `pending_logout` en el almacén cifrado;
  - para volver: `git switch` a la rama anterior, `./gradlew assembleDebug` y `adb install -r`.
- **Teléfono:** no queda ningún ajuste de prueba (sección 12) y no se tocaron otras aplicaciones.

---

# Fase 4.11: Validación final de seguridad SSO y accesibilidad

Misma rama, desde `b099123`, el 25/11/2026. Alcance limitado: el comprobante de entrada al campus, el cierre de sesión coordinado, la cuenta anterior visible en Keycloak, TalkBack real y la validación final en el teléfono. No es una refactorización general, la Fase 5 no ha comenzado y la Fase 4 no se integró en `main`.

## 4.11.1 Modelo de amenazas del comprobante

**Análisis del comprobante de la Fase 4.10**, antes de cambiar código:

| Aspecto | Cómo era | Observación |
|---|---|---|
| Generación | `GET /api/v1/me/campus-link`, con el token de la sesión (portal por el BFF; app con su token) | La identidad sale de la base del portal, nunca del cliente |
| Firma | HMAC-SHA256 con `MOODLE_SSO_SECRET` | Correcta; impide manipularlo |
| Almacenamiento | El backend no lo guarda; Moodle guarda el `jti` al usarlo | Correcto |
| Transporte | En la URL (`sso.php?ticket=…`), por el navegador | Visible en la barra, el historial, los registros del servidor web y al copiar el enlace |
| Consumo | `sso.php` verifica y abre la sesión | **Bastaba con tener la URL** |
| Expiración | 60 s | Corta, pero no impide usarlo antes de ese plazo |
| Revocación | No había | Seguía sirviendo después de cerrar sesión |
| Relación con la sesión de IINICIA | Ninguna (no llevaba el `sid`) | Sobrevivía al cierre y al cambio de cuenta |
| Web y Android | Mismo enlace en ambos (el portal lo abría con `window.location`; la app, en una Custom Tab) | En los dos casos el enlace solo era suficiente |

**Conclusión:** el comprobante era una **credencial al portador transferible**. Quien obtuviera un enlace aún no usado entraba como su dueño.

Amenazas consideradas:
- enlace copiado, compartido por chat o en pantalla, o leído en el historial, en registros o en el Referer;
- intercambio de sesión (*login CSRF*): hacer que la víctima entre con la cuenta del atacante;
- repetición y canjes simultáneos;
- manipulación del contenido;
- redirección abierta;
- uso después de cerrar sesión o de cambiar de cuenta.

## 4.11.2 Riesgo de transferencia

Las pruebas nuevas (`e2e/tests/campus-ticket.spec.ts`) lo confirmaron **antes de la corrección**. Fallaron 6 de 12 (`evidencias/comprobante-antes.txt`):
- copiado a otro navegador;
- copiado a otro dispositivo;
- usado desde otra cuenta;
- destinatario incorrecto;
- emitido antes de cerrar sesión;
- cambio de cuenta antes de canjearlo.

En todos esos casos Moodle quedaba con la sesión del dueño. La protección contra la repetición (el `jti` de un solo uso) no protegía contra la transferencia **antes** del primer uso.

## 4.11.3 Alternativas evaluadas

| Alternativa | Decisión |
|---|---|
| Acortar la vida del comprobante | Descartada: no impide la transferencia, solo la acota |
| Ligarlo a la IP, el User-Agent o el identificador del dispositivo | Descartada: es una protección débil (NAT, redes móviles, valores falsificables) y está excluida por el requerimiento |
| Entrar solo por OIDC (Moodle como cliente de Keycloak, con la sesión del navegador) | Es el respaldo: `sso.php` sin parámetros sigue ese camino, con `prompt=login`. No sirve como solución única: en la app, el canje con `offline_access` borra la sesión del navegador (segunda contraseña), y `auth_oauth2` no permite exigir la identidad esperada sin tocar Moodle Core |
| Intercambio de tokens (RFC 8693) o transferencia de sesión de Keycloak hacia Moodle | Requiere cambios en `auth_oauth2` (Moodle Core) o un cliente nuevo: cambio arquitectónico mayor |
| Prueba de posesión (DPoP o claves en el navegador) | Una navegación de primer nivel hacia Moodle no puede firmar con una clave sin código en la página; complejidad desproporcionada |
| Enviar el comprobante por POST (`form_post`) | Reduce su presencia en registros, pero las Custom Tabs no envían POST y no impide la transferencia |
| **Vincular el canje al navegador que inició la entrada, con una cookie de Moodle** | **Elegida.** Es el mismo patrón que el parámetro `state` de OAuth y la vinculación del código de autorización al agente de usuario. No agrega criptografía propia: un valor aleatorio de 256 bits, SHA-256 y el HMAC existente |

## 4.11.4 Solución seleccionada

La entrada al campus tiene ahora dos pasos:

```
Portal:  botón → BFF campus-link (sin bind) → Moodle sso.php?start=1&courseId=…
         Moodle: cookie IINICIA_SSO_BIND=n (aleatoria, HttpOnly, SameSite=Lax, ruta /local/iinicia/, 5 min)
         → portal /auth/campus?bind=n (el servidor del portal pide al backend, con el token de la sesión)
         → backend: comprobante v2 con bnd = SHA-256(n) y sid → Moodle sso.php?ticket=…
         Moodle: solo lo acepta si el navegador trae la cookie n → abre la sesión → redirección limpia al curso
App:     botón → API campus-link (sin bind) → la app agrega client=app y un state aleatorio propio
         (cifrado, con dueño, 5 min, un solo uso) → Custom Tab: sso.php?start → cookie n
         → iinicia://campus?bind=n&state=… → la app comprueba su state → API campus-link?bind=n
         → Custom Tab (mismo navegador, con la cookie) sso.php?ticket=… → sesión → redirección limpia
```

- **Sin rutas nuevas en `/api/v1`.** `GET /me/campus-link` acepta un parámetro opcional `bind`, aprobado solo para esa ruta en las pruebas de contrato.
- **Portal:** ruta nueva `/auth/campus`, de servidor. No cambia ninguna URL pública existente.
- **App:** `CampusLinks` (datos) y `CampusViewModel`. La pantalla solo pasa la vuelta de Moodle al ViewModel y no hace solicitudes.
- **Moodle:** plugin `2026112600` (0.3.0). No hay cambios en Moodle Core.
- **Sin segunda contraseña**, ni en el portal ni en la app: ningún paso pasa por Keycloak. Se verificó en el teléfono, en Brave, sin avisos: unos 1,2 s desde el toque hasta el campus.

## 4.11.5 Vinculación de la autenticación

Moodle verifica el comprobante **v2** en este orden:
1. **Firma:** HMAC-SHA256 comparado con `hash_equals`.
2. **Estructura:** `v=2` y los tipos de cada campo.
3. **Consumo atómico del `jti`:** se inserta en una tabla con índice único. Esto ocurre **antes** de las demás comprobaciones, así que un enlace que se intenta en otro navegador queda inutilizado también para su dueño.
4. **Emisor y propósito:** `iss = iinicia-backend`, `aud = wwwroot` de este Moodle (destinatario esperado) y `purpose = campus-entry`.
5. **Vigencia:** `exp`, `iat` con a lo sumo 30 s de adelanto y una vida máxima de 120 s.
6. **Destino:** `want`, solo rutas locales.
7. **Vinculación:** el SHA-256 de la cookie del navegador debe ser igual a `bnd`.
8. **Revocación:** el comprobante debe haberse emitido después del último cierre de sesión de la persona.
9. **Identidades:** usuario Moodle activo y `oauth2`, `idnumber` igual al UUID institucional, y usuario vinculado igual al sub de Keycloak.

Después:
- si hay una sesión de otra persona, se cierra y se abre la correcta;
- se vuelve a comprobar `$USER->id`;
- se redirige al destino (URL limpia, sin el comprobante).

**El backend** solo emite comprobantes si:
- la sesión de Keycloak del token (`sid`) **no** está cerrada (tabla `session_revocations`, migración 008);
- el valor de vinculación tiene el formato esperado;
- el curso o la actividad son de la persona.

**La app** solo pide el comprobante si la vuelta de Moodle trae el `state` que ella generó:
- una página que abra `iinicia://campus` no consigue nada (comprobado en el teléfono: "No se pudo abrir el campus. Vuelve a intentarlo desde la app.");
- el `state` caduca a los 5 minutos;
- se borra al cerrar sesión y debe ser de la misma cuenta.

**Transferencia comprobada en un dispositivo real:**
- se obtuvo en la computadora el enlace con comprobante del profesor y se abrió en el Brave del teléfono;
- Moodle mostró error y el teléfono quedó sin sesión (no como profesor);
- se cierra cualquier sesión ante un comprobante rechazado (falla cerrada).

## 4.11.6 Protección contra reutilización y concurrencia

- **Uso único:** índice único sobre `jti`, insertado antes de cualquier otra comprobación.
- **Dos canjes simultáneos** (prueba 7): dos conexiones independientes, con la cookie de vinculación y sin sesión de Moodle, al mismo tiempo. Exactamente una entra; la otra recibe "ya se usó". Lo garantiza la base de datos, no el orden de llegada.
- **Manipulación** (prueba 8): cambiar cualquier campo invalida la firma.
- **Redirección abierta** (prueba 14): ni `//evil.example`, ni `https://evil.example/`, ni `/\evil.example` salen de Moodle, aunque estén bien firmados.
- **Destino fijo en el paso `start`:** el portal sale de la configuración de Moodle (`PORTAL_PUBLIC_URL`, vía `cli/setup.php`) y la app tiene un esquema constante. Nada sale de la URL.

## 4.11.7 Revocación de comprobantes

- **Al cerrar sesión**, el backend registra el `sid` cerrado, así que no emite más comprobantes para esa sesión aunque su token de acceso no haya vencido.
- **Moodle** (`local_iinicia_logout_user`, parámetro `before`):
  - guarda la hora del cierre en `local_iinicia_revocation`;
  - rechaza los comprobantes emitidos hasta esa hora;
  - cierra las sesiones abiertas hasta entonces.
- **Si Moodle estaba caído**, el reintento usa la hora del cierre original, registrada en el servidor.
- **Cierre pendiente de la app:** el corte es la hora del servidor al recibirlo. **Defecto encontrado en el teléfono y corregido** (`8e3a4db`):
  - la primera versión aceptaba la hora del teléfono;
  - el reloj del ZTE iba **77 s atrasado**, así que el corte quedaba antes del cierre real;
  - la sesión de Moodle del profesor, abierta justo antes de salir, **sobrevivía**;
  - ahora no se acepta ninguna hora del cliente;
  - se repitió en el teléfono: el estudiante entra al campus, sale sin conexión y la app se reabre; quedan 0 sesiones de Moodle y Brave queda sin sesión.
- **Pruebas:**
  - 10: emitido antes de cerrar sesión;
  - 11: cambio de cuenta antes del canje;
  - M7b: emitido antes de un cierre con Moodle caído;
  - K3b: emitido antes de un cierre con Keycloak caído;
  - todos rechazados.

**Revisión de `POST /api/v1/me/logout`:**

| Punto | Resultado |
|---|---|
| Autenticación | Token obligatorio (guardia global); actúa solo sobre la persona del token |
| CSRF en el portal | Solo POST desde el servidor del portal, que exige `Origin` igual al del portal; el navegador nunca ve el token |
| Idempotencia | Repetirlo devuelve un cierre completo y no duplica nada (prueba unitaria; Keycloak responde 404 en las dos variantes, lo que cuenta como ya cerrado) |
| Revocación | Keycloak: sesión del `sid` (en línea u offline). Moodle: sesiones hasta la hora del cierre y comprobantes emitidos hasta entonces |
| Reintentos persistentes | En la base de datos (`moodle_logout_pending_at`, `session_revocations`), cada 15 s, y sobreviven a reinicios del backend |
| Recuperación tras reiniciar servicios | M1 a M8 y K1 a K8 (22 de 22) |
| Un reintento antiguo no invalida una sesión nueva | Keycloak: el reintento cierra solo ese `sid`; una sesión nueva tiene otro. Moodle: corte con la hora del cierre original (si Moodle estaba caído). En el caso de la app, un reintento tardío puede cerrar una sesión de Moodle que la **misma persona** abrió entre el nuevo inicio de sesión y el reintento: hay que volver a entrar al campus, nunca afecta a otra persona |
| Nuevo inicio de sesión con un cierre pendiente | App: el cierre pendiente se guarda aparte y se completa con su propio token (sesión antigua), al abrir la app y tras el nuevo inicio; la sesión nueva no se toca. Portal: `iin_reauth` exige credenciales, y el backend cierra la sesión antigua de Keycloak cuando vuelve |
| Sin acceso a la cuenta anterior | Comprobado en E2E (8 pruebas de aislamiento y 12 del comprobante) y en el teléfono |
| Nunca se declara completo sin confirmación | `complete` solo es verdadero si Keycloak y Moodle confirmaron; si Keycloak no responde, el paso queda como `pendiente` |

## 4.11.8 Política de múltiples dispositivos

**Capacidades reales:**
- **Keycloak identifica cada sesión** (`sid`, en línea u offline) y permite cerrarla individualmente. Cerrar sesión en IINICIA **ya cierra solo la sesión de ese dispositivo**: las otras sesiones de la app o del portal de la misma persona siguen abiertas.
- **Moodle tiene una sesión por navegador**, pero sin relación con el dispositivo ni con la sesión de IINICIA:
  - `auth_oauth2` no guarda el `sid`;
  - una entrada directa por OIDC no pasa por el comprobante.

**Política actual, que se conserva por segura:** al salir de IINICIA se cierran **todas** las sesiones de Moodle de la persona abiertas hasta ese momento, en cualquier dispositivo.
- **Consecuencia:** en otro dispositivo, la app o el portal siguen con sesión, pero el campus pide volver a entrar (sin contraseña, con un comprobante nuevo).
- No se debilita el aislamiento entre personas.

**Para la Fase 5:**
- registrar, al canjear el comprobante, la relación entre el `sid` de Keycloak y la sesión de Moodle, para poder cerrar solo la del dispositivo;
- ofrecer "Cerrar sesión en todos los dispositivos" (Keycloak: cierre de todas las sesiones del usuario).

## 4.11.9 Cuenta anterior visible en Keycloak

- **Antes:** si Keycloak estaba detenido durante el cierre, la sesión del navegador quedaba viva. El siguiente inicio de sesión mostraba la reautenticación con el nombre de la cuenta anterior (sin acceso).
- **Ahora:** el backend registra el `sid` sin confirmar y lo cierra en Keycloak cuando vuelve (reintento cada 15 s; auditoría `auth.logout_keycloak_retry`).
  - Con la sesión ya cerrada, Keycloak muestra el formulario normal, sin nombre (K4b y K4c).
  - No se tocaron MFA ni las políticas de autenticación.
- **Riesgo residual (bajo):** si alguien inicia sesión en el intervalo entre que Keycloak vuelve y el primer reintento (hasta unos 15 s), todavía puede ver el nombre anterior. Sigue sin acceso: se pide la contraseña y se puede reiniciar.

## 4.11.10 Prevención de exposición accidental

| Lugar | Resultado |
|---|---|
| Registros de NestJS | Sin comprobantes ni valores de vinculación (0 coincidencias): el backend no registra URLs ni cuerpos |
| Registros de Moodle (eventos) | 0 coincidencias en `logstore_standard_log` |
| Registro de accesos de Apache (Moodle) | **Antes:** 62 líneas con `sso.php?ticket=…`. **Ahora** (`c533ca7`): `sso.php` se registra sin la consulta ni el Referer (`?[consulta omitida]`); el resto de Moodle, igual. Las líneas anteriores desaparecieron con el contenedor |
| Registros de Keycloak | 0 coincidencias: el comprobante no pasa por Keycloak |
| Portal (Next.js) | No registra solicitudes; `/auth/campus` y sus errores no muestran el valor de vinculación |
| Historial del navegador | Las URL con `bind` o `ticket` son saltos de redirección y pueden quedar en el historial interno. **Limitación aceptada:** el comprobante ya se consumió, está vinculado a otra cookie y vence en 60 s; el valor de vinculación solo sirve con la cookie HttpOnly de ese navegador, que se borra al usarse |
| Referer | `Referrer-Policy: no-referrer` en `sso.php` y `/auth/campus`; la página final del curso tiene una URL limpia |
| Caché | `Cache-Control: no-store` en `sso.php`, `/auth/campus` y el BFF |
| Analítica | El portal y Moodle no tienen herramientas de analítica |
| Mensajes de error | Genéricos; Moodle no muestra depuración (solo con `MOODLE_DEBUG=true`, desactivado) y el portal escapa el mensaje |
| Capturas y evidencias | 0 comprobantes en `documentation/evidencias`; `e2e/test-results` y el reporte HTML están excluidos de Git. Las capturas del teléfono se tomaron solo con IINICIA en primer plano; una captura accidental de la pantalla de inicio se borró sin usarse |

## 4.11.11 Resultados de TalkBack

**Instalación:**
- Android Accessibility Suite 17.1 se instaló desde Play Store; tú confirmaste la instalación y el editor Google LLC.
- TalkBack se activó por ADB y, al terminar, la configuración de accesibilidad volvió a sus valores originales: `enabled_accessibility_services` idéntico, `accessibility_enabled=0` y `touch_exploration_enabled=0`.
- La aplicación queda instalada (no se autorizó desinstalarla).

**Prueba real**, en 5 rondas: tú hiciste los gestos de TalkBack (deslizar para recorrer, doble toque para activar) y escuchaste los anuncios. Yo verifiqué con capturas del foco de TalkBack (recuadro verde) y con la auditoría del servidor.

| Ronda | Contenido | Resultado |
|---|---|---|
| 1 | Inicio completo, barra de navegación, lista de cursos, detalle del curso y "Volver" | Correcto |
| 2 | Avisos ("Nuevo" y texto), Perfil, **interruptor de notificaciones** (un solo elemento con nombre y estado; desactivar y volver a activar) y diálogo "¿Cerrar sesión?" con "Cancelar" | Correcto |
| 3 | Sin conexión: "Cargando", aviso amarillo leído automáticamente y completo, mensaje de error al tocar "Entrar al Campus" | Correcto |
| 4 | Cierre de sesión confirmado en el diálogo (auditoría `{"moodle":"ok","keycloak":"ok"}`), pantalla de inicio de sesión y botón "Iniciar sesión" hasta el formulario de Keycloak (cliente `iinicia-android`, `prompt=login`) | Correcto. El primer intento se hizo por error en la pestaña de Moodle de Brave; se detectó porque el servidor no registró el cierre, y se repitió en la app |
| 5 | Estados vacíos con la cuenta de prueba "aspirante": Inicio ("Tus cursos aparecerán aquí…"), Cursos y Avisos ("Sin avisos.") | Correcto |

**Limitaciones de la prueba:**
- En la versión de TalkBack de este teléfono, los anuncios no quedan en el registro del sistema durante el uso normal (solo en su tutorial), así que el resultado de cada ronda es tu reporte de lo que escuchaste.
- Los toques enviados por ADB no pasan por TalkBack; se usaron solo para preparar las pantallas.

**Defectos:** no se reportaron defectos de accesibilidad nuevos. El defecto del interruptor sin nombre (Fase 4.10) se confirmó corregido con TalkBack real.

## 4.11.12 Resultados en el teléfono físico

ZTE 9000, Android 10. Se actualizó solo IINICIA debug (`adb install -r`, conservando los datos).

| Prueba | Resultado |
|---|---|
| Inicio de sesión | Correcto; siempre pide credenciales |
| Acceso al campus (estudiante y profesor) | Correcto, **sin segunda contraseña**, con el comprobante vinculado |
| Cambio aspirante → profesor → estudiante y estudiante → profesor → estudiante | Correcto: cada vez Moodle muestra exactamente la cuenta actual |
| Enlace con comprobante copiado de la computadora al teléfono | Rechazado; el teléfono queda sin sesión |
| Vuelta `iinicia://campus` falsificada (state ajeno) | Rechazada con aviso; no abre nada |
| Cierre de sesión normal | Correcto (auditoría ok/ok) |
| Cierre interrumpido (sin conexión al backend) | Aviso en pantalla; al reabrir con conexión se completa (ok/ok); 0 sesiones de Moodle y Brave sin sesión. Aquí se encontró el defecto del reloj (4.11.7), ya corregido |
| Notificaciones | 6 notificaciones de IINICIA presentes en el sistema |
| Deep links `iinicia://curso/3` e `iinicia://notificaciones` | Correcto. **Defecto encontrado y corregido** (`842fc82`, existía desde la etapa 4.6): con un curso abierto, tocar su pestaña o un deep link a ella no hacía nada. 7 de 7 combinaciones correctas tras la corrección |
| Actualización al volver del segundo plano (A17) | Correcto: un aviso creado con la app en segundo plano apareció al volver tras 65 s |
| Recuperación de conectividad | Correcto: aviso sin conexión y, al volver, datos actuales |
| TalkBack | Prueba real (4.11.11) |
| Android 8, 12 y 13+ | **Pendientes**: no hay dispositivo ni imagen de esas versiones |

**Portal web:** cubierto por la suite E2E completa y por los escenarios de fallas (4.11.13).

**Configuración del teléfono restaurada:**
- pantalla activa por USB en 0;
- sin redirecciones de puertos ni de depuración;
- accesibilidad como estaba;
- queda instalada Android Accessibility Suite, autorizada.

## 4.11.13 Resultados automatizados

Ejecutados sobre el código final de la rama:

| Conjunto | Resultado | Referencia mínima |
|---|---|---|
| Backend: unitarias | 60 de 60 | 55 |
| Backend: integración (PostgreSQL) | 8 de 8 | 8 |
| Backend: contratos de la API | 55 de 55 | 55 |
| Backend: `typecheck` y `build` | Correctos | — |
| Portal: `node --test` y Vitest | 9 de 9 y 50 de 50 | 9 + 50 |
| Portal: `typecheck`, ESLint y `build` | Correctos (0 errores y 0 avisos de lint) | — |
| E2E (Playwright, suite completa) | **101 de 101** (23,8 min; 89 anteriores y 12 nuevas del comprobante) | 89 |
| E2E de fallas de servicios (`session-failures.mjs`) | 22 de 22 | 17 |
| Android: unitarias | 76 de 76 | 67 |
| Android: instrumentadas (emulador Pixel 7, Android 17) | 15 de 15 (las 2 nuevas fallan sin la corrección de navegación) | 13 |
| Android: lint | 0 errores y 16 avisos (sin cambios) | 0 errores y 16 avisos |
| `npm audit --omit=dev` (backend, portal y e2e) | 0 vulnerabilidades en los tres | — |

**Pruebas nuevas de esta etapa:**
- **E2E:** 12 del comprobante (pruebas 1 a 11 y 14; las 12 y 13, con servicios detenidos, están en `session-failures.mjs`).
- **Fallas de servicios:** 6 comprobaciones nuevas (M0, M7b, K0, K3b, K4b y K4c).
- **Backend:** vinculación, emisor, destinatario, propósito, `sid`, corte con la hora del servidor, reintento de Keycloak por `sid` e idempotencia.
- **Android:** 9 unitarias del flujo de la app (`CampusLinksTest`) y 2 instrumentadas de navegación.

**Pruebas existentes ajustadas, sin reducir su alcance:**
- `session-isolation.spec.ts` "una sesión de Moodle de otra cuenta no se reutiliza…" esperaba que un enlace pegado convirtiera el navegador en la cuenta del profesor, que es justamente el comportamiento al portador que esta fase elimina. Ahora comprueba las dos cosas:
  - un enlace pegado no cambia de cuenta;
  - una sesión de Moodle de otra persona que quedó abierta se reemplaza por la de quien entra.
- "un enlace manipulado o vencido" sigue el flujo real en el navegador del dueño, para que el rechazo solo pueda deberse a la manipulación o al vencimiento.

## 4.11.14 Commits realizados

| Commit | Contenido |
|---|---|
| `5f2ff82` | E2E: el comprobante era una credencial transferible (6 de 12 fallan antes de la corrección) |
| `4537812` | Moodle: paso de vinculación, comprobante v2, consumo antes de comprobar, revocación y corte por hora |
| `693a4f0` | Backend: comprobante vinculado, `session_revocations` (migración 008), reintento de Keycloak, reintentos cada 15 s |
| `311f17f` | Portal: paso `/auth/campus` en el servidor |
| `8e3a4db` | Backend: el corte de Moodle es siempre la hora del servidor (defecto del reloj del teléfono) |
| `9a07667` | Android: entrada al campus vinculada al navegador del teléfono (state propio) |
| `cdb7b13` | E2E: pruebas de aislamiento con el flujo vinculado; fallas de servicios 22 de 22 |
| `842fc82` | Android: pestaña o deep link a una pestaña ya abierta vuelve a su raíz |
| `c533ca7` | Moodle: el registro de accesos omite la consulta de `sso.php` |
| `2822a75` | Esta sección, documentos 04, 05, 12 y 15, inventario de la API y evidencias |
| `9d8fbd5` | Integración (`--no-ff`) de `fix/cross-account-session-isolation` en `refactor/android-modular-architecture` |

No se reescribió el historial ni se subió nada a remotos.

### Integración en la rama de Android

Se cumplieron los criterios de la autorización condicionada:
- nadie entra a Moodle con la identidad de otra persona;
- el enlace transferido no suplanta a su dueño;
- el cierre interrumpido es seguro;
- los comprobantes pendientes se invalidan;
- las pruebas pasan;
- el teléfono funciona;
- TalkBack se probó de verdad;
- no quedan defectos críticos.

Por eso se integró la rama de corrección en `refactor/android-modular-architecture` con un *merge* `--no-ff` (`9d8fbd5`), sin reescribir el historial. El árbol resultante es idéntico al de la rama de corrección.

**Validación en la rama de Android:**

| Conjunto | Resultado |
|---|---|
| Backend | 60 unitarias, 8 de integración, 55 de contratos y `typecheck` correctos |
| Portal | 9 + 50 pruebas, `typecheck` y ESLint correctos |
| Android | 76 unitarias, lint con 0 errores y 16 avisos, `assembleDebug` correcto |
| E2E de seguridad y roles contra los servicios en ejecución | 35 de 35 (comprobante, aislamiento y roles) |

La suite E2E completa (101 de 101) y las instrumentadas (15 de 15) se ejecutaron sobre el mismo árbol.

**La Fase 4 no se integró en `main`, y la Fase 5 no ha comenzado.**

## 4.11.15 Riesgos residuales

1. **Nombre anterior en Keycloak durante unos segundos (bajo):** solo si alguien inicia sesión entre que Keycloak vuelve y el primer reintento (4.11.9). Sin acceso.
2. **Cierre de Moodle en todos los dispositivos (decisión):** 4.11.8.
3. **Reintento tardío de un cierre pendiente de la app (bajo):** puede cerrar una sesión de Moodle de la **misma persona** abierta antes del reintento; hay que volver a entrar al campus.
4. **Comprobante rechazado cierra la sesión de Moodle del navegador que lo abre (bajo, molestia):** es una falla cerrada; alguien que logre que la víctima abra un enlace inválido solo la saca del campus, sin acceso a nada.
5. **Varias entradas al campus casi simultáneas en el mismo navegador:** la segunda cookie de vinculación reemplaza a la primera, y el primer enlace falla con "Vuelve a entrar desde IINICIA". Es seguro; solo hay que repetir.
6. **Historial del navegador:** quedan URL de redirección con valores ya inútiles (4.11.10).
7. **A16 / R4:** el proceso terminado durante una renovación de token falla de forma segura; la corrección completa queda para la Fase 5.
8. **Android 8, 12 y 13+:** sin probar.
9. **TalkBack:** probado en Android 10 con la versión 17.1; otras versiones de Android o de TalkBack, sin probar.
10. **PostgreSQL:** causa histórica no determinable (sección 14).

## 4.11.16 Pendientes para las Fases 5 y 6

**Fase 5:**
- relación entre la sesión de Keycloak y la de Moodle, para cerrar solo el dispositivo actual;
- opción "Cerrar sesión en todos los dispositivos";
- A16: guardar el estado antes de usar el token rotado;
- `id_token_hint` (R6);
- valorar acortar la ventana del nombre anterior en Keycloak (por ejemplo, un reintento inmediato al detectar que Keycloak volvió).

**Fase 6:**
- PostgreSQL:
  - persistencia de registros;
  - monitoreo de reinicios;
  - alertas de disponibilidad;
  - monitoreo de recursos;
  - *healthchecks*;
  - recuperación de conexiones (en el backend ya existe el manejador del *pool*);
  - conservación de evidencias de incidentes;
  - `shm_size` y límites de memoria;
  - `--no-deps` en los scripts;
  - memoria de WSL.
- HTTPS en todos los servicios, que además permite marcar como `Secure` la cookie de vinculación.
- Rotación del `MOODLE_SSO_SECRET`.
