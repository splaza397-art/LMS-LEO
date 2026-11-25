import { EmptyState } from "@/components/feedback/status";
import { APPLICATION_STATUS_LABELS, label } from "@/config/labels";
import { privateGet } from "@/lib/api/server";
import type { Application } from "@/types/api";

/** Solicitudes de admisión de la persona (aspirante). */
export async function MyApplications() {
  const items = await privateGet<Application[]>("/me/applications");
  if (!items?.length) return <EmptyState>Aún no has enviado solicitudes. Elige un programa para comenzar.</EmptyState>;
  return (
    <ul className="space-y-3">
      {items.map((a) => <li key={a.id} className="card flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{a.programName}</span><span className="badge">{label(APPLICATION_STATUS_LABELS, a.status)}</span></li>)}
    </ul>
  );
}
