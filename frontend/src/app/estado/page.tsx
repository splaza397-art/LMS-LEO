import type { Metadata } from "next";
import { SystemStatus } from "@/components/system-status";

export const metadata: Metadata = {
  title: "Estado del sistema",
  description: "Disponibilidad del portal, la identidad y el campus de IINICIA.",
  alternates: { canonical: "/estado" },
  robots: { index: false },
};

export default function EstadoPage() {
  return (
    <div className="page">
      <h1 className="h1">Estado del sistema</h1>
      <p className="mt-3 max-w-2xl muted">Si tienes problemas para entrar al portal o al campus, aquí puedes ver si algún servicio no está disponible.</p>
      <SystemStatus />
    </div>
  );
}
