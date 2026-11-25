"use client";

import { ErrorMessage, Loading } from "@/components/feedback/status";
import { Table, Td } from "@/components/tables/data-table";
import { useApiData } from "@/hooks/use-api-data";
import type { AuditEntry } from "@/types/api";

/** Registro inalterable de acciones (superadministrador y administrador técnico). */
export function AuditPanel() {
  const { data: rows, error, loading } = useApiData<AuditEntry[]>("admin/audit");
  return (
    <>
      <ErrorMessage message={error} />
      {loading && !rows && <Loading />}
      {rows && (
        <Table head={["Fecha", "Actor", "Acción", "Objetivo"]} label="Auditoría">
          {rows.map((l) => <tr key={l.id}><Td>{new Date(l.createdAt).toLocaleString("es-MX")}</Td><Td>{l.actor ?? "sistema"}</Td><Td>{l.action}</Td><Td>{l.targetType ?? ""}</Td></tr>)}
        </Table>
      )}
    </>
  );
}
