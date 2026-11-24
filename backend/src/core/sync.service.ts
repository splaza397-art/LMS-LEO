import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { MoodleService } from '../integrations/moodle.service';
import { AuditService } from './audit.service';

const MOODLE_MANAGER_ROLES = new Set(['superadmin', 'admin_academico']);

interface SyncRow extends Record<string, unknown> {
  id: string; oidc_sub: string; email: string; first_name: string; last_name: string;
  status: string; moodle_user_id: string | null;
}

/** Espera maxima de una solicitud (admision, cambio de rol) por la sincronizacion en curso de la misma persona. */
const LOCK_WAIT_MS = 30_000;
/** Espera progresiva entre reintentos: 1, 2, 4, 8... minutos, con tope de 1 hora. */
const MAX_BACKOFF_MINUTES = 60;

/**
 * Sincronizacion idempotente con Moodle. Si el LMS falla, queda pendiente y se reintenta.
 *
 * Una sola sincronizacion por persona a la vez, aunque haya varias instancias del backend: el bloqueo es un
 * bloqueo consultivo de PostgreSQL (defecto I1 de la auditoria). Moodle aplica ademas su propio bloqueo.
 */
@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly db: DbService, private readonly moodle: MoodleService, private readonly audit: AuditService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.retryPending(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async retryPending() {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.db.query<{ id: string }>(
        `SELECT id FROM users
          WHERE moodle_sync_status = 'pending'
             OR (moodle_sync_status = 'error' AND (moodle_sync_next_at IS NULL OR moodle_sync_next_at <= now()))
          ORDER BY updated_at LIMIT 25`,
      );
      // Sin espera: si otra solicitud o instancia ya sincroniza a esa persona, se omite en esta vuelta.
      for (const row of rows) await this.syncUser(row.id, { wait: false });
    } catch (error) {
      this.logger.error(`Reintento fallido: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Devuelve true si Moodle quedo consistente con el portal. Con wait = false no espera a una sincronizacion
   * en curso de la misma persona (la usa el reintento automatico).
   */
  async syncUser(userId: string, { wait = true }: { wait?: boolean } = {}): Promise<boolean> {
    const outcome = await this.db.withLock(`moodle-sync:${userId}`, wait ? LOCK_WAIT_MS : 0, () => this.syncLocked(userId));
    if (!outcome.acquired) {
      if (wait) this.logger.warn(`Sincronizacion de ${userId} sigue en curso en otro proceso; queda para el reintento`);
      return false;
    }
    return outcome.result;
  }

  private async syncLocked(userId: string): Promise<boolean> {
    const user = await this.db.one<SyncRow>(
      `SELECT id, oidc_sub, email, first_name, last_name, status, moodle_user_id FROM users WHERE id = $1`, [userId],
    );
    if (!user?.oidc_sub) return false;
    try {
      const result = await this.moodle.upsertUser({
        uuid: user.id,
        sub: user.oidc_sub,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        suspended: user.status === 'suspendido',
      });
      const roles = (await this.db.query<{ role: string }>(`SELECT role FROM user_roles WHERE user_id = $1`, [userId])).map((r) => r.role);
      await this.moodle.setSystemRole(result.moodleuserid, 'manager', roles.some((r) => MOODLE_MANAGER_ROLES.has(r)));

      // El coordinador supervisa como profesor sin edicion los cursos de su programa.
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

      const enrolments = await this.db.query<{ moodle_course_id: string; moodle_role: string; status: string }>(
        `SELECT moodle_course_id, moodle_role, status FROM enrolments WHERE user_id = $1`, [userId],
      );
      for (const e of enrolments) {
        await this.moodle.setEnrolment(result.moodleuserid, Number(e.moodle_course_id), e.moodle_role, e.status !== 'suspended');
      }

      const cohorts = await this.db.query<{ id: string; name: string }>(
        `SELECT DISTINCT c.id, c.name FROM applications a JOIN cohorts c ON c.id = a.cohort_id
          WHERE a.user_id = $1 AND a.status = 'admitida'`,
        [userId],
      );
      for (const cohort of cohorts) {
        const { cohortid } = await this.moodle.setCohortMember(cohort.id, cohort.name, result.moodleuserid, true);
        await this.db.query(`UPDATE cohorts SET moodle_cohort_id = $2 WHERE id = $1`, [cohort.id, cohortid]);
      }
      await this.db.tx(async (client) => {
        await client.query(`UPDATE enrolments SET status = 'active', updated_at = now() WHERE user_id = $1 AND status = 'pending'`, [userId]);
        await client.query(
          `UPDATE users SET moodle_user_id = $2, moodle_sync_status = 'synced', moodle_sync_error = NULL, moodle_synced_at = now(),
                  moodle_sync_attempts = 0, moodle_sync_next_at = NULL,
                  status = CASE WHEN status = 'admitido' THEN 'activo' ELSE status END, updated_at = now()
            WHERE id = $1`,
          [userId, result.moodleuserid],
        );
        await this.audit.log({
          action: 'moodle.sync', targetType: 'user', targetId: userId,
          detail: { moodleUserId: result.moodleuserid, created: result.created, enrolments: enrolments.length },
        }, client);
      });
      return true;
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      const row = await this.db.one<{ attempts: number }>(
        `UPDATE users SET moodle_sync_status = 'error', moodle_sync_error = $2, updated_at = now(),
                moodle_sync_attempts = moodle_sync_attempts + 1,
                moodle_sync_next_at = now() + least(interval '1 minute' * power(2, moodle_sync_attempts), interval '1 minute' * $3)
          WHERE id = $1 RETURNING moodle_sync_attempts AS attempts`,
        [userId, message, MAX_BACKOFF_MINUTES],
      );
      await this.audit.log({
        action: 'moodle.sync_failed', targetType: 'user', targetId: userId,
        detail: { attempt: row?.attempts ?? null, error: message },
      }).catch(() => undefined);
      this.logger.warn(`Sincronizacion pendiente para ${userId} (intento ${row?.attempts ?? '?'}): ${message}`);
      return false;
    }
  }
}
