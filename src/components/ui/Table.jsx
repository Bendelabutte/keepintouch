import React from "react";
import { cx } from "./cx";

// Tableau dans une carte : en-tête discret, lignes séparées, survol léger.
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
        "border-b border-line bg-subtle px-4 py-3 text-sm font-semibold whitespace-nowrap text-ink-muted",
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
    <td className={cx("border-b border-line px-4 py-3 align-top text-ink", align === "right" && "text-right", className)} {...props}>
      {children}
    </td>
  );
}

export function Tr({ className = "", onClick, children, ...props }) {
  return (
    <tr
      onClick={onClick}
      className={cx("transition [&:last-child>td]:border-b-0", onClick && "cursor-pointer hover:bg-canvas/60", className)}
      {...props}
    >
      {children}
    </tr>
  );
}
