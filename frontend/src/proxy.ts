import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, cookieOptions, REFRESH_MAX_AGE, refreshTokens, sealTokens, unseal } from "@/lib/session-core";

const PROTECTED = ["/mi-iinicia", "/admin"];
const REFRESH_MARGIN_SECONDS = 30;

// Redirecciones 301 de URLs heredadas de WordPress, administradas en la base de datos.
let redirectCache: { at: number; map: Map<string, string> } = { at: 0, map: new Map() };
/** Normaliza la clave: sin barra final y con la consulta, porque WordPress usaba URLs como /?page_id=1172. */
const redirectKey = (pathname: string, search = "") => (pathname.replace(/\/$/, "") || "/") + search;
async function legacyTarget(pathname: string, search: string): Promise<string | undefined> {
  if (Date.now() - redirectCache.at > 60_000) {
    try {
      const response = await fetch(`${process.env.BACKEND_URL}/api/v1/redirects`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const rows = (await response.json()) as { source: string; target: string }[];
        redirectCache = {
          at: Date.now(),
          map: new Map(rows.map((r) => {
            const [path, query] = r.source.split("?");
            return [redirectKey(path, query ? `?${query}` : ""), r.target];
          })),
        };
      }
    } catch {
      redirectCache = { ...redirectCache, at: Date.now() - 45_000 };
    }
  }
  return (search && redirectCache.map.get(redirectKey(pathname, search))) || redirectCache.map.get(redirectKey(pathname));
}

// Las paginas de detalle se transmiten en streaming y ya no pueden cambiar su estado HTTP.
// Se valida antes que el contenido exista para responder 404 real y no un "404 suave" indexable.
const DETAIL_ROUTES: [RegExp, (slug: string) => string][] = [
  [/^\/noticias\/([a-z0-9-]+)$/, (s) => `/content/noticia/${s}`],
  [/^\/universidad\/(?!docentes$|autoridades$)([a-z0-9-]+)$/, (s) => `/content/pagina/${s}`],
  [/^\/oferta\/([a-z0-9-]+)$/, (s) => `/programs/${s}`],
];
async function detailExists(pathname: string): Promise<boolean> {
  for (const [pattern, api] of DETAIL_ROUTES) {
    const match = pathname.match(pattern);
    if (!match) continue;
    try {
      const response = await fetch(`${process.env.BACKEND_URL}/api/v1${api(match[1])}`, { method: "GET", signal: AbortSignal.timeout(3000) });
      return response.status !== 404;
    } catch {
      return true; // Si el backend no responde, la pagina muestra su propio aviso de error.
    }
  }
  return true;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const needsSession = isProtected || pathname.startsWith("/api/bff/");

  if (!needsSession) {
    const target = await legacyTarget(pathname, search);
    if (target) return NextResponse.redirect(new URL(target, process.env.PORTAL_URL), 301);
    if (!(await detailExists(pathname))) return NextResponse.rewrite(new URL("/_no-encontrado", request.url));
    return NextResponse.next();
  }

  const access = await unseal<{ t: string; e: number }>(request.cookies.get(COOKIES.access)?.value);
  const now = Math.floor(Date.now() / 1000);
  if (access && access.e - now > REFRESH_MARGIN_SECONDS) return NextResponse.next();

  const refresh = await unseal<{ t: string }>(request.cookies.get(COOKIES.refresh)?.value);
  const tokens = refresh ? await refreshTokens(refresh.t) : null;

  if (!tokens) {
    const response = isProtected
      ? NextResponse.redirect(new URL(`/auth/login?returnTo=${encodeURIComponent(pathname + search)}`, process.env.PORTAL_URL))
      : NextResponse.next();
    if (refresh) for (const name of [COOKIES.access, COOKIES.refresh, COOKIES.id]) response.cookies.delete(name);
    return response;
  }

  const sealed = await sealTokens(tokens);
  request.cookies.set(COOKIES.access, sealed.access);
  request.cookies.set(COOKIES.refresh, sealed.refresh);
  const headers = new Headers(request.headers);
  headers.set("cookie", request.cookies.toString());
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(COOKIES.access, sealed.access, { ...cookieOptions, maxAge: sealed.accessMaxAge });
  response.cookies.set(COOKIES.refresh, sealed.refresh, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });
  if (sealed.id) response.cookies.set(COOKIES.id, sealed.id, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/|media/|api/estado|api/registro|api/informacion|robots.txt|sitemap.xml).*)"],
};
