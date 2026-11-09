import React, { useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { cx } from "./cx";
import Icon from "./Icon";

/**
 * Menu déroulant accessible (« menu button ») : Entrée, Espace ou flèche bas l'ouvrent, flèches et
 * Début/Fin naviguent, Échap ferme et rend le focus, clic extérieur ou changement de page ferment.
 * items = [{ key, label, description?, icon?, to? | onSelect?, tone? }]
 */
export default function Dropdown({ trigger, triggerClassName, triggerLabel, items, align = "left", placement = "bottom", className = "" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const focusItem = (i) => {
    const n = items.length;
    itemRefs.current[((i % n) + n) % n]?.focus();
  };
  const openAt = (i) => {
    setOpen(true);
    requestAnimationFrame(() => focusItem(i));
  };
  const close = (returnFocus) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };
  const select = (item) => {
    setOpen(false);
    if (item.to) navigate(item.to);
    else item.onSelect?.();
  };

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (["ArrowDown", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            openAt(0);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            openAt(items.length - 1);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          onKeyDown={(e) => {
            const current = itemRefs.current.findIndex((el) => el === document.activeElement);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              focusItem(current + 1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              focusItem(current - 1);
            } else if (e.key === "Home") {
              e.preventDefault();
              focusItem(0);
            } else if (e.key === "End") {
              e.preventDefault();
              focusItem(items.length - 1);
            } else if (e.key === "Escape") {
              e.preventDefault();
              close(true);
            } else if (e.key === "Tab") {
              setOpen(false);
            }
          }}
          className={cx(
            "absolute z-40 min-w-56 rounded-card border border-line bg-surface p-1.5 shadow-lg",
            placement === "top" ? "bottom-full mb-2" : "top-full mt-1.5",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item, i) => (
            <button
              key={item.key || item.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => select(item)}
              className={cx(
                "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition",
                "hover:bg-canvas focus-visible:bg-accent-soft focus-visible:text-accent",
                item.tone === "danger" ? "text-danger" : "text-ink"
              )}
            >
              {item.icon && <Icon name={item.icon} className="text-ink-muted" />}
              <span className="min-w-0">
                <span className="block font-semibold">{item.label}</span>
                {item.description && <span className="block text-sm font-normal text-ink-muted">{item.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

