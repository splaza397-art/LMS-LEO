import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { ContentBody } from "@/features/content/public-content";
import { publicGet } from "@/lib/api/server";
import type { ContentItem } from "@/types/api";

const load = (slug: string) => publicGet<ContentItem>(`/content/noticia/${encodeURIComponent(slug)}`);

export async function generateMetadata({ params }: PageProps<"/noticias/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const item = await load(slug);
  if (!item) return { title: "Noticia no encontrada", robots: { index: false } };
  const description = item.seoDescription || item.summary;
  return {
    title: item.seoTitle || item.title,
    description,
    alternates: { canonical: `/noticias/${slug}` },
    openGraph: { type: "article", title: item.title, description, ...(item.imageUrl ? { images: [item.imageUrl] } : {}) },
  };
}

async function Detail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await load(slug);
  if (!item) notFound();
  return (
    <>
      <h1 className="h1">{item.title}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item.imageUrl && <img src={item.imageUrl} alt="" className="mt-6 max-h-96 w-full rounded-xl object-cover" />}
      <ContentBody body={item.body} />
    </>
  );
}

export default function Page({ params }: PageProps<"/noticias/[slug]">) {
  return <div className="page"><Suspense fallback={<Loading />}><Detail params={params} /></Suspense></div>;
}
