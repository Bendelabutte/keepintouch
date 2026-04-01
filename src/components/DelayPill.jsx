// src/components/DelayPill.jsx
import React from "react";

export default function DelayPill({ diffDays, delayLabel }) {
  if (diffDays == null || !delayLabel) return null;

  const style =
    diffDays < 0
      ? {
          padding: "2px 8px",
          borderRadius: 999,
          background: "#fef2f2",
          color: "#b91c1c",
          fontSize: "0.75rem",
          whiteSpace: "nowrap",
        }
      : {
          padding: "2px 8px",
          borderRadius: 999,
          background: "#eff6ff",
          color: "#1d4ed8",
          fontSize: "0.75rem",
          whiteSpace: "nowrap",
        };

  return <span style={style}>{delayLabel}</span>;
}