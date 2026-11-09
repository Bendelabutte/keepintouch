import React from "react";
import { cx, focusRing } from "./cx";

/**
 * Filtres en boutons : inactifs blancs à contour, actif plein de la couleur principale. items = [{ key, label, count? }].
 */
export default function Tabs({ items, value, onChange, label, className = "" }) {
  return (
    <div role="tablist" aria-label={label} className={cx("flex max-w-full flex-wrap items-center gap-2", className)}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cx(
              "inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-control border px-3.5 text-sm font-semibold transition",
              focusRing,
              active
                ? "border-primary bg-primary text-white shadow-card"
                : "border-line-strong bg-surface text-ink-soft hover:border-ink-muted hover:text-ink"
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cx(
                  "tabular min-w-6 rounded-full px-1.5 text-center text-xs font-semibold",
                  active ? "bg-white/20 text-white" : "bg-canvas text-ink-soft"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
