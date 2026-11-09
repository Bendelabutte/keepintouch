// src/components/TransactionFormModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_VAT_RATE,
  PROPERTY_TYPE_LABELS,
  SIDE_LABELS,
  defaultShares,
  deductionsTotal,
  feesHtFromTtc,
  netFeesHt,
  participantAmount,
  sharesTotal,
  validateParticipants,
} from "../lib/transactions";
import {
  buyerFromClient,
  buyerSplitParticipants,
  isBuyerComplete,
  newRowKey,
  parseDecimal,
} from "../lib/transactionDraft";
import AddressAutocomplete from "./AddressAutocomplete";
import BuyerFields from "./BuyerFields";
import { emailError } from "../lib/contact";
import { Alert, Button, Checkbox, Field, Icon, Input, Modal, Select, Textarea, cx, focusRing } from "./ui";

const str = (v) => (v === null || v === undefined ? "" : String(v));

const clientName = (c) =>
  [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || c?.email || "(sans nom)";

// Section du formulaire : titre, puis contenu.
function FormSection({ title, description, actions, children }) {
  return (
    <section className="space-y-4 rounded-card border border-line p-5">
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-base font-semibold text-ink">{title}</h3>}
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// Choix en boutons radio sur une ligne.
function RadioRow({ name, options, value, onChange }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-x-5">
      {options.map(([v, label]) => (
        <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-ink">
          <input type="radio" name={name} className="size-4 accent-primary" checked={value === v} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </div>
  );
}

const Hint = ({ children, tone = "muted" }) => (
  <p className={cx("text-sm", tone === "info" ? "text-info" : "text-ink-muted")}>{children}</p>
);

function ClientPicker({ clients, value, onChange, categories }) {
  const [search, setSearch] = useState("");
  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (clients || [])
      .filter((c) => !categories || categories.includes(c.category) || c.id === value)
      .filter((c) => c.id === value || !q || `${clientName(c)} ${c.phone || ""}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [clients, search, categories, value]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Input aria-label="Rechercher une fiche" placeholder="Rechercher une fiche…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <Select aria-label="Fiche" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Choisir une fiche —</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {clientName(c)}
            {c.status === "closed" ? " (clôturée)" : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}

// Saisie libre : Prénom + Nom (préfixe "buyer" ou "seller" dans le brouillon), champs supplémentaires en children.
// freeContent remplace les champs Prénom + Nom (bloc acquéreur complet) ; freeOnly masque le choix
// « Fiche existante ».
function PartyField({ title, prefix, draft, set, clients, categories, locked, lockedLabel, freeOnly, freeContent, children }) {
  const mode = freeOnly ? "free" : draft[`${prefix}_mode`];
  if (locked) {
    return (
      <Field label={title}>
        <Input value={lockedLabel || ""} disabled readOnly />
      </Field>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {!freeOnly && (
        <RadioRow
          name={`${prefix}-mode`}
          options={[
            ["client", "Fiche existante"],
            ["free", "Saisie libre"],
          ]}
          value={mode}
          onChange={(v) => set(`${prefix}_mode`, v)}
        />
      )}
      {mode === "client" ? (
        <ClientPicker
          clients={clients}
          value={draft[`${prefix}_client_id`]}
          onChange={(v) => set(`${prefix}_client_id`, v)}
          categories={categories}
        />
      ) : (
        <div className="space-y-3">
          {freeContent || (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                aria-label={`Prénom (${title.toLowerCase()})`}
                placeholder="Prénom"
                value={draft[`${prefix}_first_name`]}
                onChange={(e) => set(`${prefix}_first_name`, e.target.value)}
              />
              <Input
                aria-label={`Nom (${title.toLowerCase()})`}
                placeholder="Nom"
                value={draft[`${prefix}_last_name`]}
                onChange={(e) => set(`${prefix}_last_name`, e.target.value)}
              />
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export function DeductionAddForm({ onAdd, disabled }) {
  const [form, setForm] = useState({ label: "", beneficiary: "", amount_ht: "", reason: "" });
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const amount = parseDecimal(form.amount_ht);
    if (!form.label.trim()) return setError("Le libellé est obligatoire.");
    if (amount === null || amount <= 0) return setError("Le montant HT doit être supérieur à 0.");
    if (!form.reason.trim()) return setError("La justification est obligatoire.");
    setError("");
    const ok = await onAdd({ ...form, amount_ht: amount });
    if (ok !== false) setForm({ label: "", beneficiary: "", amount_ht: "", reason: "" });
  };

  return (
    <div className="space-y-4 border-t border-dashed border-line-strong pt-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Libellé" required>
          <Input value={form.label} placeholder="Commission apporteur d'affaires" onChange={(e) => set("label", e.target.value)} />
        </Field>
        <Field label="Bénéficiaire">
          <Input value={form.beneficiary} placeholder="M. X, gardien du 12 rue …" onChange={(e) => set("beneficiary", e.target.value)} />
        </Field>
        <Field label="Montant HT (€)" required>
          <Input inputMode="decimal" value={form.amount_ht} onChange={(e) => set("amount_ht", e.target.value)} />
        </Field>
      </div>
      <Field label="Justification" required error={error}>
        <Textarea rows={2} value={form.reason} onChange={(e) => set("reason", e.target.value)} />
      </Field>
      <Button variant="secondary" size="sm" onClick={submit} disabled={disabled}>
        Ajouter la déduction
      </Button>
    </div>
  );
}

// Calcul affiché en clair : honoraires HT − déductions = base, puis montant de chaque participant.
export function FeesBreakdown({ feesHt, deductions, participants, profileLabel, formatCurrency }) {
  const ded = deductionsTotal(deductions);
  const base = netFeesHt(feesHt, deductions);
  return (
    <div className="tabular space-y-2 text-sm leading-relaxed text-ink-soft">
      <p>
        Honoraires HT <strong className="text-ink">{formatCurrency(feesHt || 0)}</strong> − déductions HT{" "}
        <strong className="text-ink">{formatCurrency(ded)}</strong> = base de calcul{" "}
        <strong className="text-ink">{formatCurrency(base)}</strong>
      </p>
      {participants.length > 0 && (
        <ul className="divide-y divide-line rounded-control border border-line bg-surface">
          {participants.map((p, i) => (
            <li key={p.key || p.id || i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span>
                {profileLabel(p.user_id) || "—"}{" "}
                <span className="text-ink-muted">
                  ({SIDE_LABELS[p.side] || p.side}, {Number(p.share_pct || 0)} %)
                </span>
              </span>
              <strong className="text-ink">{formatCurrency(participantAmount(base, p.share_pct))}</strong>
            </li>
          ))}
        </ul>
      )}
      {base < 0 && <p className="font-medium text-danger">Les déductions dépassent les honoraires HT.</p>}
    </div>
  );
}

export default function TransactionFormModal({
  open,
  mode, // "create" | "edit" | "promise" (fiche vendeur → Sous promesse)
  initialDraft,
  closureInfo, // { sellerLabel } en mode promise
  profiles,
  clients,
  profileLabel,
  formatCurrency,
  onCancel,
  onSubmit,
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDeductionForm, setShowDeductionForm] = useState(false);

  useEffect(() => {
    setDraft(initialDraft);
    setError("");
    setBusy(false);
    setShowAdvanced(false);
    setShowDeductionForm(false);
  }, [initialDraft]);

  if (!open || !draft) return null;

  const isPromise = mode === "promise";
  const fromSellerFiche = isPromise;
  // Une promesse existante ne devient « Vendu » que via « Acte signé » (clôture + fiche après-vente).
  const promiseLocked = isPromise || (mode === "edit" && draft.original?.status === "in_progress");
  const isRental = draft.kind === "rental";
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setProp = (k, v) => setDraft((d) => ({ ...d, property: { ...d.property, [k]: v } }));

  const setParticipants = (list, rebalance) =>
    setDraft((d) => ({ ...d, participants: rebalance ? defaultShares(list) : list }));
  const updateParticipant = (key, field, value) =>
    setParticipants(
      draft.participants.map((p) => (p.key === key ? { ...p, [field]: value } : p)),
      field === "side"
    );

  const vatRate = parseDecimal(draft.vat_rate) ?? DEFAULT_VAT_RATE;
  const feesHt = feesHtFromTtc(parseDecimal(draft.fees_ttc), vatRate);
  const numericParticipants = draft.participants.map((p) => ({ ...p, share_pct: parseDecimal(p.share_pct) ?? 0 }));
  const participantErrors = draft.split_locked ? [] : validateParticipants(numericParticipants);
  const deductionsOverFees = draft.deductions.length > 0 && deductionsTotal(draft.deductions) > (feesHt || 0);

  const activeProfiles = (profiles || []).filter(
    (p) => p.is_active !== false || draft.participants.some((x) => x.user_id === p.id)
  );

  const dateLabel = isRental ? "Date du bail" : draft.date_kind === "promise" ? "Date de promesse" : "Date de vente";
  // Acquéreur : fiche existante choisie (buyer_mode « client ») ou saisie libre.
  const buyerIsClient = draft.buyer_mode === "client" && Boolean(draft.buyer_client_id);
  const buyerClient = buyerIsClient
    ? (clients || []).find((c) => c.id === draft.buyer_client_id) || {
        id: draft.buyer_client_id,
        first_name: draft.buyer?.first_name || "Fiche reliée",
        last_name: draft.buyer?.last_name || "",
      }
    : null;
  // Bloc acquéreur obligatoire (prénom + nom) : depuis une fiche vendeur, ou fiche après-vente demandée.
  const buyerRequired =
    !buyerIsClient && (fromSellerFiche || (!isRental && Boolean(draft.create_after_sale)));

  // Propriétaire du mandat : celui de la fiche vendeur reliée, sinon le négociateur à l'entrée.
  const sellerClient = (clients || []).find((c) => c.id === draft.seller_client_id) || null;
  const mandateOwnerId =
    sellerClient?.owner_id || draft.participants.find((p) => p.side === "entree")?.user_id || null;

  // Choix d'une fiche existante : la répartition par défaut suit les propriétaires (mandat / acquéreur).
  // Le choix n'est proposé qu'à la création : en modification, la fiche reliée reste celle d'origine.
  const canPickBuyer = mode !== "edit";
  const selectBuyerClient = (c) =>
    setDraft((d) => {
      if (!c) {
        return {
          ...d,
          buyer_mode: "free",
          buyer_client_id: "",
          participants: d.participants_before_buyer || d.participants,
          participants_before_buyer: null,
        };
      }
      const split = d.split_locked ? null : buyerSplitParticipants({ mandateOwnerId, buyerOwnerId: c.owner_id });
      const before = d.participants_before_buyer || d.participants;
      return {
        ...d,
        buyer_mode: "client",
        buyer_client_id: c.id,
        buyer: buyerFromClient(c),
        participants: split || before,
        participants_before_buyer: split ? before : null,
      };
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = [];
    const fees = parseDecimal(draft.fees_ttc);
    if (fees === null || fees <= 0) errors.push("Les honoraires TTC (part de notre agence) sont obligatoires.");
    if (!draft.date) errors.push(`${dateLabel} : obligatoire.`);
    if (buyerRequired && !isBuyerComplete(draft.buyer)) {
      errors.push("Le prénom et le nom de l'acquéreur sont obligatoires.");
    }
    if (emailError(draft.buyer?.email)) errors.push("Email de l'acquéreur : " + emailError(draft.buyer.email));
    if (deductionsOverFees) errors.push("Les déductions dépassent les honoraires HT.");
    if (participantErrors.length || deductionsOverFees) setShowAdvanced(true);
    errors.push(...participantErrors);
    if (errors.length) {
      setError(errors.join(" "));
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err?.message || "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  };

  const title = isPromise
    ? "Passer sous promesse"
    : mode === "edit"
      ? "Modifier la transaction"
      : "Nouvelle transaction";

  const participantsSummary = numericParticipants
    .map((p) => `${profileLabel(p.user_id) || "—"} ${SIDE_LABELS[p.side]?.toLowerCase() || ""} ${p.share_pct} %`)
    .join(" · ");

  const buyerHint = (() => {
    if (!buyerIsClient) return isPromise ? "La fiche après-vente sera créée automatiquement à l'acte signé." : null;
    if (isRental) return null;
    if (buyerClient?.category !== "buyer") return "Fiche reliée à la transaction (sa catégorie ne change pas).";
    return isPromise || draft.date_kind === "promise"
      ? "La fiche acquéreur passera « Sous promesse » ; à l'acte, elle deviendra la fiche après-vente."
      : "La fiche acquéreur deviendra la fiche après-vente (historique conservé).";
  })();
  const splitHint = draft.participants_before_buyer
    ? `Répartition proposée : ${profileLabel(mandateOwnerId) || "mandat"} entrée 50 %, ${
        profileLabel(buyerClient?.owner_id) || "acquéreur"
      } sortie 50 % (modifiable dans les options avancées).`
    : null;

  // Vente avec une fiche vendeur reliée : effet sur la fiche, annoncé avant l'enregistrement.
  const sellerHint =
    !isRental && draft.seller_mode === "client" && draft.seller_client_id
      ? draft.date_kind === "promise"
        ? "La fiche vendeur passera « Sous promesse »."
        : "La fiche vendeur sera clôturée en « Vendu » (promesse en cours annulée)."
      : null;


  return (
    <Modal
      open
      size="lg"
      busy={busy}
      title={title}
      description={
        fromSellerFiche
          ? `${closureInfo?.sellerLabel ? `Vendeur : ${closureInfo.sellerLabel}. ` : ""}La fiche vendeur passe « Sous promesse » et reste active ; prochaine relance à la date de promesse + le délai « relance sous promesse ». Rien n'est enregistré avant validation de ce formulaire.`
          : null
      }
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" form="transaction-form" loading={busy}>
            {isPromise ? "Enregistrer la promesse" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <form id="transaction-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        <FormSection>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!fromSellerFiche && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-ink">Type</p>
                <RadioRow
                  name="transaction-kind"
                  options={[
                    ["sale", "Vente"],
                    ["rental", "Location"],
                  ]}
                  value={draft.kind}
                  onChange={(v) => set("kind", v)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-ink">{fromSellerFiche || isRental || promiseLocked ? dateLabel : "Date"}</p>
              {!isRental && !fromSellerFiche && !promiseLocked && (
                <RadioRow
                  name="transaction-date-kind"
                  options={[
                    ["promise", "Promesse"],
                    ["sale", "Vente"],
                  ]}
                  value={draft.date_kind}
                  onChange={(v) => set("date_kind", v)}
                />
              )}
              <Input type="date" aria-label={dateLabel} value={draft.date} onChange={(e) => set("date", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">Adresse du bien</p>
            <AddressAutocomplete
              value={draft.property.address}
              placeholder="Commencer à taper l'adresse…"
              onChange={(text) => setProp("address", text)}
              onSelect={(a) =>
                setDraft((d) => ({
                  ...d,
                  property: { ...d.property, address: a.address, postal_code: a.postal_code, city: a.city },
                }))
              }
            />
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <Input aria-label="Code postal" placeholder="Code postal" value={draft.property.postal_code} onChange={(e) => setProp("postal_code", e.target.value)} />
              <Input aria-label="Ville" placeholder="Ville" value={draft.property.city} onChange={(e) => setProp("city", e.target.value)} />
            </div>
          </div>

          {!isRental && !isPromise && (
            <div className="space-y-1.5">
              <PartyField title="Vendeur" prefix="seller" draft={draft} set={set} clients={clients} categories={["seller"]} />
              {sellerHint && <Hint>{sellerHint}</Hint>}
            </div>
          )}

          <PartyField
            title={isRental ? "Locataire" : "Acquéreur"}
            prefix="buyer"
            draft={draft}
            set={set}
            clients={clients}
            categories={["buyer", "after"]}
            freeOnly
            freeContent={
              <BuyerFields
                value={draft.buyer}
                onChange={(b) => set("buyer", b)}
                required={buyerRequired}
                clients={canPickBuyer ? clients : null}
                selectedClient={buyerClient}
                onSelectClient={canPickBuyer ? selectBuyerClient : null}
                profileLabel={profileLabel}
                excludeIds={[draft.seller_client_id]}
              />
            }
          >
            {buyerHint && <Hint>{buyerHint}</Hint>}
            {splitHint && <Hint tone="info">{splitHint}</Hint>}
            {!fromSellerFiche && !isRental && !buyerIsClient && (
              <Checkbox
                label={`Créer une fiche après-vente pour l'acquéreur${draft.date_kind === "promise" ? " (à l'acte signé)" : ""}`}
                checked={Boolean(draft.create_after_sale)}
                onChange={(e) => set("create_after_sale", e.target.checked)}
              />
            )}
          </PartyField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Honoraires TTC de notre agence (€)"
              required
              hint={`${feesHt === null ? "" : `soit ${formatCurrency(feesHt)} HT (TVA ${vatRate} %) · `}partage inter-agences : notre part uniquement`}
            >
              <Input inputMode="decimal" value={draft.fees_ttc} onChange={(e) => set("fees_ttc", e.target.value)} />
            </Field>
            {!isRental && (
              <Field label={`Prix de vente (€${isPromise ? "" : ", facultatif"})`}>
                <Input inputMode="decimal" value={draft.price} onChange={(e) => set("price", e.target.value)} />
              </Field>
            )}
          </div>
        </FormSection>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
            className={cx("inline-flex min-h-11 items-center gap-1.5 rounded-control text-sm font-semibold text-ink-muted hover:text-ink", focusRing)}
          >
            <Icon name="chevronDown" size={16} className={cx("transition-transform", showAdvanced && "rotate-180")} />
            Options avancées
          </button>
          {!showAdvanced && (
            <span className={cx("text-sm", participantErrors.length ? "text-danger" : "text-ink-muted")}>
              {participantsSummary || "Aucun participant"}
              {draft.deductions.length > 0 && ` · ${draft.deductions.length} déduction(s)`}
            </span>
          )}
        </div>

        {showAdvanced && (
          <>
            <FormSection>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="TVA (%)">
                  <Input inputMode="decimal" value={draft.vat_rate} onChange={(e) => set("vat_rate", e.target.value)} />
                </Field>
                <Field label="Type de bien">
                  <Select value={draft.property.property_type} onChange={(e) => setProp("property_type", e.target.value)}>
                    <option value="">—</option>
                    {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Surface (m²)">
                  <Input inputMode="decimal" value={draft.property.surface} onChange={(e) => setProp("surface", e.target.value)} />
                </Field>
              </div>
              {(isRental || isPromise) && (
                <PartyField
                  title={isRental ? "Bailleur" : "Vendeur"}
                  prefix="seller"
                  draft={draft}
                  set={set}
                  clients={clients}
                  categories={["seller"]}
                  locked={fromSellerFiche}
                  lockedLabel={closureInfo?.sellerLabel}
                />
              )}
            </FormSection>

            {draft.split_locked ? (
              <FormSection title="Répartition entre négociateurs" description="La répartition inclut un collègue : seul un administrateur peut la modifier." />
            ) : (
              <FormSection
                title="Répartition entre négociateurs"
                actions={
                  <>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => setParticipants([...draft.participants, { key: newRowKey(), user_id: "", side: "sortie" }], true)}
                    >
                      Ajouter un participant
                    </Button>
                    <Button variant="secondary" size="xs" onClick={() => setParticipants(draft.participants, true)}>
                      Répartition par défaut
                    </Button>
                  </>
                }
              >
                <ul className="space-y-3">
                  {draft.participants.map((p) => (
                    <li key={p.key} className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_7rem_auto]">
                      <Select aria-label="Négociateur" value={p.user_id} onChange={(e) => updateParticipant(p.key, "user_id", e.target.value)}>
                        <option value="">— Négociateur —</option>
                        {activeProfiles.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {profileLabel(pr.id)}
                          </option>
                        ))}
                      </Select>
                      <Select aria-label="Côté" value={p.side} onChange={(e) => updateParticipant(p.key, "side", e.target.value)}>
                        <option value="entree">Entrée</option>
                        <option value="sortie">Sortie</option>
                      </Select>
                      <div className="relative">
                        <Input
                          aria-label="Part (%)"
                          inputMode="decimal"
                          className="pr-9"
                          value={str(p.share_pct)}
                          onChange={(e) => updateParticipant(p.key, "share_pct", e.target.value)}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-muted">%</span>
                      </div>
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => setParticipants(draft.participants.filter((x) => x.key !== p.key), true)}
                      >
                        Supprimer
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className={cx("text-sm font-semibold", participantErrors.length ? "text-danger" : "text-success")}>
                  Total : {sharesTotal(numericParticipants)} %
                  {participantErrors.length > 0 && <span className="font-normal"> · {participantErrors.join(" ")}</span>}
                </p>
              </FormSection>
            )}

            <FormSection
              title="Déductions avant commission"
              description="Dépenses extérieures à l'activité de l'agence (ex. commission d'apporteur d'affaires), déduites des honoraires HT avant le calcul des commissions des négociateurs."
            >
              {draft.deductions.length > 0 && (
                <ul className="divide-y divide-line rounded-control border border-line">
                  {draft.deductions.map((d) => (
                    <li key={d.key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <strong className="text-ink">{d.label}</strong>
                        {d.beneficiary ? ` · ${d.beneficiary}` : ""} · {formatCurrency(d.amount_ht)} HT
                        <span className="block text-ink-muted">{d.reason}</span>
                      </span>
                      <Button variant="quiet" size="xs" onClick={() => set("deductions", draft.deductions.filter((x) => x.key !== d.key))}>
                        Supprimer
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {showDeductionForm ? (
                <DeductionAddForm
                  onAdd={(d) => {
                    set("deductions", [...draft.deductions, { ...d, key: newRowKey() }]);
                    setShowDeductionForm(false);
                  }}
                />
              ) : (
                <Button variant="secondary" size="sm" icon="plus" onClick={() => setShowDeductionForm(true)}>
                  Ajouter une déduction
                </Button>
              )}
              <FeesBreakdown
                feesHt={feesHt || 0}
                deductions={draft.deductions}
                participants={numericParticipants}
                profileLabel={profileLabel}
                formatCurrency={formatCurrency}
              />
            </FormSection>

            <Field label="Notes">
              <Textarea rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </>
        )}

        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
