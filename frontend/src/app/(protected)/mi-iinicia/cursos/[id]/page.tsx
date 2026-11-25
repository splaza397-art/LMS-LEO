import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CampusButton } from "@/features/courses/campus-button";
import { Loading } from "@/components/feedback/status";
import { privateGet } from "@/lib/api/server";
import type { Course } from "@/types/api";

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const course = await privateGet<Course>(`/me/courses/${id}`);
  if (!course) notFound();
  return (
    <>
      <Link href="/mi-iinicia" className="text-sm font-semibold text-blue-700 hover:underline">Volver a Mi IINICIA</Link>
      <h1 className="h1 mt-3">{course.fullname}</h1>
      <p className="mt-2 max-w-2xl muted">{course.summary}</p>
      <div className="mt-4"><CampusButton courseId={course.id} label="Abrir en el campus" /></div>
      {course.sections?.map((s) => (
        <section key={s.id} className="mt-8">
          <h2 className="h2 mb-3">{s.name}</h2>
          <ul className="space-y-3">
            {s.activities.map((a) => (
              <li key={a.cmid} className="card flex flex-wrap items-center justify-between gap-3">
                <span><span className="font-semibold">{a.name}</span>{a.completed && <span className="badge ml-2">Completada</span>}</span>
                <CampusButton cmid={a.cmid} label="Abrir" primary={false} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export default function CoursePage({ params }: PageProps<"/mi-iinicia/cursos/[id]">) {
  return <div className="page"><Suspense fallback={<Loading />}><Detail params={params} /></Suspense></div>;
}
