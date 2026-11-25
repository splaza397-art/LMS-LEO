"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorMessage } from "@/components/feedback/status";
import { ApiError, bff } from "@/lib/api/client";

/** Solicitar admisión a un programa (solo aspirantes; el backend valida el permiso). */
export function ApplyButton({ programId }: { programId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function apply() {
    setBusy(true);
    try {
      await bff("me/applications", "POST", { programId });
      router.push("/mi-iinicia");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "No se pudo enviar la solicitud");
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={apply} disabled={busy} className="btn-primary">{busy ? "Enviando..." : "Solicitar admisión"}</button>
      <ErrorMessage message={message} className="mt-2" />
    </div>
  );
}
