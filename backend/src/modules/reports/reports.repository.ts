import { Injectable } from '@nestjs/common';
import { DbService } from '../../db/db.service';

/**
 * Consultas de solo lectura que cruzan tablas a propósito (excepción documentada en el plan de desarrollo):
 * los indicadores necesitan contar usuarios, solicitudes, matrículas y cursos en una sola consulta.
 */
@Injectable()
export class ReportsRepository {
  constructor(private readonly db: DbService) {}

  stats(scoped: boolean, programIds: string[]) {
    return this.db.one(
      `SELECT (SELECT count(*)::int FROM users u WHERE NOT $1::boolean OR EXISTS (SELECT 1 FROM applications a WHERE a.user_id = u.id AND a.program_id = ANY($2::uuid[]))) AS users,
              (SELECT count(*)::int FROM applications a WHERE a.status = 'enviada' AND (NOT $1::boolean OR a.program_id = ANY($2::uuid[]))) AS "pendingApplications",
              (SELECT count(*)::int FROM programs p WHERE NOT $1::boolean OR p.id = ANY($2::uuid[])) AS programs,
              (SELECT count(*)::int FROM users WHERE moodle_sync_status = 'error' AND NOT $1::boolean) AS "syncErrors"`,
      [scoped, programIds],
    );
  }

  byProgram(scoped: boolean, programIds: string[]) {
    return this.db.query(
      `SELECT p.id, p.name, p.level,
              (SELECT count(*)::int FROM applications a WHERE a.program_id = p.id AND a.status = 'enviada') AS pending,
              (SELECT count(*)::int FROM applications a WHERE a.program_id = p.id AND a.status = 'admitida') AS admitted,
              (SELECT count(*)::int FROM applications a WHERE a.program_id = p.id AND a.status = 'rechazada') AS rejected,
              (SELECT count(DISTINCT e.user_id)::int FROM enrolments e WHERE e.program_id = p.id AND e.moodle_role = 'student' AND e.status = 'active') AS "activeStudents",
              (SELECT count(DISTINCT e.user_id)::int FROM enrolments e WHERE e.program_id = p.id AND e.moodle_role = 'student' AND e.status = 'suspended') AS "suspendedStudents",
              (SELECT count(DISTINCT e.user_id)::int FROM enrolments e WHERE e.program_id = p.id AND e.moodle_role = 'editingteacher' AND e.status <> 'suspended') AS teachers,
              (SELECT count(*)::int FROM program_courses pc WHERE pc.program_id = p.id) AS courses
         FROM programs p WHERE NOT $1::boolean OR p.id = ANY($2::uuid[]) ORDER BY p.name`,
      [scoped, programIds],
    );
  }
}
