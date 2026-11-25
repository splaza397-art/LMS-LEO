"use client";

import { ConfirmButton } from "@/components/feedback/confirm-button";
import { useApiData } from "@/hooks/use-api-data";
import { ApiError, bff } from "@/lib/api/client";
import type { Enrolment, MoodleCourseRef } from "@/types/api";

/** Matrículas de una persona: suspender o reactivar conserva calificaciones e historial en Moodle. */
export function UserEnrolments({ userId, courses, onError }: { userId: string; courses: MoodleCourseRef[]; onError: (message: string) => void }) {
  const { data: rows, reload } = useApiData<Enrolment[]>(`admin/users/${userId}/enrolments`);
  async function toggle(courseId: number | string, active: boolean) {
    try {
      await bff(`admin/users/${userId}/enrolment`, "PATCH", { courseId: Number(courseId), active });
      await reload();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "No se pudo actualizar la matrícula");
    }
  }
  if (!rows) return <p role="status" className="text-sm muted">Cargando matrículas...</p>;
  if (!rows.length) return <p className="text-sm muted">Sin matrículas.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((e) => (
        <li key={e.courseId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span><strong>{courses.find((c) => Number(c.id) === Number(e.courseId))?.fullname ?? `Curso ${e.courseId}`}</strong> · {e.role} · {e.status === "suspended" ? "suspendida" : "activa"}</span>
          {e.status === "suspended"
            ? <button type="button" className="btn-outline" onClick={() => toggle(e.courseId, true)}>Reactivar matrícula</button>
            : <ConfirmButton label="Suspender matrícula" confirmLabel="Confirmar" onConfirm={() => toggle(e.courseId, false)} />}
        </li>
      ))}
    </ul>
  );
}
