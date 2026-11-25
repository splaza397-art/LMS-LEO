"use client";

import { Fragment, useState } from "react";
import { ConfirmButton } from "@/components/feedback/confirm-button";
import { EmptyState, ErrorMessage, Loading } from "@/components/feedback/status";
import { SelectField } from "@/components/forms/field";
import { SearchInput } from "@/components/forms/search-input";
import { Table, Td } from "@/components/tables/data-table";
import { ListToolbar, SortSelect } from "@/components/tables/list-controls";
import { Pagination } from "@/components/tables/pagination";
import { label, options, ROLE_LABELS, SYNC_LABELS, USER_STATUS_LABELS } from "@/config/labels";
import { UserEnrolments } from "@/features/enrollments/user-enrolments";
import { useApiData } from "@/hooks/use-api-data";
import { usePagedList } from "@/hooks/use-paged-list";
import { ApiError, bff } from "@/lib/api/client";
import type { AdminProgram, AdminUser, MoodleCourseRef } from "@/types/api";
import { RoleEditor } from "./role-editor";

/**
 * Usuarios, paginados y filtrados en el backend. Cada acción aparece solo si el rol tiene el permiso
 * (matriz RBAC); el backend vuelve a comprobarlo en cada solicitud. El coordinador solo recibe personas
 * relacionadas con su programa.
 */
export function UsersPanel({ permissions, selfId, restoreFilters }: { permissions: string[]; selfId: string; restoreFilters?: boolean }) {
  const list = usePagedList<AdminUser>("admin/users", { filters: { status: "", role: "" }, restoreFromUrl: restoreFilters });
  const [open, setOpen] = useState<string | null>(null);
  const canRoles = permissions.includes("roles:manage");
  const canEnrol = permissions.includes("enrolments:manage");
  const canSuspend = permissions.includes("users:suspend");
  const canSync = permissions.includes("integrations:manage");
  const { data: programs } = useApiData<AdminProgram[]>(canRoles ? "admin/programs" : null);
  const { data: courses } = useApiData<MoodleCourseRef[]>(canEnrol ? "admin/moodle/courses" : null);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      list.setError("");
      await list.reload();
    } catch (e) {
      list.setError(e instanceof ApiError ? e.message : "No se pudo completar la acción");
    }
  };

  return (
    <>
      <ListToolbar>
        <SearchInput label="Buscar" value={list.search} onChange={list.setSearch} placeholder="Nombre o correo" />
        <SelectField label="Filtrar por estado" placeholder="Todos" options={options(USER_STATUS_LABELS)} value={list.filters.status} onChange={(e) => list.setFilter("status", e.target.value)} />
        <SelectField label="Filtrar por rol" placeholder="Todos" options={options(ROLE_LABELS)} value={list.filters.role} onChange={(e) => list.setFilter("role", e.target.value)} />
        <SortSelect sort={list.sort} order={list.order} onChange={list.setSort}
          options={[["email", "asc", "Correo (A-Z)"], ["lastName", "asc", "Apellido (A-Z)"], ["createdAt", "asc", "Más antiguos primero"], ["status", "asc", "Estado"]]} />
      </ListToolbar>
      <ErrorMessage message={list.error} />
      {list.loading && !list.items && <Loading />}
      {list.items?.length === 0 && <EmptyState>No hay usuarios con esos criterios.</EmptyState>}
      {!!list.items?.length && (
        <Table head={["Persona", "Estado", "Moodle", "Rol", "Acciones"]} label="Usuarios">
          {list.items.map((u) => (
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
                <tr><Td colSpan={5} className="bg-slate-50 py-3"><UserEnrolments userId={u.id} courses={courses ?? []} onError={list.setError} /></Td></tr>
              )}
            </Fragment>
          ))}
        </Table>
      )}
      {list.items && <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} label="usuarios" />}
    </>
  );
}
