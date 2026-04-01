// src/components/AdminModal.jsx
import React from "react";

export default function AdminModal({
  isAdmin,
  session,
  showAdminPanel,
  setShowAdminPanel,
  adminMsg,
  adminBusy,
  profiles,
  reassignFrom,
  setReassignFrom,
  reassignTo,
  setReassignTo,
  toggleUserActive,
  reassignClientsToUser,
  relanceConfig,
  updateRelanceCfgField,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  handleInviteUser,
  emailNotificationConfig,
  updateEmailNotificationField,
  saveAdminSettings,
}) {
  if (!showAdminPanel || !isAdmin) return null;

  const activeProfiles = profiles.filter((p) => p.is_active !== false);
  const inactiveProfiles = profiles.filter((p) => p.is_active === false);

  return (
    <div className="admin-modal-backdrop" onClick={() => setShowAdminPanel(false)}>
      <div className="admin-modal admin-modal-xl" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head">
          <div>
            <h2>Paramètres administrateur</h2>
            <p className="admin-modal-sub">
              Gère les invitations, les utilisateurs, les réaffectations, les délais de relance et les emails automatiques.
            </p>
          </div>

          <button className="btn-outline" type="button" onClick={() => setShowAdminPanel(false)}>
            Fermer
          </button>
        </div>

        {adminMsg && (
          <div className={"admin-alert " + (adminMsg.startsWith("Erreur") ? "admin-alert-error" : "admin-alert-success")}>
            {adminMsg}
          </div>
        )}

        <div className="admin-grid">
          <section className="admin-card">
            <div className="admin-card-title">Inviter un utilisateur</div>
            <div className="admin-card-sub">
              Accès sur invitation uniquement. L’inscription libre est désactivée.
            </div>

            <div className="admin-form-grid">
              <label>
                Email
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="utilisateur@exemple.com"
                />
              </label>

              <label>
                Rôle
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="user">Commercial</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>

            <div className="admin-actions-row">
              <button type="button" className="btn-primary" disabled={adminBusy} onClick={handleInviteUser}>
                Inviter l’utilisateur
              </button>
            </div>
          </section>

          <section className="admin-card">
            <div className="admin-card-title">Réaffecter des clients</div>
            <div className="admin-card-sub">
              Transfère le portefeuille d’un utilisateur vers un autre.
            </div>

            <div className="admin-form-grid">
              <label>
                De
                <select value={reassignFrom} onChange={(e) => setReassignFrom(e.target.value)}>
                  <option value="">—</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.email}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Vers
                <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                  <option value="">—</option>
                  {activeProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="admin-actions-row">
              <button type="button" className="btn-outline" disabled={adminBusy} onClick={reassignClientsToUser}>
                Réaffecter
              </button>
            </div>
          </section>

          <section className="admin-card admin-card-users">
            <div className="admin-card-title">Utilisateurs</div>
            <div className="admin-card-sub">
              Désactive un accès sans supprimer les données. Ton propre compte ne peut pas être désactivé.
            </div>

            <div className="admin-users-wrap">
              <div>
                <div className="admin-list-title">Actifs</div>
                <div className="admin-users-list">
                  {activeProfiles.map((p) => (
                    <div className="admin-user-row" key={p.id}>
                      <div className="admin-user-main">
                        <div className="admin-user-email">{p.email}</div>
                        <div className="admin-user-meta">
                          {p.role || "user"}
                          {p.id === session.user.id ? " • toi" : ""}
                        </div>
                      </div>

                      {p.id !== session.user.id ? (
                        <button
                          type="button"
                          className="btn-outline-small"
                          disabled={adminBusy}
                          onClick={() => toggleUserActive(p.id, false)}
                        >
                          Désactiver
                        </button>
                      ) : (
                        <span className="admin-chip admin-chip-neutral">Connecté</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="admin-list-title">Désactivés</div>
                <div className="admin-users-list">
                  {inactiveProfiles.length === 0 ? (
                    <div className="admin-empty">Aucun utilisateur désactivé.</div>
                  ) : (
                    inactiveProfiles.map((p) => (
                      <div className="admin-user-row" key={p.id}>
                        <div className="admin-user-main">
                          <div className="admin-user-email">{p.email}</div>
                          <div className="admin-user-meta">{p.role || "user"}</div>
                        </div>

                        <button
                          type="button"
                          className="btn-outline-small"
                          disabled={adminBusy}
                          onClick={() => toggleUserActive(p.id, true)}
                        >
                          Réactiver
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="admin-card admin-card-delays">
            <div className="admin-card-title">Délais de relance</div>
            <div className="admin-card-sub">
              1ère relance = délai après création. Relance par défaut = si l’utilisateur valide sans date.
            </div>

            <div className="admin-delay-grid">
              {["seller", "buyer", "after"].map((cat) => (
                <div key={cat} className="admin-delay-box">
                  <div className="admin-delay-title">
                    {cat === "seller" ? "Vendeur/Bailleur" : cat === "buyer" ? "Acquéreur" : "Après-vente"}
                  </div>

                  <label>
                    1ère relance (jours)
                    <input
                      type="number"
                      min="0"
                      value={relanceConfig?.[cat]?.initial_days ?? 15}
                      onChange={(e) => updateRelanceCfgField(cat, "initial_days", e.target.value)}
                    />
                  </label>

                  <label>
                    Relance par défaut (jours)
                    <input
                      type="number"
                      min="0"
                      value={relanceConfig?.[cat]?.default_next_days ?? 14}
                      onChange={(e) => updateRelanceCfgField(cat, "default_next_days", e.target.value)}
                    />
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-card admin-card-delays">
            <div className="admin-card-title">Emails automatiques</div>
            <div className="admin-card-sub">
              Réglez simplement les alertes email envoyées aux commerciaux.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
              <div className="dash-card" style={{ padding: 12 }}>
                <div className="dash-title" style={{ marginBottom: 10 }}>
                  Types d’emails
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!emailNotificationConfig?.tomorrow_enabled}
                    onChange={(e) => updateEmailNotificationField("tomorrow_enabled", e.target.checked)}
                  />
                  Email “relance prévue demain”
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!emailNotificationConfig?.late_enabled}
                    onChange={(e) => updateEmailNotificationField("late_enabled", e.target.checked)}
                  />
                  Email “relance en retard”
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem" }}>
                  <input
                    type="checkbox"
                    checked={!!emailNotificationConfig?.global_enabled}
                    onChange={(e) => updateEmailNotificationField("global_enabled", e.target.checked)}
                  />
                  Alerte globale
                </label>
              </div>

              <div className="dash-card" style={{ padding: 12 }}>
                <div className="dash-title" style={{ marginBottom: 10 }}>
                  Seuils
                </div>

                <label style={{ fontSize: "0.85rem", display: "block", marginBottom: 8 }}>
                  Retard individuel (jours)
                  <input
                    type="number"
                    min="1"
                    value={emailNotificationConfig?.late_days ?? 3}
                    onChange={(e) => updateEmailNotificationField("late_days", e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>

                <label style={{ fontSize: "0.85rem", display: "block", marginBottom: 8 }}>
                  Alerte globale à partir de (dossiers)
                  <input
                    type="number"
                    min="1"
                    value={emailNotificationConfig?.global_threshold ?? 3}
                    onChange={(e) => updateEmailNotificationField("global_threshold", e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>

                <label style={{ fontSize: "0.85rem", display: "block" }}>
                  Fréquence alerte globale (tous les X jours)
                  <input
                    type="number"
                    min="1"
                    value={emailNotificationConfig?.global_frequency_days ?? 1}
                    onChange={(e) => updateEmailNotificationField("global_frequency_days", e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        <div className="admin-actions-row" style={{ marginTop: 16 }}>
          <button className="btn-primary" type="button" onClick={saveAdminSettings} disabled={adminBusy}>
            Enregistrer les paramètres
          </button>
        </div>
      </div>
    </div>
  );
}