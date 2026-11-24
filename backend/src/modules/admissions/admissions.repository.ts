import { Injectable } from '@nestjs/common';
import type { PageRequest, SortSpec } from '../../common/pagination';
import { SqlConditions } from '../../common/sql';
import { DbService, Queryable } from '../../db/db.service';

export interface ApplicationForDecision extends Record<string, unknown> {
  id: string; user_id: string; program_id: string; status: string; oidc_sub: string; user_status: string; program_name: string;
}

export const APPLICATION_SORT: SortSpec = {
  columns: { createdAt: 'a.created_at', status: 'a.status', programName: 'p.name' },
  default: 'createdAt', defaultOrder: 'desc', tieBreaker: 'a.id', legacyLimit: 200,
};

export const INFO_REQUEST_SORT: SortSpec = {
  columns: { createdAt: 'r.created_at', status: 'r.status', name: 'r.name' },
  default: 'createdAt', defaultOrder: 'desc', tieBreaker: 'r.id', legacyLimit: 200,
};

export interface ApplicationFilters {
  status: string | null; scoped: boolean; programIds: string[]; programId: string | null; search: string;
}

export interface InfoRequestFilters { status: string | null; programId: string | null; search: string }

/** Dueño de applications e info_requests. */
@Injectable()
export class AdmissionsRepository {
  constructor(private readonly db: DbService) {}

  insertApplication(userId: string, programId: string) {
    return this.db.one<{ id: string; status: string }>(
      `INSERT INTO applications (user_id, program_id) VALUES ($1, $2)
       ON CONFLICT (user_id, program_id) DO NOTHING RETURNING id, status`,
      [userId, programId],
    );
  }

  mine(userId: string) {
    return this.db.query(
      `SELECT a.id, a.status, a.created_at AS "createdAt", a.reviewed_at AS "reviewedAt",
              p.id AS "programId", p.name AS "programName", p.slug AS "programSlug", c.name AS "cohortName"
         FROM applications a JOIN programs p ON p.id = a.program_id LEFT JOIN cohorts c ON c.id = a.cohort_id
        WHERE a.user_id = $1 ORDER BY a.created_at DESC`,
      [userId],
    );
  }

  list(filters: ApplicationFilters, page: PageRequest) {
    const where = new SqlConditions()
      .addIf(filters.status !== null, 'a.status = ?', filters.status)
      .addIf(filters.scoped, 'a.program_id = ANY(?::uuid[])', filters.programIds)
      .addIf(filters.programId !== null, 'a.program_id = ?', filters.programId)
      .addIf(filters.search !== '', `u.email ILIKE '%' || ? || '%' OR (u.first_name || ' ' || u.last_name) ILIKE '%' || ? || '%'`, filters.search, filters.search);
    return this.db.query<Record<string, unknown> & { _total: string }>(
      `SELECT a.id, a.status, a.created_at AS "createdAt", a.notes, p.id AS "programId", p.name AS "programName",
              u.id AS "userId", u.email, u.first_name AS "firstName", u.last_name AS "lastName", c.name AS "cohortName",
              count(*) OVER () AS _total
         FROM applications a JOIN programs p ON p.id = a.program_id JOIN users u ON u.id = a.user_id
         LEFT JOIN cohorts c ON c.id = a.cohort_id
        ${where.where()}
        ORDER BY ${page.orderBy} LIMIT ${where.param(page.pageSize)} OFFSET ${where.param(page.offset)}`,
      where.params,
    );
  }

  findForDecision(applicationId: string) {
    return this.db.one<ApplicationForDecision>(
      `SELECT a.id, a.user_id, a.program_id, a.status, u.oidc_sub, u.status AS user_status, p.name AS program_name
         FROM applications a JOIN users u ON u.id = a.user_id JOIN programs p ON p.id = a.program_id WHERE a.id = $1`,
      [applicationId],
    );
  }

  async reject(client: Queryable, applicationId: string, notes: string | null, reviewerId: string): Promise<void> {
    await client.query(`UPDATE applications SET status = 'rechazada', notes = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
      [applicationId, notes, reviewerId]);
  }

  async admit(client: Queryable, applicationId: string, cohortId: string | null, notes: string | null, reviewerId: string): Promise<void> {
    await client.query(
      `UPDATE applications SET status = 'admitida', cohort_id = COALESCE($2, cohort_id), notes = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1`,
      [applicationId, cohortId, notes, reviewerId],
    );
  }

  async insertInfoRequest(data: { name: string; email: string; phone: string | null; programId: string | null; message: string }): Promise<void> {
    await this.db.query(
      `INSERT INTO info_requests (name, email, phone, program_id, message, consent_at) VALUES ($1, $2, $3, $4, $5, now())`,
      [data.name, data.email, data.phone, data.programId, data.message],
    );
  }

  infoRequests(filters: InfoRequestFilters, page: PageRequest) {
    const where = new SqlConditions()
      .addIf(filters.status !== null, 'r.status = ?', filters.status)
      .addIf(filters.programId !== null, 'r.program_id = ?', filters.programId)
      .addIf(filters.search !== '', `r.name ILIKE '%' || ? || '%' OR r.email ILIKE '%' || ? || '%'`, filters.search, filters.search);
    return this.db.query<Record<string, unknown> & { _total: string }>(
      `SELECT r.id, r.name, r.email, r.phone, r.message, r.status, r.created_at AS "createdAt", p.name AS "programName",
              count(*) OVER () AS _total
         FROM info_requests r LEFT JOIN programs p ON p.id = r.program_id
        ${where.where()}
        ORDER BY ${page.orderBy} LIMIT ${where.param(page.pageSize)} OFFSET ${where.param(page.offset)}`,
      where.params,
    );
  }

  setInfoRequestStatus(id: string, status: string, handlerId: string) {
    return this.db.one(
      `UPDATE info_requests SET status = $2, handled_by = $3, handled_at = now() WHERE id = $1 RETURNING id`, [id, status, handlerId],
    );
  }
}
