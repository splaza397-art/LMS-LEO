"use client";

import { useId } from "react";
import { ApiError, IMAGE_TYPES, uploadImage } from "@/lib/api/client";

/**
 * Campo para subir una imagen (portada de programa, imagen de contenido). El backend valida el contenido real
 * del archivo; aquí solo se evita enviar tipos o tamaños que de todos modos rechazaría.
 */
export function ImageUploadField({ label, value, onChange, onError, uploadedLabel = "Imagen cargada", id }: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
  uploadedLabel?: string;
  id?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div>
      <label className="label" htmlFor={fieldId}>{label}</label>
      <input id={fieldId} type="file" accept={IMAGE_TYPES.join(",")} className="input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            onChange((await uploadImage(file)).url);
          } catch (err) {
            onError(err instanceof ApiError ? err.message : "No se pudo subir la imagen");
          }
        }} />
      {value && <p className="mt-1 flex items-center gap-2 text-xs muted">{uploadedLabel} <button type="button" className="font-semibold text-red-700 underline" onClick={() => onChange("")}>Quitar</button></p>}
    </div>
  );
}
