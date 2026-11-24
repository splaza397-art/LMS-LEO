import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { AuditModule } from '../audit/audit.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { SynchronizationModule } from '../synchronization/synchronization.module';
import { UsersModule } from '../users/users.module';
import { ProgramsController } from './programs.controller';
import { ProgramsRepository } from './programs.repository';
import { ProgramsService } from './programs.service';

/** Programas, cohortes, cursos vinculados y profesores. */
@Module({
  imports: [AuditModule, IntegrationsModule, SynchronizationModule, EnrollmentsModule, UsersModule],
  controllers: [ProgramsController],
  providers: [ProgramsService, ProgramsRepository],
  exports: [ProgramsRepository],
})
export class ProgramsModule {}
