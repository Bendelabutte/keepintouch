// src/components/ClientModal.jsx
import React from "react";

export default function ClientModal({
  showAddModal,
  setShowAddModal,
  editingClientId,
  setEditingClientId,
  newClient,
  handleNewClientChange,
  handleSaveClient,
}) {
  if (!showAddModal) return null;

  return (
    <div
      className="admin-modal-backdrop client-modal-backdrop"
      onClick={() => {
        setShowAddModal(false);
        setEditingClientId(null);
      }}
    >
      <div
        className="admin-modal client-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="client-modal-head">
          <h2>{editingClientId ? "Modifier le client" : "Nouveau client"}</h2>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setShowAddModal(false);
              setEditingClientId(null);
            }}
          >
            Fermer
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSaveClient}>
          <div className="client-form-grid">
            <label>
              Type de client
              <select
                value={newClient.category}
                onChange={(e) => handleNewClientChange("category", e.target.value)}
              >
                <option value="seller">Vendeur / Bailleur</option>
                <option value="buyer">Acquéreur</option>
                <option value="after">Après-vente</option>
              </select>
            </label>

            <label>
              Origine
              <input
                type="text"
                value={newClient.contact_origin}
                onChange={(e) => handleNewClientChange("contact_origin", e.target.value)}
              />
            </label>

            <label>
              Prénom
              <input
                type="text"
                value={newClient.first_name}
                onChange={(e) => handleNewClientChange("first_name", e.target.value)}
              />
            </label>

            <label>
              Nom *
              <input
                type="text"
                value={newClient.last_name}
                onChange={(e) => handleNewClientChange("last_name", e.target.value)}
                required
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={newClient.email}
                onChange={(e) => handleNewClientChange("email", e.target.value)}
              />
            </label>

            <label>
              Téléphone *
              <input
                type="text"
                value={newClient.phone}
                onChange={(e) => handleNewClientChange("phone", e.target.value)}
                required
              />
            </label>

            {newClient.category === "seller" && (
              <label>
                Vendeur / Bailleur
                <select
                  value={newClient.seller_kind}
                  onChange={(e) => handleNewClientChange("seller_kind", e.target.value)}
                >
                  <option>Vendeur</option>
                  <option>Bailleur</option>
                </select>
              </label>
            )}

            {newClient.category === "seller" && (
              <label>
                Phase
                <select
                  value={newClient.deal_stage || "pre_mandat"}
                  onChange={(e) => handleNewClientChange("deal_stage", e.target.value)}
                >
                  <option value="pre_mandat">Pré-mandat</option>
                  <option value="mandat">Sous mandat</option>
                </select>
              </label>
            )}

            {newClient.category === "seller" && (
              <label>
                Date remise estimation
                <input
                  type="date"
                  value={newClient.estimation_date}
                  onChange={(e) => handleNewClientChange("estimation_date", e.target.value)}
                />
              </label>
            )}

            {newClient.category === "buyer" && (
              <label>
                Date enregistrement
                <input
                  type="date"
                  value={newClient.acquisition_date}
                  onChange={(e) => handleNewClientChange("acquisition_date", e.target.value)}
                />
              </label>
            )}

            {newClient.category === "after" && (
              <label>
                Date de vente
                <input
                  type="date"
                  value={newClient.created_at}
                  onChange={(e) => handleNewClientChange("created_at", e.target.value)}
                />
              </label>
            )}

            <label>
              Première relance (facultatif)
              <input
                type="date"
                value={newClient.manual_next_due_date}
                onChange={(e) => handleNewClientChange("manual_next_due_date", e.target.value)}
              />
            </label>

            {newClient.category !== "buyer" && (
              <label className="client-form-span-2">
                {newClient.category === "after" ? "Adresse (après-vente)" : "Adresse du bien *"}
                <input
                  type="text"
                  value={newClient.category === "after" ? newClient.after_address : newClient.property_address}
                  onChange={(e) => {
                    if (newClient.category === "after") {
                      handleNewClientChange("after_address", e.target.value);
                    } else {
                      handleNewClientChange("property_address", e.target.value);
                    }
                  }}
                />
              </label>
            )}

            {newClient.category === "seller" && (
              <label className="client-form-span-2">
                Raison de la vente / mise en location
                <input
                  type="text"
                  value={newClient.sale_reason}
                  onChange={(e) => handleNewClientChange("sale_reason", e.target.value)}
                  placeholder="ex : mutation, divorce, succession, investissement…"
                />
              </label>
            )}

            {newClient.category === "buyer" && (
              <>
                <label>
                  Secteur recherché
                  <input
                    type="text"
                    value={newClient.area}
                    onChange={(e) => handleNewClientChange("area", e.target.value)}
                  />
                </label>

                <label>
                  Budget max
                  <input
                    type="text"
                    value={newClient.budget_max}
                    onChange={(e) => handleNewClientChange("budget_max", e.target.value)}
                  />
                </label>

                <label>
                  Surface min (m²)
                  <input
                    type="text"
                    value={newClient.min_surface}
                    onChange={(e) => handleNewClientChange("min_surface", e.target.value)}
                  />
                </label>

                <label>
                  Chambres
                  <input
                    type="text"
                    value={newClient.bedrooms}
                    onChange={(e) => handleNewClientChange("bedrooms", e.target.value)}
                  />
                </label>

                <label className="client-form-span-2 client-checkbox-row">
                  <input
                    type="checkbox"
                    checked={!!newClient.also_owner}
                    onChange={(e) => handleNewClientChange("also_owner", e.target.checked)}
                  />
                  Acquéreur propriétaire (potentiel vendeur)
                </label>
              </>
            )}

            {newClient.category === "after" && (
              <>
                <label>
                  Anniversaire client
                  <input
                    type="date"
                    value={newClient.client_birthday}
                    onChange={(e) => handleNewClientChange("client_birthday", e.target.value)}
                  />
                </label>

                <label className="client-form-span-2">
                  Contexte
                  <textarea
                    rows={2}
                    value={newClient.context}
                    onChange={(e) => handleNewClientChange("context", e.target.value)}
                  />
                </label>
              </>
            )}

            {newClient.category !== "after" && (
              <label className="client-form-span-2">
                Horizon du projet
                <select
                  value={newClient.project_horizon}
                  onChange={(e) => handleNewClientChange("project_horizon", e.target.value)}
                >
                  <option>Court terme</option>
                  <option>Moyen terme</option>
                  <option>Long terme</option>
                  <option>Estimation sans projet</option>
                </select>
              </label>
            )}

            <label className="client-form-span-2">
              Ressenti / commentaire
              <textarea
                rows={2}
                value={newClient.consultant_feeling}
                onChange={(e) => handleNewClientChange("consultant_feeling", e.target.value)}
              />
            </label>
          </div>

          <div className="client-modal-actions">
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setShowAddModal(false);
                setEditingClientId(null);
              }}
            >
              Annuler
            </button>
            <button type="submit" className="btn-primary">
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}