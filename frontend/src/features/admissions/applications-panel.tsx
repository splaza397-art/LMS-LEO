"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/feedback/confirm-button";
import { EmptyState, ErrorMessage, Loading } from "@/components/feedback/status";
import { SelectField } from "@/components/forms/field";
import { SearchInput } from "@/components/forms/search-input";
import { Table, Td } from "@/components/tables/data-table";
import { ListToolbar, SortSelect } from "@/components/tables/list-controls";
import { Pagination } from "@/components/tables/pagination";
import { APPLICATION_STATUS_LABELS, label, options } from "@/config/labels";
import { useApiData } from "@/hooks/use-api-data";
import { usePagedList } from "@/hooks/use-paged-list";
import { ApiError, bff } from "@/lib/api/client";
import type { AdminApplication, AdminProgram } from "@/types/api";

function ApplicationRow({ application: a, cohorts, onDecide }: {
  application: AdminApplication;
  cohorts: { id: string; name: string }[];
  onDecide: (id: string, decision: "admitida" | "rechazada", cohortId?: string) => void;
}) {
  const [cohortId, setCohortId] = useState("");
  const pending = a.status === "enviada";
  return (
    <tr>
      <Td>{a.firstName} {a.lastName}</Td><Td>{a.email}</Td><Td>{a.programName}</Td>
      <Td>
        {pending ? (
          <select aria-label={`Cohorte para ${a.email}`} className="input" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
            <option value="">Sin cohorte</option>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (a.cohortName ?? "—")}
      </Td>
      <Td>
        {pending ? (
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => onDecide(a.id, "admitida", cohortId || undefined)}>Admitir</button>
            <ConfirmButton label="Rechazar" confirmLabel="Confirmar rechazo" onConfirm={() => onDecide(a.id, "rechazada")} />
          </div>
        ) : <span className="badge">{label(APPLICATION_STATUS_LABELS, a.status)}</span>}
      </Td>
    </tr>
  );
}

/** Solicitudes de admisión. Por omisión, las que están en revisión. El ámbito del coordinador lo aplica el backend. */
export function ApplicationsPanel({ restoreFilters }: { restoreFilters?: boolean }) {
  const list = usePagedList<AdminApplication>("admin/applications", { filters: { status: "enviada", programId: "" }, restoreFromUrl: restoreFilters });
  const { data: programs } = useApiData<AdminProgram[]>("admin/programs");

  async function decide(id: string, decision: "admitida" | "rechazada", cohortId?: string) {
    try {
      const result = await bff<{ moodleSynced: boolean }>(`admin/applications/${id}/decision`, "POST", { decision, ...(cohortId ? { cohortId } : {}) });
      await list.reload();
      list.setError(decision === "admitida" && !result.moodleSynced ? "Admitida. Moodle no respondió; la sincronización se reintentará sola." : "");
    } catch (e) {
      list.setError(e instanceof ApiError ? e.message : "No se pudo registrar la decisión");
    }
  }

  return (
    <>
      <ListToolbar>
        <SearchInput label="Buscar solicitante" value={list.search} onChange={list.setSearch} placeholder="Nombre o correo" />
        <SelectField label="Filtrar por estado" placeholder="Todas" options={options(APPLICATION_STATUS_LABELS)} value={list.filters.status} onChange={(e) => list.setFilter("status", e.target.value)} />
        <SelectField label="Filtrar por programa" placeholder="Todos" options={(programs ?? []).map((p) => [p.id, p.name])} value={list.filters.programId} onChange={(e) => list.setFilter("programId", e.target.value)} />
        <SortSelect sort={list.sort} order={list.order} onChange={list.setSort}
          options={[["createdAt", "asc", "Más antiguas primero"], ["programName", "asc", "Programa (A-Z)"], ["status", "asc", "Estado"]]} />
      </ListToolbar>
      <ErrorMessage message={list.error} />
      {list.loading && !list.items && <Loading />}
      {list.items?.length === 0 && <EmptyState>{list.filters.status === "enviada" && !list.search ? "No hay solicitudes pendientes." : "No hay solicitudes con esos criterios."}</EmptyState>}
      {!!list.items?.length && (
        <Table head={["Persona", "Correo", "Programa", "Cohorte", "Acciones"]} label="Solicitudes de admisión">
          {list.items.map((a) => <ApplicationRow key={a.id} application={a} cohorts={programs?.find((p) => p.id === a.programId)?.cohorts ?? []} onDecide={decide} />)}
        </Table>
      )}
      {list.items && <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} label="solicitudes" />}
    </>
  );
}
