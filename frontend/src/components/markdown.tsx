import type { ReactNode } from "react";

/** Formato basico para el CMS. Genera elementos React: el HTML escrito por un editor nunca se ejecuta. */
export function safeUrl(url: string, image = false): string | null {
  const value = url.trim();
  if (value.startsWith("https://")) return value;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  if (!image && value.startsWith("mailto:")) return value;
  return null;
}

const INLINE = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index;
    if (index > last) out.push(text.slice(last, index));
    if (match[1]) out.push(<strong key={index}>{match[1]}</strong>);
    else if (match[2]) out.push(<em key={index}>{match[2]}</em>);
    else {
      const href = safeUrl(match[4]);
      out.push(href
        ? <a key={index} href={href} className="font-medium text-blue-700 underline" {...(href.startsWith("https://") ? { rel: "noopener noreferrer" } : {})}>{match[3]}</a>
        : match[3]);
    }
    last = index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (heading) {
      const content = inline(heading[2]);
      // La pagina ya tiene su h1: "#" y "##" son subtitulos (h2) y "###" un apartado (h3).
      if (heading[1].length < 3) blocks.push(<h2 key={i} className="mt-8 text-2xl font-bold text-slate-900">{content}</h2>);
      else blocks.push(<h3 key={i} className="mt-6 text-xl font-bold text-slate-900">{content}</h3>);
      i++;
    } else if (image) {
      const src = safeUrl(image[2], true);
      // eslint-disable-next-line @next/next/no-img-element
      if (src) blocks.push(<img key={i} src={src} alt={image[1]} loading="lazy" className="my-4 max-w-full rounded-lg" />);
      i++;
    } else if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const pattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      const items: ReactNode[] = [];
      const start = i;
      while (i < lines.length && pattern.test(lines[i].trim())) {
        items.push(<li key={i}>{inline(lines[i].trim().replace(pattern, ""))}</li>);
        i++;
      }
      blocks.push(ordered
        ? <ol key={start} className="my-3 list-decimal space-y-1 pl-6">{items}</ol>
        : <ul key={start} className="my-3 list-disc space-y-1 pl-6">{items}</ul>);
    } else {
      const start = i;
      const paragraph: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|!\[|[-*]\s|\d+\.\s)/.test(lines[i].trim())) {
        paragraph.push(lines[i].trim());
        i++;
      }
      blocks.push(<p key={start} className="my-3">{inline(paragraph.join(" "))}</p>);
    }
  }
  return <>{blocks}</>;
}
