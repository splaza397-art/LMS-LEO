# 09 · Pruebas y evidencias

## Cómo ejecutarlas

```bash
cd backend && npm test                       # pruebas unitarias (RBAC, MFA, imágenes, proxies de confianza)
cd backend && npm run test:integration       # integración con PostgreSQL (bloqueos, límite de intentos)
cd frontend && npm test                      # pruebas unitarias del portal
cd e2e && npx playwright test                # extremo a extremo contra los servicios reales
cd e2e && node load.mjs 25 15                # carga: 25 conexiones durante 15 s por ruta
node infrastructure/scripts/backup.mjs --verify   # respaldo con restauración comprobada
```

Las pruebas de extremo a extremo limpian antes y después sus propios datos (`e2e/cleanup.mjs`) y conservan las cuentas demo. El reporte HTML queda en `evidencias/reporte-e2e/` y las capturas en `evidencias/capturas/`.

## Cobertura

| Archivo | Qué verifica |
|---|---|
| `poc.spec.ts` | Prueba de concepto obligatoria: registro, correo de confirmación con diseño IINICIA y regreso al portal, solicitud, admisión, cuenta y matrícula en Moodle, SSO sin segunda contraseña. También tokens fuera del navegador |
| `auth.spec.ts` | Pantalla de acceso con marca y enlace al registro, guía de contraseña y correo duplicado en el registro, contraseña incorrecta, recuperación de contraseña y cierre de sesión |
| `roles.spec.ts` | Matriz RBAC de los 8 roles contra la API, SSO a Moodle de 5 roles, último superadministrador protegido y límites del coordinador |
| `panels.spec.ts` | Panel de cada rol (profesor con avance real de Moodle, estudiante, coordinador, aspirante, soporte y técnico) |
| `admin.spec.ts` | Programas, cohortes y profesores desde la interfaz, idempotencia, suspensión sin pérdida de historial, roles en Moodle, CMS con imagen y HTML neutralizado, solicitudes de información y CSV |
| `security.spec.ts` | Cabeceras, redirección abierta, CSRF, rutas del BFF, tokens falsificados, acceso a datos ajenos, inyección SQL, anti-bot, límites, carga de archivos y auditoría inalterable |
| `concurrency.spec.ts` | Sincronizaciones simultáneas: una sola cuenta, cohorte y matrícula en Moodle (defecto I1) |
| `client-ip.spec.ts` | El límite de intentos no se evade con `X-Forwarded-For` y se comparte entre instancias del backend (defecto S1) |
| `a11y-seo.spec.ts` | WCAG 2.2 AA automático (axe) a 360 y 1280 px sin desbordes, teclado, SEO, sitemap, robots, 404 reales y redirecciones 301 de WordPress |

## Resultados (24/11/2026, entorno DEV en una PC)

- **Unitarias:** backend 26 de 26 y portal 5 de 5. Integración del backend contra PostgreSQL: 8 de 8.
- **Extremo a extremo:** 56 de 56 aprobadas en la corrida completa (11.3 min). Detalle en [11-estabilizacion-pre-refactorizacion.md](11-estabilizacion-pre-refactorizacion.md).
- **Carga:** entre 39 y 59 páginas por segundo por ruta, sin errores (`evidencias/carga.json`). Es una PC de desarrollo con todos los servicios, no un servidor.
- **Respaldo:** restauración verificada (`evidencias/respaldo-verificado.json`).
- **MFA:** verificada con una cuenta temporal (`capturas/32-mfa-configurar.png`).
- **Android:** probado en un teléfono físico la versión previa. La versión actual compila y su prueba en el teléfono está pendiente.

La accesibilidad se revisó de forma automática. Falta la revisión manual con lector de pantalla (NVDA, TalkBack).

## Criterios de aceptación

| ID | Criterio | Estado |
|---|---|---|
| CA-01 | WordPress fuera de la arquitectura | Cumplido en el código. El apagado depende del despliegue |
| CA-02 | Portal en React/Next.js | Cumplido |
| CA-03 | Crear cuenta desde el portal | Cumplido (poc.spec) |
| CA-04 | Cuenta Moodle sin duplicados | Cumplido (poc.spec, admin.spec) |
| CA-05 | Roles y permisos | Cumplido (roles.spec) |
| CA-06 | Autorizar programas, cohortes y matrículas | Cumplido (admin.spec) |
| CA-07 | Solo cursos permitidos | Cumplido (security.spec) |
| CA-08 / CA-09 | SSO sin segunda contraseña | Cumplido (roles.spec) |
| CA-10 | Sin tokens de Moodle en React | Cumplido (security.spec) |
| CA-11 / CA-12 / CA-13 | App: misma identidad, cursos y actividades con SSO | Cumplido en teléfono físico (versión previa) |
| CA-14 | Notificaciones móviles controladas | Parcial: por consulta periódica, sin FCM |
| CA-15 | Identidad visual coherente | Cumplido: portal, acceso, Moodle y app con logotipo y colores IINICIA |
| CA-16 | Contenido editable sin código | Cumplido (admin.spec) |
| CA-17 | Accesibilidad y responsive | Cumplido de forma automática. Falta la revisión manual |
| CA-18 | DEV, STAGING y PRODUCTION | Pendiente: solo existe DEV |
| CA-19 | Respaldos y restauración probados | Cumplido en DEV |
| CA-20 | Apagar WordPress sin afectar | Pendiente del despliegue |
