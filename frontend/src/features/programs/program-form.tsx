"use client";

import { useState, type FormEvent } from "react";
import { LEVEL_LABELS, options } from "@/config/labels";
import { ImageUploadField } from "@/features/media/image-upload-field";
import { ApiError, bff } from "@/lib/api/client";
import type { AdminProgram } from "@/types/api";

/** Alta o edición de un programa. El slug sigue la misma regla que valida el backend. */
export function ProgramForm({ program, onDone, onCancel, onError }: { program?: AdminProgram; onDone: () => void; onCancel: () => void; onError: (message: string) => void }) {
  const [cover, setCover] = useState<string>(program?.imageUrl ?? "");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const body = { ...f, published: f.published === "on", ...(cover ? { imageUrl: cover } : {}) };
    try {
      if (program) await bff(`admin/programs/${program.id}`, "PUT", body);
      else await bff("admin/programs", "POST", body);
      onDone();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "No se pudo guardar el programa");
    }
  }
  const id = program?.id ?? "new";
  return (
    <form onSubmit={save} className="card mb-4 grid gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor={`pg-name-${id}`}>Nombre</label><input id={`pg-name-${id}`} name="name" defaultValue={program?.name} required minLength={3} className="input" /></div>
      <div><label className="label" htmlFor={`pg-slug-${id}`}>Ruta (slug)</label><input id={`pg-slug-${id}`} name="slug" defaultValue={program?.slug} required pattern="[a-z0-9\-]{3,80}" className="input" /></div>
      <div><label className="label" htmlFor={`pg-level-${id}`}>Nivel</label>
        <select id={`pg-level-${id}`} name="level" defaultValue={program?.level ?? "licenciatura"} className="input">{options(LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div><label className="label" htmlFor={`pg-duration-${id}`}>Duración</label><input id={`pg-duration-${id}`} name="duration" defaultValue={program?.duration} maxLength={80} className="input" /></div>
      <div><label className="label" htmlFor={`pg-modality-${id}`}>Modalidad</label><input id={`pg-modality-${id}`} name="modality" defaultValue={program?.modality ?? "En línea"} maxLength={80} className="input" /></div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="published" defaultChecked={program?.published} className="size-5" /> Publicado en el portal</label>
      <div className="sm:col-span-2"><label className="label" htmlFor={`pg-summary-${id}`}>Resumen</label><input id={`pg-summary-${id}`} name="summary" defaultValue={program?.summary} required minLength={3} maxLength={400} className="input" /></div>
      <div className="sm:col-span-2">
        <ImageUploadField id={`pg-cover-${id}`} label="Portada" value={cover} onChange={setCover} onError={onError} uploadedLabel="Portada cargada" />
      </div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`pg-desc-${id}`}>Descripción</label><textarea id={`pg-desc-${id}`} name="description" defaultValue={program?.description} rows={5} className="input" /></div>
      <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Guardar programa</button><button type="button" className="btn-outline" onClick={onCancel}>Cancelar</button></div>
    </form>
  );
}
