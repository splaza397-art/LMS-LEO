import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { oneOf, PageQuery, parsePage, searchTerm, toPageResult } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.decorators';
import { ProgramsRepository } from '../programs/programs.repository';
import type { ContentDto } from './content.dto';
import { CONTENT_SORT, ContentRepository } from './content.repository';
import { detectImage } from './image';

const CONTENT_TYPES = new Set(['noticia', 'pagina', 'faq', 'docente', 'autoridad', 'contacto']);

export interface ContentListQuery extends PageQuery { type?: string; status?: string; q?: string }

@Injectable()
export class ContentService {
  constructor(
    private readonly content: ContentRepository,
    private readonly programs: ProgramsRepository,
    private readonly audit: AuditService,
  ) {}

  publishedByType(type: string) {
    if (!CONTENT_TYPES.has(type)) throw new NotFoundException();
    return this.content.publishedByType(type);
  }

  async publishedItem(type: string, slug: string) {
    if (!CONTENT_TYPES.has(type)) throw new NotFoundException();
    const item = await this.content.publishedItem(type, slug);
    if (!item) throw new NotFoundException('Contenido no encontrado');
    return item;
  }

  async media(id: string) {
    const file = await this.content.media(id);
    if (!file) throw new NotFoundException('Archivo no encontrado');
    return file;
  }

  async sitemapData() {
    const [programs, content] = await Promise.all([this.programs.publishedSlugs(), this.content.publishedPages()]);
    return { programs, content };
  }

  redirects() {
    return this.content.redirects();
  }

  /** El tipo se decide por el contenido real del archivo, nunca por lo que declara el cliente. */
  async upload(actor: AuthUser, data: unknown) {
    if (!Buffer.isBuffer(data) || data.length === 0) throw new BadRequestException('Sube una imagen PNG, JPG o WebP de hasta 5 MB');
    const mime = detectImage(data);
    if (!mime) throw new BadRequestException('El archivo no es una imagen PNG, JPG o WebP válida');
    const row = await this.content.insertMedia(mime, data, actor.id);
    await this.audit.log({ actorId: actor.id, action: 'media.upload', targetType: 'media', targetId: row!.id, detail: { mime, size: data.length } });
    return { id: row!.id, url: `/media/${row!.id}` };
  }

  adminList(query: ContentListQuery) {
    const page = parsePage(query, CONTENT_SORT);
    // `type` ya existía sin validación (un tipo desconocido devuelve una lista vacía): se conserva igual.
    return this.content.adminList({
      type: query.type === undefined || query.type === '' ? null : query.type,
      status: oneOf(query.status, ['borrador', 'publicado'] as const, 'status'),
      search: searchTerm(query.q),
    }, page).then((rows) => toPageResult(rows, page));
  }

  async create(actor: AuthUser, dto: ContentDto) {
    const row = await this.content.create(dto, actor.id);
    await this.audit.log({ actorId: actor.id, action: 'content.create', targetType: 'content', targetId: row!.id });
    return row;
  }

  async update(actor: AuthUser, id: string, dto: ContentDto) {
    const row = await this.content.update(id, dto, actor.id);
    if (!row) throw new NotFoundException('Contenido no encontrado');
    await this.audit.log({ actorId: actor.id, action: 'content.update', targetType: 'content', targetId: id });
    return row;
  }

  async remove(actor: AuthUser, id: string) {
    const row = await this.content.remove(id);
    if (!row) throw new NotFoundException('Contenido no encontrado');
    await this.audit.log({ actorId: actor.id, action: 'content.delete', targetType: 'content', targetId: id, detail: row });
    return { ok: true };
  }
}
