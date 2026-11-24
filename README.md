# Plataforma Digital IINICIA

Portal Next.js, backend NestJS, Moodle 5.3 LTS, identidad con Keycloak (OIDC) y app Android nativa.

| Carpeta | Contenido |
| --- | --- |
| `frontend/` | Portal, Mi IINICIA y panel de gestión (Next.js 16, TypeScript, Tailwind) |
| `backend/` | API, reglas de negocio, RBAC, auditoría e integración con Moodle (NestJS, PostgreSQL) |
| `android/` | App de estudiantes (Kotlin, Jetpack Compose, AppAuth) |
| `moodle-custom/` | Plugin `local_iinicia` y tema `theme_iinicia`, sin modificar Moodle Core |
| `infrastructure/` | Docker Compose, Keycloak, PostgreSQL y scripts |
| `e2e/` | Pruebas de extremo a extremo con Playwright |
| `documentation/` | Manuales, arquitectura y evidencias. Índice en [documentation/README.md](documentation/README.md) |

Reglas para asistentes de IA y convenciones del código: [AGENTS.md](AGENTS.md).

## Arranque en desarrollo

Requisitos: Docker Desktop, Node.js 24 y, para la app, Android Studio.

```bash
# 1. Generar secretos locales (no sobrescribe archivos existentes)
node infrastructure/scripts/generate-env.mjs

# 2. Construir Moodle y levantar servicios (la primera vez tarda varios minutos)
docker build -f infrastructure/moodle/Dockerfile -t iinicia/moodle:5.3.1 .
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d --no-build

# 3. Cursos en Moodle (Base de Datos e Inter Comunicaciones)
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env exec -T -u www-data moodle php public/local/iinicia/cli/seed_cursos.php

# 4. Backend: migrar contenido de iinicia.org y crear usuarios de prueba
cd backend && npm install && npm run build
npm run migrate:wordpress
npm run seed
npm start

# 5. Portal, en otra terminal
cd frontend && npm install && npm run build && npm start
```

| Servicio | URL |
| --- | --- |
| Portal | http://localhost:3000 |
| API y Swagger | http://localhost:4000/api/docs |
| Moodle | http://localhost:8081 |
| Keycloak | http://localhost:8180 |
| Correo de prueba (Mailpit) | http://localhost:8025 |

El contenido institucional (programas, páginas, portadas y redirecciones 301 de las URLs antiguas) se migra de https://iinicia.org con `npm run migrate:wordpress`; la fuente está en `backend/src/content/iinicia-wordpress.ts`. El logotipo oficial está en `documentation/marca/` y `node scripts/brand-assets.mjs` (en `frontend`) genera sus variantes.

Los usuarios de prueba son `superadmin`, `tecnico`, `academico`, `coordinador`, `profesor`, `estudiante`, `aspirante` y `soporte`, todos con dominio `@iinicia.test`. Su contraseña es el valor `DEMO_PASSWORD` de `backend/.env`.

## App Android

```bash
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:4000 tcp:4000 && adb reverse tcp:8180 tcp:8180 && adb reverse tcp:8081 tcp:8081
```

## Pruebas

```bash
cd backend && npm test                 # unitarias
cd backend && npm run test:integration # con PostgreSQL (servicios encendidos)
cd backend && npm run test:contracts   # compatibilidad de la API con la referencia previa a la Fase 2
cd frontend && npm test                # unitarias del portal
cd e2e && npm install && npx playwright install chromium && npx playwright test
```
