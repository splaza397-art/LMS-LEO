import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { MoodleService } from '../../integrations/moodle/moodle.service';
import { AuditService } from '../audit/audit.service';
import { SessionService } from './session.service';
import { SynchronizationRepository } from './synchronization.repository';

const MOODLE_MANAGER_ROLES = new Set(['superadmin', 'admin_academico']);

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

  constructor(
    private readonly db: DbService,
    private readonly repo: SynchronizationRepository,
    private readonly moodle: MoodleService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

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
      // Sin espera: si otra solicitud o instancia ya sincroniza a esa persona, se omite en esta vuelta.
      for (const row of await this.repo.dueForRetry()) await this.syncUser(row.id, { wait: false });
      // Cierres de sesión de Moodle que quedaron pendientes porque Moodle no respondía (Fase 4.10).
      await this.sessions.retryPendingMoodleLogouts();
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
    const user = await this.repo.snapshot(userId);
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
      const roles = await this.repo.roles(userId);
      await this.moodle.setSystemRole(result.moodleuserid, 'manager', roles.some((r) => MOODLE_MANAGER_ROLES.has(r)));

      await this.repo.reconcileCoordinatorEnrolments(userId);
      const enrolments = await this.repo.enrolments(userId);
      for (const e of enrolments) {
        await this.moodle.setEnrolment(result.moodleuserid, Number(e.moodle_course_id), e.moodle_role, e.status !== 'suspended');
      }

      for (const cohort of await this.repo.admittedCohorts(userId)) {
        const { cohortid } = await this.moodle.setCohortMember(cohort.id, cohort.name, result.moodleuserid, true);
        await this.repo.setMoodleCohortId(cohort.id, cohortid);
      }
      await this.db.tx(async (client) => {
        await this.repo.markSynced(client, userId, result.moodleuserid);
        await this.audit.log({
          action: 'moodle.sync', targetType: 'user', targetId: userId,
          detail: { moodleUserId: result.moodleuserid, created: result.created, enrolments: enrolments.length },
        }, client);
      });
      return true;
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      const attempt = await this.repo.markFailed(userId, message, MAX_BACKOFF_MINUTES);
      await this.audit.log({
        action: 'moodle.sync_failed', targetType: 'user', targetId: userId,
        detail: { attempt, error: message },
      }).catch(() => undefined);
      this.logger.warn(`Sincronizacion pendiente para ${userId} (intento ${attempt ?? '?'}): ${message}`);
      return false;
    }
  }
}
