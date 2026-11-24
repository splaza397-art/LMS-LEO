// Datos de prueba para DEV/STAGING. Idempotente. Nunca ejecutar en produccion.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Role } from './auth/permissions';
import { config } from './config';
import { AccountsService } from './core/accounts.service';
import { SyncService } from './core/sync.service';
import { DbService } from './db/db.service';
import { KeycloakService } from './integrations/keycloak.service';
import { MoodleService } from './integrations/moodle.service';

const DEMO_USERS: { key: string; first: string; last: string; role: Role }[] = [
  { key: 'superadmin', first: 'Demo', last: 'Superadmin', role: 'superadmin' },
  { key: 'tecnico', first: 'Demo', last: 'Técnico', role: 'admin_tecnico' },
  { key: 'academico', first: 'Demo', last: 'Académico', role: 'admin_academico' },
  { key: 'coordinador', first: 'Demo', last: 'Coordinación', role: 'coordinador' },
  { key: 'profesor', first: 'Demo', last: 'Docente', role: 'profesor' },
  { key: 'estudiante', first: 'Demo', last: 'Estudiante', role: 'estudiante' },
  { key: 'aspirante', first: 'Demo', last: 'Aspirante', role: 'aspirante' },
  { key: 'soporte', first: 'Demo', last: 'Soporte', role: 'soporte' },
];

// Los programas y paginas institucionales los carga `npm run migrate:wordpress`. Aqui solo van
// los textos legales provisionales, preguntas frecuentes de la plataforma y la relacion con Moodle.
const CONTENT = [
  ['pagina', 'aviso-privacidad', 'Aviso de privacidad', 'Texto provisional. Debe sustituirse por el aviso de privacidad aprobado por la institución antes de recibir datos reales.'],
  ['pagina', 'terminos', 'Términos y condiciones', 'Texto provisional. Debe sustituirse por los términos aprobados por la institución.'],
  ['faq', 'como-me-registro', '¿Cómo me registro?', 'Crea tu cuenta en Registrarme, confirma tu correo y elige un programa.'],
  ['faq', 'cuando-veo-mis-cursos', '¿Cuándo veo mis cursos?', 'Cuando tu solicitud sea autorizada, tus cursos aparecerán en Mi IINICIA y en la app.'],
] as const;

/** Programa real (de la migracion) -> curso Moodle creado por seed_cursos.php. */
const PROGRAM_COURSES = [['base-de-datos', 'BD-101'], ['inter-comunicaciones', 'IC-101']] as const;
const DEMO_PROGRAM = 'base-de-datos';

async function main() {
  if (config.production) throw new Error('El seed no se ejecuta en producción');
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error('Falta DEMO_PASSWORD');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  await app.init();
  const db = app.get(DbService);
  const accounts = app.get(AccountsService);
  const keycloak = app.get(KeycloakService);
  const moodle = app.get(MoodleService);
  const sync = app.get(SyncService);

  for (const [type, slug, title, body] of CONTENT) {
    await db.query(
      `INSERT INTO content_items (type, slug, title, summary, body, status, published_at)
       VALUES ($1, $2, $3, $4, $4, 'publicado', now()) ON CONFLICT (type, slug) DO NOTHING`,
      [type, slug, title, body],
    );
  }

  const courses = await moodle.listCourses();
  for (const [slug, shortname] of PROGRAM_COURSES) {
    const target = await db.one<{ id: string }>(`SELECT id FROM programs WHERE slug = $1`, [slug]);
    if (!target) throw new Error(`Falta el programa ${slug}: ejecuta npm run migrate:wordpress`);
    const moodleCourse = courses.find((c) => c.shortname === shortname);
    if (!moodleCourse) throw new Error(`Falta el curso ${shortname}: ejecuta seed_cursos.php en Moodle`);
    await db.query(`INSERT INTO program_courses VALUES ($1, $2) ON CONFLICT DO NOTHING`, [target.id, moodleCourse.id]);
  }
  const program = (await db.one<{ id: string }>(`SELECT id FROM programs WHERE slug = $1`, [DEMO_PROGRAM]))!;
  const course = courses.find((c) => c.shortname === 'BD-101')!;
  await db.query(`INSERT INTO cohorts (program_id, name) VALUES ($1, 'Grupo de prueba') ON CONFLICT DO NOTHING`, [program.id]);

  for (const demo of DEMO_USERS) {
    const email = `${demo.key}@iinicia.test`;
    let row = await db.one<{ id: string; oidc_sub: string }>(`SELECT id, oidc_sub FROM users WHERE email = $1`, [email]);
    if (!row) {
      const created = await accounts.register({ email, password, firstName: demo.first, lastName: demo.last, emailVerified: true });
      row = await db.one(`SELECT id, oidc_sub FROM users WHERE id = $1`, [created.id]);
    }
    await db.query(`DELETE FROM user_roles WHERE user_id = $1`, [row!.id]);
    await db.query(`INSERT INTO user_roles (user_id, role, program_id) VALUES ($1, $2, $3)`,
      [row!.id, demo.role, demo.role === 'coordinador' ? program.id : null]);
    await keycloak.setRealmRoles(row!.oidc_sub, [demo.role]);
    if (demo.role === 'admin_tecnico' || demo.role === 'soporte') {
      // Personal sin acceso al campus: cuenta activa, sin usuario de Moodle.
      await db.query(`UPDATE users SET status = 'activo' WHERE id = $1 AND status = 'aspirante'`, [row!.id]);
    }

    if (demo.role === 'estudiante' || demo.role === 'profesor') {
      await db.query(
        `INSERT INTO enrolments (user_id, moodle_course_id, program_id, moodle_role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, moodle_course_id) DO NOTHING`,
        [row!.id, course.id, program.id, demo.role === 'profesor' ? 'editingteacher' : 'student'],
      );
      await db.query(`UPDATE users SET status = 'admitido', moodle_sync_status = 'pending' WHERE id = $1 AND status <> 'activo'`, [row!.id]);
      if (!(await sync.syncUser(row!.id))) throw new Error(`No se sincronizó ${email}`);
    }
    if (demo.role === 'superadmin' || demo.role === 'admin_academico' || demo.role === 'coordinador') {
      await db.query(`UPDATE users SET status = 'admitido', moodle_sync_status = 'pending' WHERE id = $1 AND status <> 'activo'`, [row!.id]);
      if (!(await sync.syncUser(row!.id))) throw new Error(`No se sincronizó ${email}`);
    }
    if (demo.role === 'estudiante') {
      await db.query(
        `INSERT INTO applications (user_id, program_id, status, reviewed_at) VALUES ($1, $2, 'admitida', now())
         ON CONFLICT (user_id, program_id) DO NOTHING`, [row!.id, program.id],
      );
    }
  }
  console.log(`Seed completo. Curso Moodle ${course.id}, ${DEMO_USERS.length} usuarios @iinicia.test`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
