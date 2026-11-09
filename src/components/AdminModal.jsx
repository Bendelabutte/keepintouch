// src/components/AdminModal.jsx
import React from "react";
import { RELANCE_PROMESSE_DAYS } from "../lib/relance";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, Select } from "./ui";

const ROLE_LABELS = { admin: "Administrateur", manager: "Manager", user: "Commercial" };
const CATEGORY_TITLES = { seller: "Vendeur / bailleur", buyer: "Acquéreur", after: "Après-vente" };

function UserRow({ p, isMe, adminBusy, children }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate font-semibold text-ink">{p.email}</div>
        <div className="text-sm text-ink-muted">
          {ROLE_LABELS[p.role || "user"] || p.role}
          {isMe ? " · vous" : ""}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-busy={adminBusy || undefined}>
        {children}
      </div>
    </li>
  );
}

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
  onOpenCompensation,
}) {
  if (!isAdmin) return null;

  const activeProfiles = profiles.filter((p) => p.is_active !== false);
  const inactiveProfiles = profiles.filter((p) => p.is_active === false);
  const close = () => setShowAdminPanel(false);

  return (
    <Modal
      open={showAdminPanel}
      size="xl"
      busy={adminBusy}
      title="Paramètres administrateur"
      description="Invitations, utilisateurs, réaffectations, délais de relance et emails automatiques."
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={adminBusy}>
            Fermer
          </Button>
          <Button onClick={saveAdminSettings} loading={adminBusy}>
            Enregistrer les paramètres
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {adminMsg && <Alert tone={adminMsg.startsWith("Erreur") ? "danger" : "success"}>{adminMsg}</Alert>}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Inviter un utilisateur" description="Accès sur invitation uniquement. L’inscription libre est désactivée.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_11rem]">
              <Field label="Email">
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="utilisateur@exemple.com" />
              </Field>
              <Field label="Rôle">
                <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="user">Commercial</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleInviteUser} disabled={adminBusy}>
                Inviter l’utilisateur
              </Button>
            </div>
          </Card>

          <Card title="Réaffecter des clients" description="Transfère le portefeuille d’un utilisateur vers un autre.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="De">
                <Select value={reassignFrom} onChange={(e) => setReassignFrom(e.target.value)}>
                  <option value="">—</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Vers">
                <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                  <option value="">—</option>
                  {activeProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.email}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={reassignClientsToUser} disabled={adminBusy}>
                Réaffecter
              </Button>
            </div>
          </Card>
        </div>

        <Card
          title="Utilisateurs"
          description="Désactiver un accès ne supprime aucune donnée. Votre propre compte ne peut pas être désactivé."
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-muted">Actifs</h3>
              <ul className="divide-y divide-line rounded-control border border-line">
                {activeProfiles.map((p) => {
                  const isMe = p.id === session.user.id;
                  return (
                    <UserRow key={p.id} p={p} isMe={isMe} adminBusy={adminBusy}>
                      <Button variant="secondary" size="xs" disabled={adminBusy} onClick={() => onOpenCompensation(p)}>
                        Rémunération
                      </Button>
                      {isMe ? (
                        <Badge tone="muted">Connecté</Badge>
                      ) : (
                        <Button variant="danger" size="xs" disabled={adminBusy} onClick={() => toggleUserActive(p.id, false)}>
                          Désactiver
                        </Button>
                      )}
                    </UserRow>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-muted">Désactivés</h3>
              {inactiveProfiles.length === 0 ? (
                <p className="rounded-control border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">
                  Aucun utilisateur désactivé.
                </p>
              ) : (
                <ul className="divide-y divide-line rounded-control border border-line">
                  {inactiveProfiles.map((p) => (
                    <UserRow key={p.id} p={p} adminBusy={adminBusy}>
                      <Button variant="secondary" size="xs" disabled={adminBusy} onClick={() => toggleUserActive(p.id, true)}>
                        Réactiver
                      </Button>
                    </UserRow>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>

        <Card
          title="Délais de relance"
          description="1re relance = délai après création. Relance par défaut = si l’utilisateur valide sans date."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {["seller", "buyer", "after"].map((cat) => (
              <div key={cat} className="space-y-3 rounded-control border border-line p-4">
                <h3 className="text-sm font-semibold text-ink">{CATEGORY_TITLES[cat]}</h3>
                <Field label="1re relance (jours)">
                  <Input
                    type="number"
                    min="0"
                    value={relanceConfig?.[cat]?.initial_days ?? 15}
                    onChange={(e) => updateRelanceCfgField(cat, "initial_days", e.target.value)}
                  />
                </Field>
                <Field label="Relance par défaut (jours)">
                  <Input
                    type="number"
                    min="0"
                    value={relanceConfig?.[cat]?.default_next_days ?? 14}
                    onChange={(e) => updateRelanceCfgField(cat, "default_next_days", e.target.value)}
                  />
                </Field>
              </div>
            ))}
            <div className="space-y-3 rounded-control border border-line p-4">
              <h3 className="text-sm font-semibold text-ink">Vendeur sous promesse</h3>
              <Field label="Relance (jours)" hint="Après la date de promesse, puis entre deux relances jusqu’à l’acte.">
                <Input
                  type="number"
                  min="0"
                  value={relanceConfig?.promise?.default_next_days ?? RELANCE_PROMESSE_DAYS}
                  onChange={(e) => updateRelanceCfgField("promise", "default_next_days", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Emails automatiques" description="Alertes email envoyées aux commerciaux.">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink-muted">Types d’emails</h3>
              <Checkbox
                label="Email « relance prévue demain »"
                checked={!!emailNotificationConfig?.tomorrow_enabled}
                onChange={(e) => updateEmailNotificationField("tomorrow_enabled", e.target.checked)}
              />
              <Checkbox
                label="Email « relance en retard »"
                checked={!!emailNotificationConfig?.late_enabled}
                onChange={(e) => updateEmailNotificationField("late_enabled", e.target.checked)}
              />
              <Checkbox
                label="Alerte globale"
                checked={!!emailNotificationConfig?.global_enabled}
                onChange={(e) => updateEmailNotificationField("global_enabled", e.target.checked)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-1">
              <Field label="Retard individuel (jours)">
                <Input
                  type="number"
                  min="1"
                  value={emailNotificationConfig?.late_days ?? 3}
                  onChange={(e) => updateEmailNotificationField("late_days", e.target.value)}
                />
              </Field>
              <Field label="Alerte globale à partir de (dossiers)">
                <Input
                  type="number"
                  min="1"
                  value={emailNotificationConfig?.global_threshold ?? 3}
                  onChange={(e) => updateEmailNotificationField("global_threshold", e.target.value)}
                />
              </Field>
              <Field label="Fréquence de l’alerte globale (jours)">
                <Input
                  type="number"
                  min="1"
                  value={emailNotificationConfig?.global_frequency_days ?? 1}
                  onChange={(e) => updateEmailNotificationField("global_frequency_days", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </Card>
      </div>
    </Modal>
  );
}
