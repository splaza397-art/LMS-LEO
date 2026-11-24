import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

/** Registro inalterable de acciones sensibles (la tabla rechaza UPDATE y DELETE) y su consulta. */
@Module({ controllers: [AuditController], providers: [AuditService, AuditRepository], exports: [AuditService] })
export class AuditModule {}
