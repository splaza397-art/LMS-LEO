import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

/** Indicadores y reportes por programa. */
@Module({ controllers: [ReportsController], providers: [ReportsService, ReportsRepository] })
export class ReportsModule {}
