import { NextResponse } from "next/server";

export async function GET() {
  try {
    const upstream = await fetch(`${process.env.BACKEND_URL}/api/estado`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return NextResponse.json(await upstream.json(), { status: upstream.status, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "API no disponible" }, { status: 502 });
  }
}
