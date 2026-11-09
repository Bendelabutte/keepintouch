// src/components/BuyerFields.jsx
// Bloc acquéreur unique : « Passer sous promesse » et « Nouvelle vente ».
// Prénom et Nom obligatoires ; Anniversaire, Origine et Contexte repliés sous « Plus d'infos ».
// Dès 2 caractères saisis, les fiches visibles correspondantes sont proposées (évite les doublons) ;
// une fiche choisie remplace la saisie libre.
import React, { useMemo, useState } from "react";
import { matchingClients } from "../lib/transactionDraft";
import { emailError, formatPhone, formatPhoneInput } from "../lib/contact";
import { Button, Field, Icon, Input, Textarea, cx, focusRing } from "./ui";

const CATEGORY_LABELS = { seller: "Vendeur", buyer: "Acquéreur", after: "Après-vente" };
const clientLabel = (c) => [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || c?.email || "(sans nom)";
const clientMeta = (c, profileLabel) =>
  [
    CATEGORY_LABELS[c.category] || c.category,
    c.deal_stage === "sous_promesse" ? "sous promesse" : null,
    c.status === "closed" ? "clôturée" : null,
    formatPhone(c.phone),
    profileLabel ? profileLabel(c.owner_id) : null,
  ]
    .filter(Boolean)
    .join(" · ");

export default function BuyerFields({
  value,
  onChange,
  required = true,
  clients, // fiches visibles ; absent → pas de suggestion
  selectedClient, // fiche choisie, ou null
  onSelectClient, // (fiche | null) => void
  profileLabel,
  excludeIds = [],
}) {
  const [showMore, setShowMore] = useState(
    Boolean(value?.client_birthday || value?.contact_origin || value?.context)
  );
  const set = (k) => (e) => onChange({ ...value, [k]: k === "phone" ? formatPhoneInput(e.target.value) : e.target.value });
  const emailMsg = emailError(value.email);

  const suggestions = useMemo(
    () => (clients && onSelectClient && !selectedClient ? matchingClients(clients, value, { excludeIds }) : []),
    [clients, onSelectClient, selectedClient, value, excludeIds]
  );

  if (selectedClient) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-accent/20 bg-accent-soft px-4 py-3">
        <span className="min-w-0 text-sm">
          <strong className="text-ink">{clientLabel(selectedClient)}</strong>
          <span className="text-ink-muted"> · {clientMeta(selectedClient, profileLabel)}</span>
        </span>
        {onSelectClient && (
          <Button variant="secondary" size="xs" onClick={() => onSelectClient(null)}>
            Changer
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input aria-label="Prénom de l'acquéreur" placeholder={required ? "Prénom *" : "Prénom"} value={value.first_name} onChange={set("first_name")} />
        <Input aria-label="Nom de l'acquéreur" placeholder={required ? "Nom *" : "Nom"} value={value.last_name} onChange={set("last_name")} />
        <Input type="tel" inputMode="tel" aria-label="Téléphone de l'acquéreur" placeholder="Téléphone" value={value.phone} onChange={set("phone")} />
        <Field error={emailMsg}>
          <Input type="email" aria-label="Email de l'acquéreur" placeholder="Email" value={value.email} onChange={set("email")} />
        </Field>
      </div>

      {suggestions.length > 0 && (
        <div role="listbox" aria-label="Fiches existantes correspondantes" className="overflow-hidden rounded-control border border-line bg-surface">
          <div className="bg-subtle px-4 py-2 text-sm text-ink-muted">Fiche déjà existante ? Choisissez-la pour éviter un doublon.</div>
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onSelectClient(c)}
              className={cx("block min-h-11 w-full border-t border-line px-4 py-2 text-left text-sm transition hover:bg-canvas", focusRing)}
            >
              <strong className="text-ink">{clientLabel(c)}</strong>
              <span className="text-ink-muted"> · {clientMeta(c, profileLabel)}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-expanded={showMore}
        onClick={() => setShowMore((v) => !v)}
        className={cx("inline-flex min-h-11 items-center gap-1.5 rounded-control text-sm font-semibold text-ink-muted hover:text-ink", focusRing)}
      >
        <Icon name="chevronDown" size={16} className={cx("transition-transform", showMore && "rotate-180")} />
        Plus d’infos
      </button>

      {showMore && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Anniversaire">
            <Input type="date" value={value.client_birthday} onChange={set("client_birthday")} />
          </Field>
          <Field label="Origine du contact">
            <Input placeholder="vitrine, recommandation, portail…" value={value.contact_origin} onChange={set("contact_origin")} />
          </Field>
          <Field label="Contexte" className="sm:col-span-2">
            <Textarea rows={2} placeholder="travaux, emménagement, financement…" value={value.context} onChange={set("context")} />
          </Field>
        </div>
      )}
    </div>
  );
}
