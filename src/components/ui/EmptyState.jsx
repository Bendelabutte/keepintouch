import React from "react";
import { cx } from "./cx";
import Icon from "./Icon";

// État vide : icône, phrase courte, action éventuelle.
export default function EmptyState({ icon = "clipboard", title, text, action, className = "" }) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center",
        className
      )}
    >
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name={icon} size={22} />
      </span>
      {title && <p className="font-display text-base font-bold text-ink">{title}</p>}
      {text && <p className="mt-1 max-w-md text-sm text-ink-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Message d'erreur ou d'information encadré.
export function Alert({ tone = "danger", title, children, className = "" }) {
  const styles = {
    danger: "border-danger/25 bg-danger-soft text-danger",
    warning: "border-warning/25 bg-warning-soft text-warning",
    info: "border-info/25 bg-info-soft text-info",
    success: "border-success/25 bg-success-soft text-success",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-2.5 rounded-control border px-3.5 py-2.5 text-sm", styles[tone], className)}>
      <Icon name={tone === "success" ? "check" : tone === "info" ? "info" : "alert"} className="mt-0.5" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
    </div>
  );
}
