import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from '../../db/db.service';
import type { PageRequest, SortSpec } from '../../common/pagination';
import { SqlConditions } from '../../common/sql';
import type { AuthUser } from '../auth/auth.decorators';

export interface UserListFilters {
  search: string;
  scoped: boolean;
  programIds: string[];
  status: string | null;
  role: string | null;
  programId: string | null;
}

/** Orden permitido en la lista de usuarios. Por omisión, el anterior: más recientes primero. */
export const USER_SORT: SortSpec = {
  columns: { createdAt: 'u.created_at', email: 'u.email', lastName: 'u.last_name', status: 'u.status' },
  default: 'createdAt',
  defaultOrder: 'desc',
  tieBreaker: 'u.id',
  legacyLimit: 200,
};

/** Dueño de las tablas users y user_roles. Las operaciones que participan en una transacción reciben el cliente. */
@Injectable()
export class UsersRepository {
  constructor(private readonly db: DbService) {}

  /** Identidad y roles vigentes para el guard de autenticación. */
  findPrincipalBySub(sub: string) {
    return this.db.one<AuthUser>(
      `SELECT u.id, u.oidc_sub AS sub, u.email, u.status,
              COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles,
              COALESCE(array_agg(DISTINCT r.program_id::text) FILTER (WHERE r.program_id IS NOT NULL), '{}') AS "programIds"
         FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
        WHERE u.oidc_sub = $1 GROUP BY u.id`,
      [sub],
    );
  }

  async emailExists(email: string): Promise<boolean> {
    return Boolean(await this.db.one(`SELECT 1 AS x FROM users WHERE lower(email) = $1`, [email]));
  }

