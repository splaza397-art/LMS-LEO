import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { config } from '../../config';
import { MoodleCourse, MoodleService } from '../../integrations/moodle/moodle.service';
import type { AuthUser } from '../auth/auth.decorators';
import { hasPermission } from '../auth/permissions';
import { EnrollmentsRepository } from '../enrollments/enrollments.repository';
import { UsersRepository } from '../users/users.repository';
import { BIND_PATTERN, signCampusTicket } from './campus-ticket';

const summary = ({ sections, ...course }: MoodleCourse) => ({
  ...course,
  activityCount: sections.reduce((total, s) => total + s.activities.length, 0),
});

/** Mi IINICIA: lo que cada persona ve de sus cursos. Moodle es la fuente; aquí solo se filtra y resume. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly users: UsersRepository,
    private readonly enrollments: EnrollmentsRepository,
    private readonly moodle: MoodleService,
  ) {}

  /** Solo cursos reales del usuario: el ID de Moodle sale de la base, nunca del cliente. */
  private async myCourses(user: AuthUser): Promise<MoodleCourse[]> {
    if (!hasPermission(user.roles, 'campus:access')) return [];
    const moodleUserId = await this.users.moodleUserId(user.id);
    return moodleUserId ? this.moodle.overview(Number(moodleUserId)) : [];
  }

  async courses(user: AuthUser) {
    return (await this.myCourses(user)).map(summary);
  }

  async course(user: AuthUser, id: number) {
    const course = (await this.myCourses(user)).find((c) => c.id === id);
    if (!course) throw new NotFoundException('Curso no disponible');
    return course;
  }

  async upcoming(user: AuthUser) {
    const now = Math.floor(Date.now() / 1000);
    return (await this.myCourses(user))
      .flatMap((c) => c.sections.flatMap((s) => s.activities
        .filter((a) => a.duedate > now && !a.completed)
        .map((a) => ({ ...a, courseId: c.id, courseName: c.fullname }))))
      .sort((a, b) => a.duedate - b.duedate)
      .slice(0, 20);
  }

  /**
   * Entrada al campus. Valida que el curso o la actividad sean de la persona.
   * Fase 4.11, en dos pasos:
   * - sin "bind": devuelve el enlace al paso "start" de Moodle, que pone una cookie de vinculación en el navegador y
   *   lo devuelve al portal o a la app con ese valor;
   * - con "bind": devuelve el enlace con el comprobante firmado para esta persona, esta sesión y ese navegador.
   */
  async campusLink(user: AuthUser, courseId?: string, cmid?: string, bind?: string) {
    let wantsurl = '/my/courses.php';
    if (cmid || courseId) {
      const courses = await this.myCourses(user);
      if (cmid) {
        const activity = courses.flatMap((c) => c.sections.flatMap((s) => s.activities)).find((a) => a.cmid === Number(cmid));
        if (!activity) throw new ForbiddenException('Actividad no autorizada');
        wantsurl = activity.url.replace(config.moodle.url, '');
      } else {
        if (!courses.some((c) => c.id === Number(courseId))) throw new ForbiddenException('Curso no autorizado');
        wantsurl = `/course/view.php?id=${Number(courseId)}`;
      }
    }
    const moodleUserId = Number(await this.users.moodleUserId(user.id));
    if (!moodleUserId) throw new ConflictException('Tu cuenta del campus aún se está preparando. Intenta en unos minutos.');
    if (bind === undefined) {
      const target: Record<string, string> = cmid ? { cmid: String(Number(cmid)) } : courseId ? { courseId: String(Number(courseId)) } : {};
      return { url: `${config.moodle.url}/local/iinicia/sso.php?${new URLSearchParams({ start: '1', ...target })}` };
    }
    if (!BIND_PATTERN.test(bind)) throw new BadRequestException('Vinculación inválida');
    // Una sesión cerrada (o sin identificador) no obtiene comprobantes, aunque su token de acceso aún no venza.
    if (!user.sid || await this.users.isSessionRevoked(user.sid)) throw new UnauthorizedException('La sesión se cerró. Inicia sesión de nuevo.');
    const ticket = signCampusTicket({
      aud: config.moodle.url, uid: moodleUserId, uuid: user.id, sub: user.sub, sid: user.sid, want: wantsurl, bind,
    }, config.moodle.ssoSecret);
    return { url: `${config.moodle.url}/local/iinicia/sso.php?ticket=${ticket}` };
  }

  /** Cursos que imparte o supervisa el usuario, con el avance de sus estudiantes. */
  async teaching(user: AuthUser) {
    const rows = await this.enrollments.teachingOf(user.id);
    if (!rows.length) return [];
    const names = new Map((await this.moodle.listCourses()).map((c) => [c.id, c.fullname]));
    return Promise.all(rows.map(async (r) => {
      const id = Number(r.moodle_course_id);
      const students = await this.moodle.courseProgress(id);
      return {
        courseId: id,
        courseName: names.get(id) ?? `Curso ${id}`,
        role: r.moodle_role === 'editingteacher' ? 'Profesor' : 'Supervisión',
        students: students.map(({ fullname, email, progress, lastaccess }) => ({ fullname, email, progress, lastaccess })),
      };
    }));
  }
}
