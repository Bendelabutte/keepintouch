import React from "react";
import { cx } from "./cx";

const tones = {
  neutral: "bg-subtle text-ink-soft ring-line",
  primary: "bg-primary-soft text-primary ring-primary-line",
  accent: "bg-accent-soft text-accent-hover ring-accent/25",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
  muted: "bg-surface text-ink-muted ring-line-strong",
};

// Pastille d'état : toujours un libellé lisible (la couleur n'est jamais seule porteuse du sens).
export default function Badge({ tone = "neutral", icon = null, className = "", children, ...props }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
        tones[tone] || tones.neutral,
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
