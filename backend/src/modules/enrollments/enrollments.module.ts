import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SynchronizationModule } from '../synchronization/synchronization.module';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsRepository } from './enrollments.repository';
import { EnrollmentsService } from './enrollments.service';

/** Matrículas: consulta, suspensión y reactivación. */
@Module({
  imports: [AuditModule, SynchronizationModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, EnrollmentsRepository],
  exports: [EnrollmentsRepository],
})
export class EnrollmentsModule {}
