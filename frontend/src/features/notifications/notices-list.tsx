import { privateGet } from "@/lib/api/server";
import type { Notice } from "@/types/api";

/** Últimos avisos de la persona (los mismos que recibe la app Android). */
export async function NoticesList() {
  const items = await privateGet<Notice[]>("/me/notifications");
  if (!items?.length) return <p className="text-sm muted">Sin avisos.</p>;
  return <ul className="space-y-3">{items.slice(0, 5).map((n) => <li key={n.id} className="text-sm"><p className="font-semibold">{n.title}</p><p className="muted">{n.body}</p></li>)}</ul>;
}
