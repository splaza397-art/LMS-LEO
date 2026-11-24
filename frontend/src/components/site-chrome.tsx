import { cacheLife } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { COOKIES } from "@/lib/session-core";
import { MobileMenu } from "@/components/mobile-menu";

const NAV = [
  ["/", "Inicio"],
  ["/universidad", "Universidad"],
  ["/oferta", "Oferta académica"],
  ["/admisiones", "Admisiones"],
  ["/noticias", "Noticias"],
  ["/contacto", "Contacto"],
] as const;

async function AccountLinks() {
  const store = await cookies();
  const signedIn = store.has(COOKIES.refresh);
  if (signedIn) {
    return (
      <>
        <Link href="/mi-iinicia" className="btn bg-white text-blue-950 hover:bg-blue-100">Mi Campus</Link>
        <form action="/auth/logout" method="post">
          <button className="btn border border-blue-300 text-white hover:bg-blue-900">Salir</button>
        </form>
      </>
    );
  }
  return (
    <>
      <a href="/auth/login" className="btn border border-blue-300 text-white hover:bg-blue-900">Mi Campus</a>
      <Link href="/registro" className="btn bg-white text-blue-950 hover:bg-blue-100">Registrarme</Link>
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="relative z-30 bg-blue-950 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2 sm:gap-3 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center rounded" aria-label="IINICIA, Instituto de Innovación y Ciencias Aplicadas: ir al inicio">
          <Image src="/brand/logo-compacto-blanco.png" alt="" width={195} height={160} priority className="h-12 w-auto sm:h-14" />
        </Link>
        <nav aria-label="Principal" className="hidden gap-5 text-sm lg:flex">
          {NAV.map(([href, label]) => <Link key={href} href={href} className="py-2 hover:underline">{label}</Link>)}
        </nav>
        <div className="flex items-center gap-2 [&_.btn]:px-3 sm:[&_.btn]:px-5">
          <Suspense fallback={<span className="block h-11 w-40" />}><AccountLinks /></Suspense>
          <MobileMenu items={NAV} />
        </div>
      </div>
    </header>
  );
}

/** El año se calcula en caché diaria: con cacheComponents la hora actual no puede ir en la parte estática. */
async function CopyrightYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export function SiteFooter() {
  return (
    <footer className="bg-blue-950 py-10 text-sm text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-8 md:grid-cols-[auto_1fr_auto]">
        <Image src="/brand/logo-blanco.png" alt="IINICIA, Instituto de Innovación y Ciencias Aplicadas" width={640} height={645} className="h-28 w-auto" />
        <p className="max-w-md self-center text-blue-100">
          Tu educación comienza hoy, estés donde estés. El conocimiento que transforma tu vida está a tu alcance, en todo momento.
        </p>
        <nav aria-label="Pie de página" className="grid grid-cols-2 gap-x-8 gap-y-2 self-center">
          {NAV.slice(1).map(([href, label]) => <Link key={href} href={href} className="hover:underline">{label}</Link>)}
          <Link href="/universidad/aviso-privacidad" className="hover:underline">Aviso de privacidad</Link>
          <Link href="/universidad/terminos" className="hover:underline">Términos</Link>
          <Link href="/estado" className="hover:underline">Estado del sistema</Link>
        </nav>
      </div>
      <div className="mx-auto mt-8 max-w-6xl px-4 sm:px-8">
        <p className="border-t border-blue-800 pt-6 text-blue-200">
          © <CopyrightYear /> IINICIA, Instituto de Innovación y Ciencias Aplicadas
        </p>
      </div>
    </footer>
  );
}
