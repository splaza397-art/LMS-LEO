/**
 * Tipos de las respuestas de /api/v1 que usa el portal. Reflejan los contratos del backend
 * (documentation/api/openapi.json y documentation/api/inventario-endpoints.md). Sirven en servidor y cliente.
 */
export interface Program { id: string; slug: string; name: string; level: string; summary: string; description?: string; duration: string; modality: string; imageUrl?: string; published?: boolean }
export interface AdminProgram extends Program { published: boolean; courseIds: (number | string)[]; cohorts: { id: string; name: string }[] }
export interface ContentItem { id: string; type: string; slug: string; title: string; summary: string; body: string; imageUrl?: string; seoTitle?: string; seoDescription?: string; sortOrder?: number; status?: string; publishedAt?: string; updatedAt?: string }
export interface Me { id: string; email: string; firstName: string; lastName: string; phone?: string; status: string; roles: string[]; permissions: string[]; moodleSyncStatus: string }
export interface Activity { cmid: number; name: string; modname: string; url: string; duedate: number; completed: boolean }
export interface Course { id: number; fullname: string; shortname: string; summary: string; progress: number; url: string; activityCount?: number; sections?: { id: number; name: string; activities: Activity[] }[] }
export interface Upcoming extends Activity { courseId: number; courseName: string }
export interface Application { id: string; status: string; programId: string; programName: string; programSlug: string; cohortName?: string; createdAt: string }
export interface Notice { id: string; title: string; body: string; link?: string; readAt?: string; createdAt: string }
export interface TeachingCourse { courseId: number; courseName: string; role: string; students: { fullname: string; email: string; progress: number; lastaccess: number }[] }

// Panel de gestión
export interface AdminUser { id: string; email: string; firstName: string; lastName: string; status: string; moodleSyncStatus: string; moodleUserId?: string | null; roles: string[] }
export interface AdminApplication { id: string; status: string; createdAt: string; notes?: string; programId: string; programName: string; userId: string; email: string; firstName: string; lastName: string; cohortName?: string }
export interface InfoRequest { id: string; name: string; email: string; phone?: string; message: string; status: string; createdAt: string; programName?: string }
export interface AuditEntry { id: string; action: string; targetType?: string; targetId?: string; detail?: unknown; createdAt: string; actor?: string }
export interface Enrolment { courseId: number | string; role: string; status: string; programName?: string }
export interface Teacher { userId: string; courseId: number | string; status: string; email: string; firstName: string; lastName: string }
export interface TeacherCandidate { id: string; email: string; firstName: string; lastName: string }
export interface MoodleCourseRef { id: number; fullname: string; shortname: string; visible?: boolean }
export interface ProgramReport { id: string; name: string; level: string; pending: number; admitted: number; rejected: number; activeStudents: number; suspendedStudents: number; teachers: number; courses: number }

/** Respuesta paginada de las listas administrativas (Fase 2). */
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
