# 14 · Fase 3: Refactorización del frontend

Rama: `refactor/frontend-modular-architecture`, creada desde `main` después de integrar la Fase 2 (`2f69fbc`). Etapas 3.1 a 3.8, un commit por etapa: ninguna etapa comparte commit.

## 1. Estado inicial

El inventario completo está en [api/inventario-frontend.md](api/inventario-frontend.md) (etapa 3.1).

- **3 archivos concentraban el portal privado:**
  - `components/admin-panel.tsx` (566 líneas): las 8 secciones del panel, el hook de datos, la tabla, la confirmación y las etiquetas.
  - `components/portal-forms.tsx` (279 líneas): el cliente HTTP y 5 formularios.
  - `app/mi-iinicia/page.tsx` (175 líneas): los paneles de los 8 roles en una sola página.
- **Hallazgos:**
  - Las listas del panel usaban el modo compatible del backend (hasta 200 o 300 filas). Lo que quedaba más allá no se veía.
  - La búsqueda de usuarios enviaba una solicitud por tecla.
  - Había 5 formas distintas de manejar errores. Una sesión vencida se mostraba como texto, sin llevar a iniciar sesión.
  - Etiquetas, tabla y subida de imágenes estaban duplicadas.
- **Pruebas al empezar:**
  - portal: 5 de 5;
  - E2E: 63 de 63;
  - backend: 43 unitarias, 8 de integración y 54 de contratos.

## 2. Arquitectura anterior

- Todas las páginas colgaban directamente de `app/`, sin separar las públicas, las de acceso y las privadas.
- Se usaban 2 clientes HTTP: `lib/api.ts` en el servidor, y `bff()` más 4 `fetch` directos en el navegador.
- El panel elegía sus pestañas con `me.permissions`, y Mi IINICIA decidía sus secciones con condiciones repartidas en la página.
- No había pruebas de componentes: las 5 unitarias eran de `client-ip`.

## 3. Arquitectura nueva

```
app/(grupo)/ruta/page.tsx      → compone la página; datos del servidor con lib/api/server.ts
        │
features/<funcionalidad>/      → paneles, formularios y listas de una funcionalidad
        │        └──► hooks/ (useApiData, usePagedList, useDebouncedValue)
        │                   └──► lib/api/client.ts → /api/bff/* (BFF) → API NestJS
components/<tipo>/             → piezas sin reglas de negocio (ui, forms, tables, feedback, navigation, layout)
config/                        → etiquetas y secciones del panel (compartidas por servidor y cliente)
types/api.ts                   → tipos de las respuestas de la API
```

- **Un solo cliente por lado:**
  - Servidor: `lib/api/server.ts` (`server-only`): `publicGet`, `privateGet` y `getMe`.
  - Navegador: `lib/api/client.ts`, que define `ApiError` con un tipo de error y su estado HTTP.
- **Errores homogéneos:**
  - `session` (401): lleva a `/auth/login?returnTo=` con la página actual.
  - `forbidden` (403), `not_found`, `rate_limit` (429), `validation` (400 y 422), `server` y `network`.
  - El mensaje del backend solo se muestra en los errores donde es útil para la persona. Los de sesión, límite y servidor usan textos propios.
- **Sin reintentos.** Ninguna escritura se repite sola: un `POST` repetido podría duplicar una solicitud o una matrícula. Las lecturas tampoco se reintentan; el usuario vuelve a cargar si quiere.
- **Peticiones viejas:**
  - `useApiData` cancela la anterior con `AbortController` y descarta cualquier respuesta que no sea la última.
  - El estado solo cambia cuando llega una respuesta (regla `set-state-in-effect` del compilador de React).

## 4. Estructura de carpetas (`frontend/src`)

```
app/
  (public)/      inicio, universidad, oferta, noticias, admisiones, contacto, estado
  (auth)/        registro, auth/login, auth/callback, auth/logout
  (protected)/   mi-iinicia, mi-iinicia/cursos/[id], admin
  api/           bff/[...path], registro, informacion, estado   (BFF, sin cambios)
  media/, sitemap.xml/, robots.ts, layout.tsx, not-found.tsx
components/  ui/ forms/ tables/ feedback/ navigation/ layout/
features/    admissions/ audit/ auth/ content/ courses/ dashboard/ enrollments/
             media/ notifications/ programs/ reports/ users/
hooks/       use-api-data.ts, use-paged-list.ts, use-debounced-value.ts
lib/         api/server.ts, api/client.ts, seo.ts, session-core.ts, client-ip.ts
config/      labels.ts, admin-sections.ts
types/       api.ts
```

