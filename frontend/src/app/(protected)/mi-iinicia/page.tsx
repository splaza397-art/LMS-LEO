import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { label, ROLE_LABELS } from "@/config/labels";
import { RoleDashboard } from "@/features/dashboard/role-dashboard";
import { getMe } from "@/lib/api/server";

export const metadata: Metadata = { title: "Mi IINICIA", robots: { index: false } };

async function Dashboard() {
  const me = await getMe();
  if (!me) redirect("/auth/login?returnTo=/mi-iinicia");
  return (
    <>
      <h1 className="h1">Hola, {me.firstName}</h1>
      <p className="mt-2 flex flex-wrap gap-2">{me.roles.map((r) => <span key={r} className="badge">{label(ROLE_LABELS, r)}</span>)}</p>
      <RoleDashboard me={me} />
    </>
  );
}

export default function MiIniciaPage() {
  return <div className="page"><Suspense fallback={<Loading label="Cargando tu espacio..." />}><Dashboard /></Suspense></div>;
}
