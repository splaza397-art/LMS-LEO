import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/feedback/status";
import { HomeNews } from "@/features/content/public-content";
import { ProgramGrid } from "@/features/programs/program-grid";

/** Portada: título completo (sin la plantilla "%s | IINICIA"), canónica y Open Graph. */
export const metadata: Metadata = {
  ...pageMetadata({ title: "IINICIA – Instituto de Innovación y Ciencias Aplicadas", description: "Tu educación comienza hoy, estés donde estés. Cursos, diplomados, certificaciones y carreras en línea del Instituto de Innovación y Ciencias Aplicadas.", path: "/" }),
  title: { absolute: "IINICIA – Instituto de Innovación y Ciencias Aplicadas" },
};


// Textos tomados del sitio institucional vigente (iinicia.org).
const WHY = [
  ["Experiencia", "Transforma teoría en práctica con proyectos que simulan situaciones reales del entorno laboral actual."],
  ["Certificación", "Obtén certificados digitales por cada curso completado, válidos para enriquecer tu currículum y fortalecer tu perfil profesional."],
  ["Contenidos", "Contenidos alineados al plan de estudios oficial, impartidos por expertos en cada materia y disponibles 24/7 para que aprendas a tu ritmo."],
];

const OFFER = [
  ["Carreras universitarias", "Formación profesional completa con títulos oficiales, diseñada para el mundo digital."],
  ["Badges digitales", "Reconocimientos por logros específicos y competencias adquiridas."],
  ["Certificaciones", "Valida tus habilidades con certificaciones reconocidas en la industria."],
  ["Diplomados en línea", "Programas para profundizar en áreas clave."],
  ["Profesores 24 horas", "Soporte personalizado para cada materia, curso y programa."],
  ["Cursos especializados", "Aprende habilidades específicas con nuestros cursos cortos y enfocados."],
];

const STEPS = [
  ["Conoce IINICIA", "Explora los programas."],
  ["Regístrate", "Crea una sola cuenta."],
  ["Recibe autorización", "Revisamos tu solicitud."],
  ["Estudia", "En web o desde Android."],
];

export default function Home() {
  return (
    <>
      <section className="bg-blue-950 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-8 sm:py-20 md:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-3 font-semibold text-[#00ACE4]">Instituto de Innovación y Ciencias Aplicadas</p>
            <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">Tu educación comienza hoy, estés donde estés.</h1>
            <p className="mt-6 max-w-xl text-lg text-blue-100">
              El conocimiento que transforma tu vida está a tu alcance, en todo momento.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/oferta" className="btn bg-white text-blue-950 hover:bg-blue-100">Conocer programas</Link>
              <Link href="/registro" className="btn border border-blue-300 text-white hover:bg-blue-900">Registrarme</Link>
            </div>
          </div>
          <Image src="/brand/logo-blanco.png" alt="" width={640} height={645} priority className="hidden h-64 w-auto md:block" />
        </div>
      </section>

      <section className="page" aria-labelledby="oferta-titulo">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="oferta-titulo" className="h2">Todos nuestros cursos</h2>
            <p className="mt-2 max-w-2xl muted">Impulsa tu futuro con aprendizaje de excelencia. ¡Confía en los expertos y alcanza tus metas con nosotros!</p>
          </div>
          <Link href="/oferta" className="text-sm font-semibold text-blue-700 hover:underline">Ver toda la oferta</Link>
        </div>
        <Suspense fallback={<Loading />}><ProgramGrid limit={4} /></Suspense>
      </section>

      <section className="bg-white" aria-labelledby="por-que-titulo">
        <div className="page">
          <p className="font-semibold uppercase tracking-wide text-blue-700">¿Por qué elegirnos?</p>
          <h2 id="por-que-titulo" className="h2 mt-2">En IINICIA, tu aprendizaje se adapta a tu vida.</h2>
          <p className="mt-3 max-w-3xl muted">
            Diseñamos una experiencia flexible para que puedas estudiar sin dejar de lado tus responsabilidades diarias.
            Aprende a tu ritmo, desde donde estés, y haz que cada día cuente mientras construyes tu futuro profesional.
          </p>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {WHY.map(([title, text]) => (
              <li key={title} className="rounded-xl border-t-4 border-[#00ACE4] bg-slate-50 p-5">
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="page" aria-labelledby="oferta-tipos-titulo">
        <h2 id="oferta-tipos-titulo" className="h2">Formación para cada etapa</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OFFER.map(([title, text]) => (
            <li key={title} className="card">
              <h3 className="font-bold">{title}</h3>
              <p className="mt-1 text-sm muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white" aria-labelledby="pasos-titulo">
        <div className="page">
          <h2 id="pasos-titulo" className="h2">Una sola cuenta, de la admisión a tus clases</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="rounded-xl bg-slate-50 p-5">
                <span className="text-sm font-bold text-blue-700">Paso {i + 1}</span>
                <p className="mt-1 font-bold">{title}</p>
                <p className="mt-1 text-sm muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Suspense fallback={null}><HomeNews /></Suspense>
    </>
  );
}
