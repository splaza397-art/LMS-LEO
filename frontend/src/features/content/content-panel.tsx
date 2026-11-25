"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/feedback/confirm-button";
import { ErrorMessage, Loading } from "@/components/feedback/status";
import { Table, Td } from "@/components/tables/data-table";
import { CONTENT_TYPE_LABELS, label } from "@/config/labels";
import { useApiData } from "@/hooks/use-api-data";
import { ApiError, bff } from "@/lib/api/client";
import type { ContentItem } from "@/types/api";
import { ContentForm } from "./content-form";

/** Contenido institucional del portal. Lo publicado aparece de inmediato; lo eliminado responde 404. */
export function ContentPanel() {
  const { data: rows, error, loading, reload, setError } = useApiData<ContentItem[]>("admin/content");
  const [editing, setEditing] = useState<Partial<ContentItem> | null>(null);

  async function remove(id: string) {
    try {
      await bff(`admin/content/${id}`, "DELETE");
      setError("");
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  return (
    <>
      <ErrorMessage message={error} />
      {loading && !rows && <Loading />}
      <button type="button" className="btn-primary mb-4" onClick={() => setEditing({ type: "noticia", status: "borrador" })}>Nuevo contenido</button>
      {editing && (
        <ContentForm key={editing.id ?? "new"} item={editing} onError={setError} onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }} />
      )}
      {rows && (
        <Table head={["Título", "Tipo", "Estado", "Acciones"]} label="Contenidos">
          {rows.map((c) => (
            <tr key={c.id}><Td>{c.title}</Td><Td>{label(CONTENT_TYPE_LABELS, c.type)}</Td><Td>{c.status}</Td>
              <Td><div className="flex flex-wrap gap-2"><button type="button" className="btn-outline" aria-label={`Editar ${c.title}`} onClick={() => setEditing(c)}>Editar</button>
                <ConfirmButton label="Eliminar" confirmLabel="Confirmar eliminación" onConfirm={() => remove(c.id)} /></div></Td></tr>
          ))}
        </Table>
      )}
    </>
  );
}
