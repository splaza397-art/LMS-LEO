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
 * Cierre de sesión coordinado (Fases 4.10 y 4.11), sin depender de que el navegador complete una redirección:
 * - Keycloak: cierra la sesión del token (sid), en línea u offline. La sesión queda registrada como cerrada: el
 *   backend ya no emite comprobantes del campus para ella y, si Keycloak no respondió, el reintento la cierra.
 * - Moodle: cierra las sesiones de Moodle abiertas hasta la hora del cierre y revoca los comprobantes emitidos hasta
 *   entonces. Si Moodle no responde, queda pendiente con esa hora.
 * Los reintentos solo tocan lo anterior al cierre: una sesión nueva (otro sid, sesión de Moodle posterior) se respeta.
 * Nunca informa un cierre completo si algún servicio no lo confirmó. Repetir el cierre es inofensivo (idempotente).
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

  /**
   * El corte de Moodle es siempre la hora del servidor al recibir el cierre. No se acepta una hora del cliente: en el
   * teléfono de prueba el reloj iba 77 s atrasado, y un corte anterior al real dejaba viva la sesión de Moodle abierta
   * justo antes de salir (Fase 4.11). Un cierre pendiente de la app cierra todo lo abierto hasta que el servidor lo
   * recibe; una sesión nueva de Keycloak nunca se toca, porque el cierre va por sid.
   */
  async logout(user: AuthUser): Promise<LogoutResult> {
    const at = new Date();
    const [keycloak, moodle] = await Promise.all([this.endKeycloak(user), this.endMoodle(user.id, at)]);
    const result = { keycloak, moodle, complete: keycloak === 'ok' && (moodle === 'ok' || moodle === 'sin_sesion') };
    await this.audit.log({ actorId: user.id, action: 'auth.logout', targetType: 'user', targetId: user.id, detail: { keycloak, moodle } });
    return result;
  }

  private async endKeycloak(user: AuthUser): Promise<LogoutStep> {
    if (!user.sid) return 'error';
    let confirmed = false;
    try {
      confirmed = await this.keycloak.endSession(user.sid);
    } catch {
      this.logger.warn('No se pudo cerrar la sesión en Keycloak; queda pendiente');
    }
    await this.repo.revokeSession(user.sid, user.id, confirmed);
    return confirmed ? 'ok' : 'pendiente';
  }

  private async endMoodle(userId: string, at: Date): Promise<LogoutStep> {
    const snapshot = await this.repo.snapshot(userId);
    if (!snapshot?.moodle_user_id) return 'sin_sesion';
    try {
      await this.moodle.logoutUser(Number(snapshot.moodle_user_id), Math.floor(at.getTime() / 1000));
      await this.repo.setMoodleLogoutPending(userId, false);
      return 'ok';
    } catch {
      await this.repo.setMoodleLogoutPending(userId, true, at);
      return 'pendiente';
    }
  }

  /** Reintento periódico (lo llama SyncService): completa los cierres que Keycloak o Moodle no confirmaron. */
  async retryPendingLogouts(): Promise<void> {
    for (const row of await this.repo.pendingMoodleLogouts()) {
      try {
        await this.moodle.logoutUser(Number(row.moodle_user_id), Number(row.before));
        await this.repo.setMoodleLogoutPending(row.id, false);
        await this.audit.log({ actorId: row.id, action: 'auth.logout_moodle_retry', targetType: 'user', targetId: row.id });
      } catch {
        // Moodle sigue sin responder: se intenta en la siguiente vuelta.
      }
    }
    for (const row of await this.repo.pendingKeycloakLogouts()) {
      try {
        if (await this.keycloak.endSession(row.sid)) {
          await this.repo.confirmKeycloakLogout(row.sid);
          await this.audit.log({ actorId: row.user_id, action: 'auth.logout_keycloak_retry', targetType: 'user', targetId: row.user_id });
        }
      } catch {
        // Keycloak sigue sin responder.
      }
    }
    await this.repo.pruneSessionRevocations();
  }
}
