import { BadRequestException, Injectable } from '@nestjs/common';
import { optionalDate, PageQuery, parsePage, searchTerm, toPageResult } from '../../common/pagination';
import type { Queryable } from '../../db/db.service';
import { AUDIT_SORT, AuditEntry, AuditRepository } from './audit.repository';

export type { AuditEntry } from './audit.repository';

export interface AuditListQuery extends PageQuery { action?: string; q?: string; from?: string; to?: string }

@Injectable()
export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  /** Registra una acción. Con `client`, queda dentro de la transacción de la operación auditada. */
  log(entry: AuditEntry, client?: Queryable): Promise<void> {
    return this.repo.insert(entry, client);
  }

  list(query: AuditListQuery) {
    const page = parsePage(query, AUDIT_SORT);
    const action = query.action === undefined || query.action === '' ? null : query.action;
    if (action !== null && !/^[a-z_]+(\.[a-z_]+)*$/.test(action)) throw new BadRequestException('action tiene un formato inválido');
    return this.repo.list({
      action,
      search: searchTerm(query.q),
      from: optionalDate(query.from, 'from'),
      to: optionalDate(query.to, 'to'),
    }, page).then((rows) => toPageResult(rows, page));
  }
}
