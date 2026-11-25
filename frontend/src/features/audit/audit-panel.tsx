"use client";

import { useState } from "react";
import { EmptyState, ErrorMessage, Loading } from "@/components/feedback/status";
import { TextField } from "@/components/forms/field";
import { SearchInput } from "@/components/forms/search-input";
import { Table, Td } from "@/components/tables/data-table";
import { ListToolbar } from "@/components/tables/list-controls";
import { Pagination } from "@/components/tables/pagination";
import { usePagedList } from "@/hooks/use-paged-list";
import type { AuditEntry } from "@/types/api";

/** Registro inalterable de acciones (superadministrador y administrador técnico), paginado en el backend. */
export function AuditPanel({ restoreFilters }: { restoreFilters?: boolean }) {
  const list = usePagedList<AuditEntry>("admin/audit", { filters: { action: "", from: "", to: "" }, restoreFromUrl: restoreFilters });
  // La acción se escribe a mano: solo se consulta con un formato válido (el backend respondería 400).
  const [actionText, setActionText] = useState(list.filters.action);
  const actionInvalid = actionText !== "" && !/^[a-z_]+(\.[a-z_]+)*$/.test(actionText);
  function changeAction(value: string) {
    setActionText(value);
    if (value === "" || /^[a-z_]+(\.[a-z_]+)*$/.test(value)) list.setFilter("action", value);
  }
  return (
    <>
      <ListToolbar>
        <SearchInput label="Buscar por correo del actor" value={list.search} onChange={list.setSearch} />
        <TextField label="Acción" placeholder="Ej. user.register" value={actionText} onChange={(e) => changeAction(e.target.value.trim())}
          error={actionInvalid ? "Usa minúsculas y puntos, por ejemplo user.suspend" : undefined} />
        <TextField label="Desde" type="date" value={list.filters.from} onChange={(e) => list.setFilter("from", e.target.value)} />
        <TextField label="Hasta (sin incluir)" type="date" value={list.filters.to} onChange={(e) => list.setFilter("to", e.target.value)} />
      </ListToolbar>
      <ErrorMessage message={list.error} />
      {list.loading && !list.items && <Loading />}
      {list.items?.length === 0 && <EmptyState>No hay registros con esos criterios.</EmptyState>}
      {!!list.items?.length && (
        <Table head={["Fecha", "Actor", "Acción", "Objetivo"]} label="Auditoría">
          {list.items.map((l) => <tr key={l.id}><Td>{new Date(l.createdAt).toLocaleString("es-MX")}</Td><Td>{l.actor ?? "sistema"}</Td><Td>{l.action}</Td><Td>{l.targetType ?? ""}</Td></tr>)}
        </Table>
      )}
      {list.items && <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} label="registros" />}
    </>
  );
}
