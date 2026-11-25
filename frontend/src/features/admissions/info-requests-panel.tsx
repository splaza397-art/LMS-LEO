"use client";

import { EmptyState, ErrorMessage, Loading } from "@/components/feedback/status";
import { SelectField } from "@/components/forms/field";
import { SearchInput } from "@/components/forms/search-input";
import { Table, Td } from "@/components/tables/data-table";
import { ListToolbar, SortSelect } from "@/components/tables/list-controls";
import { Pagination } from "@/components/tables/pagination";
import { INFO_STATUS_LABELS, options } from "@/config/labels";
import { usePagedList } from "@/hooks/use-paged-list";
import { ApiError, bff } from "@/lib/api/client";
import type { InfoRequest } from "@/types/api";

/** Mensajes del formulario de Admisiones, paginados en el backend. */
export function InfoRequestsPanel({ restoreFilters }: { restoreFilters?: boolean }) {
  const list = usePagedList<InfoRequest>("admin/info-requests", { filters: { status: "" }, restoreFromUrl: restoreFilters });
  async function mark(id: string, status: "nueva" | "atendida") {
    try {
      await bff(`admin/info-requests/${id}`, "PATCH", { status });
      await list.reload();
    } catch (e) {
      list.setError(e instanceof ApiError ? e.message : "No se pudo actualizar la solicitud");
    }
  }
  return (
    <>
      <ListToolbar>
        <SearchInput label="Buscar persona" value={list.search} onChange={list.setSearch} placeholder="Nombre o correo" />
        <SelectField label="Filtrar por estado" placeholder="Todas" options={options(INFO_STATUS_LABELS)} value={list.filters.status} onChange={(e) => list.setFilter("status", e.target.value)} />
        <SortSelect sort={list.sort} order={list.order} onChange={list.setSort}
          options={[["createdAt", "asc", "Más antiguas primero"], ["name", "asc", "Nombre (A-Z)"], ["status", "asc", "Estado"]]} />
      </ListToolbar>
      <ErrorMessage message={list.error} />
      {list.loading && !list.items && <Loading />}
      {list.items?.length === 0 && <EmptyState>No hay solicitudes de información.</EmptyState>}
      {!!list.items?.length && (
        <Table head={["Fecha", "Persona", "Programa", "Mensaje", "Estado"]} label="Solicitudes de información">
          {list.items.map((r) => (
            <tr key={r.id}>
              <Td>{new Date(r.createdAt).toLocaleDateString("es-MX")}</Td>
              <Td><span className="font-semibold">{r.name}</span><br /><span className="text-xs muted">{r.email}{r.phone ? ` · ${r.phone}` : ""}</span></Td>
              <Td>{r.programName ?? "Sin definir"}</Td>
              <Td><span className="line-clamp-3 max-w-xs">{r.message}</span></Td>
              <Td>{r.status === "nueva"
                ? <button type="button" className="btn-outline" onClick={() => mark(r.id, "atendida")}>Marcar atendida</button>
                : <button type="button" className="btn-outline" onClick={() => mark(r.id, "nueva")}>Reabrir</button>}</Td>
            </tr>
          ))}
        </Table>
      )}
      {list.items && <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} label="solicitudes" />}
    </>
  );
}
