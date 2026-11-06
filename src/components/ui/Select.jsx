import React, { forwardRef } from "react";
import { controlClasses, cx } from "./cx";
import { useControlProps } from "./field";

// Liste déroulante native (accessible, mobile), habillée comme les champs.
const Select = forwardRef(function Select({ className = "", children, ...props }, ref) {
  const { isInvalid, rest, ...aria } = useControlProps(props);
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cx(controlClasses(isInvalid), "appearance-none pr-9", className)}
        {...aria}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
});

export default Select;
