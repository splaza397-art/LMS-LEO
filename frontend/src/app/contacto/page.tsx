import type { Metadata } from "next";
import { Suspense } from "react";
import { ContentBody, Loading } from "@/components/public-blocks";
import { publicGet, type ContentItem } from "@/lib/api";

export const metadata: Metadata = { title: "Contacto" };

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
