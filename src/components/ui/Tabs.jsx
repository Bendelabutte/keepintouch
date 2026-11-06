import React from "react";
import { cx, focusRing } from "./cx";

/**
 * Onglets segmentés (filtres) : items = [{ key, label, count? }].
 * variant « pill » (fond gris, onglet actif blanc) ou « underline » (soulignement).
 */
export default function Tabs({ items, value, onChange, label, variant = "pill", className = "" }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx(
        variant === "pill"
          ? "inline-flex max-w-full gap-1 overflow-x-auto rounded-control bg-subtle p-1 ring-1 ring-inset ring-line"
          : "flex max-w-full gap-4 overflow-x-auto border-b border-line",
        className
      )}
    >
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
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold transition-colors duration-150",
              focusRing,
              variant === "pill"
                ? cx(
                    "min-h-8 rounded-[8px] px-3",
                    active ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink"
                  )
                : cx(
                    "-mb-px min-h-10 border-b-2 px-0.5",
                    active ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink"
                  )
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cx(
                  "tabular min-w-5 rounded-full px-1.5 text-center text-xs font-semibold",
                  active ? "bg-primary-soft text-primary" : "bg-surface/70 text-ink-muted"
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
