import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { ContentBody } from "@/features/content/public-content";
import { publicGet } from "@/lib/api/server";
import type { ContentItem } from "@/types/api";

export const metadata: Metadata = pageMetadata({ title: "Contacto", description: "Datos de contacto del Instituto de Innovación y Ciencias Aplicadas (IINICIA).", path: "/contacto" });

async function Channels() {
  const items = await publicGet<ContentItem[]>("/content/contacto");
  if (!items?.length) return <p className="muted">Los canales oficiales se publicarán próximamente.</p>;
  return <>{items.map((c) => <section key={c.id} className="card mt-4"><h2 className="font-bold">{c.title}</h2><ContentBody body={c.body} /></section>)}</>;
}

export default function ContactoPage() {
  return (
    <div className="page">
      <h1 className="h1 mb-6">Contacto</h1>
      <Suspense fallback={<Loading />}><Channels /></Suspense>
    </div>
  );
}
