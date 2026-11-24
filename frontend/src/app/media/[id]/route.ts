import { NextResponse, type NextRequest } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  try {
    const upstream = await fetch(`${process.env.BACKEND_URL}/api/v1/media/${id}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!upstream.ok) return new NextResponse(null, { status: 404 });
    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "cache-control": "public, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
