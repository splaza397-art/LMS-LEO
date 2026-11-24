# 11 · Fase 1.5: Estabilización antes de la refactorización

**Fecha:** 24/11/2026 · **Rama:** `fix/pre-refactor-stabilization` · **Entorno:** DEV local (Windows 11 y Docker Desktop). No se modificaron servicios externos.

## 1. Estado inicial

- El proyecto no estaba bajo control de versiones.
- La auditoría ([10-auditoria-tecnica.md](10-auditoria-tecnica.md)) confirmó:
  - **I1:** cohortes duplicadas en Moodle. Hizo fallar 1 de 51 pruebas E2E.
  - **S1:** el límite de intentos se evadía cambiando `X-Forwarded-For`.
  - **S2:** `nodemailer` estaba sin uso y tenía una vulnerabilidad alta.
- **Diagnóstico de Moodle antes de corregir** (consultas de solo lectura): 0 cohortes, 0 usuarios, 0 vínculos OIDC y 0 matrículas duplicados. La limpieza de pruebas ya había borrado los que dejó la prueba fallida. No hubo nada que combinar ni borrar.

## 2. Control de versiones

| Paso | Detalle |
|---|---|
| `.gitignore` | Excluye:<ul><li>dependencias, compilados, cachés y temporales;</li><li>`.env` y `.env.*` (salvo `.env.example`);</li><li>`*.jks`, `*.keystore`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `google-services.json`;</li><li>`backups/`, `*.dump`, `*.tar.gz`;</li><li>resultados de pruebas.</li></ul> |
| `.gitattributes` | Finales LF en todo el repositorio (los `.sh` y `gradlew` corren dentro de Linux) y CRLF solo en `.bat` y `.cmd` |
| `.env.example` | Uno por proyecto (backend, frontend, infrastructure), con los mismos nombres de variable y `<cambiar>` en cada secreto |
| Repositorio anidado | `frontend/.git`, creado por `create-next-app`, solo tenía su commit inicial y no tenía remoto. Se movió, sin borrarlo, a `backups/frontend-git-create-next-app/.git` (excluido de Git) para que el portal entre como archivos normales y no como submódulo |
| Revisión previa al primer commit | 229 archivos:<ul><li>ninguno coincide con rutas sensibles;</li><li>se buscaron los 13 valores secretos reales de los `.env` dentro del contenido preparado, con 0 coincidencias;</li><li>el realm de Keycloak, Docker Compose y la configuración de Moodle solo usan variables `${...}` o `getenv()`;</li><li>las capturas de evidencia solo muestran cuentas de prueba `@iinicia.test`.</li></ul> |
| Ramas | `main` (base) y `fix/pre-refactor-stabilization` (esta fase). Sin remoto |

---

## 3. I1 · Cohortes duplicadas en Moodle

### Causa raíz

`local_iinicia_set_cohort_member` buscaba la cohorte por `idnumber` y, si no la encontraba, la creaba, sin exclusión mutua entre ambos pasos. Moodle no exige que `idnumber` sea único en `mdl_cohort`.

Al admitir a una persona, la sincronización de la admisión y el reintento automático (cada 60 s, con un bloqueo `running` que solo vivía en memoria) podían ejecutarse a la vez. Así se creaban dos cohortes iguales.

Los mismos dos pasos sin bloqueo existían en otros dos servicios:
- **`upsert_user`:** no duplicaba porque el `username` es único, pero la segunda llamada fallaba con `dml_write_exception` y la persona quedaba en `error`.
- **`set_enrolment`:** la segunda llamada fallaba por el índice único de matrícula.

**Reproducción antes de la corrección:** la prueba nueva lanza 8 llamadas simultáneas. Falló 3 de 3 veces con `{"exception":"dml_write_exception"}`.

### Solución

