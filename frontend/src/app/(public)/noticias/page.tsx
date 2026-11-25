import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { NewsList } from "@/features/content/public-content";

export const metadata: Metadata = pageMetadata({ title: "Noticias", description: "Noticias y avisos del Instituto de Innovación y Ciencias Aplicadas (IINICIA).", path: "/noticias" });

export default function NoticiasPage() {
  return (
    <div className="page">
      <h1 className="h1 mb-8">Noticias</h1>
      <Suspense fallback={<Loading />}><NewsList /></Suspense>
    </div>
  );
}
