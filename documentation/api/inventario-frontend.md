# Inventario del frontend (Fase 3, etapa 3.1)

Estado del portal **antes** de la refactorización: rama `refactor/frontend-modular-architecture` en `2f69fbc`, 24/11/2026. Son unas 2,400 líneas en 46 archivos.

## Rutas

| URL | Archivo | Tipo | Acceso | Datos que usa |
|---|---|---|---|---|
| `/` | `app/page.tsx` | Servidor (PPR) | Público | `GET /programs`, `GET /content/noticia` |
| `/universidad`, `/universidad/[slug]`, `/universidad/docentes`, `/universidad/autoridades` | `app/universidad/*` | Servidor | Público | `GET /content/pagina`, `/content/pagina/:slug`, `/content/docente`, `/content/autoridad` |
| `/oferta`, `/oferta/[slug]` | `app/oferta/*` | Servidor + botón cliente | Público (solicitar requiere sesión) | `GET /programs`, `/programs/:slug`; `POST /me/applications` |
| `/noticias`, `/noticias/[slug]` | `app/noticias/*` | Servidor | Público | `GET /content/noticia`, `/content/noticia/:slug` |
| `/admisiones` | `app/admisiones/page.tsx` | Servidor + formulario cliente | Público | `GET /content/faq`, `/programs`; `POST /api/informacion` |
| `/contacto` | `app/contacto/page.tsx` | Servidor | Público | `GET /content/contacto` |
| `/estado` | `app/estado/page.tsx` | Cliente | Público | `GET /api/estado` |
| `/registro` | `app/registro/page.tsx` | Formulario cliente | Público | `POST /api/registro` |
| `/mi-iinicia` | `app/mi-iinicia/page.tsx` (175 líneas) | Servidor + botones cliente | Sesión (`proxy.ts` y la página) | `/me`, `/me/courses`, `/me/teaching`, `/me/upcoming`, `/me/notifications`, `/me/applications`, `/programs`; `PATCH /me`, `GET /me/campus-link` |
| `/mi-iinicia/cursos/[id]` | `app/mi-iinicia/cursos/[id]/page.tsx` | Servidor + botones cliente | Sesión | `/me/courses/:id`, `/me/campus-link` |
| `/admin` | `app/admin/page.tsx` y `components/admin-panel.tsx` (566 líneas) | Servidor (permiso) + panel cliente | Sesión y permiso de gestión | 24 llamadas `admin/*` (ver abajo) |
| `/auth/login`, `/auth/callback`, `/auth/logout` | `app/auth/*/route.ts` | Route handlers | — | Keycloak OIDC con PKCE |
| `/api/bff/[...path]`, `/api/registro`, `/api/informacion`, `/api/estado` | `app/api/*/route.ts` | Route handlers | BFF con sesión, o público con límite de intentos | Backend |
| `/media/[id]`, `/sitemap.xml`, `/robots.txt` | `app/media`, `app/sitemap.xml`, `app/robots.ts` | Route handlers | Público | Backend |
| (redirecciones 301 y 404 reales) | `proxy.ts` | Proxy | — | `GET /redirects`, comprobación de detalle |

## Componentes

| Archivo | Líneas | Tipo | Responsabilidades |
|---|---|---|---|
| `components/admin-panel.tsx` | 566 | Cliente | Pestañas y los 8 paneles: solicitudes, usuarios con roles y matrículas, programas con cursos, profesores y cohortes, contenidos con editor Markdown y subida de imágenes, información, avisos, reportes con CSV y auditoría. Además, el hook de datos, la tabla, el botón de confirmación y las etiquetas |
| `components/portal-forms.tsx` | 279 | Cliente | Cliente HTTP `bff()`, registro, solicitud de información, solicitar admisión, botón al campus y perfil |
| `app/mi-iinicia/page.tsx` | 175 | Servidor | Panel de los 8 roles: cursos, grupos del profesor o coordinador, actividades, avisos, solicitudes, enlace al panel de gestión y perfil |
| `components/public-blocks.tsx` | 99 | Servidor | Tarjetas de programas, noticias, docentes, cuerpo Markdown y "cargando" |
| `components/site-chrome.tsx` | 87 | Servidor | Encabezado y pie |
| `components/markdown.tsx` | 78 | Servidor y cliente | Render Markdown seguro (sin HTML) |
| `components/mobile-menu.tsx` | 52 | Cliente | Menú móvil |
| `components/system-status.tsx` | 43 | Cliente | Estado del sistema |
| `lib/api.ts` | 51 | Solo servidor | `publicGet`, `privateGet`, tipos y etiquetas |
| `lib/session-core.ts` | 82 | Servidor y proxy | Cookies cifradas, renovación |
| `lib/client-ip.ts` | 18 | Servidor | IP reenviada (Fase 1.5) |

