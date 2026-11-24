import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, Unavailable } from "@/components/feedback/status";
import { publicGet } from "@/lib/api/server";
import type { ContentItem } from "@/types/api";

export const metadata: Metadata = { title: "Universidad", description: "Quiénes somos, modelo educativo, autoridades y docentes de IINICIA.", alternates: { canonical: "/universidad" } };
const LEGAL = new Set(["aviso-privacidad", "terminos"]);
const PEOPLE = [
  ["/universidad/autoridades", "Autoridades", "Quienes dirigen la institución."],
  ["/universidad/docentes", "Docentes", "Nuestra planta académica."],
];

async function Pages() {
  const pages = await publicGet<ContentItem[]>("/content/pagina");
  if (!pages) return <Unavailable />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pages.filter((p) => !LEGAL.has(p.slug)).map((p) => (
        <li key={p.id} className="card">
          <h2 className="text-lg font-bold"><Link href={`/universidad/${p.slug}`} className="underline-offset-2 hover:underline">{p.title}</Link></h2>
          <p className="mt-2 text-sm muted">{p.summary}</p>
        </li>
      ))}
      {PEOPLE.map(([href, title, text]) => (
        <li key={href} className="card">
          <h2 className="text-lg font-bold"><Link href={href} className="underline-offset-2 hover:underline">{title}</Link></h2>
          <p className="mt-2 text-sm muted">{text}</p>
        </li>
      ))}
    </ul>
  );
}

export default function UniversidadPage() {
  return (
    <div className="page">
      <h1 className="h1 mb-8">Universidad</h1>
      <Suspense fallback={<Loading />}><Pages /></Suspense>
    </div>
  );
}
