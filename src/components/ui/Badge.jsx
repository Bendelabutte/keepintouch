import React from "react";
import { cx } from "./cx";

// Pastille fine avec contour. Tons de phase et de retard repris de l'ancienne version de Keepintouch.
const tones = {
  neutral: "border-line-strong bg-surface text-ink",
  muted: "border-line bg-canvas text-ink-muted",
  accent: "border-accent/20 bg-accent-soft text-accent",
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  danger: "border-danger/20 bg-danger-soft text-danger",
  info: "border-info/20 bg-info-soft text-info",
  premandat: "border-phase-premandat/20 bg-phase-premandat-soft text-phase-premandat",
  mandat: "border-phase-mandat/20 bg-phase-mandat-soft text-phase-mandat",
  promesse: "border-phase-promesse/20 bg-phase-promesse-soft text-phase-promesse",
  vendu: "border-phase-vendu/20 bg-phase-vendu-soft text-phase-vendu",
  clos: "border-line-strong bg-line text-ink-soft",
};

export default function Badge({ tone = "neutral", className = "", children, ...props }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tones[tone] || tones.neutral,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
