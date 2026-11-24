import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiOptionalQueries, PAGE_QUERIES } from '../../common/openapi';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, RequirePermission } from '../auth/auth.decorators';
import { ApplyDto, DecisionDto, InfoRequestDto, InfoStatusDto } from './admissions.dto';
import { AdmissionsService } from './admissions.service';

@ApiTags('admisiones')
@ApiBearerAuth()
@Controller({ version: '1' })
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Get('me/applications')
  mine(@CurrentUser() user: AuthUser) {
    return this.admissions.mine(user.id);
  }

  @Post('me/applications')
  @RequirePermission('application:create')
  apply(@CurrentUser() user: AuthUser, @Body() dto: ApplyDto) {
    return this.admissions.apply(user, dto.programId);
  }

  @Get('admin/applications')
  @ApiOptionalQueries('status', 'programId', 'q', ...PAGE_QUERIES)
  @RequirePermission('applications:review')
  applications(
    @CurrentUser() actor: AuthUser,
    @Query('status') status?: string,
    @Query('programId') programId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.admissions.list(actor, { status, programId, q, page, pageSize, sort, order });
  }

  @Post('admin/applications/:id/decision')
  @RequirePermission('applications:review')
  decide(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @Req() req: Request) {
    return this.admissions.decide(actor, id, dto.decision, dto.cohortId, dto.notes, req.ip);
  }

  // Solicitudes de información (contactos previos a la admisión)
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('info-requests')
  @HttpCode(201)
  async infoRequest(@Body() dto: InfoRequestDto) {
    if (dto.website) return { ok: true };
    await this.admissions.createInfoRequest(dto);
    return { ok: true };
  }

  @Get('admin/info-requests')
  @ApiOptionalQueries('status', 'programId', 'q', ...PAGE_QUERIES)
  @RequirePermission('info_requests:manage')
  infoRequests(
    @Query('status') status?: string,
    @Query('programId') programId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.admissions.infoRequests({ status, programId, q, page, pageSize, sort, order });
  }

  @Patch('admin/info-requests/:id')
  @RequirePermission('info_requests:manage')
  async infoRequestStatus(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InfoStatusDto) {
    await this.admissions.setInfoRequestStatus(actor, id, dto.status);
    return { ok: true };
  }
}
