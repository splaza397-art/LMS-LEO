"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/feedback/confirm-button";
import { EmptyState, ErrorMessage, Loading } from "@/components/feedback/status";
import { SelectField } from "@/components/forms/field";
import { SearchInput } from "@/components/forms/search-input";
import { Table, Td } from "@/components/tables/data-table";
import { ListToolbar, SortSelect } from "@/components/tables/list-controls";
import { Pagination } from "@/components/tables/pagination";
import { CONTENT_STATUS_LABELS, CONTENT_TYPE_LABELS, label, options } from "@/config/labels";
import { usePagedList } from "@/hooks/use-paged-list";
import { ApiError, bff } from "@/lib/api/client";
import type { ContentItem } from "@/types/api";
import { ContentForm } from "./content-form";

/** Contenido institucional, paginado en el backend. Lo publicado aparece de inmediato; lo eliminado responde 404. */
export function ContentPanel({ restoreFilters }: { restoreFilters?: boolean }) {
  const list = usePagedList<ContentItem>("admin/content", { filters: { type: "", status: "" }, restoreFromUrl: restoreFilters });
  const [editing, setEditing] = useState<Partial<ContentItem> | null>(null);

  async function remove(id: string) {
    try {
      await bff(`admin/content/${id}`, "DELETE");
      list.setError("");
      await list.reload();
    } catch (e) {
      list.setError(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  return (
    <>
      <button type="button" className="btn-primary mb-4" onClick={() => setEditing({ type: "noticia", status: "borrador" })}>Nuevo contenido</button>
      {editing && (
        <ContentForm key={editing.id ?? "new"} item={editing} onError={list.setError} onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await list.reload(); }} />
      )}
      <ListToolbar>
        <SearchInput label="Buscar contenido" value={list.search} onChange={list.setSearch} placeholder="Título o ruta" />
        <SelectField label="Filtrar por tipo" placeholder="Todos" options={options(CONTENT_TYPE_LABELS)} value={list.filters.type} onChange={(e) => list.setFilter("type", e.target.value)} />
        <SelectField label="Filtrar por estado" placeholder="Todos" options={options(CONTENT_STATUS_LABELS)} value={list.filters.status} onChange={(e) => list.setFilter("status", e.target.value)} />
        <SortSelect sort={list.sort} order={list.order} onChange={list.setSort}
          options={[["title", "asc", "Título (A-Z)"], ["sortOrder", "asc", "Orden"], ["publishedAt", "desc", "Publicados recientemente"]]} />
      </ListToolbar>
      <ErrorMessage message={list.error} />
      {list.loading && !list.items && <Loading />}
      {list.items?.length === 0 && <EmptyState>No hay contenidos con esos criterios.</EmptyState>}
      {!!list.items?.length && (
        <Table head={["Título", "Tipo", "Estado", "Acciones"]} label="Contenidos">
          {list.items.map((c) => (
            <tr key={c.id}><Td>{c.title}</Td><Td>{label(CONTENT_TYPE_LABELS, c.type)}</Td><Td>{c.status}</Td>
              <Td><div className="flex flex-wrap gap-2"><button type="button" className="btn-outline" aria-label={`Editar ${c.title}`} onClick={() => setEditing(c)}>Editar</button>
                <ConfirmButton label="Eliminar" confirmLabel="Confirmar eliminación" onConfirm={() => remove(c.id)} /></div></Td></tr>
          ))}
        </Table>
      )}
      {list.items && <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} label="contenidos" />}
    </>
  );
}
