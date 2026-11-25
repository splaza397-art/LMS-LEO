"use client";

import { ErrorMessage, Loading } from "@/components/feedback/status";
import { Table, Td } from "@/components/tables/data-table";
import { useApiData } from "@/hooks/use-api-data";
import type { ProgramReport } from "@/types/api";
import { downloadCsv, toCsv } from "./csv";

const COLUMNS: [keyof ProgramReport & string, string][] = [
  ["name", "Programa"], ["courses", "Cursos"], ["pending", "En revisión"], ["admitted", "Admitidas"], ["rejected", "Rechazadas"],
  ["activeStudents", "Estudiantes activos"], ["suspendedStudents", "Matrículas suspendidas"], ["teachers", "Profesores"],
];

/** Reportes por programa (el coordinador recibe solo el suyo). */
export function ReportsPanel() {
  const { data: rows, error, loading } = useApiData<ProgramReport[]>("admin/reports");
  return (
    <>
      <ErrorMessage message={error} />
      {loading && !rows && <Loading />}
      {rows && (
        <>
          <button type="button" className="btn-outline mb-4"
            onClick={() => downloadCsv(`reporte-programas-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(COLUMNS, rows as unknown as Record<string, unknown>[]))}>
            Exportar CSV
          </button>
          <Table head={COLUMNS.map(([, l]) => l)} label="Reporte por programa">
            {rows.map((r) => <tr key={r.id}>{COLUMNS.map(([k]) => <Td key={k}>{r[k]}</Td>)}</tr>)}
          </Table>
        </>
      )}
    </>
  );
}
