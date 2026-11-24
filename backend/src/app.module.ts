import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './api/admin.controller';
import { MeController } from './api/me.controller';
import { PublicController, StatusController } from './api/public.controller';
import { AccountsService } from './core/accounts.service';
import { AdmissionsService } from './core/admissions.service';
import { NotificationsService } from './core/notifications.service';
import { SyncService } from './core/sync.service';
import { DbModule } from './db/db.module';
import { DbService } from './db/db.service';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { PgThrottlerStorage } from './security/pg-throttler.storage';
import { WriteThrottlerGuard } from './security/write-throttler.guard';

@Module({
  imports: [
    DbModule,
    // Mismo límite que antes (240 escrituras por minuto e IP), contado en PostgreSQL para todas las instancias.
    ThrottlerModule.forRootAsync({
      inject: [DbService],
      useFactory: (db: DbService) => ({ throttlers: [{ ttl: 60_000, limit: 240 }], storage: new PgThrottlerStorage(db) }),
    }),
    IntegrationsModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [StatusController, PublicController, MeController, AdminController],
  providers: [
    SyncService, NotificationsService, AccountsService, AdmissionsService,
    // Orden intencional: primero el límite de intentos y después la autenticación.
    { provide: APP_GUARD, useClass: WriteThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule {}
