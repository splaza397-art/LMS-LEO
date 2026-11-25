import { Injectable, Logger } from '@nestjs/common';
import { KeycloakService } from '../../integrations/keycloak/keycloak.service';
import { MoodleService } from '../../integrations/moodle/moodle.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.decorators';
import { SynchronizationRepository } from './synchronization.repository';

/** Resultado de cada servicio: "ok" solo si el servicio lo confirmó. */
export type LogoutStep = 'ok' | 'pendiente' | 'error' | 'sin_sesion';
export interface LogoutResult {
  keycloak: LogoutStep;
  moodle: LogoutStep;
  /** true solo si ambos servicios confirmaron el cierre. */
  complete: boolean;
}

/**
 * Cierre de sesión coordinado (Fase 4.10), sin depender de que el navegador complete una redirección:
 * - Keycloak: cierra la sesión del token (sid), en línea u offline.
 * - Moodle: cierra todas las sesiones de Moodle de la persona; si Moodle no responde, queda pendiente y el
 *   reintento periódico lo completa.
 * Nunca informa un cierre completo si algún servicio no lo confirmó.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly keycloak: KeycloakService,
    private readonly moodle: MoodleService,
    private readonly repo: SynchronizationRepository,
    private readonly audit: AuditService,
  ) {}

  async logout(user: AuthUser): Promise<LogoutResult> {
    const [keycloak, moodle] = await Promise.all([this.endKeycloak(user), this.endMoodle(user.id)]);
    const result = { keycloak, moodle, complete: keycloak === 'ok' && (moodle === 'ok' || moodle === 'sin_sesion') };
    await this.audit.log({ actorId: user.id, action: 'auth.logout', targetType: 'user', targetId: user.id, detail: { keycloak, moodle } });
    return result;
  }

  private async endKeycloak(user: AuthUser): Promise<LogoutStep> {
    if (!user.sid) return 'error';
    try {
      return (await this.keycloak.endSession(user.sid)) ? 'ok' : 'error';
    } catch {
      this.logger.warn('No se pudo cerrar la sesión en Keycloak');
      return 'error';
    }
  }

  private async endMoodle(userId: string): Promise<LogoutStep> {
    const snapshot = await this.repo.snapshot(userId);
    if (!snapshot?.moodle_user_id) return 'sin_sesion';
    try {
      await this.moodle.logoutUser(Number(snapshot.moodle_user_id));
      await this.repo.setMoodleLogoutPending(userId, false);
      return 'ok';
    } catch {
      await this.repo.setMoodleLogoutPending(userId, true);
      return 'pendiente';
    }
  }

  /** Reintento periódico (lo llama SyncService): cierra en Moodle las sesiones que quedaron pendientes. */
  async retryPendingMoodleLogouts(): Promise<void> {
    for (const row of await this.repo.pendingMoodleLogouts()) {
      try {
        await this.moodle.logoutUser(Number(row.moodle_user_id));
        await this.repo.setMoodleLogoutPending(row.id, false);
        await this.audit.log({ actorId: row.id, action: 'auth.logout_moodle_retry', targetType: 'user', targetId: row.id });
      } catch {
        // Moodle sigue sin responder: se intenta en la siguiente vuelta.
      }
    }
  }
}
