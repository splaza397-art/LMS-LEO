import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { DbModule } from './db/db.module';
import { DbService } from './db/db.service';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { ContentModule } from './modules/content/content.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SynchronizationModule } from './modules/synchronization/synchronization.module';
import { UsersModule } from './modules/users/users.module';
import { PgThrottlerStorage } from './security/pg-throttler.storage';
import { WriteThrottlerGuard } from './security/write-throttler.guard';

/** Raíz de la aplicación: solo importa y configura los módulos. */
@Module({
  imports: [
    DbModule,
    // Mismo límite que antes (240 escrituras por minuto e IP), contado en PostgreSQL para todas las instancias.
    ThrottlerModule.forRootAsync({
      inject: [DbService],
      useFactory: (db: DbService) => ({ throttlers: [{ ttl: 60_000, limit: 240 }], storage: new PgThrottlerStorage(db) }),
    }),
    AuthModule,
    AuditModule,
    HealthModule,
    UsersModule,
    AdmissionsModule,
    ProgramsModule,
    EnrollmentsModule,
    DashboardModule,
    ContentModule,
    NotificationsModule,
    ReportsModule,
    SynchronizationModule,
  ],
  providers: [
    // Orden intencional: primero el límite de intentos y después la autenticación.
    { provide: APP_GUARD, useClass: WriteThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule {}
