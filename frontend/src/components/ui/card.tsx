import type { HTMLAttributes, ReactNode } from "react";

/** Contenedor con el estilo `card`. Si tiene título, la sección queda etiquetada por él. */
export function Card({ title, headingId, actions, className, children, ...props }: HTMLAttributes<HTMLElement> & { title?: ReactNode; headingId?: string; actions?: ReactNode }) {
  return (
    <section className={["card", className].filter(Boolean).join(" ")} aria-labelledby={title && headingId ? headingId : undefined} {...props}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 id={headingId} className="font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export const Badge = ({ children }: { children: ReactNode }) => <span className="badge">{children}</span>;
