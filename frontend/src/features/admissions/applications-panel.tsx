"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/feedback/confirm-button";
import { EmptyState, ErrorMessage, Loading } from "@/components/feedback/status";
import { Table, Td } from "@/components/tables/data-table";
import { useApiData } from "@/hooks/use-api-data";
import { ApiError, bff } from "@/lib/api/client";
import type { AdminApplication, AdminProgram } from "@/types/api";

function ApplicationRow({ application: a, cohorts, onDecide }: {
  application: AdminApplication;
  cohorts: { id: string; name: string }[];
  onDecide: (id: string, decision: "admitida" | "rechazada", cohortId?: string) => void;
}) {
  const [cohortId, setCohortId] = useState("");
  return (
    <tr>
      <Td>{a.firstName} {a.lastName}</Td><Td>{a.email}</Td><Td>{a.programName}</Td>
      <Td>
        <select aria-label={`Cohorte para ${a.email}`} className="input" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
          <option value="">Sin cohorte</option>
          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Td>
      <Td><div className="flex gap-2">
        <button type="button" className="btn-primary" onClick={() => onDecide(a.id, "admitida", cohortId || undefined)}>Admitir</button>
        <ConfirmButton label="Rechazar" confirmLabel="Confirmar rechazo" onConfirm={() => onDecide(a.id, "rechazada")} />
      </div></Td>
    </tr>
  );
}

/** Solicitudes de admisión en revisión. El ámbito del coordinador lo aplica el backend. */
export function ApplicationsPanel() {
  const { data: rows, error, loading, reload, setError } = useApiData<AdminApplication[]>("admin/applications?status=enviada");
  const { data: programs } = useApiData<AdminProgram[]>("admin/programs");

  async function decide(id: string, decision: "admitida" | "rechazada", cohortId?: string) {
    try {
      const result = await bff<{ moodleSynced: boolean }>(`admin/applications/${id}/decision`, "POST", { decision, ...(cohortId ? { cohortId } : {}) });
      await reload();
      if (decision === "admitida" && !result.moodleSynced) setError("Admitida. Moodle no respondió; la sincronización se reintentará sola.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar la decisión");
    }
  }

  return (
    <>
      <ErrorMessage message={error} />
      {loading && !rows && <Loading />}
      {rows?.length === 0 && <EmptyState>No hay solicitudes pendientes.</EmptyState>}
      {!!rows?.length && (
        <Table head={["Persona", "Correo", "Programa", "Cohorte", "Acciones"]} label="Solicitudes de admisión">
          {rows.map((a) => <ApplicationRow key={a.id} application={a} cohorts={programs?.find((p) => p.id === a.programId)?.cohorts ?? []} onDecide={decide} />)}
        </Table>
      )}
    </>
  );
}
