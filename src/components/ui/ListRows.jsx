import React from "react";
import { cx } from "./cx";

// Lignes d'une liste regroupées dans une seule carte, séparées par un filet (Bien EDL).
export default function ListRows({ children, busy = false, className = "" }) {
  return (
    <ul aria-busy={busy || undefined} className={cx("divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card", className)}>
      {children}
    </ul>
  );
}
