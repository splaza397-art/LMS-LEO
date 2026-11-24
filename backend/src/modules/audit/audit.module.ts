import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Registro inalterable de acciones sensibles (la tabla rechaza UPDATE y DELETE). */
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
