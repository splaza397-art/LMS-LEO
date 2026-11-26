# CLAUDE.md

Las reglas del proyecto para asistentes de IA están en **[AGENTS.md](AGENTS.md)**: arquitectura, los 12 módulos del backend, convenciones, seguridad, base de datos, comandos y restricciones. Léelas antes de modificar código.

Lo más importante:

- Trabaja en la rama de la fase. No integres a `main` ni subas a remotos sin autorización.
- No cambies las rutas de `/api/v1`. Después de tocar el backend, ejecuta `npm run test:contracts`.
- En Android, la interfaz no hace solicitudes ni toca tokens; la caché y la memoria llevan dueño (otra cuenta no ve datos de la anterior). No instales nada en un teléfono físico sin autorización.
- En el portal, no cambies URL públicas. El código va por funcionalidad en `frontend/src/features`, y las llamadas del navegador pasan por `lib/api/client.ts`, sin reintentos.
- No reduzcas controles de seguridad para que una prueba pase, y no inventes resultados de pruebas.
- No modifiques Moodle Core ni leas su base de datos desde el backend.
- No expongas secretos ni datos personales.

Plan y estado de las fases: [documentation/12-plan-de-desarrollo.md](documentation/12-plan-de-desarrollo.md).