Los grupos `(public)`, `(auth)` y `(protected)` no forman parte de la URL. El portal conserva un solo `layout.tsx` raíz.

## 5. Componentes refactorizados

| Antes | Líneas | Después |
|---|---|---|
| `components/admin-panel.tsx` | 566 | `features/dashboard/admin-panel.tsx` (52: pestañas y carga diferida) más un panel por funcionalidad: `admissions/applications-panel` (82), `users/users-panel` (85), `programs/programs-panel` (31) con `program-card`, `program-form` y `program-teachers`, `content/content-panel` (61) con `content-form` y `markdown-editor`, `admissions/info-requests-panel` (54), `notifications/broadcast-form` (38), `reports/reports-panel` (34) con `csv.ts`, `audit/audit-panel` (43) |
| `components/portal-forms.tsx` | 279 | `lib/api/client.ts` (119), `auth/register-form` (115), `admissions/info-request-form` (60), `admissions/apply-button` (30), `courses/campus-button` (30), `users/profile-form` (32) |
| `app/mi-iinicia/page.tsx` | 175 | página de 25 líneas, más `dashboard/role-dashboard` (65), `dashboard/dashboard-sections.ts` (44), `courses/course-lists` (88), `admissions/my-applications`, `notifications/notices-list`, `programs/program-grid` |
| `components/public-blocks.tsx` | 99 | `programs/program-card`, `content/public-content` |
| `lib/api.ts` | 51 | `lib/api/server.ts`, `types/api.ts` y `config/labels.ts` |

El archivo más grande del frontend tiene ahora 120 líneas: `app/(public)/page.tsx`, la portada.

## 6. Funcionalidades independientes

Cada carpeta de `features/` corresponde a un módulo del backend de la Fase 2. Sus llamadas van solo a las rutas de ese módulo:

| Carpeta | Módulo del backend | Contenido |
|---|---|---|
| `auth` | auth | Registro y reglas de contraseña |
| `admissions` | admissions | Solicitudes (panel y propias), información, botón de solicitar |
| `users` | users | Tabla paginada, editor de roles y perfil |
| `enrollments` | enrollments | Matrículas de una persona |
| `programs` | programs | Panel, formulario, profesores y tarjetas públicas |
| `content` | content | Panel paginado, editor Markdown, render seguro y bloques públicos |
| `media` | content (imágenes) | Campo de subida con validación de tipo y tamaño |
| `notifications` | notifications | Envío de avisos y lista de avisos |
| `reports` | reports | Reporte por programa y exportación CSV |
| `audit` | audit | Bitácora paginada con filtros |
| `courses` | dashboard | Mis cursos, grupos del profesor y próximas actividades |
| `dashboard` | dashboard | Mi IINICIA por rol y panel de gestión |

Las funcionalidades no se importan entre sí, salvo 3 excepciones intencionales:
- `users-panel` usa `enrollments/user-enrolments`;
- los formularios de `programs` y `content` usan `media/image-upload-field`;
- `dashboard` compone las demás.

## 7. Rutas

**Ninguna URL cambió.** Las rutas solo se movieron a sus grupos:

| URL | Antes | Después |
|---|---|---|
| `/`, `/universidad/*`, `/oferta/*`, `/noticias/*`, `/admisiones`, `/contacto`, `/estado` | `app/<ruta>` | `app/(public)/<ruta>` |
| `/registro`, `/auth/login`, `/auth/callback`, `/auth/logout` | `app/<ruta>` | `app/(auth)/<ruta>` |
| `/mi-iinicia`, `/mi-iinicia/cursos/[id]`, `/admin` | `app/<ruta>` | `app/(protected)/<ruta>` |
| `/api/*`, `/media/[id]`, `/sitemap.xml`, `/robots.txt` | sin cambio | sin cambio |

Hay 2 parámetros de consulta nuevos y opcionales, solo en la interfaz:
- `/admin?seccion=<id>` abre una sección del panel.
- `q`, `page`, `pageSize`, `sort`, `order` y los filtros de cada tabla guardan la lista en la URL, para recargar o compartir la misma vista.

