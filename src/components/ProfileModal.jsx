// src/components/ProfileModal.jsx
import React from "react";
import { formatPhoneInput } from "../lib/contact";
import { Alert, Button, Field, Input, Modal } from "./ui";

const ROLE_LABELS = { admin: "Administrateur", manager: "Manager", user: "Commercial" };

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
  const close = () => setShowProfileModal(false);
  const set = (field, format = (v) => v) => (e) => handleProfileFormChange(field, format(e.target.value));

  return (
    <Modal
      open={showProfileModal}
      size="lg"
      busy={profileBusy}
      title="Mon profil"
      description="Vos informations personnelles et votre mot de passe."
      onClose={close}
    >
      <div className="space-y-6">
        {profileMsg && <Alert tone={profileMsg.startsWith("Erreur") ? "danger" : "success"}>{profileMsg}</Alert>}

        <form onSubmit={handleSaveMyProfile} className="space-y-4">
          <h3 className="text-base font-semibold text-ink">Informations</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Prénom">
              <Input value={profileForm.first_name} onChange={set("first_name")} />
            </Field>
            <Field label="Nom">
              <Input value={profileForm.last_name} onChange={set("last_name")} />
            </Field>
            <Field label="Téléphone">
              <Input type="tel" inputMode="tel" value={profileForm.phone} onChange={set("phone", formatPhoneInput)} />
            </Field>
            <Field label="Email" hint="Modifiable par un administrateur uniquement.">
              <Input value={currentProfile?.email || ""} disabled readOnly />
            </Field>
            <Field label="Rôle">
              <Input value={ROLE_LABELS[currentProfile?.role] || currentProfile?.role || ""} disabled readOnly />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={profileBusy}>
              Enregistrer le profil
            </Button>
          </div>
        </form>

        <form onSubmit={handleChangeMyPassword} className="space-y-4 border-t border-line pt-6">
          <h3 className="text-base font-semibold text-ink">Mot de passe</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nouveau mot de passe">
              <Input
                type="password"
                autoComplete="new-password"
                value={passwordForm.password}
                onChange={(e) => handlePasswordFormChange("password", e.target.value)}
              />
            </Field>
            <Field label="Confirmer le mot de passe">
              <Input
                type="password"
                autoComplete="new-password"
                value={passwordForm.confirm_password}
                onChange={(e) => handlePasswordFormChange("confirm_password", e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" loading={profileBusy}>
              Changer le mot de passe
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
