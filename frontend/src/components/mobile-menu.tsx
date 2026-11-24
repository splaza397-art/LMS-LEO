"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/** Menú desplegable para pantallas pequeñas. Se cierra al elegir una opción, con Escape o al tocar fuera. */
export function MobileMenu({ items }: { items: readonly (readonly [string, string])[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e.type === "click" && (e.target as Element).closest?.("nav a")) {
        el.open = false;
        return;
      }
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) {
        el.open = false;
        if (e instanceof KeyboardEvent) el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("click", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("click", close);
    };
  }, []);

  return (
    <details ref={ref} className="group lg:hidden">
      <summary
        aria-label="Menú"
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg border border-blue-300 hover:bg-blue-900 [&::-webkit-details-marker]:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 group-open:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="hidden size-6 group-open:block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </summary>
      <nav aria-label="Móvil" className="absolute inset-x-0 top-full flex flex-col border-t border-blue-800 bg-blue-950 px-4 pb-4 text-base shadow-lg sm:px-8">
        {items.map(([href, label]) => (
          <Link key={href} href={href} className="border-b border-blue-900 py-3 last:border-0 hover:text-sky-300">
            {label}
          </Link>
        ))}
      </nav>
    </details>
  );
}
