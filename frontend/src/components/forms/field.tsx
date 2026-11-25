"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface FieldBase {
  label: ReactNode;
  /** Texto de ayuda bajo el campo; se asocia con aria-describedby. */
  hint?: ReactNode;
  /** Error del campo; se anuncia y marca el campo como inválido. */
  error?: string;
  className?: string;
}

function useFieldIds(id?: string) {
  const generated = useId();
  const fieldId = id ?? generated;
  return { fieldId, hintId: `${fieldId}-ayuda`, errorId: `${fieldId}-error` };
}

function Help({ hint, error, hintId, errorId }: { hint?: ReactNode; error?: string; hintId: string; errorId: string }) {
  return (
    <>
      {hint && <p id={hintId} className="mt-1 text-xs muted">{hint}</p>}
      {error && <p id={errorId} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </>
  );
}

const describedBy = (hint: unknown, error: unknown, hintId: string, errorId: string) =>
  [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

export function TextField({ label, hint, error, className, id, ...props }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="label">{label}</label>
      <input id={fieldId} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, hintId, errorId)} {...props} />
      <Help hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

export function TextAreaField({ label, hint, error, className, id, ...props }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="label">{label}</label>
      <textarea id={fieldId} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, hintId, errorId)} {...props} />
      <Help hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

export interface SelectFieldProps extends FieldBase, SelectHTMLAttributes<HTMLSelectElement> {
  options: [value: string, label: string][];
  /** Primera opción vacía (por ejemplo, "Todos" en un filtro). */
  placeholder?: string;
}

export function SelectField({ label, hint, error, className, id, options, placeholder, ...props }: SelectFieldProps) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="label">{label}</label>
      <select id={fieldId} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, hintId, errorId)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
      <Help hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

export function CheckboxField({ label, className, id, ...props }: { label: ReactNode; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <label htmlFor={fieldId} className={["flex items-start gap-2 text-sm", className].filter(Boolean).join(" ")}>
      <input id={fieldId} type="checkbox" className="mt-0.5 size-5" {...props} />
      <span>{label}</span>
    </label>
  );
}