  async insertAspirante(client: Queryable, data: { sub: string; email: string; firstName: string; lastName: string }): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (oidc_sub, email, first_name, last_name, consent_at) VALUES ($1, $2, $3, $4, now()) RETURNING id`,
      [data.sub, data.email, data.firstName, data.lastName],
    );
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'aspirante')`, [rows[0].id]);
    return rows[0].id;
  }

  profile(userId: string) {
    return this.db.one(
      `SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName", u.phone, u.status,
              u.moodle_sync_status AS "moodleSyncStatus", u.created_at AS "createdAt",
              COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
         FROM users u LEFT JOIN user_roles r ON r.user_id = u.id WHERE u.id = $1 GROUP BY u.id`,
      [userId],
    );
  }

  async updateProfile(userId: string, firstName: string, lastName: string, phone: string | null): Promise<void> {
    await this.db.query(
      `UPDATE users SET first_name = $2, last_name = $3, phone = $4, updated_at = now(),
              moodle_sync_status = CASE WHEN moodle_user_id IS NULL THEN moodle_sync_status ELSE 'pending' END
        WHERE id = $1`,
      [userId, firstName, lastName, phone],
    );
  }

  async moodleUserId(userId: string): Promise<string | null> {
    const row = await this.db.one<{ moodle_user_id: string | null }>(`SELECT moodle_user_id FROM users WHERE id = $1`, [userId]);
    return row?.moodle_user_id ?? null;
  }

  /** Lista administrativa con búsqueda, filtros y paginación. El ámbito del coordinador siempre se aplica. */
  list(filters: UserListFilters, page: PageRequest) {
    const where = new SqlConditions()
      .addIf(filters.search !== '', `u.email ILIKE '%' || ? || '%' OR (u.first_name || ' ' || u.last_name) ILIKE '%' || ? || '%'`, filters.search, filters.search)
      .addIf(filters.scoped, `EXISTS (SELECT 1 FROM applications a WHERE a.user_id = u.id AND a.program_id = ANY(?::uuid[]))`, filters.programIds)
      .addIf(filters.status !== null, `u.status = ?`, filters.status)
      .addIf(filters.role !== null, `EXISTS (SELECT 1 FROM user_roles rr WHERE rr.user_id = u.id AND rr.role = ?)`, filters.role)
      .addIf(filters.programId !== null, `EXISTS (SELECT 1 FROM applications pa WHERE pa.user_id = u.id AND pa.program_id = ?)
          OR EXISTS (SELECT 1 FROM enrolments pe WHERE pe.user_id = u.id AND pe.program_id = ?)
          OR EXISTS (SELECT 1 FROM user_roles pr WHERE pr.user_id = u.id AND pr.program_id = ?)`, filters.programId, filters.programId, filters.programId);
    return this.db.query<Record<string, unknown> & { _total: string }>(
      `SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName", u.status,
              u.moodle_sync_status AS "moodleSyncStatus", u.moodle_user_id AS "moodleUserId",
              COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles,
              count(*) OVER () AS _total
         FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
        ${where.where()}
        GROUP BY u.id ORDER BY ${page.orderBy} LIMIT ${where.param(page.pageSize)} OFFSET ${where.param(page.offset)}`,
      where.params,
    );
  }

  findAccount(userId: string) {
    return this.db.one<{ oidc_sub: string; status: string; moodle_user_id: string | null }>(
      `SELECT oidc_sub, status, moodle_user_id FROM users WHERE id = $1`, [userId],
    );
  }

  async rolesOf(userId: string): Promise<string[]> {
    return (await this.db.query<{ role: string }>(`SELECT role FROM user_roles WHERE user_id = $1`, [userId])).map((r) => r.role);
  }

  async hasRole(userId: string, role: string): Promise<boolean> {
    return Boolean(await this.db.one(`SELECT 1 AS x FROM user_roles WHERE user_id = $1 AND role = $2`, [userId, role]));
  }

  async setStatusAfterSuspension(userId: string, status: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET status = $2, updated_at = now(),
              moodle_sync_status = CASE WHEN moodle_user_id IS NULL AND $2 <> 'admitido' THEN moodle_sync_status ELSE 'pending' END
        WHERE id = $1`,
      [userId, status],
    );
  }

  async countSuperadmins(): Promise<number> {
    const { count } = (await this.db.one<{ count: string }>(`SELECT count(*) FROM user_roles WHERE role = 'superadmin'`))!;
    return Number(count);
  }

  async replaceRoles(client: Queryable, userId: string, roles: string[], programId: string | null): Promise<void> {
    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    for (const role of roles) {
      await client.query(`INSERT INTO user_roles (user_id, role, program_id) VALUES ($1, $2, $3)`,
        [userId, role, role === 'coordinador' ? programId : null]);
    }
  }

  /** Estado de la cuenta después de cambiar roles. Devuelve el ID de Moodle, si existe. */
  async applyRoleChange(userId: string, campus: boolean, isAspirante: boolean): Promise<string | null> {
    const row = await this.db.one<{ moodle_user_id: string | null }>(
      `UPDATE users SET
              status = CASE WHEN status = 'suspendido' THEN status
                            WHEN $2 AND status = 'aspirante' THEN 'admitido'
                            WHEN NOT $2 AND $3 THEN 'aspirante'
                            WHEN NOT $2 THEN 'activo' ELSE status END,
              moodle_sync_status = CASE WHEN $2 OR moodle_user_id IS NOT NULL THEN 'pending' ELSE moodle_sync_status END,
              updated_at = now()
        WHERE id = $1 RETURNING moodle_user_id`,
      [userId, campus, isAspirante],
    );
    return row?.moodle_user_id ?? null;
  }

  /** Admisión: el aspirante pasa a estudiante y queda pendiente de sincronizar. */
  async promoteToStudent(client: Queryable, userId: string): Promise<void> {
    await client.query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'aspirante'`, [userId]);
    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'estudiante')
       ON CONFLICT (user_id, role, COALESCE(program_id, '00000000-0000-0000-0000-000000000000')) DO NOTHING`,
      [userId],
    );
    await client.query(
      `UPDATE users SET status = CASE WHEN status = 'activo' THEN 'activo' ELSE 'admitido' END,
              moodle_sync_status = 'pending', updated_at = now() WHERE id = $1`,
      [userId],
    );
  }

  /** Asignación de profesor: la cuenta queda admitida (si era aspirante) y pendiente de sincronizar. */
  async markAdmittedForTeaching(client: Queryable, userId: string): Promise<void> {
    await client.query(
      `UPDATE users SET status = CASE WHEN status = 'aspirante' THEN 'admitido' ELSE status END,
              moodle_sync_status = 'pending', updated_at = now() WHERE id = $1`,
      [userId],
    );
  }

  teacherCandidates() {
    return this.db.query(
      `SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName"
         FROM users u JOIN user_roles r ON r.user_id = u.id
        WHERE r.role = 'profesor' AND u.status <> 'suspendido' ORDER BY u.last_name`,
    );
  }

  /** Destinatarios activos de un aviso: por programa (vía matrículas) o una persona. */
  activeRecipients(programId: string | null, userId: string | null) {
    return this.db.query<{ id: string }>(
      `SELECT DISTINCT u.id FROM users u LEFT JOIN enrolments e ON e.user_id = u.id
        WHERE u.status = 'activo' AND ($1::uuid IS NULL OR e.program_id = $1) AND ($2::uuid IS NULL OR u.id = $2)`,
      [programId, userId],
    );
  }
}