La API `/api/v1` no cambió: contratos 54 de 54.

## 8. Paneles por rol

- **Una sola regla probada:**
  - `config/admin-sections.ts` asocia cada sección del panel al permiso del backend que la habilita. Con `sectionsFor(permissions)` se calculan las pestañas.
  - `features/dashboard/dashboard-sections.ts` (`dashboardSectionsFor(me)`) decide qué ve cada rol en Mi IINICIA.
- **Prueba de los 8 roles:** `test/features.test.tsx` importa `permissionsFor` y `ROLES` del backend (`backend/src/modules/auth/permissions.ts`). Para los 8 roles comprueba que las pestañas son exactamente las de su permiso. Si alguien cambia la matriz RBAC, la prueba del portal lo detecta.
- **`/admin`:**
  - Sin sesión, lleva a iniciar sesión.
  - Sin ningún permiso de gestión, lleva a `/mi-iinicia`.
  - Una sección pedida en `?seccion=` sin permiso no se abre: se muestra la primera permitida.
- **El backend sigue siendo la autoridad.** Ocultar una pestaña o un botón es solo comodidad: cada acción se vuelve a validar en la API. Las E2E `role-panels.spec` lo comprueban con llamadas directas por el BFF.

Todos los roles ven avisos y su perfil. Además:

| Rol | Mi IINICIA | Secciones del panel |
|---|---|---|
| superadmin | Mis cursos, próximas actividades | Las 8 |
| admin_tecnico | — | Usuarios, Auditoría |
| admin_academico | Mis cursos, próximas actividades | Solicitudes, Usuarios, Programas, Contenidos, Información, Avisos, Reportes |
| coordinador | Cursos que supervisa, mis cursos, próximas actividades | Solicitudes, Usuarios, Programas, Avisos, Reportes (solo su programa) |
| profesor | Mis grupos con estudiantes y avance, próximas actividades | Sin panel |
| estudiante | Mis cursos, próximas actividades | Sin panel |
| aspirante | Mis solicitudes, programas disponibles | Sin panel |
| soporte | — | Usuarios (lectura) |

La tabla salió de ejecutar `dashboardSectionsFor` con `permissionsFor` del backend para cada rol. La fuente es el código, no esta tabla.

## 9. Componentes reutilizables

| Carpeta | Componentes |
|---|---|
| `components/ui` | `Button` (variantes, estado ocupado con texto accesible, `type="button"` por omisión), `Card`, `Badge` |
| `components/forms` | `TextField`, `TextAreaField`, `SelectField`, `CheckboxField`. Etiqueta, ayuda y error van conectados con `aria-describedby` y `aria-invalid`. También `SearchInput`, con `role="search"` y un máximo de 100 caracteres |
| `components/tables` | `Table` y `Td` (encabezado, etiqueta de región y desplazamiento horizontal), `Pagination`, `ListToolbar`, `SortSelect` |
| `components/feedback` | `Loading`, `Unavailable`, `ErrorMessage`, `SuccessMessage`, `EmptyState`. `ConfirmButton` lleva el foco a "Confirmar" y se cancela con Escape. También `SystemStatus` |
| `components/navigation` | `Tabs` (con `tablist` y foco itinerante: flechas, Inicio y Fin), `MobileMenu` |
| `components/layout` | `SiteHeader`, `SiteFooter` |
| `hooks` | `useApiData`, `usePagedList`, `useDebouncedValue` (350 ms) |

## 10. Paginación

Las 5 listas grandes del panel usan ahora la paginación del backend de la Fase 2: usuarios, solicitudes, información, auditoría y contenidos. Siempre envían `page` y `pageSize`, y reciben `{items, total, page, pageSize}`.

| Tabla | Filtros | Orden (además de "Más recientes primero") |
|---|---|---|
| Usuarios | Estado, rol | Correo, apellido, más antiguos, estado |
| Solicitudes | Estado (por omisión `enviada`), programa | Más antiguas, programa, estado |
| Información | Estado | Más antiguas, nombre, estado |
| Contenidos | Tipo, estado | Título, orden, publicados recientemente |
| Auditoría | Acción (validada en el navegador), desde, hasta | — |

Las 5 tablas tienen búsqueda de texto (`q`); en auditoría busca por el correo de quien hizo la acción. Los campos que se buscan y los de orden son los que acepta el backend de la Fase 2.

