import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { SyncService } from './sync.service';

@ApiTags('sincronizacion')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class SynchronizationController {
  constructor(private readonly audit: AuditService, private readonly sync: SyncService) {}

  @Post('users/:id/sync')
  @RequirePermission('integrations:manage')
  async syncUser(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.audit.log({ actorId: actor.id, action: 'moodle.manual_sync', targetType: 'user', targetId: id });
    return { synced: await this.sync.syncUser(id) };
  }
}
