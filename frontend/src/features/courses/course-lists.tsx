import Link from "next/link";
import { EmptyState } from "@/components/feedback/status";
import { privateGet } from "@/lib/api/server";
import type { Course, TeachingCourse, Upcoming } from "@/types/api";
import { CampusButton } from "./campus-button";

const CAMPUS_DOWN = <p role="alert" className="text-amber-700">El campus no está disponible por el momento.</p>;
const zone = "America/Mexico_City";
const dateTime = (unix: number) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(unix * 1000);
const day = (unix: number) => (unix ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: zone }).format(unix * 1000) : "Sin acceso");

/** Cursos de la persona con su avance (estudiantes y quienes tienen acceso al campus). */
export async function MyCourses() {
  const courses = await privateGet<Course[]>("/me/courses");
  if (!courses) return CAMPUS_DOWN;
  if (!courses.length) return <EmptyState>Aún no tienes cursos asignados.</EmptyState>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {courses.map((c) => (
        <li key={c.id} className="card">
          <span className="badge">{c.shortname}</span>
          <h3 className="mt-2 text-lg font-bold"><Link href={`/mi-iinicia/cursos/${c.id}`} className="hover:underline">{c.fullname}</Link></h3>
          <p className="mt-1 text-sm muted">{c.activityCount} actividades</p>
          {c.progress >= 0 && (
            <div className="mt-3">
              <div role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${c.fullname}`} className="h-2 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-blue-700" style={{ width: `${c.progress}%` }} />
              </div>
              <p className="mt-1 text-xs muted">{c.progress}% completado</p>
            </div>
          )}
          <div className="mt-4"><CampusButton courseId={c.id} label="Entrar al curso" /></div>
        </li>
      ))}
    </ul>
  );
}

/** Grupos del profesor (o cursos que supervisa el coordinador) con el avance real de cada estudiante en Moodle. */
export async function TeachingGroups() {
  const courses = await privateGet<TeachingCourse[]>("/me/teaching");
  if (!courses) return CAMPUS_DOWN;
  if (!courses.length) return <EmptyState>Aún no tienes cursos asignados.</EmptyState>;
  return (
    <div className="space-y-6">
      {courses.map((c) => (
        <section key={c.courseId} className="card" aria-labelledby={`curso-${c.courseId}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id={`curso-${c.courseId}`} className="text-lg font-bold">{c.courseName}</h3>
              <p className="text-sm muted">{c.role} · {c.students.length} estudiante(s) activo(s)</p>
            </div>
            <CampusButton courseId={c.courseId} label="Abrir en el campus" primary={false} />
          </div>
          {c.students.length > 0 && (
            <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label={`Estudiantes de ${c.courseName}`}>
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-slate-100"><tr><th scope="col" className="px-3 py-2">Estudiante</th><th scope="col" className="px-3 py-2">Avance</th><th scope="col" className="px-3 py-2">Último acceso</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {c.students.map((s) => (
                    <tr key={s.email}>
                      <td className="px-3 py-2"><span className="font-semibold">{s.fullname}</span><br /><span className="text-xs muted">{s.email}</span></td>
                      <td className="px-3 py-2">{s.progress >= 0 ? `${s.progress}%` : "Sin seguimiento"}</td>
                      <td className="px-3 py-2">{day(s.lastaccess)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** Próximas entregas de los cursos de la persona. */
export async function UpcomingList() {
  const items = await privateGet<Upcoming[]>("/me/upcoming");
  if (!items?.length) return <p className="text-sm muted">Sin actividades próximas.</p>;
  return (
    <ul className="space-y-3">
      {items.slice(0, 5).map((a) => (
        <li key={a.cmid} className="text-sm"><p className="font-semibold">{a.name}</p><p className="muted">{a.courseName} · {dateTime(a.duedate)}</p></li>
      ))}
    </ul>
  );
}
