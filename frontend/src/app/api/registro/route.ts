import { NextResponse, type NextRequest } from "next/server";
import { forwardedFor } from "@/lib/client-ip";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== process.env.PORTAL_URL) {
    return NextResponse.json({ message: "Origen no permitido" }, { status: 403 });
  }
  try {
    const upstream = await fetch(`${process.env.BACKEND_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", ...forwardedFor(request.headers) },
      body: await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ message: "Servicio no disponible" }, { status: 502 });
  }
}
