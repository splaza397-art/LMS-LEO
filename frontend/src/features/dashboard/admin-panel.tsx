"use client";

import { useSearchParams } from "next/navigation";
import { useState, type ComponentType } from "react";
import { Tabs } from "@/components/navigation/tabs";
import { sectionsFor, type AdminSectionId } from "@/config/admin-sections";
import { ApplicationsPanel } from "@/features/admissions/applications-panel";
import { InfoRequestsPanel } from "@/features/admissions/info-requests-panel";
import { AuditPanel } from "@/features/audit/audit-panel";
import { ContentPanel } from "@/features/content/content-panel";
import { BroadcastForm } from "@/features/notifications/broadcast-form";
import { ProgramsPanel } from "@/features/programs/programs-panel";
import { ReportsPanel } from "@/features/reports/reports-panel";
import { UsersPanel } from "@/features/users/users-panel";

export interface AdminPanelProps {
  permissions: string[];
  selfId: string;
  /** Solo la sección abierta al cargar la página recupera sus filtros de la URL; al cambiar de pestaña se empieza limpio. */
  restoreFilters?: boolean;
}

const PANELS: Record<AdminSectionId, ComponentType<AdminPanelProps>> = {
  solicitudes: ApplicationsPanel,
  usuarios: UsersPanel,
  programas: ProgramsPanel,
  contenidos: ContentPanel,
  informacion: InfoRequestsPanel,
  avisos: BroadcastForm,
  reportes: ReportsPanel,
  auditoria: AuditPanel,
};

/** Panel de gestión: solo las secciones que permite el rol (config/admin-sections.ts). */
export function AdminPanel({ permissions, selfId }: Omit<AdminPanelProps, "restoreFilters">) {
  const sections = sectionsFor(permissions);
  const requested = useSearchParams().get("seccion");
  const [tab, setTab] = useState<string>(sections.find((s) => s.id === requested)?.id ?? sections[0]?.id ?? "");
  /** Al cambiar de sección se limpian los filtros de la anterior y se guarda la sección en la URL. */
  const [switched, setSwitched] = useState(false);
  function changeTab(id: string) {
    setTab(id);
    setSwitched(true);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?seccion=${encodeURIComponent(id)}`);
  }
  const active = sections.find((s) => s.id === tab);
  const Panel = active ? PANELS[active.id] : null;
  return (
    <>
      <Tabs items={sections.map(({ id, label }) => ({ id, label }))} active={tab} onChange={changeTab} label="Secciones" panelId="admin-tabpanel" />
      <div role="tabpanel" id="admin-tabpanel" aria-labelledby={`tab-${tab}`}>
        {Panel && <Panel key={tab} permissions={permissions} selfId={selfId} restoreFilters={!switched} />}
      </div>
    </>
  );
}
