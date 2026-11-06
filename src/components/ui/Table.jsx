import React from "react";
import { cx } from "./cx";

// Tableau lisible : en-tête discret, lignes séparées, survol léger, défilement horizontal contenu
// dans la carte (jamais dans la page).
export default function Table({ className = "", children }) {
  return (
    <div className={cx("overflow-x-auto rounded-card border border-line bg-surface shadow-card", className)}>
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className = "", align = "left", children, ...props }) {
  return (
    <th
      scope="col"
      className={cx(
        "whitespace-nowrap border-b border-line bg-subtle/70 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted",
        align === "right" && "text-right",
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ className = "", align = "left", children, ...props }) {
  return (
    <td
      className={cx("border-b border-line px-3 py-2.5 align-top text-ink", align === "right" && "text-right", className)}
      {...props}
    >
      {children}
    </td>
  );
}

export function Tr({ className = "", onClick, children, ...props }) {
  return (
    <tr
      onClick={onClick}
      className={cx("transition-colors last:[&>td]:border-b-0", onClick && "cursor-pointer hover:bg-primary-soft/40", className)}
      {...props}
    >
      {children}
    </tr>
  );
}
