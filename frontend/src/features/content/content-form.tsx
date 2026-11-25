"use client";

import { useState, type FormEvent } from "react";
import { CONTENT_STATUS_LABELS, CONTENT_TYPE_LABELS, options } from "@/config/labels";
import { ImageUploadField } from "@/features/media/image-upload-field";
import { ApiError, bff } from "@/lib/api/client";
import type { ContentItem } from "@/types/api";
import { MarkdownEditor } from "./markdown-editor";

/** Convierte el formulario en el cuerpo que espera la API: sin campos vacíos y con el orden numérico. */
export function contentBody(raw: Record<string, string>, cover: string): Record<string, unknown> {
  const body: Record<string, unknown> = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ""));
  if (cover) body.imageUrl = cover;
  if (raw.sortOrder) body.sortOrder = Number(raw.sortOrder);
  return body;
}

/** Alta o edición de contenido institucional (noticias, páginas, preguntas, docentes, autoridades, contacto). */
export function ContentForm({ item, onSaved, onCancel, onError }: { item: Partial<ContentItem>; onSaved: () => Promise<void>; onCancel: () => void; onError: (message: string) => void }) {
  const [cover, setCover] = useState(item.imageUrl ?? "");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = contentBody(Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>, cover);
    try {
      if (item.id) await bff(`admin/content/${item.id}`, "PUT", body);
      else await bff("admin/content", "POST", body);
      onError("");
      await onSaved();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "No se pudo guardar el contenido");
    }
  }
  return (
    <form onSubmit={save} className="card mb-4 grid gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor="c-type">Tipo</label>
        <select id="c-type" name="type" defaultValue={item.type} className="input">{options(CONTENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div><label className="label" htmlFor="c-status">Estado</label>
        <select id="c-status" name="status" defaultValue={item.status} className="input">{options(CONTENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div><label className="label" htmlFor="c-title">Título</label><input id="c-title" name="title" defaultValue={item.title} required className="input" /></div>
      <div><label className="label" htmlFor="c-slug">Ruta (slug)</label><input id="c-slug" name="slug" defaultValue={item.slug} required pattern="[a-z0-9\-]{2,120}" className="input" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="c-summary">Resumen</label><input id="c-summary" name="summary" defaultValue={item.summary} maxLength={600} className="input" /></div>
      <div className="sm:col-span-2">
        <span className="label">Contenido</span>
        <MarkdownEditor defaultValue={item.body} onError={onError} />
      </div>
      <ImageUploadField id="c-cover" label="Imagen principal" value={cover} onChange={setCover} onError={onError} />
      <div><label className="label" htmlFor="c-order">Orden</label><input id="c-order" name="sortOrder" type="number" defaultValue={item.sortOrder ?? 0} className="input" /></div>
      <div><label className="label" htmlFor="c-seo-t">Título SEO</label><input id="c-seo-t" name="seoTitle" defaultValue={item.seoTitle ?? ""} maxLength={160} className="input" /></div>
      <div><label className="label" htmlFor="c-seo-d">Descripción SEO</label><input id="c-seo-d" name="seoDescription" defaultValue={item.seoDescription ?? ""} maxLength={320} className="input" /></div>
      <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Guardar</button><button type="button" className="btn-outline" onClick={onCancel}>Cancelar</button></div>
    </form>
  );
}