**`usePagedList`** reúne el comportamiento común:
- **Espera:** aguarda 350 ms sin cambios en la búsqueda y los filtros antes de consultar. Escribir "Interesada 23" genera una sola solicitud, no 13.
- **Peticiones viejas:** se cancelan o se descartan con `useApiData`.
- **Página 1:** cualquier cambio de búsqueda, filtro, orden o tamaño vuelve a la primera página.
- **URL:** el estado se guarda con `history.replaceState`. Al recargar se recupera. Al cambiar de pestaña no se arrastran los filtros de la anterior.
- **Tamaños:** 20, 50 o 100 por página. El backend limita a 100.

La E2E `admin-tables.spec` inserta 230 solicitudes ficticias por SQL y comprueba:
- que se llega a la 230, más allá de la antigua barrera de 200;
- que la búsqueda espera y envía una sola solicitud;
- que el filtro vuelve a la página 1;
- que la URL se conserva al recargar.

Al terminar borra esas filas.

## 11. Seguridad

| Control | Estado | Cómo se verifica |
|---|---|---|
| BFF: el navegador solo llama a `/api/bff/*`, `/api/registro`, `/api/informacion` y `/api/estado` | Sin cambios | `security.spec` (rutas no permitidas) y revisión del código: los `fetch` del navegador solo están en `lib/api/client.ts` |
| Tokens solo en cookies `httpOnly` cifradas | Sin cambios | `poc.spec`: las cookies `iin_*` son `httpOnly` y el HTML no contiene secretos. `security.spec`: el token de Moodle y el secreto de Keycloak no llegan al navegador |
| CSRF: comprobación de `Origin` en el BFF | Sin cambios | `security.spec` y `poc.spec` (403 desde otro origen) |
| Sin `NEXT_PUBLIC_*` | 0 variables | `grep` en `frontend/` |
| `server-only` fuera del cliente | `lib/api/server.ts` y `session-core.ts` solo se importan desde servidor | La compilación falla si un componente cliente los importa. `config/admin-sections.ts` existe para que el servidor no importe constantes de un módulo `"use client"` |
| Sin reintentos de escrituras | Ninguno | `api-client.test`: un error 500 en `POST` produce exactamente 1 llamada |
| Imágenes | Tipo y 5 MB en el navegador. El backend sigue validando el contenido real | `api-client.test` y `admin.spec` |
| Entradas | Búsqueda limitada a 100 caracteres. La acción de auditoría se valida con `^[a-z_]+(\.[a-z_]+)*$` antes de consultar | Pruebas de componentes. El backend vuelve a validar (Fase 2) |
| Markdown | Render sin HTML: el componente se movió sin cambios | Revisión del código |
| CSV de reportes | Las celdas que empiezan con `=`, `+`, `-` o `@` se neutralizan | `features.test` |

## 12. Accesibilidad

Objetivo: WCAG 2.2 AA. **No se declara cumplimiento total.** Las pruebas automáticas detectan parte de los problemas; falta una revisión manual con lectores de pantalla.

- **Automatizado (axe-core con las etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y `wcag22aa`):** 0 violaciones en:
  - las páginas públicas a 360, 768, 1024, 1280 y 1440 px;
  - las 8 secciones del panel a 768, 1024 y 1440 px;
  - Mi IINICIA de 5 roles a 360 y 1440 px.
- **Teclado:**
  - pestañas con flechas, Inicio y Fin, y foco visible;
  - menú móvil que se cierra con Escape;
  - confirmaciones con el foco en "Confirmar".
- **Formularios:** cada campo tiene etiqueta y su error está conectado. Los mensajes de estado usan `aria-live`.
- **Corregido en esta fase:**
  - 2 filtros se llamaban igual ("Estado") en la misma pantalla. Ahora son "Filtrar por estado/rol/tipo/programa".
  - Las tablas son regiones con nombre, como "Estudiantes de Base de Datos".

## 13. Rendimiento

**Corrección del método de medición.** Las cifras de la etapa 3.1 (y una primera medición posterior) **no eran comparables** y se descartaron:
- `metrics.mjs` sumaba todos los scripts hasta `networkidle`, incluidas las precargas de Next.js de los enlaces visibles. Esas precargas dependen del momento: la misma compilación dio 81 KB y 237 KB en `/oferta` en dos corridas.
- Mezclaba tamaños comprimidos (`content-length`) y sin comprimir (cuerpo leído).

