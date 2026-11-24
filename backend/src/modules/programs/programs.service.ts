import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { MoodleService } from '../../integrations/moodle/moodle.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.decorators';
import { isProgramScoped } from '../auth/permissions';
import { assertProgramScope } from '../auth/program-scope';
import { EnrollmentsRepository } from '../enrollments/enrollments.repository';
import { SyncService } from '../synchronization/sync.service';
import { UsersRepository } from '../users/users.repository';
import type { CohortDto, ProgramDto } from './programs.dto';
import { ProgramsRepository } from './programs.repository';

@Injectable()
export class ProgramsService {
  constructor(
    private readonly db: DbService,
    private readonly programs: ProgramsRepository,
    private readonly enrollments: EnrollmentsRepository,
    private readonly users: UsersRepository,
    private readonly moodle: MoodleService,
    private readonly sync: SyncService,
    private readonly audit: AuditService,
  ) {}

  published() {
    return this.programs.published();
  }

  async publishedBySlug(slug: string) {
    const program = await this.programs.publishedBySlug(slug);
    if (!program) throw new NotFoundException('Programa no encontrado');
    return program;
  }

  adminList(actor: AuthUser) {
    return this.programs.adminList(isProgramScoped(actor.roles, 'programs:manage'), actor.programIds);
  }

  async create(actor: AuthUser, dto: ProgramDto) {
    if (isProgramScoped(actor.roles, 'programs:manage')) throw new ForbiddenException('Un coordinador no crea programas');
    const row = await this.programs.create(dto);
    await this.audit.log({ actorId: actor.id, action: 'program.create', targetType: 'program', targetId: row!.id });
    return row;
  }

  async update(actor: AuthUser, id: string, dto: ProgramDto) {
    assertProgramScope(actor, 'programs:manage', id);
    const row = await this.programs.update(id, dto);
    if (!row) throw new NotFoundException('Programa no encontrado');
    await this.audit.log({ actorId: actor.id, action: 'program.update', targetType: 'program', targetId: id });
    return row;
  }

  async createCohort(actor: AuthUser, programId: string, dto: CohortDto) {
    assertProgramScope(actor, 'programs:manage', programId);
    const row = await this.programs.createCohort(programId, dto);
    await this.audit.log({ actorId: actor.id, action: 'cohort.create', targetType: 'cohort', targetId: row!.id });
    return row;
  }

  async linkCourse(actor: AuthUser, programId: string, courseId: number) {
    assertProgramScope(actor, 'programs:manage', programId);
    if (!(await this.moodle.listCourses()).some((c) => c.id === courseId)) throw new NotFoundException('Curso Moodle no encontrado');
    await this.programs.linkCourse(programId, courseId);
    await this.audit.log({ actorId: actor.id, action: 'program.link_course', targetType: 'program', targetId: programId, detail: { courseId } });
    return { ok: true };
  }

  async unlinkCourse(actor: AuthUser, programId: string, courseId: number) {
    assertProgramScope(actor, 'programs:manage', programId);
    await this.programs.unlinkCourse(programId, courseId);
    await this.audit.log({ actorId: actor.id, action: 'program.unlink_course', targetType: 'program', targetId: programId, detail: { courseId } });
    return { ok: true };
  }

  teachers(actor: AuthUser, programId: string) {
    assertProgramScope(actor, 'programs:manage', programId);
    return this.enrollments.teachersOfProgram(programId);
  }

  /** Asigna o retira a un profesor de un curso del programa. Retirar conserva su historial en Moodle. */
  async setTeacher(actor: AuthUser, programId: string, courseId: number, userId: string, active: boolean, ip?: string) {
    assertProgramScope(actor, 'programs:manage', programId);
    if (!(await this.programs.hasCourse(programId, courseId))) {
      throw new BadRequestException('El curso no pertenece al programa');
    }
    if (!(await this.users.hasRole(userId, 'profesor'))) {
      throw new BadRequestException('La persona no tiene rol de profesor');
    }
    const current = await this.enrollments.find(userId, courseId);
    if (current && current.moodle_role !== 'editingteacher') throw new ConflictException('La persona ya está en el curso con otro rol');
    if (!current && !active) throw new NotFoundException('Asignación no encontrada');

    await this.db.tx(async (client) => {
      await this.enrollments.upsertTeacher(client, userId, courseId, programId, active ? 'pending' : 'suspended');
      await this.users.markAdmittedForTeaching(client, userId);
      await this.audit.log({
        actorId: actor.id, action: active ? 'teacher.assign' : 'teacher.remove',
        targetType: 'user', targetId: userId, detail: { programId, courseId }, ip,
      }, client);
    });
    return { moodleSynced: await this.sync.syncUser(userId) };
  }

  teacherCandidates() {
    return this.users.teacherCandidates();
  }

  moodleCourses() {
    return this.moodle.listCourses();
  }
}
