import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { AuditModule } from '../audit/audit.module';
import { AdminSessionController, SessionController } from './session.controller';
import { SessionService } from './session.service';
import { SyncService } from './sync.service';
import { SynchronizationController } from './synchronization.controller';
import { SynchronizationRepository } from './synchronization.repository';

/** Sincronización con Moodle: bloqueo por persona, reintentos con espera progresiva y auditoría de fallos. */
@Module({
  imports: [AuditModule, IntegrationsModule],
  controllers: [SynchronizationController, SessionController, AdminSessionController],
  providers: [SyncService, SynchronizationRepository, SessionService],
  exports: [SyncService, SynchronizationRepository],
})
export class SynchronizationModule {}
