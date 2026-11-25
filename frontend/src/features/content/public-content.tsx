import Link from "next/link";
import { Unavailable } from "@/components/feedback/status";
import { publicGet } from "@/lib/api/server";
import type { ContentItem } from "@/types/api";
import { Markdown } from "./markdown";

/** En el inicio, la seccion de noticias solo aparece cuando hay noticias publicadas. */
export async function HomeNews() {
  const items = await publicGet<ContentItem[]>("/content/noticia");
  if (!items?.length) return null;
  return (
    <section className="page" aria-labelledby="noticias-titulo">
      <h2 id="noticias-titulo" className="h2 mb-6">Noticias</h2>
      <NewsList limit={2} />
    </section>
  );
}

export async function NewsList({ limit }: { limit?: number }) {
  const items = await publicGet<ContentItem[]>("/content/noticia");
  if (!items) return <Unavailable />;
  if (!items.length) return <p className="muted">Aún no hay noticias publicadas.</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {items.slice(0, limit).map((n) => (
        <li key={n.id} className="card">
          <h3 className="text-lg font-bold"><Link href={`/noticias/${n.slug}`} className="hover:underline">{n.title}</Link></h3>
          <p className="mt-2 text-sm muted">{n.summary}</p>
        </li>
      ))}
    </ul>
  );
}

export async function FaqList() {
  const items = await publicGet<ContentItem[]>("/content/faq");
  if (!items) return <Unavailable />;
  return (
    <div className="space-y-3">
      {items.map((f) => (
        <details key={f.id} className="card">
          <summary className="cursor-pointer font-semibold">{f.title}</summary>
          <p className="mt-2 whitespace-pre-line text-sm muted">{f.body}</p>
        </details>
      ))}
    </div>
  );
}

/** El contenido del CMS se convierte a elementos React y nunca se inyecta como HTML. */
export function ContentBody({ body }: { body: string }) {
  return <div className="mt-6 max-w-3xl leading-7 text-slate-700"><Markdown source={body} /></div>;
}

export async function PeopleList({ type }: { type: "docente" | "autoridad" }) {
  const people = await publicGet<ContentItem[]>(`/content/${type}`);
  if (!people) return <Unavailable />;
  if (!people.length) return <p className="muted">Pronto publicaremos esta información.</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {people.map((p) => (
        <li key={p.id} className="card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.imageUrl && <img src={p.imageUrl} alt={`Fotografía de ${p.title}`} loading="lazy" className="mb-3 aspect-square w-full rounded-lg object-cover" />}
          <h2 className="text-lg font-bold">{p.title}</h2>
          {p.summary && <p className="mt-1 text-sm muted">{p.summary}</p>}
          {p.body && p.body !== p.summary && <div className="mt-2 text-sm text-slate-700"><Markdown source={p.body} /></div>}
        </li>
      ))}
    </ul>
  );
}
