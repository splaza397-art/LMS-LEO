import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiOptionalQueries } from '../../common/openapi';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { DashboardService } from './dashboard.service';

@ApiTags('mi-iinicia')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('courses')
  courses(@CurrentUser() user: AuthUser) {
    return this.dashboard.courses(user);
  }

  @Get('courses/:id')
  course(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.dashboard.course(user, id);
  }

  @Get('upcoming')
  upcoming(@CurrentUser() user: AuthUser) {
    return this.dashboard.upcoming(user);
  }

  @Get('campus-link')
  @ApiOptionalQueries('courseId', 'cmid', 'bind')
  @RequirePermission('campus:access')
  campusLink(
    @CurrentUser() user: AuthUser,
    @Query('courseId') courseId?: string,
    @Query('cmid') cmid?: string,
    @Query('bind') bind?: string,
  ) {
    return this.dashboard.campusLink(user, courseId, cmid, bind);
  }

  @Get('teaching')
  teaching(@CurrentUser() user: AuthUser) {
    return this.dashboard.teaching(user);
  }
}
