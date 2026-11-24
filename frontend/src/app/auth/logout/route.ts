import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, oidcEndpoint, unseal } from "@/lib/session-core";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== process.env.PORTAL_URL) {
    return NextResponse.json({ message: "Origen no permitido" }, { status: 403 });
  }
  const id = await unseal<{ t: string }>(request.cookies.get(COOKIES.id)?.value);
  const url = new URL(oidcEndpoint("logout"));
  url.searchParams.set("client_id", process.env.OIDC_CLIENT_ID!);
  url.searchParams.set("post_logout_redirect_uri", `${process.env.PORTAL_URL}/`);
  if (id) url.searchParams.set("id_token_hint", id.t);

  const response = NextResponse.redirect(url, 303);
  for (const name of [COOKIES.access, COOKIES.refresh, COOKIES.id]) response.cookies.delete(name);
  return response;
}
