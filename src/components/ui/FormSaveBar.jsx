import React from "react";
import Button from "./Button";
import { cx } from "./cx";

/**
 * Barre « Enregistrer » fixée en bas de la fenêtre (Bien EDL), avec un espace réservé de même
 * hauteur en fin de page pour qu'elle ne masque jamais la dernière section.
 * formId : le <form> soumis par le bouton (la barre est rendue hors du formulaire).
 */
export default function FormSaveBar({ formId, label = "Enregistrer", dirty, loading, disabled, idleLabel = "Aucune modification", secondary }) {
  return (
    <>
      <div aria-hidden="true" className="h-[calc(4.25rem+1px+env(safe-area-inset-bottom))]" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-bar">
        <div className="mx-auto flex h-17 max-w-page items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <p role="status" className={cx("min-w-0 truncate text-sm font-medium", dirty ? "text-warning" : "text-ink-muted")}>
            {dirty ? "Modifications non enregistrées" : idleLabel}
          </p>
          <div className="flex shrink-0 items-center gap-3">
            {secondary}
            <Button type="submit" form={formId} loading={loading} disabled={disabled}>
              {label}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
