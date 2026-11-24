import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { EnrolmentDto } from './enrollments.dto';
import { EnrollmentsService } from './enrollments.service';

@ApiTags('matriculas')
@ApiBearerAuth()
@Controller({ version: '1' })
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Get('admin/users/:id/enrolments')
  @RequirePermission('enrolments:manage')
  list(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.enrollments.listForUser(actor, id);
  }

  @Patch('admin/users/:id/enrolment')
  @RequirePermission('enrolments:manage')
  setStatus(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrolmentDto, @Req() req: Request) {
    return this.enrollments.setEnrolment(actor, id, dto.courseId, dto.active, req.ip);
  }
}
