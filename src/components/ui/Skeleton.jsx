import React from "react";
import { cx } from "./cx";

export default function Skeleton({ className = "" }) {
  return <span aria-hidden="true" className={cx("block animate-pulse rounded bg-line", className)} />;
}

// Lignes squelettes dans une seule carte (Bien EDL).
export function SkeletonList({ rows = 6, label = "Chargement…" }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 px-4 py-4 sm:px-6">
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-line" />
            <div className="h-3 w-1/4 rounded bg-line/70" />
          </div>
          <div className="hidden h-3 w-1/5 rounded bg-line/70 md:block" />
          <div className="hidden h-3 w-1/6 rounded bg-line/70 md:block" />
        </div>
      ))}
    </div>
  );
}
