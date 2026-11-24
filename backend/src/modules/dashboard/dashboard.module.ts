import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { UsersModule } from '../users/users.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** Mi IINICIA: cursos, actividades próximas, enlace al campus y grupos del profesor o coordinador. */
@Module({ imports: [IntegrationsModule, UsersModule, EnrollmentsModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
