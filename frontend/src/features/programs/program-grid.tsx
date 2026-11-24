import Image from "next/image";
import Link from "next/link";
import { Unavailable } from "@/components/feedback/status";
import { LEVEL_LABELS } from "@/config/labels";
import { publicGet } from "@/lib/api/server";
import type { Program } from "@/types/api";

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
