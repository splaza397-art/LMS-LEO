import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { PeopleList } from "@/features/content/public-content";

export const metadata: Metadata = pageMetadata({ title: "Docentes", description: "Conoce a la planta docente de IINICIA.", path: "/universidad/docentes" });

export default function DocentesPage() {
  return (
    <div className="page">
      <h1 className="h1 mb-8">Docentes</h1>
      <Suspense fallback={<Loading />}><PeopleList type="docente" /></Suspense>
    </div>
  );
}
