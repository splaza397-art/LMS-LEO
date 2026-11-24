import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProgramsModule } from '../programs/programs.module';
import { ContentController } from './content.controller';
import { ContentRepository } from './content.repository';
import { ContentService } from './content.service';

/** Contenido del portal, imágenes, redirecciones de WordPress y datos del sitemap. */
@Module({ imports: [AuditModule, ProgramsModule], controllers: [ContentController], providers: [ContentService, ContentRepository] })
export class ContentModule {}
