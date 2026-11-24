import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PORTAL_URL ?? "http://localhost:3000"),
  openGraph: { siteName: "IINICIA", locale: "es_MX", type: "website" },
  title: { default: "IINICIA – Instituto de Innovación y Ciencias Aplicadas", template: "%s | IINICIA" },
  description: "Tu educación comienza hoy, estés donde estés. Cursos, diplomados, certificaciones y carreras en línea del Instituto de Innovación y Ciencias Aplicadas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">
          Saltar al contenido
        </a>
        <SiteHeader />
        <main id="contenido" className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
