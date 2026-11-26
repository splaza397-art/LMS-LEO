import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KeycloakService, type KeycloakSession } from '../../integrations/keycloak/keycloak.service';
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
/** device: solo la sesión de este dispositivo (sid del token). all: todas las sesiones de la persona. */
export type LogoutScope = 'device' | 'all';
type MoodleTarget = { scope: 'device'; kcsid: string } | { scope: 'all' };

/**
 * Cierre de sesión coordinado (Fases 4.10, 4.11 y 5), sin depender de que el navegador complete una redirección.
 *
 * - **Este dispositivo** (predeterminado): Keycloak cierra la sesión del token (sid) y Moodle cierra solo las sesiones
 *   asociadas a ese sid por el comprobante (más las no asociadas anteriores al cierre). Otros dispositivos siguen.
 * - **Todas las sesiones**: Keycloak cierra todas las de la persona (en línea y offline), Moodle todas las anteriores
 *   al cierre, y los tokens emitidos hasta ahora dejan de valer en la API (users.sessions_revoked_at).
 *
 * Lo que un servicio no confirma queda pendiente en la base de datos y lo completa el reintento periódico; cada
 * pendiente lleva su sid o su hora, así que un reintento antiguo nunca cierra una sesión nueva (otro sid).
 * Nunca informa un cierre completo si algún servicio no lo confirmó. Repetir el cierre es inofensivo.
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
   * justo antes de salir (Fase 4.11).
   */
  async logout(user: AuthUser, scope: LogoutScope = 'device'): Promise<LogoutResult> {
    const at = new Date();
    // Sin sid no se puede identificar el dispositivo: se cierra todo en Moodle (política segura).
    const target: MoodleTarget = scope === 'device' && user.sid ? { scope: 'device', kcsid: user.sid } : { scope: 'all' };
    const keycloakStep = scope === 'all' ? this.endAllKeycloak(user.id, user.sub, at) : this.endKeycloak(user);
    const [keycloak, moodle] = await Promise.all([keycloakStep, this.endMoodle(user.id, target, at)]);
    const result = { keycloak, moodle, complete: keycloak === 'ok' && (moodle === 'ok' || moodle === 'sin_sesion') };
    await this.audit.log({
      actorId: user.id, action: scope === 'all' ? 'auth.logout_all' : 'auth.logout', targetType: 'user', targetId: user.id,
      detail: { keycloak, moodle },
    });
    return result;
  }

  /** Administración (Fase 5): sesiones de Keycloak de una persona, para revocar una sesión comprometida. */
  async listSessions(actor: AuthUser, userId: string): Promise<KeycloakSession[]> {
    const target = await this.target(actor, userId);
    return this.keycloak.listSessions(target.oidc_sub);
  }

  /** Administración: revoca una sesión concreta (comprometida) en Keycloak y su campus en Moodle. */
  async revokeSession(actor: AuthUser, userId: string, sid: string, ip?: string): Promise<LogoutResult> {
    const target = await this.target(actor, userId);
    const sessions = await this.keycloak.listSessions(target.oidc_sub);
    if (!sessions.some((s) => s.id === sid)) throw new NotFoundException('La sesión no existe o ya se cerró');
    const at = new Date();
    const [keycloak, moodle] = await Promise.all([
      this.endKeycloak({ id: userId, sid } as AuthUser),
      this.endMoodle(userId, { scope: 'device', kcsid: sid }, at),
    ]);
    await this.audit.log({ actorId: actor.id, action: 'security.session_revoked', targetType: 'user', targetId: userId, ip, detail: { keycloak, moodle } });
    return { keycloak, moodle, complete: keycloak === 'ok' && (moodle === 'ok' || moodle === 'sin_sesion') };
  }

  /** Administración: revoca todas las sesiones de una persona por motivos de seguridad. */
  async revokeAll(actor: AuthUser, userId: string, ip?: string): Promise<LogoutResult> {
    const target = await this.target(actor, userId);
    const at = new Date();
    const [keycloak, moodle] = await Promise.all([
      this.endAllKeycloak(userId, target.oidc_sub, at),
      this.endMoodle(userId, { scope: 'all' }, at),
    ]);
    await this.audit.log({ actorId: actor.id, action: 'security.sessions_revoked', targetType: 'user', targetId: userId, ip, detail: { keycloak, moodle } });
    return { keycloak, moodle, complete: keycloak === 'ok' && (moodle === 'ok' || moodle === 'sin_sesion') };
  }

  /** Igual que la suspensión: solo un superadministrador actúa sobre otro superadministrador. */
  private async target(actor: AuthUser, userId: string) {
    const target = await this.repo.snapshot(userId);
    if (!target) throw new NotFoundException('Usuario no encontrado');
    const roles = await this.repo.roles(userId);
    if (roles.includes('superadmin') && !actor.roles.includes('superadmin')) {
      throw new ForbiddenException('Solo un superadministrador puede revocar las sesiones de otro');
    }
    return target;
  }

  private async endKeycloak(user: Pick<AuthUser, 'id' | 'sid'>): Promise<LogoutStep> {
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

  private async endAllKeycloak(userId: string, sub: string, at: Date): Promise<LogoutStep> {
    let confirmed = false;
    try {
      await this.keycloak.logoutAll(sub);
      confirmed = true;
    } catch {
      this.logger.warn('No se pudieron cerrar todas las sesiones en Keycloak; queda pendiente');
    }
    // Los tokens emitidos hasta ahora dejan de valer en la API desde ya, aunque Keycloak no haya respondido.
    await this.repo.revokeAllSessions(userId, at, !confirmed);
    return confirmed ? 'ok' : 'pendiente';
  }

  private async endMoodle(userId: string, target: MoodleTarget, at: Date): Promise<LogoutStep> {
    const snapshot = await this.repo.snapshot(userId);
    if (!snapshot?.moodle_user_id) return 'sin_sesion';
    try {
      await this.moodle.logoutUser(Number(snapshot.moodle_user_id), Math.floor(at.getTime() / 1000), target);
      return 'ok';
    } catch {
      await this.repo.queueMoodleLogout(userId, target.scope, target.scope === 'device' ? target.kcsid : null, at);
      return 'pendiente';
    }
  }

  /** Reintento periódico (lo llama SyncService): completa los cierres que Keycloak o Moodle no confirmaron. */
  async retryPendingLogouts(): Promise<void> {
    for (const row of await this.repo.pendingMoodleLogouts()) {
      try {
        const target: MoodleTarget = row.scope === 'device' && row.kc_sid ? { scope: 'device', kcsid: row.kc_sid } : { scope: 'all' };
        await this.moodle.logoutUser(Number(row.moodle_user_id), Number(row.before), target);
        await this.repo.doneMoodleLogout(row.id);
        await this.audit.log({ actorId: row.user_id, action: 'auth.logout_moodle_retry', targetType: 'user', targetId: row.user_id, detail: { scope: row.scope } });
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
    for (const row of await this.repo.pendingRevokeAll()) {
      try {
        await this.keycloak.logoutAll(row.oidc_sub);
        await this.repo.doneRevokeAll(row.id);
        await this.audit.log({ actorId: row.id, action: 'auth.logout_all_keycloak_retry', targetType: 'user', targetId: row.id });
      } catch {
        // Keycloak sigue sin responder.
      }
    }
    await this.repo.pruneSessionRevocations();
  }
}
