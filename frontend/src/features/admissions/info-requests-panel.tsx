"use client";

import { EmptyState, ErrorMessage, Loading } from "@/components/feedback/status";
import { Table, Td } from "@/components/tables/data-table";
import { useApiData } from "@/hooks/use-api-data";
import { ApiError, bff } from "@/lib/api/client";
import type { InfoRequest } from "@/types/api";

/** Mensajes del formulario de Admisiones. */
export function InfoRequestsPanel() {
  const { data: rows, error, loading, reload, setError } = useApiData<InfoRequest[]>("admin/info-requests");
  async function mark(id: string, status: "nueva" | "atendida") {
    try {
      await bff(`admin/info-requests/${id}`, "PATCH", { status });
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar la solicitud");
    }
  }
  return (
    <>
      <ErrorMessage message={error} />
      {loading && !rows && <Loading />}
      {rows?.length === 0 && <EmptyState>No hay solicitudes de información.</EmptyState>}
      {!!rows?.length && (
        <Table head={["Fecha", "Persona", "Programa", "Mensaje", "Estado"]} label="Solicitudes de información">
          {rows.map((r) => (
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
    </>
  );
}
