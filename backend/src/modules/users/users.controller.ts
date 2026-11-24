import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiOptionalQueries, PAGE_QUERIES } from '../../common/openapi';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, RequirePermission } from '../auth/auth.decorators';
import { permissionsFor } from '../auth/permissions';
import { RegisterDto, RolesDto, SuspendDto, UpdateProfileDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller({ version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    // Al bot se le responde igual que a un registro correcto para no revelar la trampa.
    if (dto.website) return { status: 'aspirante' };
    const { status } = await this.users.register(dto, req.ip);
    return { status };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return { ...(await this.users.profile(user.id)), permissions: permissionsFor(user.roles) };
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user, dto);
  }

  @Get('admin/users')
  @ApiOptionalQueries('q', 'status', 'role', 'programId', ...PAGE_QUERIES)
  @RequirePermission('users:read')
  list(
    @CurrentUser() actor: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('programId') programId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.users.list(actor, { q, status, role, programId, page, pageSize, sort, order });
  }

  @Patch('admin/users/:id/suspension')
  @RequirePermission('users:suspend')
  suspend(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendDto, @Req() req: Request) {
    return this.users.setSuspended(actor, id, dto.suspended, req.ip);
  }

  @Put('admin/users/:id/roles')
  @RequirePermission('roles:manage')
  roles(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RolesDto, @Req() req: Request) {
    return this.users.setRoles(actor, id, dto.roles, dto.programId ?? null, req.ip);
  }
}
