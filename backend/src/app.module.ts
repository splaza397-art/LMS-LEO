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
import { DbModule } from './db/db.module';
import { DbService } from './db/db.service';
import { KeycloakService } from './integrations/keycloak.service';
import { MoodleService } from './integrations/moodle.service';
import { PgThrottlerStorage } from './security/pg-throttler.storage';

@Module({
  imports: [
    DbModule,
    // Mismo límite que antes (240 escrituras por minuto e IP), ahora contado en PostgreSQL para todas las instancias.
    ThrottlerModule.forRootAsync({
      inject: [DbService],
      useFactory: (db: DbService) => ({ throttlers: [{ ttl: 60_000, limit: 240 }], storage: new PgThrottlerStorage(db) }),
    }),
  ],
  controllers: [StatusController, PublicController, MeController, AdminController],
  providers: [
    AuditService, KeycloakService, MoodleService, SyncService,
    NotificationsService, AccountsService, AdmissionsService,
    { provide: APP_GUARD, useClass: WriteThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
