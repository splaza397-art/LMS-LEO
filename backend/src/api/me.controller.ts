import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermission } from '../modules/auth/auth.decorators';
import { hasPermission, permissionsFor } from '../modules/auth/permissions';
import { config } from '../config';
import { AccountsService } from '../core/accounts.service';
import { AdmissionsService } from '../core/admissions.service';
import { NotificationsService } from '../core/notifications.service';
import { DbService } from '../db/db.service';
import { MoodleCourse, MoodleService } from '../integrations/moodle.service';
import { ApplyDto, DeviceDto, UpdateProfileDto } from './dto';

const summary = ({ sections, ...course }: MoodleCourse) => ({
  ...course,
  activityCount: sections.reduce((total, s) => total + s.activities.length, 0),
});

@ApiTags('mi-iinicia')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    private readonly db: DbService,
    private readonly accounts: AccountsService,
    private readonly admissions: AdmissionsService,
    private readonly notifications: NotificationsService,
    private readonly moodle: MoodleService,
  ) {}

  /** Solo cursos reales del usuario: el ID de Moodle sale de la base, nunca del cliente. */
  private async myCourses(user: AuthUser): Promise<MoodleCourse[]> {
    if (!hasPermission(user.roles, 'campus:access')) return [];
    const row = await this.db.one<{ moodle_user_id: string | null }>(`SELECT moodle_user_id FROM users WHERE id = $1`, [user.id]);
    return row?.moodle_user_id ? this.moodle.overview(Number(row.moodle_user_id)) : [];
  }

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    return { ...(await this.accounts.profile(user.id)), permissions: permissionsFor(user.roles) };
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.accounts.updateProfile(user, dto);
  }

  @Get('courses')
  async courses(@CurrentUser() user: AuthUser) {
    return (await this.myCourses(user)).map(summary);
  }

  @Get('courses/:id')
  async course(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const course = (await this.myCourses(user)).find((c) => c.id === id);
    if (!course) throw new NotFoundException('Curso no disponible');
    return course;
  }

  @Get('upcoming')
  async upcoming(@CurrentUser() user: AuthUser) {
    const now = Math.floor(Date.now() / 1000);
    return (await this.myCourses(user))
      .flatMap((c) => c.sections.flatMap((s) => s.activities
        .filter((a) => a.duedate > now && !a.completed)
        .map((a) => ({ ...a, courseId: c.id, courseName: c.fullname }))))
      .sort((a, b) => a.duedate - b.duedate)
      .slice(0, 20);
  }

  /** Enlace SSO al LMS. Valida que la actividad pertenezca a un curso del usuario. */
  @Get('campus-link')
  @RequirePermission('campus:access')
  async campusLink(@CurrentUser() user: AuthUser, @Query('courseId') courseId?: string, @Query('cmid') cmid?: string) {
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
    return { url: `${config.moodle.url}/local/iinicia/sso.php?wantsurl=${encodeURIComponent(wantsurl)}` };
  }

  /** Cursos que imparte o supervisa el usuario, con el avance de sus estudiantes. */
  @Get('teaching')
  async teaching(@CurrentUser() user: AuthUser) {
    const rows = await this.db.query<{ moodle_course_id: string; moodle_role: string }>(
      `SELECT moodle_course_id, moodle_role FROM enrolments
        WHERE user_id = $1 AND moodle_role IN ('editingteacher', 'teacher') AND status = 'active' ORDER BY moodle_course_id`,
      [user.id],
    );
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

  @Get('applications')
  applications(@CurrentUser() user: AuthUser) {
    return this.admissions.mine(user.id);
  }

  @Post('applications')
  @RequirePermission('application:create')
  apply(@CurrentUser() user: AuthUser, @Body() dto: ApplyDto) {
    return this.admissions.apply(user, dto.programId);
  }

  @Get('notifications')
  listNotifications(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Post('notifications/:id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('devices')
  device(@CurrentUser() user: AuthUser, @Body() dto: DeviceDto) {
    return this.notifications.registerDevice(user.id, dto.token, dto.enabled ?? true);
  }

  @Delete('devices/:token')
  removeDevice(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.notifications.removeDevice(user.id, token);
  }
}
