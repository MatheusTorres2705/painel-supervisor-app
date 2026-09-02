// src/components/ui/field.tsx
// Rótulo + controle associados por id. Antes havia 28 <label> sem um único
// htmlFor e 75 <span> fazendo papel de rótulo — nenhum campo era anunciável.
import * as React from "react";

import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  /** Fixa o id; por padrão é gerado com React.useId(). */
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Recebe as props a aplicar no controle (id, aria-*). */
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
    required?: boolean;
  }) => React.ReactNode;
};

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const auto = React.useId();
  const id = htmlFor ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className="block text-2xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required,
      })}

      {error ? (
        <p id={errorId} className="text-2xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-2xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
