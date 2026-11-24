import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CampusButton, ProfileForm } from "@/components/portal-forms";
import { Loading } from "@/components/feedback/status";
import { ProgramGrid } from "@/features/programs/program-grid";
import { getMe, privateGet } from "@/lib/api/server";
import { ROLE_LABELS } from "@/config/labels";
import type { Application, Course, Me, Notice, Upcoming } from "@/types/api";

export const metadata: Metadata = { title: "Mi IINICIA", robots: { index: false } };

const STATUS: Record<string, string> = { enviada: "En revisión", admitida: "Admitida", rechazada: "No aprobada" };
const date = (unix: number) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(unix * 1000);

async function Courses({ teaching }: { teaching: boolean }) {
  const courses = await privateGet<Course[]>("/me/courses");
  if (!courses) return <p role="alert" className="text-amber-700">El campus no está disponible por el momento.</p>;
  if (!courses.length) return <p className="muted">Aún no tienes cursos asignados.</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {courses.map((c) => (
        <li key={c.id} className="card">
          <span className="badge">{c.shortname}</span>
          <h3 className="mt-2 text-lg font-bold"><Link href={`/mi-iinicia/cursos/${c.id}`} className="hover:underline">{c.fullname}</Link></h3>
          <p className="mt-1 text-sm muted">{c.activityCount} actividades</p>
          {!teaching && c.progress >= 0 && (
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

interface TeachingCourse { courseId: number; courseName: string; role: string; students: { fullname: string; email: string; progress: number; lastaccess: number }[] }

async function Teaching() {
  const courses = await privateGet<TeachingCourse[]>("/me/teaching");
  if (!courses) return <p role="alert" className="text-amber-700">El campus no está disponible por el momento.</p>;
  if (!courses.length) return <p className="muted">Aún no tienes cursos asignados.</p>;
  const day = (unix: number) => unix ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(unix * 1000) : "Sin acceso";
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

async function UpcomingList() {
  const items = await privateGet<Upcoming[]>("/me/upcoming");
  if (!items?.length) return <p className="text-sm muted">Sin actividades próximas.</p>;
  return (
    <ul className="space-y-3">
      {items.slice(0, 5).map((a) => (
        <li key={a.cmid} className="text-sm"><p className="font-semibold">{a.name}</p><p className="muted">{a.courseName} · {date(a.duedate)}</p></li>
      ))}
    </ul>
  );
}

async function Notices() {
  const items = await privateGet<Notice[]>("/me/notifications");
  if (!items?.length) return <p className="text-sm muted">Sin avisos.</p>;
  return <ul className="space-y-3">{items.slice(0, 5).map((n) => <li key={n.id} className="text-sm"><p className="font-semibold">{n.title}</p><p className="muted">{n.body}</p></li>)}</ul>;
}

async function Applications() {
  const items = await privateGet<Application[]>("/me/applications");
  if (!items?.length) return <p className="muted">Aún no has enviado solicitudes. Elige un programa para comenzar.</p>;
  return (
    <ul className="space-y-3">
      {items.map((a) => <li key={a.id} className="card flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{a.programName}</span><span className="badge">{STATUS[a.status] ?? a.status}</span></li>)}
    </ul>
  );
}

function RoleView({ me }: { me: Me }) {
  const canCampus = me.permissions.includes("campus:access");
  const teaching = me.roles.includes("profesor");
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      <div className="space-y-8 lg:col-span-2">
        {(teaching || me.roles.includes("coordinador")) && (
          <section aria-labelledby="docencia">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="docencia" className="h2">{teaching ? "Mis grupos" : "Cursos que supervisas"}</h2>
              {teaching && <CampusButton label="Entrar al Campus" primary={false} />}
            </div>
            <Suspense fallback={<Loading label="Cargando grupos..." />}><Teaching /></Suspense>
          </section>
        )}
        {canCampus && !teaching && (
          <section aria-labelledby="cursos">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="cursos" className="h2">{teaching ? "Cursos que impartes" : "Mis cursos"}</h2>
              <CampusButton label="Entrar al Campus" primary={false} />
            </div>
            <Suspense fallback={<Loading label="Cargando cursos..." />}><Courses teaching={teaching} /></Suspense>
          </section>
        )}
        {me.roles.includes("aspirante") && (
          <>
            <section aria-labelledby="solicitudes">
              <h2 id="solicitudes" className="h2 mb-4">Mis solicitudes</h2>
              <Suspense fallback={<Loading />}><Applications /></Suspense>
            </section>
            <section aria-labelledby="programas">
              <h2 id="programas" className="h2 mb-4">Programas disponibles</h2>
              <Suspense fallback={<Loading />}><ProgramGrid /></Suspense>
            </section>
          </>
        )}
        {me.permissions.some((p) => p.endsWith(":manage") || p === "users:read" || p === "audit:read") && (
          <section className="card" aria-labelledby="gestion">
            <h2 id="gestion" className="h2">Panel de gestión</h2>
            <p className="mt-2 text-sm muted">Herramientas disponibles según tu rol.</p>
            <Link href="/admin" className="btn-primary mt-4">Abrir panel</Link>
          </section>
        )}
      </div>
      <aside className="space-y-6">
        {canCampus && <section className="card"><h2 className="mb-3 font-bold">Próximas actividades</h2><Suspense fallback={<Loading />}><UpcomingList /></Suspense></section>}
        <section className="card"><h2 className="mb-3 font-bold">Avisos</h2><Suspense fallback={<Loading />}><Notices /></Suspense></section>
        <section className="card"><h2 className="mb-3 font-bold">Mi perfil</h2><p className="mb-3 text-sm muted">{me.email}</p><ProfileForm firstName={me.firstName} lastName={me.lastName} phone={me.phone} /></section>
      </aside>
    </div>
  );
}

async function Dashboard() {
  const me = await getMe();
  if (!me) redirect("/auth/login?returnTo=/mi-iinicia");
  return (
    <>
      <h1 className="h1">Hola, {me.firstName}</h1>
      <p className="mt-2 flex flex-wrap gap-2">{me.roles.map((r) => <span key={r} className="badge">{ROLE_LABELS[r] ?? r}</span>)}</p>
      <RoleView me={me} />
    </>
  );
}

export default function MiIniciaPage() {
  return <div className="page"><Suspense fallback={<Loading label="Cargando tu espacio..." />}><Dashboard /></Suspense></div>;
}