| Capa | Cambio |
|---|---|
| Moodle (`local_iinicia` 2026112402) | `\local_iinicia\lock` usa la fábrica de bloqueos de Moodle; en PostgreSQL son bloqueos consultivos, válidos entre procesos y servidores, y se liberan solos si el proceso muere. Envuelve "buscar o crear" en:<ul><li>`upsert_user` (clave: UUID IINICIA, con transacción y `rollback` explícito);</li><li>`set_cohort_member` (clave: `idnumber`);</li><li>`set_enrolment` (clave: persona y curso).</li></ul>Si ya existieran duplicados de antes, `set_cohort_member` usa siempre la cohorte más antigua y no crea otra. **Moodle Core no se modificó** |
| Moodle | Script `cli/diagnose_duplicates.php`, de solo lectura, que informa cohortes, usuarios, vínculos OIDC e instancias de matrícula duplicados. **No borra ni combina nada** |
| Backend | `DbService.withLock()` usa un bloqueo consultivo de PostgreSQL por persona (`moodle-sync:<uuid>`):<ul><li>Usa un pool de conexiones aparte (5) para que quien espera nunca agote las conexiones de quien trabaja.</li><li>Una solicitud (admisión, cambio de rol, sincronización manual) espera hasta 30 s.</li><li>El reintento automático no espera: si otra instancia ya sincroniza a esa persona, la omite.</li></ul> |
| Backend | Reintentos con espera progresiva de 1, 2, 4, 8… minutos, con tope de 1 hora. Usa las columnas `moodle_sync_attempts` y `moodle_sync_next_at` (migración `004`, solo agrega columnas). Cada fallo queda en `audit_log` como `moodle.sync_failed`, con el número de intento y el error |

**Identificadores estables:**
- persona: UUID IINICIA, en `mdl_user.idnumber`;
- vínculo OIDC: `sub` de Keycloak;
- cohorte: UUID de la cohorte del portal, en `mdl_cohort.idnumber`;
- matrícula: persona y curso, con índice único en Moodle.

---

## 4. S1 · Evasión del límite de intentos

### Causa raíz

Cadena: navegador → Next.js (portal) → NestJS.

1. **Next.js** conserva el `X-Forwarded-For` que manda el navegador; solo lo completa si falta (`base-server.js`: `??=`).
2. **El portal** lo reenviaba tal cual en `/api/registro`, `/api/informacion` y el BFF.
3. **El backend** confiaba en él porque el portal se conecta por `loopback` (`trust proxy = 'loopback'`).
4. **El contador** de intentos vivía en memoria: con N instancias se permitía N veces el límite.

### Solución

| Salto | Regla nueva |
|---|---|
| Navegador → Nginx (STAGING/PROD, Fase 6) | Nginx escribe la IP real de la conexión: `proxy_set_header X-Forwarded-For $remote_addr;` o `$proxy_add_x_forwarded_for`. Ninguno de los dos permite que el cliente elija la IP final |
| → Portal | `forwardedFor()` (`frontend/src/lib/client-ip.ts`):<ul><li>Con `TRUSTED_PROXY_HOPS=0` (DEV, sin proxy) ignora `X-Forwarded-For` y **no reenvía ninguna IP**.</li><li>Con `1` (Nginx delante) toma la última dirección de la cadena, la que agregó Nginx, y verifica que sea una IP.</li></ul>El portal no debe ser accesible sin pasar por Nginx |
| → Backend | `TRUSTED_PROXIES` es una lista explícita (DEV: `loopback`; PROD: direcciones internas de Nginx y del portal). El arranque **falla** si alguien configura `true`, `*`, `0.0.0.0/0` o `::/0`. El backend escucha en `HOST` (por omisión `127.0.0.1`), así que no se puede llegar a él directamente desde la red |
| Contador | `PgThrottlerStorage`: tabla `throttle_counters` en PostgreSQL (migración `005`, `UNLOGGED` porque son datos efímeros) con incremento atómico, compartida por todas las instancias |

**Límites sin cambios:**
- 240 escrituras por minuto por IP (las lecturas no cuentan);
- 5 por minuto en registro y solicitudes de información.

**Acceso directo al backend:** con `HOST=127.0.0.1`, la conexión por la IP de red de la PC queda rechazada (`curl` respondió `000`); por `localhost` y desde el portal funciona. La app Android en el teléfono sigue usando `adb reverse`, que llega por `localhost`.

**Consecuencia conocida en DEV:** sin Nginx, el portal no puede conocer la IP de cada visitante, así que todos los registros hechos desde el portal comparten un mismo contador. Es más estricto, no más débil. En STAGING y PROD, con Nginx y `TRUSTED_PROXY_HOPS=1`, el límite vuelve a ser por visitante.

---

## 5. S2 · Dependencia vulnerable

- `npm ls` confirmó que nada depende de `nodemailer` ni de `@types/nodemailer`, y ningún archivo los importa.
- `config.mail` y las variables `SMTP_HOST`, `SMTP_PORT` y `MAIL_FROM` eran configuración muerta. Los correos los envía Keycloak con su propio SMTP.
- Se eliminaron con `npm uninstall`. El `package-lock.json` solo perdió esas dos entradas; no se actualizó ninguna otra dependencia.
- No se usó `npm audit fix --force`.
- Tu `backend/.env` conserva las 3 variables SMTP, que ya no se leen. No lo modifiqué.

