// src/components/ClosureModal.jsx
import React from "react";

export default function ClosureModal({
  closureClient,
  setClosureClient,
  reasonsForClient,
  closureReason,
  setClosureReason,
  handleConfirmClosure,
}) {
  if (!closureClient) return null;

  // La vente avec nous passe par « Acte signé » ou la page Transactions ; ici, uniquement les autres motifs.
  const isUnderPromise = closureClient.category === "seller" && closureClient.deal_stage === "sous_promesse";


  return (
    <div className="admin-modal-backdrop" onClick={() => setClosureClient(null)}>
      <div
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 760, width: "95%" }}
      >
        <h2>Clôturer le client</h2>
        <p style={{ marginBottom: 16 }}>
          {closureClient.first_name} {closureClient.last_name}
        </p>

        <form onSubmit={handleConfirmClosure}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              background: "#f9fafb",
            }}
          >
            {reasonsForClient(closureClient).map((r) => (
              <label
                key={r.value}
                style={{
                  fontSize: "0.95rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  value={r.value}
                  checked={closureReason === r.value}
                  onChange={(e) => setClosureReason(e.target.value)}
                />
                {r.label}
              </label>
            ))}
          </div>

          {isUnderPromise && (
            <p style={{ marginTop: 14, fontSize: "0.9rem", color: "#4b5563", lineHeight: 1.45 }}>
              Cette fiche est sous promesse : la promesse en cours sera annulée avec ce motif.
              Pour une vente avec nous, utilisez plutôt « Acte signé » sur la fiche.
            </p>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 18,
            }}
          >
            <button
              type="button"
              className="btn-outline"
              onClick={() => setClosureClient(null)}
            >
              Annuler
            </button>
            <button type="submit" className="btn-primary">
              Confirmer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}