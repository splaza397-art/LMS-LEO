import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "danger";
const CLASS: Record<Variant, string> = { primary: "btn-primary", outline: "btn-outline", danger: "btn-danger" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Mientras es true, el botón se desactiva y muestra `busyLabel`. */
  busy?: boolean;
  busyLabel?: string;
}

/** Botón con los estilos institucionales. Por omisión es type="button" para no enviar formularios por accidente. */
export function Button({ variant = "primary", busy = false, busyLabel, className, type = "button", disabled, children, ...props }: ButtonProps) {
  return (
    <button type={type} className={[CLASS[variant], className].filter(Boolean).join(" ")} disabled={disabled || busy} aria-busy={busy || undefined} {...props}>
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