El script corregido:
- cuenta los bytes transferidos (comprimidos);
- separa el JS de la página (pedido antes de `load`) del total con precargas;
- usa 5 corridas.

Con él se midieron **las dos versiones en la misma sesión**: `main` (compilada en un *worktree* temporal) y esta rama, en el mismo puerto y con los mismos servicios.

Mediana de 5 cargas con caché vacía, PC de desarrollo. Archivos: `evidencias/rendimiento-frontend-antes.json` (`main`) y `rendimiento-frontend-despues.json` (rama).

| Página | JS de la página, antes → después (KB transferidos) | JS con precargas (KB) | Lista para usar (ms) |
|---|---|---|---|
| `/` | 141 → 141 | 144 → 147 | 1465 → 1326 |
| `/oferta` | 141 → 141 | 144 → 147 | 1391 → 1425 |
| `/oferta/base-de-datos` | 144 → 143 | 144 → 148 | 1129 → 1208 |
| `/mi-iinicia` (estudiante)\* | 3 → 4 | 3 → 4 | 1369 → 1324 |
| `/admin` (superadmin)\* | 10 → 3 | 14 → 11 | 1278 → 1256 |

\* Medidas después de iniciar sesión en el mismo contexto: el código común ya está en caché y solo cuenta lo adicional.

**Conclusiones:**
- **Las páginas públicas pesan lo mismo.** Casi todo su JS es el código común de Next.js y React. La refactorización no lo cambió, y tampoco lo empeoró.
- **El panel descarga menos al abrir:** 10 → 3 KB, porque cada sección se baja al abrir su pestaña.
- **Los tiempos suben y bajan entre 40 y 140 ms** en ambos sentidos. Es el ruido de una PC de desarrollo: no hay mejora ni empeoramiento demostrable.
- **El cambio con efecto real en datos:** las tablas traen 20 filas por página en vez de hasta 200 o 300.

## 14. SEO y redirecciones

- **`lib/seo.ts` (`pageMetadata`):** da a cada página pública título, descripción, URL canónica, Open Graph (con imagen por omisión) y tarjeta de Twitter coherentes entre sí.
- **Páginas sin indexar:** `/mi-iinicia`, `/admin`, `/estado`, la página 404 y los detalles inexistentes siguen con `robots: { index: false }`. `/registro` es pública e indexable, como antes.
- **Sin cambios:** `sitemap.xml` y `robots.txt`.
- **Redirecciones 301 de WordPress:** se conservan en `proxy.ts`. `a11y-seo.spec` comprueba una redirección creada desde el panel, y que las páginas que no existen devuelven 404 real.

## 15. Resultados reales de pruebas

Todas las cifras son de ejecuciones reales del 24/11/2026 en DEV.

| Validación | Al empezar | Al terminar la Fase 3 |
|---|---|---|
| Portal: pruebas `node --test` | 5 de 5 | **5 de 5** (`client-ip`) |
| Portal: Vitest (componentes, formularios, validación, paginación, búsqueda, filtros, carga, vacío, errores, sesión vencida, navegación, roles) | — | **50 de 50** en 4 archivos |
| Portal: typecheck, ESLint y compilación | Correctos | Correctos |
| Backend: unitarias, integración y contratos | 43, 8 y 54 | **43 de 43, 8 de 8 y 54 de 54**. El backend no se modificó |
| Backend: typecheck y compilación | Correctos | Correctos |
| E2E completa (Playwright) | 63 de 63 | **81 de 81** en 14.9 min: las 63 anteriores, más 18 nuevas. La primera corrida dio 80 de 81 por un defecto real, que se corrigió (ver abajo) |
| `npm audit --omit=dev` | 0 | **0** en backend, portal y E2E |
| `npm audit` con herramientas de desarrollo | 6 moderadas | 6 moderadas, sin cambios: 3 del backend (`@nestjs/cli` → `glob`, `minimatch`) y 3 de E2E (`autocannon` → `uuid`). El portal tiene 0 |
| Android: `assembleDebug` y `lintDebug` | Compila; 0 errores y 35 avisos | Compila (`BUILD SUCCESSFUL`); **0 errores y 35 avisos**. Android no se modificó |

