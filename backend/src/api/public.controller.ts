import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.guard';
import { AccountsService } from '../core/accounts.service';
import { DbService } from '../db/db.service';
import { KeycloakService } from '../integrations/keycloak.service';
import { MoodleService } from '../integrations/moodle.service';
import { InfoRequestDto, RegisterDto } from './dto';

const CONTENT_TYPES = new Set(['noticia', 'pagina', 'faq', 'docente', 'autoridad', 'contacto']);
const CONTENT_FIELDS = `id, type, slug, title, summary, body, image_url AS "imageUrl", seo_title AS "seoTitle",
  seo_description AS "seoDescription", sort_order AS "sortOrder", published_at AS "publishedAt"`;

@ApiTags('estado')
@Public()
@Controller({ version: VERSION_NEUTRAL })
export class StatusController {
  constructor(private readonly db: DbService, private readonly keycloak: KeycloakService, private readonly moodle: MoodleService) {}

  @Get('estado')
  async status() {
    const [database, identidad, lms] = await Promise.all([
      this.db.one('SELECT 1 AS ok').then(() => true).catch(() => false),
      this.keycloak.health(),
      this.moodle.health(),
    ]);
    return {
      sistema: 'IINICIA',
      estado: database && identidad && lms ? 'operativo' : 'degradado',
      version: '1.0.0',
      servicios: { database, identidad, lms },
    };
  }
}

@ApiTags('publico')
@Public()
@Controller({ version: '1' })
export class PublicController {
  constructor(private readonly db: DbService, private readonly accounts: AccountsService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    // Al bot se le responde igual que a un registro correcto para no revelar la trampa.
    if (dto.website) return { status: 'aspirante' };
    const { status } = await this.accounts.register(dto, req.ip);
    return { status };
  }

  @Get('programs')
  programs() {
    return this.db.query(
      `SELECT id, slug, name, level, summary, duration, modality, image_url AS "imageUrl" FROM programs WHERE published
        ORDER BY array_position(ARRAY['licenciatura','diplomado','certificacion','curso'], level), name`,
    );
  }

  @Get('programs/:slug')
  async program(@Param('slug') slug: string) {
    const program = await this.db.one(
      `SELECT id, slug, name, level, summary, description, duration, modality, image_url AS "imageUrl" FROM programs WHERE slug = $1 AND published`, [slug],
    );
    if (!program) throw new NotFoundException('Programa no encontrado');
    return program;
  }

  @Get('content/:type')
  content(@Param('type') type: string) {
    if (!CONTENT_TYPES.has(type)) throw new NotFoundException();
    return this.db.query(
      `SELECT ${CONTENT_FIELDS} FROM content_items WHERE type = $1 AND status = 'publicado'
        ORDER BY sort_order, published_at DESC NULLS LAST LIMIT 100`,
      [type],
    );
  }

  @Get('content/:type/:slug')
  async contentItem(@Param('type') type: string, @Param('slug') slug: string) {
    if (!CONTENT_TYPES.has(type)) throw new NotFoundException();
    const item = await this.db.one(
      `SELECT ${CONTENT_FIELDS} FROM content_items WHERE type = $1 AND slug = $2 AND status = 'publicado'`, [type, slug],
    );
    if (!item) throw new NotFoundException('Contenido no encontrado');
    return item;
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('info-requests')
  @HttpCode(201)
  async infoRequest(@Body() dto: InfoRequestDto) {
    if (dto.website) return { ok: true };
    const program = dto.programId ? await this.db.one(`SELECT id FROM programs WHERE id = $1 AND published`, [dto.programId]) : null;
    await this.db.query(
      `INSERT INTO info_requests (name, email, phone, program_id, message, consent_at) VALUES ($1, $2, $3, $4, $5, now())`,
      [dto.name, dto.email.toLowerCase(), dto.phone || null, program?.id ?? null, dto.message],
    );
    return { ok: true };
  }

  @Get('media/:id')
  async media(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.db.one<{ mime: string; data: Buffer }>(`SELECT mime, data FROM media WHERE id = $1`, [id]);
    if (!file) throw new NotFoundException('Archivo no encontrado');
    res.set({ 'content-type': file.mime, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' }).send(file.data);
  }

  @Get('sitemap-data')
  async sitemapData() {
    const [programs, content] = await Promise.all([
      this.db.query(`SELECT slug, updated_at AS "updatedAt" FROM programs WHERE published`),
      this.db.query(`SELECT type, slug, updated_at AS "updatedAt" FROM content_items WHERE status = 'publicado' AND type IN ('noticia', 'pagina')`),
    ]);
    return { programs, content };
  }

  @Get('redirects')
  redirects() {
    return this.db.query(`SELECT source_path AS source, target_path AS target FROM redirects`);
  }
}
