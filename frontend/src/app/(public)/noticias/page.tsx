import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { NewsList } from "@/features/content/public-content";

export const metadata: Metadata = { title: "Noticias" };

export default function NoticiasPage() {
  return (
    <div className="page">
      <h1 className="h1 mb-8">Noticias</h1>
      <Suspense fallback={<Loading />}><NewsList /></Suspense>
    </div>
  );
}