**E2E nuevas de la fase:**
- `role-panels.spec`: los 8 roles, sus pestañas y el rechazo del backend;
- `admin-tables.spec`: paginación más allá de 200, búsqueda con espera, filtros y URL;
- `responsive-a11y.spec`: axe y desbordes a 768, 1024 y 1440, teclado y menú móvil.

### Defecto encontrado en la validación final: texto escrito antes de que el panel funcione

La primera corrida completa de la etapa 3.8 dio **80 de 81**. Falló `admin-tables.spec`: la tabla mostraba 230 solicitudes, pero la URL no tenía `q=Interesada`, es decir, la búsqueda no se había aplicado.

- **Causa:** las secciones del panel se cargan con `next/dynamic`, que por omisión también las dibuja en el servidor. El campo de búsqueda aparecía en el HTML antes de que React lo activara: con JavaScript desactivado, el campo existía (1 resultado). Lo que se escribía en ese intervalo se veía en pantalla, pero no llegaba al estado.
- **Afecta a personas reales**, no solo a la prueba, sobre todo con conexiones lentas.
- **Por qué la prueba no lo detectaba siempre:** en ese punto de la suite no hay otras solicitudes en la base, así que el total era 230 con o sin búsqueda. Solo fallaba la comprobación de la URL.
- **Corrección** (`features/dashboard/admin-panel.tsx`):
  - Las secciones usan `ssr: false`. Son privadas, no se indexan y piden sus datos en el navegador.
  - Ahora se muestra "Cargando" hasta que el panel funciona. Sin JavaScript no aparece ningún campo (0 resultados).
  - Efecto secundario: las pestañas también se dibujan en el navegador, porque el panel completo cae a su límite `Suspense`. En una página privada sin indexar solo significa ver "Cargando" un momento más.
  - La prueba comprueba además la URL justo después de buscar.
- **No se agregaron esperas ni reintentos.** Después de la corrección: `admin-tables` pasó 15 de 15 (3 pruebas × 5 repeticiones), y la suite completa se volvió a ejecutar (tabla de arriba).

### Fallo intermitente de Moodle tras reiniciar Docker

En la Fase 2, la prueba de concepto falló una vez al esperar 60 s la página del curso, justo después de reiniciar Docker Desktop. Se investigó sin agregar reintentos ni aumentar tiempos. Datos: `evidencias/moodle-arranque-en-frio.json`.

| Escenario | Hasta *healthy* | Primer acceso al curso por SSO | Segundo acceso |
|---|---|---|---|
| Reinicio solo de Moodle | 16.3 s | 17.1 s | 4.5 s |
| `docker compose restart` (pila completa) | 45.3 s | 19.4 s (el inicio de sesión en Keycloak tardó 7.7 s, frente a 2.1 s en caliente) | 4.7 s |

- **No se reprodujo:** en ambos escenarios el primer acceso queda por debajo del límite de 60 s.
- **Hallazgos:**
  1. *Healthy* no significa "listo para usar": el primer acceso tarda unas 4 veces más que el segundo.
  2. `entrypoint.sh` ejecuta `purge_caches.php` en cada arranque. Después, Moodle recompila el tema y las cachés en las primeras solicitudes reales.
  3. `moodle-cron` arranca en cuanto Moodle está *healthy* y ejecuta enseguida todas las tareas programadas atrasadas. Compite por CPU y base de datos con esos primeros accesos.
  4. El *healthcheck* solo pide `/login/index.php`, que no recompila el tema del curso.
- **Hipótesis no verificada:** el caso original fue un reinicio de Docker Desktop completo, con la máquina virtual y la caché de disco frías. Ese escenario no se midió.
- **Condiciones para la Fase 6:**
  - purgar cachés solo después de `upgrade.php`, no en cada arranque, o hacer un calentamiento tras purgarlas (CSS y JS del tema, inicio de sesión, una página de curso) antes de crear `.iinicia-ready`;
  - un *healthcheck* de disponibilidad que incluya el tema;
  - retrasar el primer ciclo de `moodle-cron`;
  - medir el tiempo de arranque en frío en STAGING, con un objetivo definido.

**No verificado en esta fase:**
- revisión manual con lector de pantalla;
- teléfono físico;
- STAGING y PRODUCTION, que todavía no existen.

## 16. Capturas con datos ficticios

