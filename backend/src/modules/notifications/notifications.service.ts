import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.decorators';
import { isProgramScoped } from '../auth/permissions';
import { assertProgramScope } from '../auth/program-scope';
import { UsersRepository } from '../users/users.repository';
import type { BroadcastDto } from './notifications.dto';
import { NotificationsRepository } from './notifications.repository';

/**
 * Las notificaciones se guardan aqui y la app Android las consulta en segundo plano.
 * Para FCM basta enviar a la tabla devices dentro de create(); requiere un proyecto Firebase.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
  ) {}

  create(userId: string, title: string, body: string, link?: string) {
    return this.notifications.create(userId, title, body, link ?? null);
  }

  list(userId: string) {
    return this.notifications.list(userId);
  }

  async markRead(userId: string, id: string) {
    await this.notifications.markRead(userId, id);
    return { ok: true };
  }

  async registerDevice(userId: string, token: string, enabled: boolean) {
    await this.notifications.upsertDevice(userId, token, enabled);
    return { ok: true };
  }

  async removeDevice(userId: string, token: string) {
    await this.notifications.removeDevice(userId, token);
    return { ok: true };
  }

  async broadcast(actor: AuthUser, dto: BroadcastDto) {
    const scoped = isProgramScoped(actor.roles, 'notifications:send');
    if (scoped && !dto.programId) throw new ForbiddenException('Debes indicar un programa de tu ámbito');
    if (dto.programId) assertProgramScope(actor, 'notifications:send', dto.programId);
    if (!dto.programId && !dto.userId) throw new ForbiddenException('Indica un programa o un usuario destinatario');
    const recipients = await this.users.activeRecipients(dto.programId ?? null, dto.userId ?? null);
    for (const r of recipients) await this.create(r.id, dto.title, dto.body, dto.link);
    await this.audit.log({ actorId: actor.id, action: 'notification.broadcast', detail: { programId: dto.programId, userId: dto.userId, recipients: recipients.length } });
    return { recipients: recipients.length };
  }
}
