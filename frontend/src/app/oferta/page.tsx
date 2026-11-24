import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading, ProgramGrid } from "@/components/public-blocks";

export const metadata: Metadata = { title: "Oferta académica" };

export default function OfertaPage() {
  return (
    <div className="page">
      <h1 className="h1">Oferta académica</h1>
      <p className="mt-3 mb-8 max-w-2xl muted">Licenciaturas, diplomados, certificaciones y cursos.</p>
      <Suspense fallback={<Loading />}><ProgramGrid /></Suspense>
    </div>
  );
}