En `evidencias/capturas/`, generadas con `e2e/capture-panels.mjs`:

| Archivo | Contenido |
|---|---|
| `50-admin-informacion-paginada.png` | Información con 230 solicitudes ficticias ("Interesada N", `@iinicia.test`), página 1 de 12 |
| `51-admin-usuarios-filtrados.png` | Usuarios filtrados por `iinicia.test` (solo cuentas demo) |
| `52-admin-usuarios-movil.png` | La misma tabla a 360 px, con desplazamiento dentro de su región |
| `53-mi-iinicia-coordinador.png` | Mi IINICIA del coordinador a 1440 px |
| `54-mi-iinicia-profesor-movil.png` | Mi IINICIA del profesor a 360 px |

- Las filas con un correo que no sea `@iinicia.test` se cubren con una máscara (rectángulo magenta). En 53 y 54 hay una de esas filas en Base de Datos, y aparece cubierta.
- La suite E2E también regeneró `01` a `07` y `40` (prueba de concepto y panel del profesor) con la interfaz nueva. Solo muestran cuentas demo, la cuenta ficticia "Prueba Concepto" y programas de prueba; en `40` la fila ajena aparece cubierta.
- Las capturas se revisaron una por una: no contienen nombres ni correos reales, tokens, credenciales ni información académica privada.
- Las filas ficticias se borran al terminar el script.

## 17. Commits

| Commit | Etapa | Contenido |
|---|---|---|
| `27e2daf` | 3.1 | Inventario de rutas, componentes y llamadas; métricas iniciales |
| `0846502` | 3.2 | Grupos de rutas y carpetas por funcionalidad |
| `57cdeca` | 3.3 | Componentes compartidos, cliente de API y hooks de datos; Vitest |
| `1bdb914` | 3.4 | División del panel, los formularios y Mi IINICIA por funcionalidad |
| `7a6ae9f` | 3.5 | Paneles por rol con una sola regla probada para los 8 roles |
| `64b74eb` | 3.6 | Paginación, búsqueda y filtros del backend en las tablas del panel |
| `d4d40f5` | 3.7 | SEO, carga diferida de secciones, accesibilidad y diseño adaptable |
| Commit de esta etapa | 3.8 | Validación final, Moodle en frío, capturas y documentación |

La rama no se ha integrado en `main`: espera tu autorización. La Fase 4 (Android) no ha comenzado.

## 18. Riesgos pendientes

1. **Arranque en frío de Moodle:** ver la sección 15. Queda para la Fase 6.
2. **Accesibilidad:** solo pruebas automáticas y de teclado. Falta una revisión manual con lector de pantalla y con personas usuarias.
3. **Vitest 4:** Vitest 5 exige `@types/node` 22 o superior, en conflicto con el proyecto. No se forzó la instalación. En Windows, `scripts/vitest.mjs` ejecuta Vitest desde la ruta canónica, porque con la letra de unidad en minúscula Vitest carga los módulos dos veces.
4. **La prueba de roles del portal importa la matriz del backend** por ruta relativa. Si los proyectos se separan en repositorios distintos, habrá que publicar la matriz como paquete o copiarla con una prueba de igualdad.
5. **Tiempos de carga:** 5 corridas en una PC de desarrollo no bastan para conclusiones sobre tiempos. En la Fase 7 conviene medir en CI, con más corridas y con un presupuesto de JS por página.
6. **Sin cambios en esta fase, siguen pendientes:**
   - las 6 vulnerabilidades moderadas de desarrollo;
   - los 35 avisos del lint de Android (Fase 4).

## 19. Procedimiento de recuperación

- **Volver al portal anterior:** `main` no tiene la Fase 3. Basta con `git switch main`, `cd frontend && npm install && npm run build` y reiniciar el portal.
- **Sin cambios de datos:** esta fase no tiene migraciones ni cambios en la base de datos. El backend y Android no se modificaron. Las URL son las mismas, así que no hay enlaces que reparar.
- **Deshacer una etapa:** `git revert <commit>` en la rama. Después, `npm test`, `npm run typecheck`, `npx eslint .`, `npm run build` y la suite E2E.
- **Filas de prueba:** si un script o prueba se interrumpe, las solicitudes ficticias se borran con `DELETE FROM info_requests WHERE name ~ '^Interesada [0-9]+$'`. La limpieza global de las E2E también lo hace.
