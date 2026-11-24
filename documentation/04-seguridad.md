# 04 · Seguridad y roles

## Autenticación

- OIDC con código de autorización y PKCE (S256) en el portal y la app. El portal es un cliente confidencial y la app un cliente público.
- Política de contraseñas en Keycloak: mínimo 10 caracteres, con mayúscula, minúscula y número, distinta del usuario. Bloqueo tras 5 intentos fallidos.
- Verificación de correo obligatoria en el registro y recuperación de contraseña desde la pantalla de acceso.
- **MFA para roles privilegiados** (superadministrador, administrador técnico y administrador académico). Al recibir el rol, Keycloak exige configurar un autenticador TOTP y desde entonces lo pide en cada acceso. Se controla con `MFA_PRIVILEGED_ROLES` y se verificó con una cuenta temporal (`evidencias/capturas/32-mfa-configurar.png`).
- Tokens de acceso de 5 minutos, sesión web de 30 minutos de inactividad (máximo 10 h) y refresh tokens rotativos de un solo uso. La app usa una sesión offline (30 días de inactividad) que se revoca en el servidor al cerrar sesión.

## Autorización: matriz RBAC

La única fuente es `backend/src/auth/permissions.ts`. El backend valida cada petición y lee los roles desde PostgreSQL, así que una suspensión o un cambio de rol aplica de inmediato. El portal solo oculta lo que el rol no puede usar.

| Permiso | Superadmin | Admin. técnico | Admin. académico | Coordinador¹ | Profesor | Estudiante | Aspirante | Soporte |
|---|---|---|---|---|---|---|---|---|
| Configuración global, roles | Sí | | | | | | | |
| Auditoría | Sí | Sí | | | | | | |
| Sincronización (integraciones) | Sí | Sí | | | | | | |
| Ver usuarios | Sí | Sí | Sí | Su programa | | | | Sí |
| Gestionar y suspender usuarios | Sí | | Sí | | | | | |
| Programas, cohortes, cursos, profesores | Sí | | Sí | Su programa | | | | |
| Revisar solicitudes de admisión | Sí | | Sí | Su programa | | | | |
| Matrículas | Sí | | Sí | Su programa | | | | |
| Contenidos (CMS) | Sí | | Sí | | | | | |
| Avisos | Sí | | Sí | Su programa | | | | |
| Reportes | Sí | | Sí | Su programa | | | | |
| Acceso al campus | Sí | | Sí | Sí | Sí | Sí | | |
| Solicitar admisión | | | | | | | Sí | |

¹ El coordinador queda limitado al programa asignado. Crear programas está reservado a superadministradores y administradores académicos.

**Roles en Moodle:** superadministrador y administrador académico reciben `manager` de sistema. El coordinador recibe profesor sin edición (`teacher`) en los cursos de su programa. El profesor recibe `editingteacher` en los cursos asignados y el estudiante `student`. Las asignaciones las gestiona el componente `local_iinicia` y nunca tocan las asignaciones hechas a mano en Moodle.

## Protecciones

| Área | Medida |
|---|---|
| Secretos | Solo en variables de entorno del servidor. El navegador recibe cookies `httpOnly`, `SameSite=Lax` y cifradas, y la app no recibe tokens de Moodle |
| CSRF | El BFF y los formularios públicos rechazan peticiones de otro origen (`Origin`), y el cierre de sesión solo acepta POST |
| XSS | El contenido del CMS se convierte a elementos React y nunca se inyecta HTML. Hay CSP con `frame-ancestors 'none'` y `object-src 'none'` |
| Inyección SQL | Todas las consultas están parametrizadas |
| Validación | DTOs con lista blanca (`forbidNonWhitelisted`) |
| Abuso | Límite de escrituras por IP (5 por minuto en registro y solicitudes de información) y campo trampa anti-bot |
| Archivos | Se admiten PNG, JPG y WebP de hasta 5 MB, con el tipo detectado por contenido (no por extensión), servidos con `nosniff`. SVG rechazado |
| Redirecciones | `returnTo` solo acepta rutas internas: no hay redirección abierta |
| Auditoría | `audit_log` registra registros, cambios de rol, admisiones, matrículas, suspensiones, contenidos y sincronizaciones. Un trigger impide modificar o borrar entradas |
| Privacidad | Datos mínimos (nombre, correo, teléfono opcional) y consentimiento registrado con fecha |

## Pendientes antes de producción

- HTTPS en todos los dominios y Keycloak en modo producción.
- Sustituir `'unsafe-inline'` de la CSP por nonces.
- Textos legales definitivos (aviso de privacidad y términos).
- Prueba de penetración externa.
