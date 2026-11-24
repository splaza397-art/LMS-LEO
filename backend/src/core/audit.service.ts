import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from '../db/db.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  async log(entry: AuditEntry, client: Queryable = this.db.pool): Promise<void> {
    await client.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, ip) VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.actorId ?? null, entry.action, entry.targetType ?? null, entry.targetId ?? null,
        JSON.stringify(entry.detail ?? {}), entry.ip ?? null],
    );
  }
}
