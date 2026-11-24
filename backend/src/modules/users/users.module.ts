import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { AuditModule } from '../audit/audit.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { SynchronizationModule } from '../synchronization/synchronization.module';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/** Registro, perfil, usuarios, suspensión y roles. */
@Module({
  imports: [AuditModule, IntegrationsModule, SynchronizationModule, EnrollmentsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
