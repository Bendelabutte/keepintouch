import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cx, focusRing } from "./cx";
import Icon from "./Icon";

const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" };

/**
 * Fenêtre modale : rendue dans <body>, Échap et clic sur le fond ferment (sauf pendant un
 * enregistrement), focus placé dans la fenêtre puis rendu à l'élément d'origine, défilement de la
 * page bloqué. Le contenu n'est monté que lorsque la fenêtre est ouverte.
 * footer : actions alignées à droite, séparées du contenu par un filet.
 */
export default function Modal({ open, title, description, size = "md", busy = false, onClose, footer, children }) {
  const panelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const first = panel?.querySelector(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-close])"
    );
    (first || panel)?.focus();

    const onKey = (e) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose?.();
      }
      if (e.key === "Tab" && panel) {
        const items = [...panel.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
        if (!items.length) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous && typeof previous.focus === "function") previous.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-card border border-line bg-surface text-ink shadow-pop outline-none sm:rounded-card",
          "animate-[kit-fade-in_150ms_ease-out]",
          widths[size] || widths.md
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-ink">
              {title}
            </h2>
            {description && <div className="mt-1 text-sm text-ink-muted">{description}</div>}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
            className={cx(
              "-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-50",
              focusRing
            )}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-subtle/60 px-5 py-3 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
