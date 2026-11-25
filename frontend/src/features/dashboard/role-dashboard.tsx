import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { MyApplications } from "@/features/admissions/my-applications";
import { CampusButton } from "@/features/courses/campus-button";
import { MyCourses, TeachingGroups, UpcomingList } from "@/features/courses/course-lists";
import { NoticesList } from "@/features/notifications/notices-list";
import { ProgramGrid } from "@/features/programs/program-grid";
import { ProfileForm } from "@/features/users/profile-form";
import type { Me } from "@/types/api";
import { dashboardSectionsFor } from "./dashboard-sections";

/** Mi IINICIA: las secciones salen de dashboardSectionsFor (roles y permisos del backend). */
export function RoleDashboard({ me }: { me: Me }) {
  const show = dashboardSectionsFor(me);
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      <div className="space-y-8 lg:col-span-2">
        {show.teaching && (
          <section aria-labelledby="docencia">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="docencia" className="h2">{show.teaching === "groups" ? "Mis grupos" : "Cursos que supervisas"}</h2>
              {show.teaching === "groups" && <CampusButton label="Entrar al Campus" primary={false} />}
            </div>
            <Suspense fallback={<Loading label="Cargando grupos..." />}><TeachingGroups /></Suspense>
          </section>
        )}
        {show.courses && (
          <section aria-labelledby="cursos">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="cursos" className="h2">Mis cursos</h2>
              <CampusButton label="Entrar al Campus" primary={false} />
            </div>
            <Suspense fallback={<Loading label="Cargando cursos..." />}><MyCourses /></Suspense>
          </section>
        )}
        {show.applications && (
          <>
            <section aria-labelledby="solicitudes">
              <h2 id="solicitudes" className="h2 mb-4">Mis solicitudes</h2>
              <Suspense fallback={<Loading />}><MyApplications /></Suspense>
            </section>
            <section aria-labelledby="programas">
              <h2 id="programas" className="h2 mb-4">Programas disponibles</h2>
              <Suspense fallback={<Loading />}><ProgramGrid /></Suspense>
            </section>
          </>
        )}
        {show.management.length > 0 && (
          <section className="card" aria-labelledby="gestion">
            <h2 id="gestion" className="h2">Panel de gestión</h2>
            <p className="mt-2 text-sm muted">Herramientas disponibles según tu rol: {show.management.map((s) => s.label).join(", ")}.</p>
            <Link href="/admin" className="btn-primary mt-4">Abrir panel</Link>
          </section>
        )}
      </div>
      <aside className="space-y-6">
        {show.upcoming && <section className="card"><h2 className="mb-3 font-bold">Próximas actividades</h2><Suspense fallback={<Loading />}><UpcomingList /></Suspense></section>}
        <section className="card"><h2 className="mb-3 font-bold">Avisos</h2><Suspense fallback={<Loading />}><NoticesList /></Suspense></section>
        <section className="card"><h2 className="mb-3 font-bold">Mi perfil</h2><p className="mb-3 text-sm muted">{me.email}</p><ProfileForm firstName={me.firstName} lastName={me.lastName} phone={me.phone} /></section>
      </aside>
    </div>
  );
}
