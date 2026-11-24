import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.guard';
import { isProgramScoped } from '../auth/permissions';
import { AccountsService } from '../core/accounts.service';
import { AdmissionsService } from '../core/admissions.service';
import { AuditService } from '../core/audit.service';
import { NotificationsService } from '../core/notifications.service';
import { SyncService } from '../core/sync.service';
import { DbService } from '../db/db.service';
import { MoodleService } from '../integrations/moodle.service';
import { BroadcastDto, CohortDto, ContentDto, DecisionDto, EnrolmentDto, InfoStatusDto, ProgramCourseDto, ProgramDto, RolesDto, SuspendDto, TeacherDto } from './dto';
import { detectImage } from './image';

@ApiTags('administracion')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly db: DbService,
    private readonly accounts: AccountsService,
    private readonly admissions: AdmissionsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly sync: SyncService,
    private readonly moodle: MoodleService,
  ) {}

  @Get('stats')
  @RequirePermission('users:read')
  async stats(@CurrentUser() actor: AuthUser) {
    const scoped = isProgramScoped(actor.roles, 'users:read');
    return this.db.one(
      `SELECT (SELECT count(*)::int FROM users u WHERE NOT $1::boolean OR EXISTS (SELECT 1 FROM applications a WHERE a.user_id = u.id AND a.program_id = ANY($2::uuid[]))) AS users,
              (SELECT count(*)::int FROM applications a WHERE a.status = 'enviada' AND (NOT $1::boolean OR a.program_id = ANY($2::uuid[]))) AS "pendingApplications",
              (SELECT count(*)::int FROM programs p WHERE NOT $1::boolean OR p.id = ANY($2::uuid[])) AS programs,
              (SELECT count(*)::int FROM users WHERE moodle_sync_status = 'error' AND NOT $1::boolean) AS "syncErrors"`,
      [scoped, actor.programIds],
    );
  }

  // Usuarios
  @Get('users')
  @RequirePermission('users:read')
  users(@CurrentUser() actor: AuthUser, @Query('q') q?: string) {
    return this.accounts.list(actor, q ?? '');
  }

  @Patch('users/:id/suspension')
  @RequirePermission('users:suspend')
  suspend(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendDto, @Req() req: Request) {
    return this.accounts.setSuspended(actor, id, dto.suspended, req.ip);
  }

  @Put('users/:id/roles')
  @RequirePermission('roles:manage')
  roles(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RolesDto, @Req() req: Request) {
    return this.accounts.setRoles(actor, id, dto.roles, dto.programId ?? null, req.ip);
  }

  @Post('users/:id/sync')
  @RequirePermission('integrations:manage')
  async syncUser(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.audit.log({ actorId: actor.id, action: 'moodle.manual_sync', targetType: 'user', targetId: id });
    return { synced: await this.sync.syncUser(id) };
  }

  @Patch('users/:id/enrolment')
  @RequirePermission('enrolments:manage')
  enrolment(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrolmentDto, @Req() req: Request) {
    return this.admissions.setEnrolment(actor, id, dto.courseId, dto.active, req.ip);
  }

  // Admisiones
  @Get('applications')
  @RequirePermission('applications:review')
  applications(@CurrentUser() actor: AuthUser, @Query('status') status?: string) {
    return this.admissions.list(actor, status);
  }

  @Post('applications/:id/decision')
  @RequirePermission('applications:review')
  decide(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @Req() req: Request) {
    return this.admissions.decide(actor, id, dto.decision, dto.cohortId, dto.notes, req.ip);
  }

  // Programas
  @Get('programs')
  @RequirePermission('programs:manage')
  programs(@CurrentUser() actor: AuthUser) {
    const scoped = isProgramScoped(actor.roles, 'programs:manage');
    return this.db.query(
      `SELECT p.id, p.slug, p.name, p.level, p.summary, p.description, p.duration, p.modality, p.published, p.image_url AS "imageUrl",
              COALESCE((SELECT json_agg(pc.moodle_course_id) FROM program_courses pc WHERE pc.program_id = p.id), '[]') AS "courseIds",
              COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name)) FROM cohorts c WHERE c.program_id = p.id), '[]') AS cohorts
         FROM programs p WHERE NOT $1::boolean OR p.id = ANY($2::uuid[]) ORDER BY p.name`,
      [scoped, actor.programIds],
    );
  }

  @Post('programs')
  @RequirePermission('programs:manage')
  async createProgram(@CurrentUser() actor: AuthUser, @Body() dto: ProgramDto) {
    if (isProgramScoped(actor.roles, 'programs:manage')) throw new ForbiddenException('Un coordinador no crea programas');
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO programs (slug, name, level, summary, description, duration, modality, published, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'En línea'), $8, $9) RETURNING id`,
      [dto.slug, dto.name, dto.level, dto.summary, dto.description ?? '', dto.duration ?? '', dto.modality ?? null, dto.published, dto.imageUrl ?? null],
    );
    await this.audit.log({ actorId: actor.id, action: 'program.create', targetType: 'program', targetId: row!.id });
    return row;
  }

  @Put('programs/:id')
  @RequirePermission('programs:manage')
  async updateProgram(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProgramDto) {
    this.admissions.assertProgramScope(actor, 'programs:manage', id);
    const row = await this.db.one(
      `UPDATE programs SET slug = $2, name = $3, level = $4, summary = $5, description = $6, duration = $7,
              modality = COALESCE($8, modality), published = $9, image_url = $10, updated_at = now() WHERE id = $1 RETURNING id`,
      [id, dto.slug, dto.name, dto.level, dto.summary, dto.description ?? '', dto.duration ?? '', dto.modality ?? null, dto.published, dto.imageUrl ?? null],
    );
    if (!row) throw new NotFoundException('Programa no encontrado');
    await this.audit.log({ actorId: actor.id, action: 'program.update', targetType: 'program', targetId: id });
    return row;
  }

  @Post('programs/:id/cohorts')
  @RequirePermission('programs:manage')
  async createCohort(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CohortDto) {
    this.admissions.assertProgramScope(actor, 'programs:manage', id);
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO cohorts (program_id, name, starts_on, ends_on) VALUES ($1, $2, $3, $4) RETURNING id, name`,
      [id, dto.name, dto.startsOn ?? null, dto.endsOn ?? null],
    );
    await this.audit.log({ actorId: actor.id, action: 'cohort.create', targetType: 'cohort', targetId: row!.id });
    return row;
  }

  @Post('programs/:id/courses')
  @RequirePermission('programs:manage')
  async linkCourse(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProgramCourseDto) {
    this.admissions.assertProgramScope(actor, 'programs:manage', id);
    if (!(await this.moodle.listCourses()).some((c) => c.id === dto.moodleCourseId)) throw new NotFoundException('Curso Moodle no encontrado');
    await this.db.query(`INSERT INTO program_courses VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, dto.moodleCourseId]);
    await this.audit.log({ actorId: actor.id, action: 'program.link_course', targetType: 'program', targetId: id, detail: { courseId: dto.moodleCourseId } });
    return { ok: true };
  }

  @Delete('programs/:id/courses/:courseId')
  @RequirePermission('programs:manage')
  async unlinkCourse(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('courseId', ParseIntPipe) courseId: number) {
    this.admissions.assertProgramScope(actor, 'programs:manage', id);
    await this.db.query(`DELETE FROM program_courses WHERE program_id = $1 AND moodle_course_id = $2`, [id, courseId]);
    await this.audit.log({ actorId: actor.id, action: 'program.unlink_course', targetType: 'program', targetId: id, detail: { courseId } });
    return { ok: true };
  }

  @Get('programs/:id/teachers')
  @RequirePermission('programs:manage')
  teachers(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admissions.teachers(actor, id);
  }

  @Put('programs/:id/teachers')
  @RequirePermission('programs:manage')
  setTeacher(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TeacherDto, @Req() req: Request) {
    return this.admissions.setTeacher(actor, id, dto.courseId, dto.userId, dto.active, req.ip);
  }

  @Get('users/:id/enrolments')
  @RequirePermission('enrolments:manage')
  enrolments(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admissions.enrolmentsOf(actor, id);
  }

  @Get('teachers')
  @RequirePermission('programs:manage')
  teacherCandidates() {
    return this.db.query(
      `SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName"
         FROM users u JOIN user_roles r ON r.user_id = u.id
        WHERE r.role = 'profesor' AND u.status <> 'suspendido' ORDER BY u.last_name`,
    );
  }

  // Reportes
  @Get('reports')
  @RequirePermission('reports:read')
  reports(@CurrentUser() actor: AuthUser) {
    const scoped = isProgramScoped(actor.roles, 'reports:read');
    return this.db.query(
      `SELECT p.id, p.name, p.level,
              (SELECT count(*)::int FROM applications a WHERE a.program_id = p.id AND a.status = 'enviada') AS pending,
              (SELECT count(*)::int FROM applications a WHERE a.program_id = p.id AND a.status = 'admitida') AS admitted,
              (SELECT count(*)::int FROM applications a WHERE a.program_id = p.id AND a.status = 'rechazada') AS rejected,
              (SELECT count(DISTINCT e.user_id)::int FROM enrolments e WHERE e.program_id = p.id AND e.moodle_role = 'student' AND e.status = 'active') AS "activeStudents",
              (SELECT count(DISTINCT e.user_id)::int FROM enrolments e WHERE e.program_id = p.id AND e.moodle_role = 'student' AND e.status = 'suspended') AS "suspendedStudents",
              (SELECT count(DISTINCT e.user_id)::int FROM enrolments e WHERE e.program_id = p.id AND e.moodle_role = 'editingteacher' AND e.status <> 'suspended') AS teachers,
              (SELECT count(*)::int FROM program_courses pc WHERE pc.program_id = p.id) AS courses
         FROM programs p WHERE NOT $1::boolean OR p.id = ANY($2::uuid[]) ORDER BY p.name`,
      [scoped, actor.programIds],
    );
  }

  // Solicitudes de informacion
  @Get('info-requests')
  @RequirePermission('info_requests:manage')
  infoRequests() {
    return this.db.query(
      `SELECT r.id, r.name, r.email, r.phone, r.message, r.status, r.created_at AS "createdAt", p.name AS "programName"
         FROM info_requests r LEFT JOIN programs p ON p.id = r.program_id ORDER BY r.created_at DESC LIMIT 200`,
    );
  }

  @Patch('info-requests/:id')
  @RequirePermission('info_requests:manage')
  async infoRequestStatus(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InfoStatusDto) {
    const row = await this.db.one(
      `UPDATE info_requests SET status = $2, handled_by = $3, handled_at = now() WHERE id = $1 RETURNING id`, [id, dto.status, actor.id],
    );
    if (!row) throw new NotFoundException('Solicitud no encontrada');
    await this.audit.log({ actorId: actor.id, action: 'info_request.status', targetType: 'info_request', targetId: id, detail: { status: dto.status } });
    return { ok: true };
  }

  // Medios: el tipo se decide por el contenido real del archivo, nunca por lo que declara el cliente.
  @Post('media')
  @RequirePermission('content:manage')
  async upload(@CurrentUser() actor: AuthUser, @Req() req: Request) {
    const data = req.body as unknown;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new BadRequestException('Sube una imagen PNG, JPG o WebP de hasta 5 MB');
    const mime = detectImage(data);
    if (!mime) throw new BadRequestException('El archivo no es una imagen PNG, JPG o WebP válida');
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO media (mime, size_bytes, data, uploaded_by) VALUES ($1, $2, $3, $4) RETURNING id`, [mime, data.length, data, actor.id],
    );
    await this.audit.log({ actorId: actor.id, action: 'media.upload', targetType: 'media', targetId: row!.id, detail: { mime, size: data.length } });
    return { id: row!.id, url: `/media/${row!.id}` };
  }

  @Get('moodle/courses')
  @RequirePermission('programs:manage')
  moodleCourses() {
    return this.moodle.listCourses();
  }

  // Contenidos (CMS propio)
  @Get('content')
  @RequirePermission('content:manage')
  content(@Query('type') type?: string) {
    return this.db.query(
      `SELECT id, type, slug, title, summary, body, image_url AS "imageUrl", seo_title AS "seoTitle", seo_description AS "seoDescription",
              sort_order AS "sortOrder", status, published_at AS "publishedAt", updated_at AS "updatedAt"
         FROM content_items WHERE $1::text IS NULL OR type = $1 ORDER BY updated_at DESC LIMIT 300`,
      [type ?? null],
    );
  }

  @Post('content')
  @RequirePermission('content:manage')
  async createContent(@CurrentUser() actor: AuthUser, @Body() dto: ContentDto) {
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO content_items (type, slug, title, summary, body, image_url, seo_title, seo_description, sort_order, status, published_at, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $10 = 'publicado' THEN now() END, $11) RETURNING id`,
      [dto.type, dto.slug, dto.title, dto.summary ?? '', dto.body ?? '', dto.imageUrl ?? null, dto.seoTitle ?? null,
        dto.seoDescription ?? null, dto.sortOrder ?? 0, dto.status, actor.id],
    );
    await this.audit.log({ actorId: actor.id, action: 'content.create', targetType: 'content', targetId: row!.id });
    return row;
  }

  @Put('content/:id')
  @RequirePermission('content:manage')
  async updateContent(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ContentDto) {
    const row = await this.db.one(
      `UPDATE content_items SET type = $2, slug = $3, title = $4, summary = $5, body = $6, image_url = $7, seo_title = $8,
              seo_description = $9, sort_order = $10, status = $11,
              published_at = CASE WHEN $11 = 'publicado' THEN COALESCE(published_at, now()) END,
              updated_by = $12, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id, dto.type, dto.slug, dto.title, dto.summary ?? '', dto.body ?? '', dto.imageUrl ?? null, dto.seoTitle ?? null,
        dto.seoDescription ?? null, dto.sortOrder ?? 0, dto.status, actor.id],
    );
    if (!row) throw new NotFoundException('Contenido no encontrado');
    await this.audit.log({ actorId: actor.id, action: 'content.update', targetType: 'content', targetId: id });
    return row;
  }

  @Delete('content/:id')
  @RequirePermission('content:manage')
  async deleteContent(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const row = await this.db.one(`DELETE FROM content_items WHERE id = $1 RETURNING id, type, slug`, [id]);
    if (!row) throw new NotFoundException('Contenido no encontrado');
    await this.audit.log({ actorId: actor.id, action: 'content.delete', targetType: 'content', targetId: id, detail: row });
    return { ok: true };
  }

  // Notificaciones
  @Post('notifications')
  @RequirePermission('notifications:send')
  async broadcast(@CurrentUser() actor: AuthUser, @Body() dto: BroadcastDto) {
    const scoped = isProgramScoped(actor.roles, 'notifications:send');
    if (scoped && !dto.programId) throw new ForbiddenException('Debes indicar un programa de tu ámbito');
    if (dto.programId) this.admissions.assertProgramScope(actor, 'notifications:send', dto.programId);
    if (!dto.programId && !dto.userId) throw new ForbiddenException('Indica un programa o un usuario destinatario');
    const recipients = await this.db.query<{ id: string }>(
      `SELECT DISTINCT u.id FROM users u LEFT JOIN enrolments e ON e.user_id = u.id
        WHERE u.status = 'activo' AND ($1::uuid IS NULL OR e.program_id = $1) AND ($2::uuid IS NULL OR u.id = $2)`,
      [dto.programId ?? null, dto.userId ?? null],
    );
    for (const r of recipients) await this.notifications.create(r.id, dto.title, dto.body, dto.link);
    await this.audit.log({ actorId: actor.id, action: 'notification.broadcast', detail: { programId: dto.programId, userId: dto.userId, recipients: recipients.length } });
    return { recipients: recipients.length };
  }

  @Get('audit')
  @RequirePermission('audit:read')
  auditLog() {
    return this.db.query(
      `SELECT l.id, l.action, l.target_type AS "targetType", l.target_id AS "targetId", l.detail, l.created_at AS "createdAt", u.email AS actor
         FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.created_at DESC LIMIT 200`,
    );
  }
}
