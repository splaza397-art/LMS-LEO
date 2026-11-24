import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { BroadcastDto, DeviceDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('avisos')
@ApiBearerAuth()
@Controller({ version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('me/notifications')
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Post('me/notifications/:id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('me/devices')
  device(@CurrentUser() user: AuthUser, @Body() dto: DeviceDto) {
    return this.notifications.registerDevice(user.id, dto.token, dto.enabled ?? true);
  }

  @Delete('me/devices/:token')
  removeDevice(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.notifications.removeDevice(user.id, token);
  }

  @Post('admin/notifications')
  @RequirePermission('notifications:send')
  broadcast(@CurrentUser() actor: AuthUser, @Body() dto: BroadcastDto) {
    return this.notifications.broadcast(actor, dto);
  }
}
