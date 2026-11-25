import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { ADMIN_PERMISSIONS } from "@/config/admin-sections";
import { AdminPanel } from "@/features/dashboard/admin-panel";
import { getMe } from "@/lib/api/server";

export const metadata: Metadata = { title: "Panel de gestión", robots: { index: false } };

/** Acceso por URL directa: sin sesión lleva a iniciar sesión; sin permisos de gestión, a Mi IINICIA. */
async function Gate() {
  const me = await getMe();
  if (!me) redirect("/auth/login?returnTo=/admin");
  if (!me.permissions.some((p) => ADMIN_PERMISSIONS.includes(p))) redirect("/mi-iinicia");
  return <AdminPanel permissions={me.permissions} selfId={me.id} />;
}

export default function AdminPage() {
  return (
    <div className="page">
      <h1 className="h1 mb-6">Panel de gestión</h1>
      <Suspense fallback={<Loading />}><Gate /></Suspense>
    </div>
  );
}
