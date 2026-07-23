"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Label + bordered text field that share the same left edge.
 * The border lives on a wrapper div so browser input chrome can't inset it.
 */
export function TextField({
  label,
  hint,
  inputClassName = "",
  ...inputProps
}: {
  label: string;
  hint?: ReactNode;
  inputClassName?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  return (
    <div className="field-group">
      <label className="label">{label}</label>
      <div className="field">
        <input className={`field-input ${inputClassName}`.trim()} {...inputProps} />
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
