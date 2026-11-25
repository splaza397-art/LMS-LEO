"use client";

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

export interface AdminPanelProps { permissions: string[]; selfId: string }

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
export function AdminPanel({ permissions, selfId }: AdminPanelProps) {
  const sections = sectionsFor(permissions);
  const [tab, setTab] = useState<string>(sections[0]?.id ?? "");
  const active = sections.find((s) => s.id === tab);
  const Panel = active ? PANELS[active.id] : null;
  return (
    <>
      <Tabs items={sections.map(({ id, label }) => ({ id, label }))} active={tab} onChange={setTab} label="Secciones" panelId="admin-tabpanel" />
      <div role="tabpanel" id="admin-tabpanel" aria-labelledby={`tab-${tab}`}>
        {Panel && <Panel permissions={permissions} selfId={selfId} />}
      </div>
    </>
  );
}
