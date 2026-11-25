import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { ContentBody } from "@/features/content/public-content";
import { publicGet } from "@/lib/api/server";
import type { ContentItem } from "@/types/api";

const load = (slug: string) => publicGet<ContentItem>(`/content/pagina/${encodeURIComponent(slug)}`);

export async function generateMetadata({ params }: PageProps<"/universidad/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const item = await load(slug);
  if (!item) return { title: "Página no encontrada", robots: { index: false } };
  return pageMetadata({ title: item.seoTitle || item.title, description: item.seoDescription || item.summary, path: `/universidad/${slug}`, image: item.imageUrl });
}

async function Detail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await load(slug);
  if (!item) notFound();
  return <><h1 className="h1">{item.title}</h1><ContentBody body={item.body} /></>;
}

export default function Page({ params }: PageProps<"/universidad/[slug]">) {
  return <div className="page"><Suspense fallback={<Loading />}><Detail params={params} /></Suspense></div>;
}
