// src/components/ProfileModal.jsx
import React from "react";

export default function ProfileModal({
  showProfileModal,
  setShowProfileModal,
  profileForm,
  handleProfileFormChange,
  handleSaveMyProfile,
  passwordForm,
  handlePasswordFormChange,
  handleChangeMyPassword,
  profileMsg,
  profileBusy,
  currentProfile,
}) {
  if (!showProfileModal) return null;

  return (
    <div
      className="admin-modal-backdrop"
      onClick={() => setShowProfileModal(false)}
    >
      <div
        className="admin-modal profile-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-modal-head">
          <div>
            <h2>Mon profil</h2>
            <p className="admin-modal-sub">
              Modifie tes informations personnelles et ton mot de passe.
            </p>
          </div>

          <button
            type="button"
            className="btn-outline"
            onClick={() => setShowProfileModal(false)}
          >
            Fermer
          </button>
        </div>

        {profileMsg && (
          <div
            className={
              "admin-alert " +
              (profileMsg.startsWith("Erreur")
                ? "admin-alert-error"
                : "admin-alert-success")
            }
          >
            {profileMsg}
          </div>
        )}

        <div className="profile-modal-grid">
          <section className="admin-card">
            <div className="admin-card-title">Informations</div>
            <div className="admin-card-sub">
              Ces informations seront associées à ton compte.
            </div>

            <form
              className="auth-form"
              onSubmit={handleSaveMyProfile}
              style={{ marginTop: 0 }}
            >
              <div className="admin-form-grid">
                <label>
                  Prénom
                  <input
                    type="text"
                    value={profileForm.first_name}
                    onChange={(e) =>
                      handleProfileFormChange("first_name", e.target.value)
                    }
                  />
                </label>

                <label>
                  Nom
                  <input
                    type="text"
                    value={profileForm.last_name}
                    onChange={(e) =>
                      handleProfileFormChange("last_name", e.target.value)
                    }
                  />
                </label>

                <label>
                  Téléphone
                  <input
                    type="text"
                    value={profileForm.phone}
                    onChange={(e) =>
                      handleProfileFormChange("phone", e.target.value)
                    }
                  />
                </label>

                <label>
                  Email
                  <input
                    type="text"
                    value={currentProfile?.email || ""}
                    disabled
                    readOnly
                  />
                </label>

                <label>
                  Rôle
                  <input
                    type="text"
                    value={currentProfile?.role || ""}
                    disabled
                    readOnly
                  />
                </label>
              </div>

              <div className="admin-actions-row">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={profileBusy}
                >
                  {profileBusy ? "Enregistrement..." : "Enregistrer le profil"}
                </button>
              </div>
            </form>
          </section>

          <section className="admin-card">
            <div className="admin-card-title">Mot de passe</div>
            <div className="admin-card-sub">
              Choisis un nouveau mot de passe pour ton compte.
            </div>

            <form
              className="auth-form"
              onSubmit={handleChangeMyPassword}
              style={{ marginTop: 0 }}
            >
              <label>
                Nouveau mot de passe
                <input
                  type="password"
                  value={passwordForm.password}
                  onChange={(e) =>
                    handlePasswordFormChange("password", e.target.value)
                  }
                />
              </label>

              <label>
                Confirmer le mot de passe
                <input
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) =>
                    handlePasswordFormChange("confirm_password", e.target.value)
                  }
                />
              </label>

              <div className="admin-actions-row">
                <button
                  type="submit"
                  className="btn-outline"
                  disabled={profileBusy}
                >
                  {profileBusy ? "Enregistrement..." : "Changer le mot de passe"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}