// Route handler y no sitemap.ts: el mapa debe reflejar al momento lo publicado en el CMS.
const STATIC = ["/", "/universidad", "/universidad/autoridades", "/universidad/docentes", "/oferta", "/admisiones", "/noticias", "/contacto", "/registro"];
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface SitemapData {
  programs: { slug: string; updatedAt: string }[];
  content: { type: string; slug: string; updatedAt: string }[];
}

export async function GET() {
  const base = process.env.PORTAL_URL;
  let data: SitemapData = { programs: [], content: [] };
  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/v1/sitemap-data`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.ok) data = await response.json();
  } catch {
    // Sin backend se publica al menos el mapa de paginas fijas.
  }
  const entries: [string, string?][] = [
    ...STATIC.map((path): [string] => [path]),
    ...data.programs.map((p): [string, string] => [`/oferta/${p.slug}`, p.updatedAt]),
    ...data.content.map((c): [string, string] => [`/${c.type === "noticia" ? "noticias" : "universidad"}/${c.slug}`, c.updatedAt]),
  ];
  const urls = entries.map(([path, updated]) =>
    `<url><loc>${escape(`${base}${path}`)}</loc>${updated ? `<lastmod>${new Date(updated).toISOString()}</lastmod>` : ""}</url>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
