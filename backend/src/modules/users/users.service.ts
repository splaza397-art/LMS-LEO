import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { oneOf, optionalUuid, PageQuery, parsePage, searchTerm, toPageResult } from '../../common/pagination';
import { DbService } from '../../db/db.service';
import { KeycloakService } from '../../integrations/keycloak/keycloak.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.decorators';
import { hasPermission, isProgramScoped, Role, ROLES } from '../auth/permissions';
import { EnrollmentsRepository } from '../enrollments/enrollments.repository';
import { SyncService } from '../synchronization/sync.service';
import { USER_SORT, UsersRepository } from './users.repository';

export interface RegisterInput {
  email: string; password: string; firstName: string; lastName: string; emailVerified?: boolean;
}

export const USER_STATUSES = ['aspirante', 'admitido', 'activo', 'suspendido'] as const;

export interface UserListQuery extends PageQuery {
  q?: string;
  status?: string;
  role?: string;
  programId?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersRepository,
    private readonly enrollments: EnrollmentsRepository,
    private readonly keycloak: KeycloakService,
    private readonly sync: SyncService,
    private readonly audit: AuditService,
  ) {}

  /** Crear cuenta NO autoriza cursos: toda cuenta nueva inicia como aspirante. */
  async register(input: RegisterInput, ip?: string) {
    const email = input.email.trim().toLowerCase();
    if (await this.users.emailExists(email)) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }
    const sub = await this.keycloak.createUser({ ...input, email });
    try {
      const id = await this.db.tx(async (client) => {
        const userId = await this.users.insertAspirante(client, { sub, email, firstName: input.firstName.trim(), lastName: input.lastName.trim() });
        await this.audit.log({ actorId: userId, action: 'user.register', targetType: 'user', targetId: userId, ip }, client);
        return userId;
      });
      await this.keycloak.setRealmRoles(sub, ['aspirante']);
      if (!input.emailVerified) await this.keycloak.sendVerificationEmail(sub);
      return { id, status: 'aspirante' };
    } catch (error) {
      await this.keycloak.deleteUser(sub); // Compensacion: evita identidades huerfanas.
      throw error;
    }
  }

  profile(userId: string) {
    return this.users.profile(userId);
  }

  async updateProfile(user: AuthUser, data: { firstName: string; lastName: string; phone?: string }) {
    await this.keycloak.updateProfile(user.sub, data.firstName.trim(), data.lastName.trim());
    await this.users.updateProfile(user.id, data.firstName.trim(), data.lastName.trim(), data.phone?.trim() || null);
    await this.audit.log({ actorId: user.id, action: 'user.profile_update', targetType: 'user', targetId: user.id });
    if (await this.users.moodleUserId(user.id)) await this.sync.syncUser(user.id);
    return this.profile(user.id);
  }

  list(actor: AuthUser, query: UserListQuery) {
    const page = parsePage(query, USER_SORT);
    return this.users.list({
      search: searchTerm(query.q),
      scoped: isProgramScoped(actor.roles, 'users:read'),
      programIds: actor.programIds,
      status: oneOf(query.status, USER_STATUSES, 'status'),
      role: oneOf(query.role, ROLES, 'role'),
      programId: optionalUuid(query.programId, 'programId'),
    }, page).then((rows) => toPageResult(rows, page));
  }

  async setSuspended(actor: AuthUser, userId: string, suspended: boolean, ip?: string) {
    if (actor.id === userId) throw new BadRequestException('No puedes suspender tu propia cuenta');
    const target = await this.users.findAccount(userId);
    if (!target) throw new NotFoundException('Usuario no encontrado');
    const targetRoles = await this.users.rolesOf(userId);
    if (targetRoles.includes('superadmin') && !actor.roles.includes('superadmin')) {
      throw new ForbiddenException('Solo un superadministrador puede suspender a otro');
    }
    await this.keycloak.setEnabled(target.oidc_sub, !suspended);
    const next = suspended ? 'suspendido'
      : target.moodle_user_id ? 'activo'
      : hasPermission(targetRoles, 'campus:access') ? 'admitido'
      : targetRoles.includes('aspirante') ? 'aspirante'
      : 'activo'; // Personal sin campus (técnico, soporte): cuenta activa sin Moodle.
    await this.users.setStatusAfterSuspension(userId, next);
    await this.audit.log({ actorId: actor.id, action: suspended ? 'user.suspend' : 'user.reactivate', targetType: 'user', targetId: userId, ip });
    if (target.moodle_user_id || next === 'admitido') await this.sync.syncUser(userId);
    return this.profile(userId);
  }

  async setRoles(actor: AuthUser, userId: string, roles: string[], programId: string | null, ip?: string) {
    const invalid = roles.filter((r) => !ROLES.includes(r as Role));
    if (invalid.length || roles.length === 0) throw new BadRequestException('Roles inválidos');
    if (roles.includes('coordinador') && !programId) throw new BadRequestException('El coordinador requiere un programa asignado');
    const target = await this.users.findAccount(userId);
    if (!target) throw new NotFoundException('Usuario no encontrado');

    const previous = await this.users.rolesOf(userId);
    if (previous.includes('superadmin') && !roles.includes('superadmin')) {
      if ((await this.users.countSuperadmins()) <= 1) throw new BadRequestException('Debe existir al menos un superadministrador');
    }
    await this.db.tx(async (client) => {
      await this.users.replaceRoles(client, userId, roles, programId);
      await this.audit.log({
        actorId: actor.id, action: 'user.roles_change', targetType: 'user', targetId: userId, ip,
        detail: { previous, next: roles, programId },
      }, client);
    });
    await this.keycloak.setRealmRoles(target.oidc_sub, roles);

    // El acceso al LMS sigue al rol: se concede o se suspende sin perder historial.
    const campus = hasPermission(roles, 'campus:access');
    if (!campus) await this.enrollments.suspendAllForUser(userId);
    const moodleUserId = await this.users.applyRoleChange(userId, campus, roles.includes('aspirante'));
    if (campus || moodleUserId) await this.sync.syncUser(userId);
    return this.profile(userId);
  }
}
