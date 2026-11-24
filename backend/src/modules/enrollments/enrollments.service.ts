import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.decorators';
import { isProgramScoped } from '../auth/permissions';
import { assertProgramScope } from '../auth/program-scope';
import { SynchronizationRepository } from '../synchronization/synchronization.repository';
import { SyncService } from '../synchronization/sync.service';
import { EnrollmentsRepository } from './enrollments.repository';

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly db: DbService,
    private readonly enrollments: EnrollmentsRepository,
    private readonly syncState: SynchronizationRepository,
    private readonly sync: SyncService,
    private readonly audit: AuditService,
  ) {}

  listForUser(actor: AuthUser, userId: string) {
    return this.enrollments.listForUser(userId, isProgramScoped(actor.roles, 'enrolments:manage'), actor.programIds);
  }

  async setEnrolment(actor: AuthUser, userId: string, courseId: number, active: boolean, ip?: string) {
    const enrolment = await this.enrollments.find(userId, courseId);
    if (!enrolment) throw new NotFoundException('Matrícula no encontrada');
    if (isProgramScoped(actor.roles, 'enrolments:manage')) {
      if (!enrolment.program_id) throw new ForbiddenException('La matrícula está fuera de tu ámbito');
      assertProgramScope(actor, 'enrolments:manage', enrolment.program_id);
    }
    await this.db.tx(async (client) => {
      await this.enrollments.setStatus(client, userId, courseId, active ? 'pending' : 'suspended');
      await this.syncState.markPending(client, userId);
      await this.audit.log({
        actorId: actor.id, action: active ? 'enrolment.activate' : 'enrolment.suspend',
        targetType: 'user', targetId: userId, detail: { courseId }, ip,
      }, client);
    });
    return { moodleSynced: await this.sync.syncUser(userId) };
  }
}
