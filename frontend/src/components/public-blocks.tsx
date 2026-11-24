import Image from "next/image";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { LEVEL_LABELS, publicGet, type ContentItem, type Program } from "@/lib/api";

export const Loading = ({ label = "Cargando..." }: { label?: string }) => <p role="status" className="muted">{label}</p>;
export const Unavailable = () => <p role="alert" className="text-amber-700">Esta información no está disponible por el momento.</p>;

export async function ProgramGrid({ limit }: { limit?: number }) {
  const programs = await publicGet<Program[]>("/programs");
  if (!programs) return <Unavailable />;
  if (!programs.length) return <p className="muted">Pronto publicaremos nuestra oferta académica.</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {programs.slice(0, limit).map((p) => (
        <li key={p.id} className="card flex flex-col overflow-hidden p-0 sm:p-0">
          {p.imageUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
            : <div className="flex aspect-[4/3] items-center justify-center bg-blue-950"><Image src="/brand/isotipo.png" alt="" width={462} height={256} className="w-1/2" /></div>}
          <div className="flex flex-1 flex-col p-5">
            <span className="badge self-start">{LEVEL_LABELS[p.level] ?? p.level}</span>
            <h3 className="mt-3 text-lg font-bold">{p.name}</h3>
            <p className="mt-2 flex-1 text-sm muted">{p.summary}</p>
            <p className="mt-3 text-sm muted">{[p.duration, p.modality].filter(Boolean).join(" · ")}</p>
            <Link href={`/oferta/${p.slug}`} className="btn-outline mt-4">Ver programa<span className="sr-only">: {p.name}</span></Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

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
