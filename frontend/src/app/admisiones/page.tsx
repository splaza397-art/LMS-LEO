import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InfoRequestForm } from "@/components/portal-forms";
import { FaqList, Loading } from "@/components/public-blocks";
import { publicGet, type Program } from "@/lib/api";

export const metadata: Metadata = { title: "Admisiones", description: "Conoce el proceso de admisión de IINICIA y solicita información.", alternates: { canonical: "/admisiones" } };

const STEPS = [
  "Crea tu cuenta y confirma tu correo.",
  "Elige el programa de tu interés y envía tu solicitud.",
  "El área académica revisa y autoriza tu solicitud.",
  "Tus cursos aparecen en Mi IINICIA y en la app Android.",
];

async function InfoForm() {
  const programs = await publicGet<Program[]>("/programs");
  return <InfoRequestForm programs={(programs ?? []).map((p) => ({ id: p.id, name: p.name }))} />;
}

export default function AdmisionesPage() {
  return (
    <div className="page">
      <h1 className="h1">Admisiones</h1>
      <ol className="mt-6 max-w-2xl list-decimal space-y-2 pl-5 text-slate-700">
        {STEPS.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <Link href="/registro" className="btn-primary mt-6">Comenzar registro</Link>
      <h2 className="h2 mt-12 mb-4">Solicita información</h2>
      <Suspense fallback={<Loading />}><InfoForm /></Suspense>
      <h2 className="h2 mt-12 mb-4">Preguntas frecuentes</h2>
      <Suspense fallback={<Loading />}><FaqList /></Suspense>
    </div>
  );
}
