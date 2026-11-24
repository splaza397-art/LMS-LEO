import { NextResponse, type NextRequest } from "next/server";
import { forwardedFor } from "@/lib/client-ip";
import { COOKIES, unseal } from "@/lib/session-core";

const ALLOWED = /^v1\/(me|admin)(\/[A-Za-z0-9_:.-]+)*$/;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function forward(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const joined = path.join("/");
  if (!ALLOWED.test(joined) || path.some((s) => s === "." || s === "..")) {
    return NextResponse.json({ message: "Ruta no permitida" }, { status: 404 });
  }
  if (request.method !== "GET" && request.headers.get("origin") !== process.env.PORTAL_URL) {
    return NextResponse.json({ message: "Origen no permitido" }, { status: 403 });
  }
  const access = await unseal<{ t: string }>(request.cookies.get(COOKIES.access)?.value);
  if (!access) return NextResponse.json({ message: "Sesión requerida" }, { status: 401 });

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const declared = request.headers.get("content-type") ?? "";
  const isImage = IMAGE_TYPES.has(declared) && joined === "v1/admin/media";
  try {
    const upstream = await fetch(`${process.env.BACKEND_URL}/api/${joined}${request.nextUrl.search}`, {
      method: request.method,
      headers: {
        authorization: `Bearer ${access.t}`,
        ...(hasBody ? { "content-type": isImage ? declared : "application/json" } : {}),
        ...forwardedFor(request.headers),
      },
      body: !hasBody ? undefined : isImage ? await request.arrayBuffer() : await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Servicio no disponible" }, { status: 502 });
  }
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
