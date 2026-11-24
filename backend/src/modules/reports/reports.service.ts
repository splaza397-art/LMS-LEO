import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.decorators';
import { isProgramScoped } from '../auth/permissions';
import { ReportsRepository } from './reports.repository';

/** Aplica el ámbito del coordinador (solo sus programas) a los indicadores. */
@Injectable()
export class ReportsService {
  constructor(private readonly reports: ReportsRepository) {}

  stats(actor: AuthUser) {
    return this.reports.stats(isProgramScoped(actor.roles, 'users:read'), actor.programIds);
  }

  byProgram(actor: AuthUser) {
    return this.reports.byProgram(isProgramScoped(actor.roles, 'reports:read'), actor.programIds);
  }
}
