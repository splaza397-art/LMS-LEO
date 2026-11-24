import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { oneOf, optionalUuid, PageQuery, parsePage, searchTerm, toPageResult } from '../../common/pagination';
import { DbService } from '../../db/db.service';
import { KeycloakService } from '../../integrations/keycloak/keycloak.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.decorators';
import { isProgramScoped } from '../auth/permissions';
import { assertProgramScope } from '../auth/program-scope';
import { EnrollmentsRepository } from '../enrollments/enrollments.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { ProgramsRepository } from '../programs/programs.repository';
import { SyncService } from '../synchronization/sync.service';
import { UsersRepository } from '../users/users.repository';
import { AdmissionsRepository, APPLICATION_SORT, INFO_REQUEST_SORT } from './admissions.repository';
import type { InfoRequestDto } from './admissions.dto';

export const APPLICATION_STATUSES = ['enviada', 'admitida', 'rechazada'] as const;
export const INFO_REQUEST_STATUSES = ['nueva', 'atendida'] as const;

export interface ApplicationListQuery extends PageQuery { status?: string; programId?: string; q?: string }
export interface InfoRequestListQuery extends PageQuery { status?: string; programId?: string; q?: string }

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly db: DbService,
    private readonly admissions: AdmissionsRepository,
    private readonly programs: ProgramsRepository,
    private readonly users: UsersRepository,
    private readonly enrollments: EnrollmentsRepository,
    private readonly keycloak: KeycloakService,
    private readonly sync: SyncService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async apply(user: AuthUser, programId: string) {
    if (!(await this.programs.findPublished(programId))) throw new NotFoundException('Programa no disponible');
    const row = await this.admissions.insertApplication(user.id, programId);
    if (!row) throw new ConflictException('Ya tienes una solicitud para este programa');
    await this.audit.log({ actorId: user.id, action: 'application.create', targetType: 'application', targetId: String(row.id) });
    return row;
  }

  mine(userId: string) {
    return this.admissions.mine(userId);
  }

  list(actor: AuthUser, query: ApplicationListQuery) {
    const page = parsePage(query, APPLICATION_SORT);
    // `status` ya existía y no se validaba: un valor desconocido devolvía una lista vacía. Se conserva ese
    // comportamiento para no romper a los consumidores; solo se rechazan valores con formato inválido.
    const status = query.status === undefined || query.status === '' ? null : query.status;
    if (status !== null && !/^[a-z_]{1,30}$/.test(status)) oneOf(status, APPLICATION_STATUSES, 'status');
    return this.admissions.list({
      status,
      scoped: isProgramScoped(actor.roles, 'applications:review'),
      programIds: actor.programIds,
      programId: optionalUuid(query.programId, 'programId'),
      search: searchTerm(query.q),
    }, page).then((rows) => toPageResult(rows, page));
  }

  /** Repetir una admision es seguro: no duplica matriculas ni cuentas Moodle. */
  async decide(actor: AuthUser, applicationId: string, decision: 'admitida' | 'rechazada', cohortId?: string, notes?: string, ip?: string) {
    const application = await this.admissions.findForDecision(applicationId);
    if (!application) throw new NotFoundException('Solicitud no encontrada');
    assertProgramScope(actor, 'applications:review', application.program_id);
    if (application.user_status === 'suspendido') throw new BadRequestException('La cuenta está suspendida');
    if (application.status === 'admitida' && decision === 'rechazada') {
      throw new ConflictException('La solicitud ya fue admitida; suspende la matrícula si corresponde');
    }
    if (cohortId && !(await this.programs.cohortBelongsTo(cohortId, application.program_id))) {
      throw new BadRequestException('La cohorte no pertenece al programa');
    }

    if (decision === 'rechazada') {
      await this.db.tx(async (client) => {
        await this.admissions.reject(client, applicationId, notes ?? null, actor.id);
        await this.audit.log({ actorId: actor.id, action: 'application.reject', targetType: 'application', targetId: applicationId, ip }, client);
      });
      await this.notifications.create(application.user_id, 'Actualización de tu solicitud',
        `Tu solicitud para ${application.program_name} no fue aprobada en esta ocasión.`, '/mi-iinicia');
      return { status: 'rechazada', moodleSynced: false };
    }

    const courses = await this.programs.courseIds(application.program_id);
    await this.db.tx(async (client) => {
      await this.admissions.admit(client, applicationId, cohortId ?? null, notes ?? null, actor.id);
      await this.users.promoteToStudent(client, application.user_id);
      await this.enrollments.upsertPendingForProgram(client, application.user_id, courses, application.program_id);
      await this.audit.log({
        actorId: actor.id, action: 'application.admit', targetType: 'application', targetId: applicationId, ip,
        detail: { courses: courses.map((c) => Number(c)), cohortId },
      }, client);
    });

    await this.keycloak.setRealmRoles(application.oidc_sub, await this.users.rolesOf(application.user_id));
    const moodleSynced = await this.sync.syncUser(application.user_id);
    await this.notifications.create(application.user_id, '¡Fuiste admitido!',
      `Ya puedes entrar a tus cursos de ${application.program_name}.`, '/mi-iinicia');
    return { status: 'admitida', moodleSynced };
  }

  // Solicitudes de información
  async createInfoRequest(dto: InfoRequestDto) {
    const program = dto.programId ? await this.programs.findPublished(dto.programId) : null;
    await this.admissions.insertInfoRequest({
      name: dto.name, email: dto.email.toLowerCase(), phone: dto.phone || null, programId: program?.id ?? null, message: dto.message,
    });
  }

  infoRequests(query: InfoRequestListQuery) {
    const page = parsePage(query, INFO_REQUEST_SORT);
    return this.admissions.infoRequests({
      status: oneOf(query.status, INFO_REQUEST_STATUSES, 'status'),
      programId: optionalUuid(query.programId, 'programId'),
      search: searchTerm(query.q),
    }, page).then((rows) => toPageResult(rows, page));
  }

  async setInfoRequestStatus(actor: AuthUser, id: string, status: string) {
    const row = await this.admissions.setInfoRequestStatus(id, status, actor.id);
    if (!row) throw new NotFoundException('Solicitud no encontrada');
    await this.audit.log({ actorId: actor.id, action: 'info_request.status', targetType: 'info_request', targetId: id, detail: { status } });
  }
}
