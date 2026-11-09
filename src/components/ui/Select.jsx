import React, { forwardRef } from "react";
import { controlClasses, cx } from "./cx";
import { useControlProps } from "./field";

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%236b7280' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")";

// Liste déroulante native. Placée dans un <Field>, elle reprend son id, son aide et son erreur.
const Select = forwardRef(function Select({ className = "", children, ...props }, ref) {
  const { isInvalid, rest, ...aria } = useControlProps(props);
  return (
    <select
      ref={ref}
      className={cx(
        controlClasses(isInvalid),
        "cursor-pointer appearance-none bg-[length:1rem] bg-[right_0.875rem_center] bg-no-repeat pr-10",
        className
      )}
      style={{ backgroundImage: CHEVRON }}
      {...aria}
      {...rest}
    >
      {children}
    </select>
  );
});

export default Select;
