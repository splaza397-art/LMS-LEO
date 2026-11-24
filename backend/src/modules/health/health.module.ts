import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/** Estado del sistema (base de datos, identidad y campus). */
@Module({ imports: [IntegrationsModule], controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
