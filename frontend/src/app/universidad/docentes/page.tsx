import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading, PeopleList } from "@/components/public-blocks";

export const metadata: Metadata = { title: "Docentes", description: "Conoce a la planta docente de IINICIA.", alternates: { canonical: "/universidad/docentes" } };

export default function DocentesPage() {
  return (
    <div className="page">
      <h1 className="h1 mb-8">Docentes</h1>
      <Suspense fallback={<Loading />}><PeopleList type="docente" /></Suspense>
    </div>
  );
}
