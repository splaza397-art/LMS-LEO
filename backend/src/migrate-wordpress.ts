// Migra el contenido institucional del WordPress actual. Idempotente: puede ejecutarse varias veces.
// Uso: npm run migrate:wordpress
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { detectImage } from './modules/content/image';
import { AppModule } from './app.module';
import { DEMO_CONTENT, DEMO_PROGRAM_SLUGS, PAGES, PROGRAMS, REDIRECTS } from './content/iinicia-wordpress';
import { DbService } from './db/db.service';

async function importImage(db: DbService, url: string): Promise<string | null> {
  const existing = await db.one<{ id: string }>(`SELECT id FROM media WHERE source_url = $1`, [url]);
  if (existing) return `/media/${existing.id}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'IINICIA-migracion' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    const mime = detectImage(data);
    if (!mime || data.length > 5 * 1024 * 1024) throw new Error('formato o tamaño no admitido');
    const row = await db.one<{ id: string }>(
      `INSERT INTO media (mime, size_bytes, data, source_url) VALUES ($1, $2, $3, $4) RETURNING id`, [mime, data.length, data, url],
    );
    return `/media/${row!.id}`;
  } catch (error) {
    console.warn(`Imagen omitida (${url}): ${(error as Error).message}`);
    return null;
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  await app.init();
  const db = app.get(DbService);

  for (const p of PROGRAMS) {
    const image = p.image ? await importImage(db, p.image) : null;
    await db.query(
      `INSERT INTO programs (slug, name, level, summary, description, modality, published, image_url, source_url)
       VALUES ($1, $2, $3, $4, $5, 'En línea', true, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, level = EXCLUDED.level, summary = EXCLUDED.summary,
         description = EXCLUDED.description, image_url = COALESCE(EXCLUDED.image_url, programs.image_url),
         source_url = EXCLUDED.source_url, updated_at = now()`,
      [p.slug, p.name, p.level, p.summary, p.description, image, p.source],
    );
  }

  for (const page of PAGES) {
    await db.query(
      `INSERT INTO content_items (type, slug, title, summary, body, sort_order, status, published_at, source_url)
       VALUES ('pagina', $1, $2, $3, $4, $5, 'publicado', now(), $6)
       ON CONFLICT (type, slug) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary, body = EXCLUDED.body,
         sort_order = EXCLUDED.sort_order, source_url = EXCLUDED.source_url, updated_at = now()`,
      [page.slug, page.title, page.summary, page.body, page.order, page.source],
    );
  }

  for (const [source, target] of REDIRECTS) {
    await db.query(`INSERT INTO redirects VALUES ($1, $2) ON CONFLICT (source_path) DO UPDATE SET target_path = EXCLUDED.target_path`, [source, target]);
  }

  for (const [type, slug] of DEMO_CONTENT) await db.query(`DELETE FROM content_items WHERE type = $1 AND slug = $2`, [type, slug]);
  await db.tx(async (client) => {
    const demo = `(SELECT id FROM programs WHERE slug = ANY($1::text[]))`;
    await client.query(`DELETE FROM user_roles WHERE role = 'coordinador' AND program_id IN ${demo}`, [DEMO_PROGRAM_SLUGS]);
    await client.query(`DELETE FROM enrolments WHERE program_id IN ${demo}`, [DEMO_PROGRAM_SLUGS]);
    await client.query(`DELETE FROM applications WHERE program_id IN ${demo}`, [DEMO_PROGRAM_SLUGS]);
    await client.query(`DELETE FROM programs WHERE slug = ANY($1::text[])`, [DEMO_PROGRAM_SLUGS]);
  });

  console.log(`Migración completa: ${PROGRAMS.length} programas, ${PAGES.length} páginas, ${REDIRECTS.length} redirecciones.`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
