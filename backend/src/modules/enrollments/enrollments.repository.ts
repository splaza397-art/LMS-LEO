import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from '../../db/db.service';

/** Dueño de la tabla enrolments (matrículas de estudiantes, profesores y supervisión). */
@Injectable()
export class EnrollmentsRepository {
  constructor(private readonly db: DbService) {}

  listForUser(userId: string, scoped: boolean, programIds: string[]) {
    return this.db.query(
      `SELECT e.moodle_course_id AS "courseId", e.moodle_role AS role, e.status, p.name AS "programName"
         FROM enrolments e LEFT JOIN programs p ON p.id = e.program_id
        WHERE e.user_id = $1 AND (NOT $2::boolean OR e.program_id = ANY($3::uuid[])) ORDER BY e.moodle_course_id`,
      [userId, scoped, programIds],
    );
  }

  find(userId: string, courseId: number) {
    return this.db.one<{ program_id: string | null; moodle_role: string }>(
      `SELECT program_id, moodle_role FROM enrolments WHERE user_id = $1 AND moodle_course_id = $2`, [userId, courseId],
    );
  }

  async setStatus(client: Queryable, userId: string, courseId: number, status: 'pending' | 'suspended'): Promise<void> {
    await client.query(`UPDATE enrolments SET status = $3, updated_at = now() WHERE user_id = $1 AND moodle_course_id = $2`,
      [userId, courseId, status]);
  }

  /** Sin rol con acceso al campus: se suspenden todas sus matrículas, sin borrar historial. */
  async suspendAllForUser(userId: string): Promise<void> {
    await this.db.query(`UPDATE enrolments SET status = 'suspended', updated_at = now() WHERE user_id = $1`, [userId]);
  }

  /** Admisión: matrícula pendiente en cada curso del programa (idempotente). */
  async upsertPendingForProgram(client: Queryable, userId: string, courseIds: string[], programId: string): Promise<void> {
    for (const courseId of courseIds) {
      await client.query(
        `INSERT INTO enrolments (user_id, moodle_course_id, program_id) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, moodle_course_id) DO UPDATE SET status = 'pending', program_id = EXCLUDED.program_id, updated_at = now()`,
        [userId, courseId, programId],
      );
    }
  }

  async upsertTeacher(client: Queryable, userId: string, courseId: number, programId: string, status: 'pending' | 'suspended'): Promise<void> {
    await client.query(
      `INSERT INTO enrolments (user_id, moodle_course_id, program_id, moodle_role, status) VALUES ($1, $2, $3, 'editingteacher', $4)
       ON CONFLICT (user_id, moodle_course_id) DO UPDATE SET status = EXCLUDED.status, program_id = EXCLUDED.program_id, updated_at = now()`,
      [userId, courseId, programId, status],
    );
  }

  teachersOfProgram(programId: string) {
    return this.db.query(
      `SELECT e.user_id AS "userId", e.moodle_course_id AS "courseId", e.status, u.email, u.first_name AS "firstName", u.last_name AS "lastName"
         FROM enrolments e JOIN users u ON u.id = e.user_id
        WHERE e.program_id = $1 AND e.moodle_role = 'editingteacher' ORDER BY u.last_name`,
      [programId],
    );
  }

  /** Cursos que la persona imparte o supervisa, con matrícula activa. */
  teachingOf(userId: string) {
    return this.db.query<{ moodle_course_id: string; moodle_role: string }>(
      `SELECT moodle_course_id, moodle_role FROM enrolments
        WHERE user_id = $1 AND moodle_role IN ('editingteacher', 'teacher') AND status = 'active' ORDER BY moodle_course_id`,
      [userId],
    );
  }
}
