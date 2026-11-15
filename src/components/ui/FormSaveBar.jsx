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
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-bar">
        <div className="mx-auto flex h-17 max-w-page items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <p role="status" className={cx("min-w-0 truncate text-sm font-medium max-sm:sr-only", dirty ? "text-warning" : "text-ink-muted")}>
            {dirty ? "Modifications non enregistrées" : idleLabel}
          </p>
          {/* Téléphone : boutons sur toute la largeur, le principal à droite sous le pouce */}
          <div className="flex shrink-0 items-center gap-3 max-sm:flex-1 max-sm:justify-end">
            {secondary}
            <Button type="submit" form={formId} loading={loading} disabled={disabled} className="max-sm:flex-1">
              {label}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
