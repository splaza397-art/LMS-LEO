import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from '../../db/db.service';

export interface SyncRow extends Record<string, unknown> {
  id: string; oidc_sub: string; email: string; first_name: string; last_name: string;
  status: string; moodle_user_id: string | null;
}

/**
 * Consultas de la sincronización con Moodle. Excepción documentada a "cada módulo solo lee sus tablas":
 * la sincronización lee el estado que replica (persona, roles, matrículas, cohortes) y escribe las columnas
 * moodle_sync_* de users, la activación de matrículas y el ID de cohorte en Moodle.
 */
@Injectable()
export class SynchronizationRepository {
  constructor(private readonly db: DbService) {}

  /** Personas a reintentar: pendientes, o con error cuya espera progresiva ya venció. */
  dueForRetry() {
    return this.db.query<{ id: string }>(
      `SELECT id FROM users
        WHERE moodle_sync_status = 'pending'
           OR (moodle_sync_status = 'error' AND (moodle_sync_next_at IS NULL OR moodle_sync_next_at <= now()))
        ORDER BY updated_at LIMIT 25`,
    );
  }

  /** Personas con cierre de sesión de Moodle pendiente (Moodle no respondió al salir). */
  pendingMoodleLogouts() {
    return this.db.query<{ id: string; moodle_user_id: string }>(
      `SELECT id, moodle_user_id FROM users
        WHERE moodle_logout_pending_at IS NOT NULL AND moodle_user_id IS NOT NULL
        ORDER BY moodle_logout_pending_at LIMIT 25`,
    );
  }

  setMoodleLogoutPending(userId: string, pending: boolean) {
    return this.db.query(
      `UPDATE users SET moodle_logout_pending_at = ${pending ? 'COALESCE(moodle_logout_pending_at, now())' : 'NULL'} WHERE id = $1`,
      [userId],
    );
  }

  snapshot(userId: string) {
    return this.db.one<SyncRow>(
      `SELECT id, oidc_sub, email, first_name, last_name, status, moodle_user_id FROM users WHERE id = $1`, [userId],
    );
  }

  async roles(userId: string): Promise<string[]> {
    return (await this.db.query<{ role: string }>(`SELECT role FROM user_roles WHERE user_id = $1`, [userId])).map((r) => r.role);
  }

  /** El coordinador supervisa como profesor sin edición los cursos de su programa. */
  async reconcileCoordinatorEnrolments(userId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO enrolments (user_id, moodle_course_id, program_id, moodle_role, status)
       SELECT $1, pc.moodle_course_id, pc.program_id, 'teacher', 'pending'
         FROM user_roles ur JOIN program_courses pc ON pc.program_id = ur.program_id
        WHERE ur.user_id = $1 AND ur.role = 'coordinador'
       ON CONFLICT (user_id, moodle_course_id) DO UPDATE SET status = 'pending', updated_at = now()
        WHERE enrolments.moodle_role = 'teacher' AND enrolments.status = 'suspended'`,
      [userId],
    );
    await this.db.query(
      `UPDATE enrolments e SET status = 'suspended', updated_at = now()
        WHERE e.user_id = $1 AND e.moodle_role = 'teacher' AND e.status <> 'suspended'
          AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN program_courses pc ON pc.program_id = ur.program_id
                           WHERE ur.user_id = e.user_id AND ur.role = 'coordinador' AND pc.moodle_course_id = e.moodle_course_id)`,
      [userId],
    );
  }

  enrolments(userId: string) {
    return this.db.query<{ moodle_course_id: string; moodle_role: string; status: string }>(
      `SELECT moodle_course_id, moodle_role, status FROM enrolments WHERE user_id = $1`, [userId],
    );
  }

  admittedCohorts(userId: string) {
    return this.db.query<{ id: string; name: string }>(
      `SELECT DISTINCT c.id, c.name FROM applications a JOIN cohorts c ON c.id = a.cohort_id
        WHERE a.user_id = $1 AND a.status = 'admitida'`,
      [userId],
    );
  }

  async setMoodleCohortId(cohortId: string, moodleCohortId: number): Promise<void> {
    await this.db.query(`UPDATE cohorts SET moodle_cohort_id = $2 WHERE id = $1`, [cohortId, moodleCohortId]);
  }

  /** Éxito: activa las matrículas pendientes y deja la cuenta sincronizada (en la transacción recibida). */
  async markSynced(client: Queryable, userId: string, moodleUserId: number): Promise<void> {
    await client.query(`UPDATE enrolments SET status = 'active', updated_at = now() WHERE user_id = $1 AND status = 'pending'`, [userId]);
    await client.query(
      `UPDATE users SET moodle_user_id = $2, moodle_sync_status = 'synced', moodle_sync_error = NULL, moodle_synced_at = now(),
              moodle_sync_attempts = 0, moodle_sync_next_at = NULL,
              status = CASE WHEN status = 'admitido' THEN 'activo' ELSE status END, updated_at = now()
        WHERE id = $1`,
      [userId, moodleUserId],
    );
  }

  /** Fallo: guarda el error y programa el siguiente intento con espera progresiva. Devuelve el número de intento. */
  async markFailed(userId: string, message: string, maxBackoffMinutes: number): Promise<number | null> {
    const row = await this.db.one<{ attempts: number }>(
      `UPDATE users SET moodle_sync_status = 'error', moodle_sync_error = $2, updated_at = now(),
              moodle_sync_attempts = moodle_sync_attempts + 1,
              moodle_sync_next_at = now() + least(interval '1 minute' * power(2, moodle_sync_attempts), interval '1 minute' * $3)
        WHERE id = $1 RETURNING moodle_sync_attempts AS attempts`,
      [userId, message, maxBackoffMinutes],
    );
    return row?.attempts ?? null;
  }

  /** Marca a la persona como pendiente de sincronizar (dentro de la transacción del cambio que lo provoca). */
  async markPending(client: Queryable, userId: string): Promise<void> {
    await client.query(`UPDATE users SET moodle_sync_status = 'pending', updated_at = now() WHERE id = $1`, [userId]);
  }
}