---

## 6. Archivos modificados

| Área | Archivos |
|---|---|
| Moodle | `local/iinicia/classes/lock.php` (nuevo); `classes/external/upsert_user.php`, `set_cohort_member.php`, `set_enrolment.php`; `cli/diagnose_duplicates.php` (nuevo); `cli/cleanup_e2e.php`; `lang/es` y `lang/en`; `version.php` |
| Backend | `db/db.module.ts` (nuevo); `db/db.service.ts`; `core/sync.service.ts`; `security/trusted-proxies.ts` (nuevo); `security/pg-throttler.storage.ts` (nuevo); `app.module.ts`; `config.ts`; `main.ts`; migraciones `004` y `005` (nuevas); `package.json` y `package-lock.json`; `.env.example` |
| Portal | `lib/client-ip.ts` (nuevo); `app/api/registro`, `app/api/informacion`, `app/api/bff`; `package.json` (scripts `test` y `typecheck`); `tsconfig.json` (`allowImportingTsExtensions`, para las pruebas); `.gitignore`; `.env.example` |
| Infraestructura | `scripts/generate-env.mjs` (`HOST`, `TRUSTED_PROXIES`, `TRUSTED_PROXY_HOPS`; sin SMTP) |
| Pruebas | Ver la sección 7 |
| Raíz | `.gitignore`, `.gitattributes` |

## 7. Pruebas agregadas

| Prueba | Qué comprueba |
|---|---|
| `e2e/tests/concurrency.spec.ts` › Moodle | 8 llamadas simultáneas a `upsert_user`, `set_cohort_member` y `set_enrolment`. Todas terminan bien y queda 1 cuenta, 1 cohorte con 1 miembro y 1 matrícula |
| `e2e/tests/concurrency.spec.ts` › backend | Admisión y 4 sincronizaciones manuales al mismo tiempo. Queda 1 cuenta, 1 cohorte, 1 membresía, 1 matrícula y estado `synced` |
| `backend/test/integration/lock.int.test.ts` | Con 2 `DbService` (2 instancias) contra PostgreSQL:<ul><li>exclusión mutua;</li><li>la sincronización sin espera se omite;</li><li>si el proceso con el bloqueo muere, el bloqueo se libera;</li><li>un error libera el bloqueo.</li></ul> |
| `e2e/tests/client-ip.spec.ts` | <ul><li>Por el portal, cambiar `X-Forwarded-For` en cada intento termina en `429`.</li><li>Un proxy de confianza conserva la IP del cliente y el límite es por IP.</li><li>Con **una segunda instancia real del backend** (puerto 4001), los intentos repartidos se bloquean igual en el sexto.</li></ul> |
| `backend/test/trusted-proxies.test.ts` | Configuración segura por omisión; rechazo de `true`, `*` y `0.0.0.0/0`; resolución de la IP con la misma librería que Express (`proxy-addr`) para conexión directa, portal y Nginx |
| `backend/test/integration/throttler.int.test.ts` | Contador compartido entre 2 instancias, incremento atómico con 20 intentos simultáneos, contadores separados por IP y fin de la ventana |
| `frontend/test/client-ip.test.ts` | Sin proxy se ignora el encabezado; con Nginx se toma la dirección agregada por él; se rechaza lo que no es IP; una configuración inválida equivale a no confiar |

Las pruebas nuevas se ejecutaron primero contra el código sin corregir:
- `concurrency` › Moodle: 3 de 3 fallaron.
- `client-ip`: 2 de 3 fallaron. Por el portal se obtuvieron 7 respuestas `400` sin ningún bloqueo; con dos instancias, el sexto intento no se bloqueó.

## 8. Resultados reales (24/11/2026)

