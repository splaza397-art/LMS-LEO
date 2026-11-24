import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="page">
      <h1 className="h1">Página no encontrada</h1>
      <p className="mt-3 max-w-xl muted">La página que buscas no existe o fue retirada.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="btn-primary">Ir al inicio</Link>
        <Link href="/oferta" className="btn-outline">Ver oferta académica</Link>
      </div>
    </div>
  );
}
