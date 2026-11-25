import type { Metadata } from "next";

/** Imagen por omisión al compartir una página (logotipo sobre fondo claro). */
export const DEFAULT_SHARE_IMAGE = "/brand/logo-oscuro.png";

/**
 * Metadatos de una página pública: título, descripción, URL canónica y Open Graph coherentes entre sí.
 * Next.js no copia el título a og:title, así que se define aquí para que al compartir se vea la página real.
 */
export function pageMetadata({ title, description, path, image, type = "website" }: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  type?: "website" | "article";
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type, title, description, url: path, siteName: "IINICIA", locale: "es_MX", images: [image || DEFAULT_SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Páginas privadas o sin contenido: nunca se indexan. */
export const NO_INDEX: Metadata["robots"] = { index: false, follow: false };
