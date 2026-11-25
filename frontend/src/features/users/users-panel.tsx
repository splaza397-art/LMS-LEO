"use client";

import { Fragment, useState } from "react";
import { ConfirmButton } from "@/components/feedback/confirm-button";
import { ErrorMessage, Loading } from "@/components/feedback/status";
import { Table, Td } from "@/components/tables/data-table";
import { label, ROLE_LABELS, SYNC_LABELS, USER_STATUS_LABELS } from "@/config/labels";
import { UserEnrolments } from "@/features/enrollments/user-enrolments";
import { useApiData } from "@/hooks/use-api-data";
import { ApiError, bff } from "@/lib/api/client";
import type { AdminProgram, AdminUser, MoodleCourseRef } from "@/types/api";
import { RoleEditor } from "./role-editor";

/**
 * Usuarios. Cada acción aparece solo si el rol tiene el permiso correspondiente (matriz RBAC); el backend
 * vuelve a comprobarlo en cada solicitud.
 */
export function UsersPanel({ permissions, selfId }: { permissions: string[]; selfId: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data: rows, error, loading, reload, setError } = useApiData<AdminUser[]>(`admin/users?q=${encodeURIComponent(q)}`);
  const canRoles = permissions.includes("roles:manage");
  const canEnrol = permissions.includes("enrolments:manage");
  const canSuspend = permissions.includes("users:suspend");
  const canSync = permissions.includes("integrations:manage");
  const { data: programs } = useApiData<AdminProgram[]>(canRoles ? "admin/programs" : null);
  const { data: courses } = useApiData<MoodleCourseRef[]>(canEnrol ? "admin/moodle/courses" : null);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError("");
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo completar la acción");
    }
  };

  return (
    <>
      <label htmlFor="user-search" className="label">Buscar</label>
      <input id="user-search" className="input mb-4 max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o correo" />
      <ErrorMessage message={error} />
      {loading && !rows && <Loading />}
      {rows && (
        <Table head={["Persona", "Estado", "Moodle", "Rol", "Acciones"]} label="Usuarios">
          {rows.map((u) => (
            <Fragment key={u.id}>
              <tr>
                <Td><span className="font-semibold">{u.firstName} {u.lastName}</span><br /><span className="text-xs muted">{u.email}</span></Td>
                <Td>{label(USER_STATUS_LABELS, u.status)}</Td>
                <Td>{label(SYNC_LABELS, u.moodleSyncStatus)}</Td>
                <Td>{canRoles && u.id !== selfId
                  ? <RoleEditor key={u.roles.join()} user={u} programs={programs ?? []} onSave={(roles, programId) => act(() => bff(`admin/users/${u.id}/roles`, "PUT", { roles, ...(programId ? { programId } : {}) }))} />
                  : u.roles.map((r) => label(ROLE_LABELS, r)).join(", ")}</Td>
                <Td><div className="flex flex-wrap gap-2">
                  {canEnrol && <button type="button" className="btn-outline" aria-expanded={open === u.id} onClick={() => setOpen(open === u.id ? null : u.id)}>Matrículas</button>}
                  {canSuspend && u.id !== selfId && (u.status === "suspendido"
                    ? <button type="button" className="btn-outline" onClick={() => act(() => bff(`admin/users/${u.id}/suspension`, "PATCH", { suspended: false }))}>Reactivar</button>
                    : <ConfirmButton label="Suspender" confirmLabel="Confirmar" onConfirm={() => act(() => bff(`admin/users/${u.id}/suspension`, "PATCH", { suspended: true }))} />)}
                  {canSync && <button type="button" className="btn-outline" onClick={() => act(() => bff(`admin/users/${u.id}/sync`, "POST"))}>Sincronizar</button>}
                </div></Td>
              </tr>
              {open === u.id && (
                <tr><Td colSpan={5} className="bg-slate-50 py-3"><UserEnrolments userId={u.id} courses={courses ?? []} onError={setError} /></Td></tr>
              )}
            </Fragment>
          ))}
        </Table>
      )}
    </>
  );
}
