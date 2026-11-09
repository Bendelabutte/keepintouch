import React from "react";
import { cx } from "./cx";

// Carte blanche, filet fin, rayon 16 px. Avec un titre, devient une section titrée.
export default function Card({
  title,
  description,
  actions,
  as = "section",
  padding = "md",
  className = "",
  bodyClassName = "",
  children,
  ...props
}) {
  const Tag = as;
  const pad = padding === "none" ? "" : padding === "sm" ? "p-4" : "p-5 sm:p-6";
  return (
    <Tag className={cx("rounded-card border border-line bg-surface shadow-card", pad, className)} {...props}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

// Indicateur chiffré (tableau de bord, rémunération).
export function StatCard({ label, value, hint, sub, tone = "neutral", className = "" }) {
  const color = { danger: "text-danger", success: "text-success", accent: "text-accent" }[tone] || "text-ink";
  return (
    <div className={cx("rounded-card border border-line bg-surface p-5 shadow-card", className)}>
      <div className="text-sm font-semibold text-ink-muted">{label}</div>
      <div className={cx("tabular mt-2 font-display text-3xl font-semibold tracking-tight", color)}>{value}</div>
      {hint && <div className="mt-1 text-sm text-ink-soft">{hint}</div>}
      {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}
