import React, { useId, useState } from "react";
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

// Bulle d'aide (i) : s'ouvre au clic ou au clavier, se ferme au clic suivant, à Échap ou à la perte du focus.
export function InfoTip({ label = "Aide", children, className = "" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cx("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line-strong text-xs font-semibold text-ink-muted transition hover:border-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        i
      </button>
      <span
        id={id}
        role="note"
        hidden={!open}
        className="absolute top-7 left-0 z-20 w-72 max-w-[calc(100vw-4rem)] rounded-control border border-line bg-surface p-3 text-sm leading-relaxed font-normal text-ink-soft shadow-lg"
      >
        {children}
      </span>
    </span>
  );
}

// Indicateur chiffré (tableau de bord, rémunération). help : texte de la bulle d'aide (i) à côté du libellé.
export function StatCard({ label, value, hint, sub, help, tone = "neutral", className = "" }) {
  const color =
    { danger: "text-danger", success: "text-success", accent: "text-accent", advance: "text-advance" }[tone] || "text-ink";
  return (
    <div className={cx("rounded-card border border-line bg-surface p-5 shadow-card", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
        {label}
        {help && <InfoTip label={`Aide : ${label}`}>{help}</InfoTip>}
      </div>
      <div className={cx("tabular mt-2 font-display text-3xl font-semibold tracking-tight", color)}>{value}</div>
      {hint && <div className="mt-1 text-sm text-ink-soft">{hint}</div>}
      {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}
