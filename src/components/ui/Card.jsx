import React from "react";
import { cx } from "./cx";

// Carte blanche à bordure fine. Avec un titre, devient une section titrée (actions à droite).
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
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

// Indicateur chiffré (tableau de bord, rémunération).
export function StatCard({ label, value, hint, tone = "neutral", className = "" }) {
  const accent =
    tone === "primary" ? "text-primary" : tone === "accent" ? "text-accent-hover" : tone === "success" ? "text-success" : "text-ink";
  return (
    <div className={cx("rounded-card border border-line bg-surface p-4 shadow-card", className)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={cx("tabular mt-1 font-display text-2xl font-bold", accent)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}
