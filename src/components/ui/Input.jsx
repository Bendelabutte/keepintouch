import React, { forwardRef, useId } from "react";
import { controlClasses, cx } from "./cx";
import { FieldContext, useControlProps } from "./field";

// Libellé au-dessus du champ, aide et message d'erreur en dessous (Bien EDL).
export function Field({ label, hint, error, required = false, className = "", children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error, required }}>
      <div className={cx("space-y-1.5", className)}>
        {label && (
          <label htmlFor={id} className="block text-sm font-semibold text-ink">
            {label}
            {required && (
              <span className="ml-0.5 text-ink-muted" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        {children}
        {hint && !error && (
          <p id={hintId} className="text-sm text-ink-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

const Input = forwardRef(function Input({ className = "", ...props }, ref) {
  const { isInvalid, rest, ...aria } = useControlProps(props);
  return <input ref={ref} className={cx(controlClasses(isInvalid), className)} {...aria} {...rest} />;
});

export const Textarea = forwardRef(function Textarea({ className = "", rows = 3, ...props }, ref) {
  const { isInvalid, rest, ...aria } = useControlProps(props);
  return <textarea ref={ref} rows={rows} className={cx(controlClasses(isInvalid), className)} {...aria} {...rest} />;
});

// Case à cocher avec libellé à droite.
export function Checkbox({ label, className = "", ...props }) {
  return (
    <label className={cx("flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink", className)}>
      <input type="checkbox" className="size-5 shrink-0 cursor-pointer accent-primary" {...props} />
      <span>{label}</span>
    </label>
  );
}

export default Input;
