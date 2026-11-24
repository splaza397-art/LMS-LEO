import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { ReportsService } from './reports.service';

@ApiTags('reportes')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('stats')
  @RequirePermission('users:read')
  stats(@CurrentUser() actor: AuthUser) {
    return this.reports.stats(actor);
  }

  @Get('reports')
  @RequirePermission('reports:read')
  byProgram(@CurrentUser() actor: AuthUser) {
    return this.reports.byProgram(actor);
  }
}