## Comunicación con el backend

- **Servidor:** `publicGet` y `privateGet` en `lib/api.ts`, que devuelven `null` si hay error.
- **Cliente:** `bff()` en `portal-forms.tsx`, que lanza el mensaje del backend. Además hay 4 `fetch` directos con su propio manejo de errores: subir imágenes, registro, información y estado.
- **Las 24 llamadas `admin/*` del panel**, en sus 8 secciones: solicitudes (2), usuarios (6), matrículas (2), programas (8), contenidos (3), información (2), avisos (1) y reportes, auditoría y medios (1 cada una). Todas encajan en los módulos del backend de la Fase 2, sin rutas desconocidas.

## Hallazgos

1. **Listas truncadas.** Usuarios, solicitudes, información, auditoría y contenidos usan el modo anterior (arreglo de hasta 200 o 300 registros). Lo que quede más allá no se ve.
2. **Búsqueda de usuarios sin espera.** Se envía una solicitud por cada tecla. Ya ignora las respuestas viejas, pero no cancela la solicitud ni espera a que se termine de escribir.
3. **Manejo de errores distinto en 5 lugares.** Una sesión vencida (401) se muestra como el texto "Sesión requerida" sin llevar a iniciar sesión. El límite de intentos (429) solo se traduce en uno de los formularios.
4. **Duplicación.**
   - Las etiquetas de roles existen en `lib/api.ts` (servidor) y en `admin-panel.tsx` (cliente).
   - La tabla administrativa tiene dos versiones: la del panel y la de "Mis grupos".
   - La lógica de subir imagen se repite en el formulario de programa y en el de contenido.
5. **Permisos en la interfaz.** Las pestañas del panel siguen la matriz RBAC (`me.permissions`). Las acciones se ocultan según el permiso, y el backend las vuelve a validar (Fase 2). `/admin` redirige a quien no tiene ningún permiso de gestión. El botón "Nuevo programa" depende de `users:manage`, que solo tienen el superadministrador y el administrador académico; coincide con el backend, que no deja crear programas al coordinador.
6. **Cliente y servidor.** Ningún componente cliente importa `lib/api.ts` (que es `server-only`). No hay variables `NEXT_PUBLIC_*`. Los tokens solo viven en cookies `httpOnly`.

## Pruebas al inicio de la fase

| Prueba | Resultado |
|---|---|
| Portal: unitarias | 5 de 5 |
| Portal: typecheck, ESLint y compilación | Correctos |
| E2E completa (Fase 2) | 63 de 63 |
| Backend: unitarias, integración y contratos | 43, 8 y 54 |

## Rendimiento inicial

> **Reemplazado en la etapa 3.8.** Estas cifras mezclaban bytes comprimidos y sin comprimir e incluían precargas de enlaces, así que no sirven para comparar. La medición válida, de `main` y de la rama con el mismo método, está en la sección 13 de [14-refactorizacion-frontend.md](../14-refactorizacion-frontend.md). `evidencias/rendimiento-frontend-antes.json` contiene ahora esa medición nueva.

Mediana de 3 cargas con caché vacía, en la PC de desarrollo (medición original, solo como registro).

| Página | JS (KB) | Solicitudes | DOMContentLoaded (ms) | Lista para usar (ms) |
|---|---|---|---|---|
| `/` | 259 | 29 | 392 | 1835 |
| `/oferta` | 235 | 36 | 164 | 1696 |
| `/oferta/base-de-datos` | 258 | 28 | 190 | 1213 |
| `/mi-iinicia` (estudiante)\* | 35 | 31 | 774 | 1642 |
| `/admin` (superadmin)\* | 76 | 36 | 407 | 1528 |

\* Después de iniciar sesión, el código común ya está en caché: el JS es solo el adicional de la página.