| Validación | Resultado |
|---|---|
| Backend: unitarias | **26 de 26**: 19 anteriores y 7 nuevas |
| Backend: integración (PostgreSQL real) | **8 de 8** |
| Backend: typecheck y compilación | Correctos |
| Portal: typecheck, ESLint y compilación | Correctos, sin avisos |
| Portal: unitarias | **5 de 5** |
| E2E completa (Playwright) | **56 de 56** en 11.3 min: las 51 anteriores y las 5 nuevas. La prueba `admin.spec.ts` que falló en la auditoría pasa |
| Repeticiones (defecto intermitente) | `concurrency` › Moodle: **20 de 20**. `concurrency` › backend: **10 de 10**. `admin.spec` › "admisión con cohorte": **5 de 5** |
| Diagnóstico de duplicados en Moodle después de todo | "Sin duplicados" |
| `npm audit --omit=dev` (producción) | Backend, portal y E2E: **0 vulnerabilidades** |
| `npm audit` (incluye herramientas de desarrollo) | Backend: 3 moderadas en `@nestjs/cli` (→ `glob`, `minimatch`). E2E: 3 moderadas en `autocannon` (→ `hyperid`, `uuid`). Portal: 0. **No llegan a producción.** Corregirlas exige actualizar a versiones mayores; queda pendiente de autorización |
| Android: `assembleDebug` y `lintDebug` | Compila. Lint: 0 errores y 35 avisos (los mismos de la auditoría; Android no cambió en esta fase). Sin pruebas propias todavía (Fase 4) |

**Costo medido:** con el bloqueo de Moodle, 8 llamadas idénticas se atienden una tras otra, en unos 0.6 s cada una en este equipo. En la práctica hay 2 o 3 por persona.

## 9. Commits

| Commit | Contenido |
|---|---|
| `b5706d6` | `chore: establish IINICIA baseline after technical audit` (rama `main`) |
| `a5edc1a` | `fix(sync): prevent duplicate Moodle cohorts under concurrent synchronization` |
| `5645ec4` | `fix(security): stop X-Forwarded-For spoofing from bypassing rate limits` |
| `9cb4deb` | `chore(deps): remove unused nodemailer (high-severity advisories)` |
| Siguiente commit | `docs: document phase 1.5 stabilization and updated development plan` (este documento, el plan y las capturas regeneradas por la corrida E2E) |

## 10. Riesgos pendientes

1. **Producción necesita Nginx bien configurado:**
   - Nginx debe escribir `X-Forwarded-For`.
   - El portal no debe ser accesible directamente.
   - Hay que ajustar `TRUSTED_PROXY_HOPS=1` y `TRUSTED_PROXIES`.
   
   Se hará en la Fase 6. Mientras tanto, DEV es seguro, pero comparte un contador entre todos los visitantes del portal.
2. **Moodle no tiene restricción de unicidad** en `mdl_cohort.idnumber`; la protección depende del bloqueo. No se puede agregar sin modificar el esquema de Moodle Core.
3. **Una admisión puede tardar hasta 30 s** si otra sincronización de la misma persona está en curso. Después responde `moodleSynced: false` y el reintento la completa.
4. **Comportamiento previo, no cambiado:** la sincronización manual (`POST /admin/users/:id/sync`) crea cuenta de Moodle incluso a un aspirante. Se revisará en la Fase 5.
5. **Vulnerabilidades moderadas** en herramientas de desarrollo (sección 8).
6. **Contador de intentos en tabla `UNLOGGED`:** si PostgreSQL se reinicia de forma abrupta, los contadores vuelven a cero. Es aceptable para límites de un minuto.

## 11. Procedimiento de recuperación

- **Volver al estado anterior a esta fase:** `git switch main`, porque `main` no tiene estos cambios. También se puede deshacer una sola corrección con `git revert <commit>`.
- **Moodle:**
  - Al deshacer el cambio del plugin hay que **mantener `version.php` en 2026112402 o mayor**, porque Moodle no acepta bajar la versión de un plugin instalado.
  - Después: `docker compose --env-file .env up -d --build moodle moodle-cron`.
- **Migraciones 004 y 005:** solo agregan columnas y una tabla. Si hiciera falta quitarlas, primero hay que revertir el código y después ejecutar:

  ```sql
  ALTER TABLE users DROP COLUMN moodle_sync_attempts, DROP COLUMN moodle_sync_next_at;
  DROP TABLE throttle_counters;
  DELETE FROM schema_migrations WHERE name IN ('004_sincronizacion_reintentos.sql', '005_limite_intentos.sql');
  ```

  No es necesario para volver atrás: el código anterior ignora esas columnas y esa tabla.
- **Diagnóstico de duplicados**, en cualquier momento y sin modificar nada:

  ```bash
  docker compose exec -u www-data moodle php public/local/iinicia/cli/diagnose_duplicates.php
  ```

- **Respaldo de datos:** `node infrastructure/scripts/backup.mjs --verify`, antes de cualquier cambio en un servidor real.
