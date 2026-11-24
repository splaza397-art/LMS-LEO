# 02 · Instalación y despliegue

## Requisitos

Docker Desktop (4 CPU y 8 GB recomendados), Node.js 24 y, para la app, Android Studio con JDK 17 o superior.

## Entorno de desarrollo (DEV)

```bash
node infrastructure/scripts/generate-env.mjs        # secretos aleatorios; no sobrescribe archivos existentes
docker build -f infrastructure/moodle/Dockerfile -t iinicia/moodle:5.3.1 .
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d --no-build
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env exec -T -u www-data moodle php public/local/iinicia/cli/seed_cursos.php

cd backend && npm install && npm run build
npm run migrate:wordpress   # contenido institucional desde iinicia.org (idempotente)
npm run seed                # 8 usuarios de prueba @iinicia.test (solo DEV/STAGING)
npm start                   # http://localhost:4000

cd ../frontend && npm install && npm run build && npm start   # http://localhost:3000
```

La primera instalación de Moodle tarda entre 5 y 10 minutos. Cuando `docker compose ps` muestra `moodle` como `healthy`, Moodle quedó instalado y configurado: SSO, servicios web, cuenta de servicio, tema e idioma.

### Puertos (solo escuchan en 127.0.0.1)

| Servicio | Puerto |
|---|---|
| Portal | 3000 |
| Backend | 4000 |
| Moodle | 8081 |
| Keycloak | 8180 |
| PostgreSQL | 5434 |
| Mailpit | 8025 (web), 1025 (SMTP) |

## Variables de entorno

Las genera `generate-env.mjs`. Ningún archivo `.env` se versiona.

| Archivo | Variable | Uso |
|---|---|---|
| `infrastructure/.env` | `*_DB_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, `MOODLE_ADMIN_PASSWORD` | Credenciales de servicios |
| | `MOODLE_WS_TOKEN` | Token del servicio web de Moodle, solo para el backend |
| | `KC_*_CLIENT_SECRET` | Secretos de clientes OIDC |
| | `PORTAL_PUBLIC_URL`, `MOODLE_PUBLIC_URL`, `KEYCLOAK_PUBLIC_URL` | URLs públicas |
| `backend/.env` | `DATABASE_URL`, `KEYCLOAK_*`, `MOODLE_URL`, `MOODLE_WS_TOKEN` | Conexiones |
| | `CORS_ORIGINS` | Orígenes permitidos (el portal) |
| | `MFA_PRIVILEGED_ROLES` | `true` en STAGING y PROD. En DEV vale `false` para cuentas demo y pruebas |
| | `DEMO_PASSWORD` | Contraseña de las cuentas demo (solo DEV) |
| `frontend/.env.local` | `BACKEND_URL`, `PORTAL_URL`, `OIDC_*` | Conexiones del BFF |
| | `SESSION_SECRET` | Llave de cifrado de cookies (64 hex) |

## Paso a STAGING y PRODUCTION

Lista de verificación. Ninguno de estos puntos está aplicado aún, porque dependen del servidor y del dominio.

1. **Dominios y TLS.** Usar `iinicia.org` (portal), `aula.iinicia.org` (Moodle), `auth.iinicia.org` (Keycloak) y `api.iinicia.org` (API) detrás de un proxy inverso con TLS automático (Nginx o Caddy). Actualizar las URLs públicas en los tres `.env` y en `android/gradle.properties`.
2. **Keycloak** en modo `start`, no `start-dev`, con `KC_HOSTNAME` y `KC_PROXY_HEADERS=xforwarded`. Retirar `MOODLE_ALLOW_PRIVATE_HOSTS` de Moodle.
3. **Correo real.** Configurar SMTP en el realm de Keycloak (`smtpServer`) y en Moodle (`smtphosts`).
4. **MFA.** `MFA_PRIVILEGED_ROLES=true`.
5. **Datos de prueba.** No ejecutar `npm run seed` en producción, porque el script se rechaza a sí mismo con `NODE_ENV=production`.
6. **Contenedores** para backend y portal (`node:24-alpine`, `npm ci`, `npm run build`, usuario sin privilegios) y despliegue por CI/CD: rama, Pull Request, revisión, pruebas, STAGING, aceptación y PRODUCTION.
7. **Respaldos programados** (ver [03 · Operación](03-operacion.md)).
8. **Textos legales.** Sustituir el aviso de privacidad y los términos provisionales desde el panel antes de abrir el registro.
9. **Retiro de WordPress.** Hacerlo solo después de validar contenidos, redirecciones 301, analítica y formularios.

## Migración de contenido desde WordPress

`npm run migrate:wordpress` carga programas, páginas, portadas y 15 redirecciones 301. La fuente revisada está en `backend/src/content/iinicia-wordpress.ts`, donde se documenta qué se descartó (elementos de plantilla). El script es idempotente: actualiza los registros por `slug` y las imágenes por URL de origen.
