# Documentación técnica — Plataforma Digital IINICIA

Plataforma que sustituye el portal WordPress de IINICIA (Instituto de Innovación y Ciencias Aplicadas) por un portal Next.js, un backend NestJS, Moodle 5.3 LTS como LMS, Keycloak como proveedor de identidad y una app Android nativa.

| Documento | Para quién | Contenido |
|---|---|---|
| [01 · Arquitectura](01-arquitectura.md) | Todo el equipo | Componentes, flujos, decisiones técnicas |
| [02 · Instalación y despliegue](02-instalacion-y-despliegue.md) | Desarrollo, infraestructura | Entorno local, variables, paso a producción |
| [03 · Operación y respaldos](03-operacion.md) | Infraestructura, soporte | Arranque, registros, respaldo y restauración, incidencias |
| [04 · Seguridad y roles](04-seguridad.md) | Todo el equipo | Autenticación, MFA, matriz RBAC, protecciones, auditoría |
| [05 · API e integración con Moodle](05-api-e-integracion.md) | Backend, Android | Endpoints, servicios web de Moodle, sincronización |
| [06 · App Android](06-android.md) | Móvil | Arquitectura, compilación, configuración, publicación |
| [07 · Manual de administración](07-manual-administracion.md) | Área académica | Admisiones, programas, profesores, contenidos, reportes |
| [08 · Manual de usuario](08-manual-usuario.md) | Aspirantes, estudiantes, profesores | Registro, Mi IINICIA, campus y app |
| [09 · Pruebas y evidencias](09-pruebas-y-evidencias.md) | QA, dirección | Pruebas automáticas, resultados, criterios de aceptación |

Material complementario:

- `api/openapi.json`: especificación OpenAPI generada por el backend. En desarrollo también se consulta en http://localhost:4000/api/docs.
- `marca/`: logotipo oficial de origen. Las variantes se generan con `frontend/scripts/brand-assets.mjs`.
- `evidencias/`: capturas, resultado de carga y verificación de respaldo.
