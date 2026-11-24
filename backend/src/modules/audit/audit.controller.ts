import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiOptionalQueries, PAGE_QUERIES } from '../../common/openapi';
import { RequirePermission } from '../auth/auth.decorators';
import { AuditService } from './audit.service';

@ApiTags('auditoria')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('audit')
  @ApiOptionalQueries('action', 'q', 'from', 'to', ...PAGE_QUERIES)
  @RequirePermission('audit:read')
  list(
    @Query('action') action?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.audit.list({ action, q, from, to, page, pageSize, sort, order });
  }
}
