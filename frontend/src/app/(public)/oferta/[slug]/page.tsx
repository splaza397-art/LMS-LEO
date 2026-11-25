import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApplyButton } from "@/features/admissions/apply-button";
import { Loading } from "@/components/feedback/status";
import { ContentBody } from "@/features/content/public-content";
import { getMe, publicGet } from "@/lib/api/server";
import { LEVEL_LABELS } from "@/config/labels";
import type { Program } from "@/types/api";

export async function generateMetadata({ params }: PageProps<"/oferta/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const program = await publicGet<Program>(`/programs/${encodeURIComponent(slug)}`);
  if (!program) return { title: "Programa no encontrado", robots: { index: false } };
  return { title: program.name, description: program.summary, alternates: { canonical: `/oferta/${slug}` } };
}

async function Apply({ programId }: { programId: string }) {
  const me = await getMe();
  if (!me) return <a href="/registro" className="btn-primary">Regístrate para solicitar</a>;
  if (!me.permissions.includes("application:create")) return null;
  return <ApplyButton programId={programId} />;
}

async function ProgramDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const program = await publicGet<Program>(`/programs/${encodeURIComponent(slug)}`);
  if (!program) notFound();
  return (
    <>
      <span className="badge">{LEVEL_LABELS[program.level] ?? program.level}</span>
      <h1 className="h1 mt-3">{program.name}</h1>
      <p className="mt-3 max-w-2xl text-lg muted">{program.summary}</p>
      <p className="mt-3 text-sm muted">{[program.duration, program.modality].filter(Boolean).join(" · ")}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {program.imageUrl && <img src={program.imageUrl} alt="" className="mt-6 max-h-96 w-full max-w-3xl rounded-xl object-cover" />}
      <ContentBody body={program.description ?? ""} />
      <div className="mt-8"><Suspense fallback={<Loading />}><Apply programId={program.id} /></Suspense></div>
    </>
  );
}

export default function ProgramPage({ params }: PageProps<"/oferta/[slug]">) {
  return <div className="page"><Suspense fallback={<Loading />}><ProgramDetail params={params} /></Suspense></div>;
}
