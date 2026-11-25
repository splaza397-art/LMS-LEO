import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { ProgramGrid } from "@/features/programs/program-grid";

export const metadata: Metadata = pageMetadata({ title: "Oferta académica", description: "Cursos, diplomados, certificaciones y carreras en línea de IINICIA.", path: "/oferta" });

export default function OfertaPage() {
  return (
    <div className="page">
      <h1 className="h1">Oferta académica</h1>
      <p className="mt-3 mb-8 max-w-2xl muted">Licenciaturas, diplomados, certificaciones y cursos.</p>
      <Suspense fallback={<Loading />}><ProgramGrid /></Suspense>
    </div>
  );
}
