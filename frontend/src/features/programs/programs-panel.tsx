"use client";

import { useState } from "react";
import { ErrorMessage, Loading } from "@/components/feedback/status";
import { useApiData } from "@/hooks/use-api-data";
import type { AdminProgram, MoodleCourseRef, TeacherCandidate } from "@/types/api";
import { ProgramCard } from "./program-card";
import { ProgramForm } from "./program-form";

/**
 * Programas académicos. El coordinador solo recibe su programa (ámbito aplicado por el backend) y no puede crear
 * programas: el botón depende de `users:manage`, que solo tienen el superadministrador y el administrador académico.
 */
export function ProgramsPanel({ permissions }: { permissions: string[] }) {
  const { data: rows, error, loading, reload, setError } = useApiData<AdminProgram[]>("admin/programs");
  const { data: courses } = useApiData<MoodleCourseRef[]>("admin/moodle/courses");
  const { data: candidates } = useApiData<TeacherCandidate[]>("admin/teachers");
  const [creating, setCreating] = useState(false);
  const canCreate = permissions.includes("users:manage");
  return (
    <>
      <ErrorMessage message={error} />
      {loading && !rows && <Loading />}
      {canCreate && !creating && <button type="button" className="btn-primary mb-4" onClick={() => setCreating(true)}>Nuevo programa</button>}
      {creating && <ProgramForm onDone={() => { setCreating(false); void reload(); }} onCancel={() => setCreating(false)} onError={setError} />}
      <ul className="space-y-3">
        {rows?.map((p) => <ProgramCard key={p.id} program={p} courses={courses ?? []} candidates={candidates ?? []} canEdit reload={reload} onError={setError} />)}
      </ul>
    </>
  );
}
