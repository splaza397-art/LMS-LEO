import { Injectable } from '@nestjs/common';
import type { PageRequest, SortSpec } from '../../common/pagination';
import { SqlConditions } from '../../common/sql';
import { DbService, Queryable } from '../../db/db.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
  ip?: string;
}

export const AUDIT_SORT: SortSpec = {
  columns: { createdAt: 'l.created_at', action: 'l.action' },
  default: 'createdAt', defaultOrder: 'desc', tieBreaker: 'l.id', legacyLimit: 200,
};

export interface AuditFilters { action: string | null; search: string; from: string | null; to: string | null }

/** Dueño de audit_log. La tabla solo admite INSERT (un disparador rechaza UPDATE y DELETE). */
@Injectable()
export class AuditRepository {
  constructor(private readonly db: DbService) {}

  async insert(entry: AuditEntry, client: Queryable = this.db.pool): Promise<void> {
    await client.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, ip) VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.actorId ?? null, entry.action, entry.targetType ?? null, entry.targetId ?? null,
        JSON.stringify(entry.detail ?? {}), entry.ip ?? null],
    );
  }

  list(filters: AuditFilters, page: PageRequest) {
    const where = new SqlConditions()
      .addIf(filters.action !== null, 'l.action = ?', filters.action)
      .addIf(filters.search !== '', `u.email ILIKE '%' || ? || '%'`, filters.search)
      .addIf(filters.from !== null, 'l.created_at >= ?::timestamptz', filters.from)
      .addIf(filters.to !== null, 'l.created_at < ?::timestamptz', filters.to);
    return this.db.query<Record<string, unknown> & { _total: string }>(
      `SELECT l.id, l.action, l.target_type AS "targetType", l.target_id AS "targetId", l.detail, l.created_at AS "createdAt", u.email AS actor,
              count(*) OVER () AS _total
         FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id
        ${where.where()}
        ORDER BY ${page.orderBy} LIMIT ${where.param(page.pageSize)} OFFSET ${where.param(page.offset)}`,
      where.params,
    );
  }
}
