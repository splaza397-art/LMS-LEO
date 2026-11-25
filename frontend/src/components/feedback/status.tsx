import type { ReactNode } from "react";

/** Mensajes de estado compartidos. Los de carga y éxito se anuncian con role="status"; los errores, con role="alert". */
export const Loading = ({ label = "Cargando..." }: { label?: string }) => <p role="status" className="muted">{label}</p>;
export const Unavailable = () => <p role="alert" className="text-amber-700">Esta información no está disponible por el momento.</p>;

export function ErrorMessage({ message, className = "my-3" }: { message?: string; className?: string }) {
  if (!message) return null;
  return <p role="alert" className={`${className} text-sm text-red-700`}>{message}</p>;
}

export function SuccessMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="status" className="text-sm font-semibold text-green-800">{message}</p>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}
