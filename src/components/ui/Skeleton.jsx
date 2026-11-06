import React from "react";
import { cx } from "./cx";

// Chargement : formes grises animées à la place du contenu (pas de « Chargement… » isolé).
export default function Skeleton({ className = "" }) {
  return <span aria-hidden="true" className={cx("block animate-pulse rounded-[6px] bg-line", className)} />;
}

export function SkeletonList({ rows = 5, label = "Chargement…" }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
