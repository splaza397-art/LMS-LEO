import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { config } from '../../config';

import type { MoodleCourse } from './moodle.types';

export type { MoodleActivity, MoodleCourse, MoodleSection } from './moodle.types';

/** Unico punto de contacto con Moodle. El token nunca sale de este servicio ni se registra en logs. */
@Injectable()
export class MoodleService {
  private readonly logger = new Logger(MoodleService.name);

  private async call<T>(wsfunction: string, params: Record<string, string | number> = {}): Promise<T> {
    const body = new URLSearchParams({
      wstoken: config.moodle.token,
      wsfunction,
      moodlewsrestformat: 'json',
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    let data: unknown;
    try {
      const response = await fetch(`${config.moodle.url}/webservice/rest/server.php`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      data = await response.json();
    } catch (error) {
      this.logger.error(`Moodle no disponible en ${wsfunction}: ${(error as Error).name}`);
      throw new BadGatewayException('El campus no está disponible');
    }
    if (data && typeof data === 'object' && 'exception' in data) {
      const e = data as { errorcode?: string; message?: string };
      this.logger.error(`Error Moodle en ${wsfunction}: ${e.errorcode}`);
      throw new BadGatewayException(`Error del campus: ${e.errorcode ?? 'desconocido'}`);
    }
    return data as T;
  }

  upsertUser(input: { uuid: string; sub: string; email: string; firstName: string; lastName: string; suspended: boolean }) {
    return this.call<{ moodleuserid: number; created: boolean }>('local_iinicia_upsert_user', {
      uuid: input.uuid,
      oidcsub: input.sub,
      email: input.email,
      firstname: input.firstName,
      lastname: input.lastName,
      suspended: input.suspended ? 1 : 0,
    });
  }

  setEnrolment(userId: number, courseId: number, role: string, active: boolean) {
    return this.call<{ enrolled: boolean; active: boolean }>('local_iinicia_set_enrolment', {
      userid: userId, courseid: courseId, role, active: active ? 1 : 0,
    });
  }

  setSystemRole(userId: number, role: 'manager', active: boolean) {
    return this.call<{ active: boolean }>('local_iinicia_set_system_role', { userid: userId, role, active: active ? 1 : 0 });
  }

  setCohortMember(cohortUuid: string, name: string, userId: number, active: boolean) {
    return this.call<{ cohortid: number }>('local_iinicia_set_cohort_member', {
      idnumber: cohortUuid, name, userid: userId, active: active ? 1 : 0,
    });
  }

  async courseProgress(courseId: number) {
    return (await this.call<{ students: { id: number; uuid: string; fullname: string; email: string; progress: number; lastaccess: number }[] }>(
      'local_iinicia_course_progress', { courseid: courseId },
    )).students;
  }

  /** Cierra todas las sesiones de Moodle de una persona (Fase 4.10). Devuelve cuántas había. */
  /**
   * Cierra sesiones de Moodle de la persona. scope=device: solo las asociadas a la sesión de Keycloak kcsid (y las no
   * asociadas anteriores a "before"); scope=all: todas las anteriores a "before" (segundos Unix). Revoca los
   * comprobantes de esa sesión (device) o los emitidos hasta "before" (all).
   */
  async logoutUser(userId: number, before: number, target: { scope: 'device'; kcsid: string } | { scope: 'all' } = { scope: 'all' }): Promise<number> {
    const params: Record<string, string | number> = { userid: userId, before, scope: target.scope };
    if (target.scope === 'device') params.kcsid = target.kcsid;
    return (await this.call<{ closed: number }>('local_iinicia_logout_user', params)).closed;
  }

  async overview(userId: number): Promise<MoodleCourse[]> {
    return (await this.call<{ courses: MoodleCourse[] }>('local_iinicia_student_overview', { userid: userId })).courses;
  }

  async listCourses() {
    return (await this.call<{ courses: { id: number; fullname: string; shortname: string; visible: boolean }[] }>('local_iinicia_list_courses')).courses;
  }

  async health(): Promise<boolean> {
    try {
      await this.listCourses();
      return true;
    } catch {
      return false;
    }
  }
}
