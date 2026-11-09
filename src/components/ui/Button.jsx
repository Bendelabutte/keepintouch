import React from "react";
import { Link } from "react-router";
import { buttonClasses, cx } from "./cx";
import Icon from "./Icon";

export function Spinner({ className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={cx("size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
    />
  );
}

export default function Button({
  variant,
  size,
  block,
  icon,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...props}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === "xs" ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, block, icon, className, children, ...props }) {
  return (
    <Link className={buttonClasses({ variant, size, block, className })} {...props}>
      {icon && <Icon name={icon} size={size === "xs" ? 16 : 18} />}
      {children}
    </Link>
  );
}
