import React from "react";
import { cx } from "./cx";

// Liste vide (Bien EDL) : cadre en pointillés, titre en Fraunces, phrase courte, action éventuelle.
export default function EmptyState({ title, text, action, className = "" }) {
  return (
    <div className={cx("rounded-card border border-dashed border-line-strong bg-surface px-6 py-14 text-center", className)}>
      {title && <p className="font-display text-xl font-semibold text-ink">{title}</p>}
      {text && <p className="mx-auto mt-2 max-w-md text-ink-muted">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// Bandeau d'erreur, d'avertissement, d'information ou de succès.
export function Alert({ tone = "danger", title, children, className = "" }) {
  const styles = {
    danger: "border-danger/20 bg-danger-soft text-danger",
    warning: "border-warning/20 bg-warning-soft text-warning",
    info: "border-info/20 bg-info-soft text-info",
    success: "border-success/20 bg-success-soft text-success",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("rounded-control border px-4 py-3 text-sm font-medium", styles[tone] || styles.danger, className)}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5 font-normal" : ""}>{children}</div>}
    </div>
  );
}
