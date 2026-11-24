import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../modules/auth/auth.decorators';
import { isProgramScoped, Permission } from '../modules/auth/permissions';
import { DbService } from '../db/db.service';
import { KeycloakService } from '../integrations/keycloak.service';
import { AuditService } from '../modules/audit/audit.service';
import { NotificationsService } from './notifications.service';
import { SyncService } from './sync.service';

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly db: DbService,
    private readonly keycloak: KeycloakService,
    private readonly sync: SyncService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  assertProgramScope(actor: AuthUser, permission: Permission, programId: string) {
    if (isProgramScoped(actor.roles, permission) && !actor.programIds.includes(programId)) {
      throw new ForbiddenException('El programa está fuera de tu ámbito');
    }
  }

  async apply(user: AuthUser, programId: string) {
    const program = await this.db.one(`SELECT id FROM programs WHERE id = $1 AND published`, [programId]);
    if (!program) throw new NotFoundException('Programa no disponible');
    const row = await this.db.one(
      `INSERT INTO applications (user_id, program_id) VALUES ($1, $2)
       ON CONFLICT (user_id, program_id) DO NOTHING RETURNING id, status`,
      [user.id, programId],
    );
    if (!row) throw new ConflictException('Ya tienes una solicitud para este programa');
    await this.audit.log({ actorId: user.id, action: 'application.create', targetType: 'application', targetId: String(row.id) });
    return row;
  }

  mine(userId: string) {
    return this.db.query(
      `SELECT a.id, a.status, a.created_at AS "createdAt", a.reviewed_at AS "reviewedAt",
              p.id AS "programId", p.name AS "programName", p.slug AS "programSlug", c.name AS "cohortName"
         FROM applications a JOIN programs p ON p.id = a.program_id LEFT JOIN cohorts c ON c.id = a.cohort_id
        WHERE a.user_id = $1 ORDER BY a.created_at DESC`,
      [userId],
    );
  }

  list(actor: AuthUser, status?: string) {
    const scoped = isProgramScoped(actor.roles, 'applications:review');
    return this.db.query(
      `SELECT a.id, a.status, a.created_at AS "createdAt", a.notes, p.id AS "programId", p.name AS "programName",
              u.id AS "userId", u.email, u.first_name AS "firstName", u.last_name AS "lastName", c.name AS "cohortName"
         FROM applications a JOIN programs p ON p.id = a.program_id JOIN users u ON u.id = a.user_id
         LEFT JOIN cohorts c ON c.id = a.cohort_id
        WHERE ($1::text IS NULL OR a.status = $1) AND (NOT $2::boolean OR a.program_id = ANY($3::uuid[]))
        ORDER BY a.created_at DESC LIMIT 200`,
      [status ?? null, scoped, actor.programIds],
    );
  }

  /** Repetir una admision es seguro: no duplica matriculas ni cuentas Moodle. */
  async decide(actor: AuthUser, applicationId: string, decision: 'admitida' | 'rechazada', cohortId?: string, notes?: string, ip?: string) {
    const application = await this.db.one<{ id: string; user_id: string; program_id: string; status: string; oidc_sub: string; user_status: string; program_name: string }>(
      `SELECT a.id, a.user_id, a.program_id, a.status, u.oidc_sub, u.status AS user_status, p.name AS program_name
         FROM applications a JOIN users u ON u.id = a.user_id JOIN programs p ON p.id = a.program_id WHERE a.id = $1`,
      [applicationId],
    );
    if (!application) throw new NotFoundException('Solicitud no encontrada');
    this.assertProgramScope(actor, 'applications:review', application.program_id);
    if (application.user_status === 'suspendido') throw new BadRequestException('La cuenta está suspendida');
    if (application.status === 'admitida' && decision === 'rechazada') {
      throw new ConflictException('La solicitud ya fue admitida; suspende la matrícula si corresponde');
    }
    if (cohortId) {
      const cohort = await this.db.one(`SELECT 1 AS x FROM cohorts WHERE id = $1 AND program_id = $2`, [cohortId, application.program_id]);
      if (!cohort) throw new BadRequestException('La cohorte no pertenece al programa');
    }

    if (decision === 'rechazada') {
      await this.db.tx(async (client) => {
        await client.query(`UPDATE applications SET status = 'rechazada', notes = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
          [applicationId, notes ?? null, actor.id]);
        await this.audit.log({ actorId: actor.id, action: 'application.reject', targetType: 'application', targetId: applicationId, ip }, client);
      });
      await this.notifications.create(application.user_id, 'Actualización de tu solicitud',
        `Tu solicitud para ${application.program_name} no fue aprobada en esta ocasión.`, '/mi-iinicia');
      return { status: 'rechazada', moodleSynced: false };
    }

    const courses = await this.db.query<{ moodle_course_id: string }>(
      `SELECT moodle_course_id FROM program_courses WHERE program_id = $1`, [application.program_id],
    );
    await this.db.tx(async (client) => {
      await client.query(
        `UPDATE applications SET status = 'admitida', cohort_id = COALESCE($2, cohort_id), notes = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1`,
        [applicationId, cohortId ?? null, notes ?? null, actor.id],
      );
      await client.query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'aspirante'`, [application.user_id]);
      await client.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'estudiante')
         ON CONFLICT (user_id, role, COALESCE(program_id, '00000000-0000-0000-0000-000000000000')) DO NOTHING`,
        [application.user_id],
      );
      await client.query(
        `UPDATE users SET status = CASE WHEN status = 'activo' THEN 'activo' ELSE 'admitido' END,
                moodle_sync_status = 'pending', updated_at = now() WHERE id = $1`,
        [application.user_id],
      );
      for (const c of courses) {
        await client.query(
          `INSERT INTO enrolments (user_id, moodle_course_id, program_id) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, moodle_course_id) DO UPDATE SET status = 'pending', program_id = EXCLUDED.program_id, updated_at = now()`,
          [application.user_id, c.moodle_course_id, application.program_id],
        );
      }
      await this.audit.log({
        actorId: actor.id, action: 'application.admit', targetType: 'application', targetId: applicationId, ip,
        detail: { courses: courses.map((c) => Number(c.moodle_course_id)), cohortId },
      }, client);
    });

    const roles = (await this.db.query<{ role: string }>(`SELECT role FROM user_roles WHERE user_id = $1`, [application.user_id])).map((r) => r.role);
    await this.keycloak.setRealmRoles(application.oidc_sub, roles);
    const moodleSynced = await this.sync.syncUser(application.user_id);
    await this.notifications.create(application.user_id, '¡Fuiste admitido!',
      `Ya puedes entrar a tus cursos de ${application.program_name}.`, '/mi-iinicia');
    return { status: 'admitida', moodleSynced };
  }

  teachers(actor: AuthUser, programId: string) {
    this.assertProgramScope(actor, 'programs:manage', programId);
    return this.db.query(
      `SELECT e.user_id AS "userId", e.moodle_course_id AS "courseId", e.status, u.email, u.first_name AS "firstName", u.last_name AS "lastName"
         FROM enrolments e JOIN users u ON u.id = e.user_id
        WHERE e.program_id = $1 AND e.moodle_role = 'editingteacher' ORDER BY u.last_name`,
      [programId],
    );
  }

  /** Asigna o retira a un profesor de un curso del programa. Retirar conserva su historial en Moodle. */
  async setTeacher(actor: AuthUser, programId: string, courseId: number, userId: string, active: boolean, ip?: string) {
    this.assertProgramScope(actor, 'programs:manage', programId);
    if (!(await this.db.one(`SELECT 1 AS x FROM program_courses WHERE program_id = $1 AND moodle_course_id = $2`, [programId, courseId]))) {
      throw new BadRequestException('El curso no pertenece al programa');
    }
    if (!(await this.db.one(`SELECT 1 AS x FROM user_roles WHERE user_id = $1 AND role = 'profesor'`, [userId]))) {
      throw new BadRequestException('La persona no tiene rol de profesor');
    }
    const current = await this.db.one<{ moodle_role: string }>(
      `SELECT moodle_role FROM enrolments WHERE user_id = $1 AND moodle_course_id = $2`, [userId, courseId],
    );
    if (current && current.moodle_role !== 'editingteacher') throw new ConflictException('La persona ya está en el curso con otro rol');
    if (!current && !active) throw new NotFoundException('Asignación no encontrada');

    await this.db.tx(async (client) => {
      await client.query(
        `INSERT INTO enrolments (user_id, moodle_course_id, program_id, moodle_role, status) VALUES ($1, $2, $3, 'editingteacher', $4)
         ON CONFLICT (user_id, moodle_course_id) DO UPDATE SET status = EXCLUDED.status, program_id = EXCLUDED.program_id, updated_at = now()`,
        [userId, courseId, programId, active ? 'pending' : 'suspended'],
      );
      await client.query(
        `UPDATE users SET status = CASE WHEN status = 'aspirante' THEN 'admitido' ELSE status END,
                moodle_sync_status = 'pending', updated_at = now() WHERE id = $1`,
        [userId],
      );
      await this.audit.log({
        actorId: actor.id, action: active ? 'teacher.assign' : 'teacher.remove',
        targetType: 'user', targetId: userId, detail: { programId, courseId }, ip,
      }, client);
    });
    return { moodleSynced: await this.sync.syncUser(userId) };
  }

  enrolmentsOf(actor: AuthUser, userId: string) {
    const scoped = isProgramScoped(actor.roles, 'enrolments:manage');
    return this.db.query(
      `SELECT e.moodle_course_id AS "courseId", e.moodle_role AS role, e.status, p.name AS "programName"
         FROM enrolments e LEFT JOIN programs p ON p.id = e.program_id
        WHERE e.user_id = $1 AND (NOT $2::boolean OR e.program_id = ANY($3::uuid[])) ORDER BY e.moodle_course_id`,
      [userId, scoped, actor.programIds],
    );
  }

  async setEnrolment(actor: AuthUser, userId: string, courseId: number, active: boolean, ip?: string) {
    const enrolment = await this.db.one<{ program_id: string | null }>(
      `SELECT program_id FROM enrolments WHERE user_id = $1 AND moodle_course_id = $2`, [userId, courseId],
    );
    if (!enrolment) throw new NotFoundException('Matrícula no encontrada');
    if (isProgramScoped(actor.roles, 'enrolments:manage')) {
      if (!enrolment.program_id) throw new ForbiddenException('La matrícula está fuera de tu ámbito');
      this.assertProgramScope(actor, 'enrolments:manage', enrolment.program_id);
    }
    await this.db.tx(async (client) => {
      await client.query(`UPDATE enrolments SET status = $3, updated_at = now() WHERE user_id = $1 AND moodle_course_id = $2`,
        [userId, courseId, active ? 'pending' : 'suspended']);
      await client.query(`UPDATE users SET moodle_sync_status = 'pending', updated_at = now() WHERE id = $1`, [userId]);
      await this.audit.log({
        actorId: actor.id, action: active ? 'enrolment.activate' : 'enrolment.suspend',
        targetType: 'user', targetId: userId, detail: { courseId }, ip,
      }, client);
    });
    return { moodleSynced: await this.sync.syncUser(userId) };
  }
}
