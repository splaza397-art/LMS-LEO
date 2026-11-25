"use client";

import { useState, type FormEvent } from "react";
import { ConfirmButton } from "@/components/feedback/confirm-button";
import { LEVEL_LABELS, label } from "@/config/labels";
import { useApiData } from "@/hooks/use-api-data";
import { ApiError, bff } from "@/lib/api/client";
import type { AdminProgram, MoodleCourseRef, Teacher, TeacherCandidate } from "@/types/api";
import { ProgramForm } from "./program-form";
import { ProgramTeachers } from "./program-teachers";

/** Un programa en el panel: cursos de Moodle vinculados, profesores y cohortes. */
export function ProgramCard({ program: p, courses, candidates, canEdit, reload, onError }: {
  program: AdminProgram;
  courses: MoodleCourseRef[];
  candidates: TeacherCandidate[];
  canEdit: boolean;
  reload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { data: teachers, reload: reloadTeachers } = useApiData<Teacher[]>(`admin/programs/${p.id}/teachers`);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onError("");
      await reload();
      await reloadTeachers();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "No se pudo completar la acción");
    }
  };
  const courseName = (id: number | string) => courses.find((c) => Number(c.id) === Number(id))?.fullname ?? `Curso ${id}`;
  const linked = p.courseIds;

  async function addCohort(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    await run(() => bff(`admin/programs/${p.id}/cohorts`, "POST", { name: f.name, ...(f.startsOn ? { startsOn: f.startsOn } : {}), ...(f.endsOn ? { endsOn: f.endsOn } : {}) }));
    form.reset();
  }

  if (editing) return <ProgramForm program={p} onDone={() => { setEditing(false); void reload(); }} onCancel={() => setEditing(false)} onError={onError} />;
  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-bold">{p.name}</h2><p className="mt-1 text-sm muted">{label(LEVEL_LABELS, p.level)} · {p.published ? "Publicado" : "Oculto"}</p></div>
        {canEdit && <button type="button" className="btn-outline" onClick={() => setEditing(true)}>Editar programa</button>}
      </div>

      <h3 className="mt-5 font-semibold">Cursos Moodle</h3>
      <ul className="mt-2 space-y-2">
        {linked.map((id) => (
          <li key={id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{courseName(id)}</span>
            <ConfirmButton label="Desvincular" confirmLabel="Confirmar" onConfirm={() => run(() => bff(`admin/programs/${p.id}/courses/${id}`, "DELETE"))} /></li>
        ))}
        {!linked.length && <li className="text-sm muted">Sin cursos vinculados.</li>}
      </ul>
      <label htmlFor={`course-${p.id}`} className="label mt-3">Vincular curso</label>
      <select id={`course-${p.id}`} className="input max-w-sm" value="" onChange={(e) => e.target.value && run(() => bff(`admin/programs/${p.id}/courses`, "POST", { moodleCourseId: Number(e.target.value) }))}>
        <option value="">Selecciona un curso</option>
        {courses.filter((c) => !linked.some((id) => Number(id) === Number(c.id))).map((c) => <option key={c.id} value={c.id}>{c.fullname}</option>)}
      </select>

      <ProgramTeachers programName={p.name} teachers={teachers} candidates={candidates} linked={linked} courseName={courseName}
        onAssign={(userId, courseId) => run(() => bff(`admin/programs/${p.id}/teachers`, "PUT", { userId, courseId, active: true }))}
        onRemove={(userId, courseId) => run(() => bff(`admin/programs/${p.id}/teachers`, "PUT", { userId, courseId, active: false }))} />

      <h3 className="mt-5 font-semibold">Cohortes</h3>
      <p className="mt-1 text-sm muted">{p.cohorts.map((c) => c.name).join(", ") || "Sin cohortes."}</p>
      <form onSubmit={addCohort} className="mt-2 grid gap-2 sm:grid-cols-4">
        <div><label className="label" htmlFor={`co-name-${p.id}`}>Nombre</label><input id={`co-name-${p.id}`} name="name" required minLength={2} className="input" /></div>
        <div><label className="label" htmlFor={`co-start-${p.id}`}>Inicio</label><input id={`co-start-${p.id}`} name="startsOn" type="date" className="input" /></div>
        <div><label className="label" htmlFor={`co-end-${p.id}`}>Fin</label><input id={`co-end-${p.id}`} name="endsOn" type="date" className="input" /></div>
        <button className="btn-outline self-end">Crear cohorte</button>
      </form>
    </li>
  );
}
