import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { AuditModule } from '../audit/audit.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProgramsModule } from '../programs/programs.module';
import { SynchronizationModule } from '../synchronization/synchronization.module';
import { UsersModule } from '../users/users.module';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsRepository } from './admissions.repository';
import { AdmissionsService } from './admissions.service';

/** Solicitudes de admisión, decisiones y solicitudes de información. */
@Module({
  imports: [AuditModule, IntegrationsModule, SynchronizationModule, EnrollmentsModule, UsersModule, ProgramsModule, NotificationsModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService, AdmissionsRepository],
})
export class AdmissionsModule {}
