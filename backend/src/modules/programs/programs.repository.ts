import { Injectable } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import type { CohortDto, ProgramDto } from './programs.dto';

/** Dueño de programs, cohorts y program_courses. */
@Injectable()
export class ProgramsRepository {
  constructor(private readonly db: DbService) {}

  published() {
    return this.db.query(
      `SELECT id, slug, name, level, summary, duration, modality, image_url AS "imageUrl" FROM programs WHERE published
        ORDER BY array_position(ARRAY['licenciatura','diplomado','certificacion','curso'], level), name`,
    );
  }

  publishedBySlug(slug: string) {
    return this.db.one(
      `SELECT id, slug, name, level, summary, description, duration, modality, image_url AS "imageUrl" FROM programs WHERE slug = $1 AND published`, [slug],
    );
  }

  /** Programa publicado (para solicitudes de admisión e información). */
  findPublished(id: string) {
    return this.db.one<{ id: string }>(`SELECT id FROM programs WHERE id = $1 AND published`, [id]);
  }

  publishedSlugs() {
    return this.db.query(`SELECT slug, updated_at AS "updatedAt" FROM programs WHERE published`);
  }

  adminList(scoped: boolean, programIds: string[]) {
    return this.db.query(
      `SELECT p.id, p.slug, p.name, p.level, p.summary, p.description, p.duration, p.modality, p.published, p.image_url AS "imageUrl",
              COALESCE((SELECT json_agg(pc.moodle_course_id) FROM program_courses pc WHERE pc.program_id = p.id), '[]') AS "courseIds",
              COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name)) FROM cohorts c WHERE c.program_id = p.id), '[]') AS cohorts
         FROM programs p WHERE NOT $1::boolean OR p.id = ANY($2::uuid[]) ORDER BY p.name`,
      [scoped, programIds],
    );
  }

  create(dto: ProgramDto) {
    return this.db.one<{ id: string }>(
      `INSERT INTO programs (slug, name, level, summary, description, duration, modality, published, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'En línea'), $8, $9) RETURNING id`,
      [dto.slug, dto.name, dto.level, dto.summary, dto.description ?? '', dto.duration ?? '', dto.modality ?? null, dto.published, dto.imageUrl ?? null],
    );
  }

  update(id: string, dto: ProgramDto) {
    return this.db.one(
      `UPDATE programs SET slug = $2, name = $3, level = $4, summary = $5, description = $6, duration = $7,
              modality = COALESCE($8, modality), published = $9, image_url = $10, updated_at = now() WHERE id = $1 RETURNING id`,
      [id, dto.slug, dto.name, dto.level, dto.summary, dto.description ?? '', dto.duration ?? '', dto.modality ?? null, dto.published, dto.imageUrl ?? null],
    );
  }

  createCohort(programId: string, dto: CohortDto) {
    return this.db.one<{ id: string }>(
      `INSERT INTO cohorts (program_id, name, starts_on, ends_on) VALUES ($1, $2, $3, $4) RETURNING id, name`,
      [programId, dto.name, dto.startsOn ?? null, dto.endsOn ?? null],
    );
  }

  async cohortBelongsTo(cohortId: string, programId: string): Promise<boolean> {
    return Boolean(await this.db.one(`SELECT 1 AS x FROM cohorts WHERE id = $1 AND program_id = $2`, [cohortId, programId]));
  }

  async linkCourse(programId: string, courseId: number): Promise<void> {
    await this.db.query(`INSERT INTO program_courses VALUES ($1, $2) ON CONFLICT DO NOTHING`, [programId, courseId]);
  }

  async unlinkCourse(programId: string, courseId: number): Promise<void> {
    await this.db.query(`DELETE FROM program_courses WHERE program_id = $1 AND moodle_course_id = $2`, [programId, courseId]);
  }

  async courseIds(programId: string): Promise<string[]> {
    return (await this.db.query<{ moodle_course_id: string }>(
      `SELECT moodle_course_id FROM program_courses WHERE program_id = $1`, [programId],
    )).map((r) => r.moodle_course_id);
  }

  async hasCourse(programId: string, courseId: number): Promise<boolean> {
    return Boolean(await this.db.one(`SELECT 1 AS x FROM program_courses WHERE program_id = $1 AND moodle_course_id = $2`, [programId, courseId]));
  }
}
