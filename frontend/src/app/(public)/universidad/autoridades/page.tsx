import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { PeopleList } from "@/features/content/public-content";

export const metadata: Metadata = { title: "Autoridades", description: "Conoce a las autoridades de IINICIA.", alternates: { canonical: "/universidad/autoridades" } };

export default function AutoridadesPage() {
  return (
    <div className="page">
      <h1 className="h1 mb-8">Autoridades</h1>
      <Suspense fallback={<Loading />}><PeopleList type="autoridad" /></Suspense>
    </div>
  );
}
