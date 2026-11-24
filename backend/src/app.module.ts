import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './api/admin.controller';
import { MeController } from './api/me.controller';
import { PublicController, StatusController } from './api/public.controller';
import { AuthGuard } from './auth/auth.guard';
import { WriteThrottlerGuard } from './auth/throttle.guard';
import { AccountsService } from './core/accounts.service';
import { AdmissionsService } from './core/admissions.service';
import { AuditService } from './core/audit.service';
import { NotificationsService } from './core/notifications.service';
import { SyncService } from './core/sync.service';
import { DbService } from './db/db.service';
import { KeycloakService } from './integrations/keycloak.service';
import { MoodleService } from './integrations/moodle.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }])],
  controllers: [StatusController, PublicController, MeController, AdminController],
  providers: [
    DbService, AuditService, KeycloakService, MoodleService, SyncService,
    NotificationsService, AccountsService, AdmissionsService,
    { provide: APP_GUARD, useClass: WriteThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
