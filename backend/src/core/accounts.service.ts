import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.guard';
import { hasPermission, isProgramScoped, Role, ROLES } from '../auth/permissions';
import { DbService } from '../db/db.service';
import { KeycloakService } from '../integrations/keycloak.service';
import { AuditService } from './audit.service';
import { SyncService } from './sync.service';

export interface RegisterInput {
  email: string; password: string; firstName: string; lastName: string; emailVerified?: boolean;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly db: DbService,
    private readonly keycloak: KeycloakService,
    private readonly sync: SyncService,
    private readonly audit: AuditService,
  ) {}

  /** Crear cuenta NO autoriza cursos: toda cuenta nueva inicia como aspirante. */
  async register(input: RegisterInput, ip?: string) {
    const email = input.email.trim().toLowerCase();
    if (await this.db.one(`SELECT 1 AS x FROM users WHERE lower(email) = $1`, [email])) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }
    const sub = await this.keycloak.createUser({ ...input, email });
    try {
      const user = await this.db.tx(async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO users (oidc_sub, email, first_name, last_name, consent_at) VALUES ($1, $2, $3, $4, now()) RETURNING id`,
          [sub, email, input.firstName.trim(), input.lastName.trim()],
        );
        await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'aspirante')`, [rows[0].id]);
        await this.audit.log({ actorId: rows[0].id, action: 'user.register', targetType: 'user', targetId: rows[0].id, ip }, client);
        return rows[0];
      });
      await this.keycloak.setRealmRoles(sub, ['aspirante']);
      if (!input.emailVerified) await this.keycloak.sendVerificationEmail(sub);
      return { id: user.id, status: 'aspirante' };
    } catch (error) {
      await this.keycloak.deleteUser(sub); // Compensacion: evita identidades huerfanas.
      throw error;
    }
  }

  async profile(userId: string) {
    return this.db.one(
      `SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName", u.phone, u.status,
              u.moodle_sync_status AS "moodleSyncStatus", u.created_at AS "createdAt",
              COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
         FROM users u LEFT JOIN user_roles r ON r.user_id = u.id WHERE u.id = $1 GROUP BY u.id`,
      [userId],
    );
  }

  async updateProfile(user: AuthUser, data: { firstName: string; lastName: string; phone?: string }) {
    await this.keycloak.updateProfile(user.sub, data.firstName.trim(), data.lastName.trim());
    await this.db.query(
      `UPDATE users SET first_name = $2, last_name = $3, phone = $4, updated_at = now(),
              moodle_sync_status = CASE WHEN moodle_user_id IS NULL THEN moodle_sync_status ELSE 'pending' END
        WHERE id = $1`,
      [user.id, data.firstName.trim(), data.lastName.trim(), data.phone?.trim() || null],
    );
    await this.audit.log({ actorId: user.id, action: 'user.profile_update', targetType: 'user', targetId: user.id });
    const row = await this.db.one<{ moodle_user_id: string | null }>(`SELECT moodle_user_id FROM users WHERE id = $1`, [user.id]);
    if (row?.moodle_user_id) await this.sync.syncUser(user.id);
    return this.profile(user.id);
  }

  async list(actor: AuthUser, search = '') {
    const scoped = isProgramScoped(actor.roles, 'users:read');
    return this.db.query(
      `SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName", u.status,
              u.moodle_sync_status AS "moodleSyncStatus", u.moodle_user_id AS "moodleUserId",
              COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
         FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
        WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR (u.first_name || ' ' || u.last_name) ILIKE '%' || $1 || '%')
          AND (NOT $2::boolean OR EXISTS (
                SELECT 1 FROM applications a WHERE a.user_id = u.id AND a.program_id = ANY($3::uuid[])))
        GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`,
      [search.trim(), scoped, actor.programIds],
    );
  }

  async setSuspended(actor: AuthUser, userId: string, suspended: boolean, ip?: string) {
    if (actor.id === userId) throw new BadRequestException('No puedes suspender tu propia cuenta');
    const target = await this.db.one<{ oidc_sub: string; status: string; moodle_user_id: string | null }>(
      `SELECT oidc_sub, status, moodle_user_id FROM users WHERE id = $1`, [userId],
    );
    if (!target) throw new NotFoundException('Usuario no encontrado');
    const targetRoles = await this.rolesOf(userId);
    if (targetRoles.includes('superadmin') && !actor.roles.includes('superadmin')) {
      throw new ForbiddenException('Solo un superadministrador puede suspender a otro');
    }
    await this.keycloak.setEnabled(target.oidc_sub, !suspended);
    const next = suspended ? 'suspendido'
      : target.moodle_user_id ? 'activo'
      : hasPermission(targetRoles, 'campus:access') ? 'admitido'
      : targetRoles.includes('aspirante') ? 'aspirante'
      : 'activo'; // Personal sin campus (técnico, soporte): cuenta activa sin Moodle.
    await this.db.query(
      `UPDATE users SET status = $2, updated_at = now(),
              moodle_sync_status = CASE WHEN moodle_user_id IS NULL AND $2 <> 'admitido' THEN moodle_sync_status ELSE 'pending' END
        WHERE id = $1`,
      [userId, next],
    );
    await this.audit.log({ actorId: actor.id, action: suspended ? 'user.suspend' : 'user.reactivate', targetType: 'user', targetId: userId, ip });
    if (target.moodle_user_id || next === 'admitido') await this.sync.syncUser(userId);
    return this.profile(userId);
  }

  async setRoles(actor: AuthUser, userId: string, roles: string[], programId: string | null, ip?: string) {
    const invalid = roles.filter((r) => !ROLES.includes(r as Role));
    if (invalid.length || roles.length === 0) throw new BadRequestException('Roles inválidos');
    if (roles.includes('coordinador') && !programId) throw new BadRequestException('El coordinador requiere un programa asignado');
    const target = await this.db.one<{ oidc_sub: string }>(`SELECT oidc_sub FROM users WHERE id = $1`, [userId]);
    if (!target) throw new NotFoundException('Usuario no encontrado');

    const previous = await this.rolesOf(userId);
    if (previous.includes('superadmin') && !roles.includes('superadmin')) {
      const { count } = (await this.db.one<{ count: string }>(`SELECT count(*) FROM user_roles WHERE role = 'superadmin'`))!;
      if (Number(count) <= 1) throw new BadRequestException('Debe existir al menos un superadministrador');
    }
    await this.db.tx(async (client) => {
      await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
      for (const role of roles) {
        await client.query(`INSERT INTO user_roles (user_id, role, program_id) VALUES ($1, $2, $3)`,
          [userId, role, role === 'coordinador' ? programId : null]);
      }
      await this.audit.log({
        actorId: actor.id, action: 'user.roles_change', targetType: 'user', targetId: userId, ip,
        detail: { previous, next: roles, programId },
      }, client);
    });
    await this.keycloak.setRealmRoles(target.oidc_sub, roles);

    // El acceso al LMS sigue al rol: se concede o se suspende sin perder historial.
    const campus = hasPermission(roles, 'campus:access');
    if (!campus) await this.db.query(`UPDATE enrolments SET status = 'suspended', updated_at = now() WHERE user_id = $1`, [userId]);
    const row = await this.db.one<{ moodle_user_id: string | null }>(
      `UPDATE users SET
              status = CASE WHEN status = 'suspendido' THEN status
                            WHEN $2 AND status = 'aspirante' THEN 'admitido'
                            WHEN NOT $2 AND $3 THEN 'aspirante'
                            WHEN NOT $2 THEN 'activo' ELSE status END,
              moodle_sync_status = CASE WHEN $2 OR moodle_user_id IS NOT NULL THEN 'pending' ELSE moodle_sync_status END,
              updated_at = now()
        WHERE id = $1 RETURNING moodle_user_id`,
      [userId, campus, roles.includes('aspirante')],
    );
    if (campus || row?.moodle_user_id) await this.sync.syncUser(userId);
    return this.profile(userId);
  }

  private async rolesOf(userId: string): Promise<string[]> {
    return (await this.db.query<{ role: string }>(`SELECT role FROM user_roles WHERE user_id = $1`, [userId])).map((r) => r.role);
  }
}
