// src/components/ClosureModal.jsx
import React from "react";

export default function ClosureModal({
  closureClient,
  setClosureClient,
  reasonsForClient,
  closureReason,
  setClosureReason,
  handleConfirmClosure,
  afterSaleForm,
  handleAfterSaleFormChange,
}) {
  if (!closureClient) return null;

  const isSellerToAfter =
    closureClient.category === "seller" && closureReason === "vendu_avec_nous";

  const fieldStyle = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 10,
    fontSize: "0.95rem",
    background: "#fff",
    boxSizing: "border-box",
    marginTop: 6,
  };

  const labelStyle = {
    display: "block",
    fontSize: "0.88rem",
    fontWeight: 600,
    color: "#111827",
  };

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

          {isSellerToAfter && (
            <div
              style={{
                marginTop: 18,
                border: "1px solid #dbeafe",
                background: "#f8fbff",
                borderRadius: 16,
                padding: 18,
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>
                Informations acquéreur pour le suivi après-vente
              </h3>

              <p
                style={{
                  marginTop: 0,
                  marginBottom: 18,
                  fontSize: "0.9rem",
                  color: "#4b5563",
                  lineHeight: 1.45,
                }}
              >
                Le vendeur sera remplacé par l’acquéreur dans la fiche après-vente.
                Merci de renseigner les informations utiles du nouveau client.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                }}
              >
                <label style={labelStyle}>
                  Prénom
                  <input
                    type="text"
                    value={afterSaleForm.first_name}
                    onChange={(e) =>
                      handleAfterSaleFormChange("first_name", e.target.value)
                    }
                    style={fieldStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Nom *
                  <input
                    type="text"
                    value={afterSaleForm.last_name}
                    onChange={(e) =>
                      handleAfterSaleFormChange("last_name", e.target.value)
                    }
                    required={isSellerToAfter}
                    style={fieldStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Email
                  <input
                    type="email"
                    value={afterSaleForm.email}
                    onChange={(e) =>
                      handleAfterSaleFormChange("email", e.target.value)
                    }
                    style={fieldStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Téléphone *
                  <input
                    type="text"
                    value={afterSaleForm.phone}
                    onChange={(e) =>
                      handleAfterSaleFormChange("phone", e.target.value)
                    }
                    required={isSellerToAfter}
                    style={fieldStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Date encaissement / vente finale *
                  <input
                    type="date"
                    value={afterSaleForm.sale_date}
                    onChange={(e) =>
                      handleAfterSaleFormChange("sale_date", e.target.value)
                    }
                    required={isSellerToAfter}
                    style={fieldStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Commission TTC (€) *
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="ex : 18000"
                    value={afterSaleForm.commission_ttc}
                    onChange={(e) =>
                      handleAfterSaleFormChange("commission_ttc", e.target.value)
                    }
                    required={isSellerToAfter}
                    style={fieldStyle}
                  />
                </label>

                <label style={labelStyle}>
                  TVA (%) *
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={afterSaleForm.commission_vat_rate}
                    onChange={(e) =>
                      handleAfterSaleFormChange(
                        "commission_vat_rate",
                        e.target.value
                      )
                    }
                    required={isSellerToAfter}
                    style={fieldStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Date d’anniversaire
                  <input
                    type="date"
                    value={afterSaleForm.client_birthday}
                    onChange={(e) =>
                      handleAfterSaleFormChange("client_birthday", e.target.value)
                    }
                    style={fieldStyle}
                  />
                </label>

                <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
                  Origine du contact
                  <input
                    type="text"
                    value={afterSaleForm.contact_origin}
                    onChange={(e) =>
                      handleAfterSaleFormChange("contact_origin", e.target.value)
                    }
                    placeholder="ex : vitrine, appel entrant, recommandation, portail…"
                    style={fieldStyle}
                  />
                </label>

                <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
                  Ressenti consultant
                  <textarea
                    rows={3}
                    value={afterSaleForm.consultant_feeling}
                    onChange={(e) =>
                      handleAfterSaleFormChange(
                        "consultant_feeling",
                        e.target.value
                      )
                    }
                    placeholder="ton ressenti sur le client, sa réactivité, son profil, la suite à prévoir…"
                    style={{ ...fieldStyle, resize: "vertical", minHeight: 90 }}
                  />
                </label>

                <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
                  Contexte
                  <textarea
                    rows={3}
                    value={afterSaleForm.context}
                    onChange={(e) =>
                      handleAfterSaleFormChange("context", e.target.value)
                    }
                    placeholder="travaux prévus, emménagement, financement, éléments utiles pour le suivi…"
                    style={{ ...fieldStyle, resize: "vertical", minHeight: 90 }}
                  />
                </label>
              </div>

              <div
                style={{
                  marginTop: 14,
                  fontSize: "0.85rem",
                  color: "#4b5563",
                  lineHeight: 1.45,
                }}
              >
                La fiche passera en après-vente avec les informations de l’acquéreur,
                l’adresse du bien, l’historique existant et les données de vente.
              </div>
            </div>
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