import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { PeopleList } from "@/features/content/public-content";

export const metadata: Metadata = pageMetadata({ title: "Autoridades", description: "Conoce a las autoridades de IINICIA.", path: "/universidad/autoridades" });

export default function AutoridadesPage() {
  return (
    <div className="page">
      <h1 className="h1 mb-8">Autoridades</h1>
      <Suspense fallback={<Loading />}><PeopleList type="autoridad" /></Suspense>
    </div>
  );
}
