"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useState, type ComponentType } from "react";
import { Tabs } from "@/components/navigation/tabs";
import { sectionsFor, type AdminSectionId } from "@/config/admin-sections";
import { Loading } from "@/components/feedback/status";

export interface AdminPanelProps {
  permissions: string[];
  selfId: string;
  /** Solo la sección abierta al cargar la página recupera sus filtros de la URL; al cambiar de pestaña se empieza limpio. */
  restoreFilters?: boolean;
}

// Cada sección se descarga solo al abrir su pestaña: un rol con 2 secciones no carga el código de las 8.
// ssr: false: si el servidor dibujara la sección, sus campos aparecerían antes de que React los active, y lo que se
// escribiera en ese momento se vería en pantalla sin aplicarse (la búsqueda quedaba sin filtrar). Las secciones
// son privadas y piden sus datos en el navegador, así que no se pierde nada: se muestra "Cargando" hasta que funcionan.
const lazy = <P,>(load: () => Promise<ComponentType<P>>) => dynamic(load, { ssr: false, loading: () => <Loading /> });
const PANELS: Record<AdminSectionId, ComponentType<AdminPanelProps>> = {
  solicitudes: lazy(() => import("@/features/admissions/applications-panel").then((m) => m.ApplicationsPanel)),
  usuarios: lazy(() => import("@/features/users/users-panel").then((m) => m.UsersPanel)),
  programas: lazy(() => import("@/features/programs/programs-panel").then((m) => m.ProgramsPanel)),
  contenidos: lazy(() => import("@/features/content/content-panel").then((m) => m.ContentPanel)),
  informacion: lazy(() => import("@/features/admissions/info-requests-panel").then((m) => m.InfoRequestsPanel)),
  avisos: lazy(() => import("@/features/notifications/broadcast-form").then((m) => m.BroadcastForm)),
  reportes: lazy(() => import("@/features/reports/reports-panel").then((m) => m.ReportsPanel)),
  auditoria: lazy(() => import("@/features/audit/audit-panel").then((m) => m.AuditPanel)),
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
