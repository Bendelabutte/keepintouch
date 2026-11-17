// src/components/AgenciesSection.jsx
// Paramètres administrateur → Agences : liste, création, modification, archivage, membres.
// Encadré distinct : chaque agence s'enregistre avec son propre bouton, pas avec « Enregistrer les
// paramètres ». onDirtyChange signale une agence en cours de saisie non enregistrée.
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { EMPTY_AGENCY, REVIEW_URL_HINT, agencyErrors, agencyPayload, profileName, searchProfiles } from "../lib/agencies";
import { formatPhone, formatPhoneInput } from "../lib/contact";
import { Alert, Badge, Button, Card, Field, Icon, Input } from "./ui";

const sameValues = (a, b) => Object.keys(EMPTY_AGENCY).every((k) => String(a[k] ?? "").trim() === String(b[k] ?? "").trim());

function AgencyForm({ initial, creating, busy, onCancel, onSubmit, onDirtyChange }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});

  const dirty = !sameValues(values, initial);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // Formulaire fermé (enregistré ou annulé) : plus rien en attente
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const set = (key) => (e) => {
    const v = key === "phone" ? formatPhoneInput(e.target.value) : e.target.value;
    setValues((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const submit = (e) => {
    e.preventDefault();
    const found = agencyErrors(values);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(values);
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-control border border-line bg-subtle p-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nom de l’agence" required error={errors.name}>
          <Input value={values.name} onChange={set("name")} placeholder="Ramey" autoComplete="off" />
        </Field>
        <Field label="Téléphone">
          <Input type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} placeholder="01 42 00 00 00" />
        </Field>
      </div>
      <Field label="Adresse">
        <Input value={values.address} onChange={set("address")} placeholder="18 rue Ramey, 75018 Paris" />
      </Field>
      <Field label="Lien d’avis Google" hint={REVIEW_URL_HINT} error={errors.google_review_url}>
        <Input
          type="url"
          inputMode="url"
          value={values.google_review_url}
          onChange={set("google_review_url")}
          placeholder="https://g.page/r/…/review"
          autoComplete="off"
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
        <Button type="submit" size="sm" loading={busy}>
          {creating ? "Créer l’agence" : "Enregistrer l’agence"}
        </Button>
      </div>
    </form>
  );
}

function MembersPanel({ agency, members, profiles, busy, onAdd, onRemove }) {
  const [query, setQuery] = useState("");
  const memberIds = members.filter((m) => m.agency_id === agency.id).map((m) => m.user_id);
  const current = profiles
    .filter((p) => memberIds.includes(p.id))
    .sort((a, b) => profileName(a).localeCompare(profileName(b), "fr"));
  const results = searchProfiles(profiles, query, memberIds);

  return (
    <div className="space-y-3 rounded-control border border-line bg-subtle p-4">
      <h4 className="text-sm font-semibold text-ink">Membres de {agency.name}</h4>
      {current.length === 0 ? (
        <p className="text-sm text-ink-muted">Aucun membre pour l’instant.</p>
      ) : (
        <ul className="divide-y divide-line rounded-control border border-line bg-surface">
          {current.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{profileName(p)}</span>
                {p.is_active === false && <span className="text-xs text-ink-muted">Compte désactivé</span>}
              </span>
              <Button variant="quiet" size="xs" disabled={busy} onClick={() => onRemove(agency.id, p.id)}>
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Field label="Ajouter un membre">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par nom ou email"
          autoComplete="off"
        />
      </Field>
      {query.trim() && (
        results.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun utilisateur actif ne correspond.</p>
        ) : (
          <ul className="divide-y divide-line rounded-control border border-line bg-surface">
            {results.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{profileName(p)}</span>
                  <span className="block truncate text-xs text-ink-muted">{p.email}</span>
                </span>
                <Button
                  variant="secondary"
                  size="xs"
                  icon="plus"
                  disabled={busy}
                  onClick={async () => {
                    if (await onAdd(agency.id, p.id)) setQuery("");
                  }}
                >
                  Ajouter
                </Button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

export default function AgenciesSection({ agencies, members, profiles, onChanged, onDirtyChange }) {
  // panel : null | { kind: "create" } | { kind: "edit", id } | { kind: "members", id }
  const [panel, setPanel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const sorted = agencies.slice().sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const active = sorted.filter((a) => !a.archived_at);
  const archived = sorted.filter((a) => a.archived_at);
  const shown = showArchived ? [...active, ...archived] : active;
  const memberCount = (id) => members.filter((m) => m.agency_id === id).length;

  const run = async (action, success) => {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await action();
      if (error) throw error;
      await onChanged();
      if (success) setMsg({ tone: "success", text: success });
      return true;
    } catch (err) {
      console.error("Agences", err);
      setMsg({ tone: "danger", text: `Erreur : ${err.message || "enregistrement impossible."}` });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (values) => {
    const payload = agencyPayload(values);
    const ok =
      panel?.kind === "edit"
        ? await run(() => supabase.from("agencies").update(payload).eq("id", panel.id), "Agence modifiée.")
        : await run(() => supabase.from("agencies").insert(payload), "Agence créée.");
    if (ok) setPanel(null);
  };

  const setArchived = (agency, archive) =>
    run(
      () => supabase.from("agencies").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", agency.id),
      archive ? `${agency.name} archivée.` : `${agency.name} désarchivée.`
    );

  const addMember = (agencyId, userId) => run(() => supabase.from("agency_members").insert({ agency_id: agencyId, user_id: userId }));
  const removeMember = (agencyId, userId) =>
    run(() => supabase.from("agency_members").delete().eq("agency_id", agencyId).eq("user_id", userId));

  const toFormValues = (a) => ({
    ...EMPTY_AGENCY,
    name: a.name || "",
    google_review_url: a.google_review_url || "",
    address: a.address || "",
    phone: formatPhone(a.phone || ""),
  });

  return (
    <Card
      title="Agences"
      className="!border-accent/30 !bg-accent-soft/40"
      description={
        <>
          <strong className="text-ink">Les agences s’enregistrent individuellement</strong>, avec leur propre bouton. Nom, lien
          d’avis Google et coordonnées sont repris dans les messages de remerciement ; un utilisateur peut appartenir à plusieurs
          agences.
        </>
      }
      actions={
        panel?.kind !== "create" && (
          <Button size="sm" icon="plus" onClick={() => setPanel({ kind: "create" })} disabled={busy}>
            Nouvelle agence
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        {panel?.kind === "create" && (
          <AgencyForm initial={EMPTY_AGENCY} creating busy={busy} onCancel={() => setPanel(null)} onSubmit={save} onDirtyChange={onDirtyChange} />
        )}

        {shown.length === 0 ? (
          <p className="rounded-control border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">
            Aucune agence pour l’instant.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-control border border-line">
            {shown.map((a) => {
              const open = panel && panel.id === a.id ? panel.kind : null;
              const count = memberCount(a.id);
              return (
                <li key={a.id} className="space-y-3 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{a.name}</span>
                        {a.archived_at && <Badge tone="clos">Archivée</Badge>}
                        {!a.google_review_url && !a.archived_at && <Badge tone="warning">Sans lien d’avis</Badge>}
                      </div>
                      <div className="text-sm text-ink-muted">
                        {count === 0 ? "Aucun membre" : `${count} membre${count > 1 ? "s" : ""}`}
                        {a.address ? ` · ${a.address}` : ""}
                        {a.phone ? ` · ${formatPhone(a.phone)}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!a.archived_at && (
                        <>
                          <Button
                            variant="secondary"
                            size="xs"
                            disabled={busy}
                            aria-expanded={open === "members"}
                            onClick={() => setPanel(open === "members" ? null : { kind: "members", id: a.id })}
                          >
                            <Icon name="user" size={16} />
                            Membres
                          </Button>
                          <Button
                            variant="secondary"
                            size="xs"
                            disabled={busy}
                            aria-expanded={open === "edit"}
                            onClick={() => setPanel(open === "edit" ? null : { kind: "edit", id: a.id })}
                          >
                            Modifier
                          </Button>
                        </>
                      )}
                      <Button variant={a.archived_at ? "secondary" : "quiet"} size="xs" disabled={busy} onClick={() => setArchived(a, !a.archived_at)}>
                        {a.archived_at ? "Désarchiver" : "Archiver"}
                      </Button>
                    </div>
                  </div>
                  {open === "edit" && (
                    <AgencyForm
                      key={a.id}
                      initial={toFormValues(a)}
                      busy={busy}
                      onCancel={() => setPanel(null)}
                      onSubmit={save}
                      onDirtyChange={onDirtyChange}
                    />
                  )}
                  {open === "members" && (
                    <MembersPanel agency={a} members={members} profiles={profiles} busy={busy} onAdd={addMember} onRemove={removeMember} />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {archived.length > 0 && (
          <Button variant="ghost" size="xs" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Masquer les agences archivées" : `Voir les agences archivées (${archived.length})`}
          </Button>
        )}
      </div>
    </Card>
  );
}
