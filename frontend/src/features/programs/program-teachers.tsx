"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/feedback/confirm-button";
import type { Teacher, TeacherCandidate } from "@/types/api";

/**
 * Profesores de un programa: asignar a un curso vinculado o retirar (retirar conserva su historial en Moodle).
 * Se muestra el correo de cada candidato para distinguir personas con el mismo nombre.
 */
export function ProgramTeachers({ programName, teachers, candidates, linked, courseName, onAssign, onRemove }: {
  programName: string;
  teachers: Teacher[] | null;
  candidates: TeacherCandidate[];
  linked: (number | string)[];
  courseName: (id: number | string) => string;
  onAssign: (userId: string, courseId: number) => Promise<void>;
  onRemove: (userId: string, courseId: number) => void;
}) {
  const [teacher, setTeacher] = useState("");
  const [course, setCourse] = useState("");
  const active = teachers?.filter((t) => t.status !== "suspended") ?? [];
  return (
    <>
      <h3 className="mt-5 font-semibold">Profesores</h3>
      <ul className="mt-2 space-y-2">
        {active.map((t) => (
          <li key={`${t.userId}-${t.courseId}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{t.firstName} {t.lastName} · {courseName(t.courseId)}</span>
            <ConfirmButton label="Retirar" confirmLabel="Confirmar" onConfirm={() => onRemove(t.userId, Number(t.courseId))} />
          </li>
        ))}
        {teachers && !active.length && <li className="text-sm muted">Sin profesores asignados.</li>}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select aria-label={`Profesor para ${programName}`} className="input" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
          <option value="">Selecciona profesor</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.email})</option>)}
        </select>
        <select aria-label={`Curso del profesor en ${programName}`} className="input" value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">Selecciona curso</option>
          {linked.map((id) => <option key={id} value={id}>{courseName(id)}</option>)}
        </select>
        <button type="button" className="btn-outline" disabled={!teacher || !course}
          onClick={async () => { await onAssign(teacher, Number(course)); setTeacher(""); setCourse(""); }}>Asignar profesor</button>
      </div>
    </>
  );
}
