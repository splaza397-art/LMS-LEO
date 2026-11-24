import { Injectable } from '@nestjs/common';
import type { PageRequest, SortSpec } from '../../common/pagination';
import { SqlConditions } from '../../common/sql';
import { DbService } from '../../db/db.service';
import type { ContentDto } from './content.dto';

const CONTENT_FIELDS = `id, type, slug, title, summary, body, image_url AS "imageUrl", seo_title AS "seoTitle",
  seo_description AS "seoDescription", sort_order AS "sortOrder", published_at AS "publishedAt"`;

export const CONTENT_SORT: SortSpec = {
  columns: { updatedAt: 'updated_at', title: 'title', sortOrder: 'sort_order', publishedAt: 'published_at' },
  default: 'updatedAt', defaultOrder: 'desc', tieBreaker: 'id', legacyLimit: 300,
};

export interface ContentFilters { type: string | null; status: string | null; search: string }

/** Dueño de content_items, media y redirects. */
@Injectable()
export class ContentRepository {
  constructor(private readonly db: DbService) {}

  publishedByType(type: string) {
    return this.db.query(
      `SELECT ${CONTENT_FIELDS} FROM content_items WHERE type = $1 AND status = 'publicado'
        ORDER BY sort_order, published_at DESC NULLS LAST LIMIT 100`,
      [type],
    );
  }

  publishedItem(type: string, slug: string) {
    return this.db.one(
      `SELECT ${CONTENT_FIELDS} FROM content_items WHERE type = $1 AND slug = $2 AND status = 'publicado'`, [type, slug],
    );
  }

  publishedPages() {
    return this.db.query(`SELECT type, slug, updated_at AS "updatedAt" FROM content_items WHERE status = 'publicado' AND type IN ('noticia', 'pagina')`);
  }

  redirects() {
    return this.db.query(`SELECT source_path AS source, target_path AS target FROM redirects`);
  }

  media(id: string) {
    return this.db.one<{ mime: string; data: Buffer }>(`SELECT mime, data FROM media WHERE id = $1`, [id]);
  }

  insertMedia(mime: string, data: Buffer, uploadedBy: string) {
    return this.db.one<{ id: string }>(
      `INSERT INTO media (mime, size_bytes, data, uploaded_by) VALUES ($1, $2, $3, $4) RETURNING id`, [mime, data.length, data, uploadedBy],
    );
  }

  adminList(filters: ContentFilters, page: PageRequest) {
    const where = new SqlConditions()
      .addIf(filters.type !== null, 'type = ?', filters.type)
      .addIf(filters.status !== null, 'status = ?', filters.status)
      .addIf(filters.search !== '', `title ILIKE '%' || ? || '%' OR slug ILIKE '%' || ? || '%'`, filters.search, filters.search);
    return this.db.query<Record<string, unknown> & { _total: string }>(
      `SELECT id, type, slug, title, summary, body, image_url AS "imageUrl", seo_title AS "seoTitle", seo_description AS "seoDescription",
              sort_order AS "sortOrder", status, published_at AS "publishedAt", updated_at AS "updatedAt",
              count(*) OVER () AS _total
         FROM content_items
        ${where.where()}
        ORDER BY ${page.orderBy} LIMIT ${where.param(page.pageSize)} OFFSET ${where.param(page.offset)}`,
      where.params,
    );
  }

  create(dto: ContentDto, actorId: string) {
    return this.db.one<{ id: string }>(
      `INSERT INTO content_items (type, slug, title, summary, body, image_url, seo_title, seo_description, sort_order, status, published_at, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $10 = 'publicado' THEN now() END, $11) RETURNING id`,
      [dto.type, dto.slug, dto.title, dto.summary ?? '', dto.body ?? '', dto.imageUrl ?? null, dto.seoTitle ?? null,
        dto.seoDescription ?? null, dto.sortOrder ?? 0, dto.status, actorId],
    );
  }

  update(id: string, dto: ContentDto, actorId: string) {
    return this.db.one(
      `UPDATE content_items SET type = $2, slug = $3, title = $4, summary = $5, body = $6, image_url = $7, seo_title = $8,
              seo_description = $9, sort_order = $10, status = $11,
              published_at = CASE WHEN $11 = 'publicado' THEN COALESCE(published_at, now()) END,
              updated_by = $12, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id, dto.type, dto.slug, dto.title, dto.summary ?? '', dto.body ?? '', dto.imageUrl ?? null, dto.seoTitle ?? null,
        dto.seoDescription ?? null, dto.sortOrder ?? 0, dto.status, actorId],
    );
  }

  remove(id: string) {
    return this.db.one<{ id: string; type: string; slug: string }>(`DELETE FROM content_items WHERE id = $1 RETURNING id, type, slug`, [id]);
  }
}
