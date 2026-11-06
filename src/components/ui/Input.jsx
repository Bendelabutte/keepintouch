import React, { forwardRef, useId } from "react";
import { controlClasses, cx } from "./cx";
import { FieldContext, useControlProps } from "./field";

// Libellé au-dessus, aide ou erreur en dessous ; relie automatiquement le champ (id, aria-describedby).
export function Field({ label, hint, error, required = false, className = "", children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error, required }}>
      <div className={cx("space-y-1.5", className)}>
        {label && (
          <label htmlFor={id} className="block text-sm font-semibold text-ink-soft">
            {label}
            {required && (
              <span className="ml-0.5 text-accent" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        {children}
        {error ? (
          <p id={errorId} className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
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
  return (
    <textarea ref={ref} rows={rows} className={cx(controlClasses(isInvalid), "resize-y", className)} {...aria} {...rest} />
  );
});

export default Input;
