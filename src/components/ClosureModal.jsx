// src/components/ClosureModal.jsx
import React from "react";
import { Alert, Button, Modal, cx } from "./ui";

export default function ClosureModal({
  closureClient,
  setClosureClient,
  reasonsForClient,
  closureReason,
  setClosureReason,
  handleConfirmClosure,
}) {
  // La vente avec nous passe par « Acte signé » ou la page Transactions ; ici, uniquement les autres motifs.
  const isUnderPromise = closureClient?.category === "seller" && closureClient?.deal_stage === "sous_promesse";
  const close = () => setClosureClient(null);

  return (
    <Modal
      open={!!closureClient}
      size="sm"
      title="Clôturer le dossier"
      description={[closureClient?.first_name, closureClient?.last_name].filter(Boolean).join(" ")}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Annuler
          </Button>
          <Button type="submit" form="closure-form">
            Clôturer
          </Button>
        </>
      }
    >
      {closureClient && (
        <form id="closure-form" onSubmit={handleConfirmClosure} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-ink-soft">Motif de clôture</legend>
            {reasonsForClient(closureClient).map((r) => {
              const checked = closureReason === r.value;
              return (
                <label
                  key={r.value}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-sm transition-colors",
                    checked ? "border-primary bg-primary-soft text-ink" : "border-line hover:bg-subtle"
                  )}
                >
                  <input
                    type="radio"
                    name="closure-reason"
                    className="size-4 accent-primary"
                    value={r.value}
                    checked={checked}
                    onChange={(e) => setClosureReason(e.target.value)}
                  />
                  {r.label}
                </label>
              );
            })}
          </fieldset>
          {isUnderPromise && (
            <Alert tone="info">
              Cette fiche est sous promesse : la promesse en cours sera annulée avec ce motif. Pour une vente avec nous,
              utilisez plutôt « Acte signé ».
            </Alert>
          )}
        </form>
      )}
    </Modal>
  );
}
