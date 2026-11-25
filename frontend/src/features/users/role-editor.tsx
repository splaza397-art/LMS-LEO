"use client";

import { useState } from "react";
import { options, ROLE_LABELS } from "@/config/labels";
import type { AdminProgram, AdminUser } from "@/types/api";

/** Cambio de rol (solo superadministrador; el backend lo vuelve a validar). El coordinador necesita programa. */
export function RoleEditor({ user, programs, onSave }: { user: AdminUser; programs: AdminProgram[]; onSave: (roles: string[], programId?: string) => void }) {
  const [role, setRole] = useState<string>(user.roles[0] ?? "aspirante");
  const [programId, setProgramId] = useState("");
  const dirty = role !== user.roles[0] || (role === "coordinador" && !!programId);
  return (
    <div className="flex min-w-48 flex-col gap-2">
      <select aria-label={`Rol de ${user.email}`} className="input" value={role} onChange={(e) => setRole(e.target.value)}>
        {options(ROLE_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
      {role === "coordinador" && (
        <select aria-label={`Programa que coordina ${user.email}`} className="input" value={programId} onChange={(e) => setProgramId(e.target.value)}>
          <option value="">Selecciona programa</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {dirty && <button type="button" className="btn-outline" disabled={role === "coordinador" && !programId} onClick={() => onSave([role], programId || undefined)}>Guardar rol</button>}
    </div>
  );
}
