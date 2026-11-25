"use client";

import { useRef, useState } from "react";
import { ApiError, IMAGE_TYPES, uploadImage } from "@/lib/api/client";
import { Markdown } from "./markdown";

const TOOLS: [label: string, before: string, after: string, placeholder: string][] = [
  ["Título", "\n## ", "\n", "Título"], ["Negrita", "**", "**", "texto"], ["Cursiva", "*", "*", "texto"],
  ["Lista", "\n- ", "\n", "elemento"], ["Enlace", "[", "](https://)", "texto del enlace"],
];

/**
 * Editor Markdown del CMS con vista previa. La vista previa usa el mismo renderizador que el portal, que
 * convierte el texto en elementos React y nunca inyecta HTML (sin riesgo de XSS).
 */
export function MarkdownEditor({ defaultValue, onError }: { defaultValue?: string; onError: (message: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue ?? "");
  const [preview, setPreview] = useState(false);

  function wrap(before: string, after = "", placeholder = "texto") {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || placeholder;
    setValue(value.slice(0, s) + before + selected + after + value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + selected.length); });
  }

  async function image(file?: File) {
    if (!file) return;
    try {
      const { url } = await uploadImage(file);
      wrap("\n![", `](${url})\n`, "Descripción de la imagen");
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "No se pudo subir la imagen");
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {TOOLS.map(([label, before, after, placeholder]) => <button key={label} type="button" className="btn-outline" onClick={() => wrap(before, after, placeholder)}>{label}</button>)}
        <label className="btn-outline cursor-pointer focus-within:outline-2">Imagen<input type="file" accept={IMAGE_TYPES.join(",")} className="sr-only" onChange={(e) => { void image(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <button type="button" className="btn-outline" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Editar" : "Vista previa"}</button>
      </div>
      {preview && <div className="min-h-40 rounded-lg border border-slate-300 bg-white p-4 leading-7 text-slate-700"><Markdown source={value} /></div>}
      <textarea ref={ref} id="c-body" name="body" value={value} onChange={(e) => setValue(e.target.value)} rows={10} hidden={preview} className="input font-mono" aria-label="Contenido" />
    </div>
  );
}
