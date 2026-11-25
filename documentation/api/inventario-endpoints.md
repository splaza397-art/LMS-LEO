# Inventario de endpoints

Generado desde el código con `npm run inventory` (en `backend/`). No editar a mano.

Total: **53** endpoints. "sesión" = requiere sesión válida, sin permiso adicional.

| Método | Ruta | Acceso | Código | Límite | Cuerpo | Parámetros |
|---|---|---|---|---|---|---|
| GET | `/api/estado` | público | 200 |  |  |  |
| GET | `/api/v1/admin/applications` | `applications:review` | 200 |  |  | ?order ?page ?pageSize ?programId ?q ?sort ?status |
| POST | `/api/v1/admin/applications/:id/decision` | `applications:review` | 201 |  | DecisionDto | id (ParseUUIDPipe) |
| GET | `/api/v1/admin/audit` | `audit:read` | 200 |  |  | ?action ?from ?order ?page ?pageSize ?q ?sort ?to |
| GET | `/api/v1/admin/content` | `content:manage` | 200 |  |  | ?order ?page ?pageSize ?q ?sort ?status ?type |
| POST | `/api/v1/admin/content` | `content:manage` | 201 |  | ContentDto |  |
| DELETE | `/api/v1/admin/content/:id` | `content:manage` | 200 |  |  | id (ParseUUIDPipe) |
| PUT | `/api/v1/admin/content/:id` | `content:manage` | 200 |  | ContentDto | id (ParseUUIDPipe) |
| GET | `/api/v1/admin/info-requests` | `info_requests:manage` | 200 |  |  | ?order ?page ?pageSize ?programId ?q ?sort ?status |
| PATCH | `/api/v1/admin/info-requests/:id` | `info_requests:manage` | 200 |  | InfoStatusDto | id (ParseUUIDPipe) |
| POST | `/api/v1/admin/media` | `content:manage` | 201 |  |  |  |
| GET | `/api/v1/admin/moodle/courses` | `programs:manage` | 200 |  |  |  |
| POST | `/api/v1/admin/notifications` | `notifications:send` | 201 |  | BroadcastDto |  |
| GET | `/api/v1/admin/programs` | `programs:manage` | 200 |  |  |  |
| POST | `/api/v1/admin/programs` | `programs:manage` | 201 |  | ProgramDto |  |
| PUT | `/api/v1/admin/programs/:id` | `programs:manage` | 200 |  | ProgramDto | id (ParseUUIDPipe) |
| POST | `/api/v1/admin/programs/:id/cohorts` | `programs:manage` | 201 |  | CohortDto | id (ParseUUIDPipe) |
| POST | `/api/v1/admin/programs/:id/courses` | `programs:manage` | 201 |  | ProgramCourseDto | id (ParseUUIDPipe) |
| DELETE | `/api/v1/admin/programs/:id/courses/:courseId` | `programs:manage` | 200 |  |  | courseId (ParseIntPipe) id (ParseUUIDPipe) |
| GET | `/api/v1/admin/programs/:id/teachers` | `programs:manage` | 200 |  |  | id (ParseUUIDPipe) |
| PUT | `/api/v1/admin/programs/:id/teachers` | `programs:manage` | 200 |  | TeacherDto | id (ParseUUIDPipe) |
| GET | `/api/v1/admin/reports` | `reports:read` | 200 |  |  |  |
| GET | `/api/v1/admin/stats` | `users:read` | 200 |  |  |  |
| GET | `/api/v1/admin/teachers` | `programs:manage` | 200 |  |  |  |
| GET | `/api/v1/admin/users` | `users:read` | 200 |  |  | ?order ?page ?pageSize ?programId ?q ?role ?sort ?status |
| PATCH | `/api/v1/admin/users/:id/enrolment` | `enrolments:manage` | 200 |  | EnrolmentDto | id (ParseUUIDPipe) |
| GET | `/api/v1/admin/users/:id/enrolments` | `enrolments:manage` | 200 |  |  | id (ParseUUIDPipe) |
| PUT | `/api/v1/admin/users/:id/roles` | `roles:manage` | 200 |  | RolesDto | id (ParseUUIDPipe) |
| PATCH | `/api/v1/admin/users/:id/suspension` | `users:suspend` | 200 |  | SuspendDto | id (ParseUUIDPipe) |
| POST | `/api/v1/admin/users/:id/sync` | `integrations:manage` | 201 |  |  | id (ParseUUIDPipe) |
| POST | `/api/v1/auth/register` | público | 201 | 5/60s | RegisterDto |  |
| GET | `/api/v1/content/:type` | público | 200 |  |  | type |
| GET | `/api/v1/content/:type/:slug` | público | 200 |  |  | slug type |
| POST | `/api/v1/info-requests` | público | 201 | 5/60s | InfoRequestDto |  |
| GET | `/api/v1/me` | sesión | 200 |  |  |  |
| PATCH | `/api/v1/me` | sesión | 200 |  | UpdateProfileDto |  |
| GET | `/api/v1/me/applications` | sesión | 200 |  |  |  |
| POST | `/api/v1/me/applications` | `application:create` | 201 |  | ApplyDto |  |
| GET | `/api/v1/me/campus-link` | `campus:access` | 200 |  |  | ?cmid ?courseId |
| GET | `/api/v1/me/courses` | sesión | 200 |  |  |  |
| GET | `/api/v1/me/courses/:id` | sesión | 200 |  |  | id (ParseIntPipe) |
| POST | `/api/v1/me/devices` | sesión | 201 |  | DeviceDto |  |
| DELETE | `/api/v1/me/devices/:token` | sesión | 200 |  |  | token |
| POST | `/api/v1/me/logout` | sesión | 200 |  |  |  |
| GET | `/api/v1/me/notifications` | sesión | 200 |  |  |  |
| POST | `/api/v1/me/notifications/:id/read` | sesión | 201 |  |  | id (ParseUUIDPipe) |
| GET | `/api/v1/me/teaching` | sesión | 200 |  |  |  |
| GET | `/api/v1/me/upcoming` | sesión | 200 |  |  |  |
| GET | `/api/v1/media/:id` | público | 200 |  |  | id (ParseUUIDPipe) |
| GET | `/api/v1/programs` | público | 200 |  |  |  |
| GET | `/api/v1/programs/:slug` | público | 200 |  |  | slug |
| GET | `/api/v1/redirects` | público | 200 |  |  |  |
| GET | `/api/v1/sitemap-data` | público | 200 |  |  |  |
