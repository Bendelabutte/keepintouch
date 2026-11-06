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

const str = (v) => (v === null || v === undefined ? "" : String(v));

const fieldStyle = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  fontSize: "0.92rem",
  background: "#fff",
  boxSizing: "border-box",
  marginTop: 4,
};
const labelStyle = { display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#111827" };
const sectionStyle = {
  marginTop: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
  background: "#f9fafb",
};
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 };

const clientName = (c) =>
  [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || c?.email || "(sans nom)";

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
    <div>
      <input
        type="text"
        placeholder="Rechercher une fiche…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={fieldStyle}
      />
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle, borderRadius: 10 }}>
        <option value="">— Choisir une fiche —</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {clientName(c)}
            {c.status === "closed" ? " (clôturée)" : ""}
          </option>
        ))}
      </select>
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
      <div style={labelStyle}>
        {title}
        <div style={{ ...fieldStyle, background: "#f3f4f6", fontWeight: 400 }}>{lockedLabel}</div>
      </div>
    );
  }
  return (
    <div style={labelStyle}>
      {title}
      {!freeOnly && (
        <div style={{ display: "flex", gap: 12, fontWeight: 400, marginTop: 4 }}>
          <label>
            <input type="radio" checked={mode === "client"} onChange={() => set(`${prefix}_mode`, "client")} /> Fiche existante
          </label>
          <label>
            <input type="radio" checked={mode === "free"} onChange={() => set(`${prefix}_mode`, "free")} /> Saisie libre
          </label>
        </div>
      )}
      {mode === "client" ? (
        <ClientPicker
          clients={clients}
          value={draft[`${prefix}_client_id`]}
          onChange={(v) => set(`${prefix}_client_id`, v)}
          categories={categories}
        />
      ) : (
        <div style={{ fontWeight: 400 }}>
          {freeContent || (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                type="text"
                placeholder="Prénom"
                style={fieldStyle}
                value={draft[`${prefix}_first_name`]}
                onChange={(e) => set(`${prefix}_first_name`, e.target.value)}
              />
              <input
                type="text"
                placeholder="Nom"
                style={fieldStyle}
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
    <div style={{ marginTop: 10, borderTop: "1px dashed #d1d5db", paddingTop: 10 }}>
      <div style={gridStyle}>
        <label style={labelStyle}>
          Libellé *
          <input style={fieldStyle} value={form.label} placeholder="Commission apporteur d'affaires" onChange={(e) => set("label", e.target.value)} />
        </label>
        <label style={labelStyle}>
          Bénéficiaire
          <input style={fieldStyle} value={form.beneficiary} placeholder="M. X, gardien du 12 rue …" onChange={(e) => set("beneficiary", e.target.value)} />
        </label>
        <label style={labelStyle}>
          Montant HT (€) *
          <input style={fieldStyle} inputMode="decimal" value={form.amount_ht} onChange={(e) => set("amount_ht", e.target.value)} />
        </label>
      </div>
      <label style={{ ...labelStyle, marginTop: 10 }}>
        Justification *
        <textarea rows={2} style={{ ...fieldStyle, resize: "vertical" }} value={form.reason} onChange={(e) => set("reason", e.target.value)} />
      </label>
      {error && <p className="error-text" style={{ margin: "6px 0 0" }}>{error}</p>}
      <button type="button" className="btn-outline-small" style={{ marginTop: 8 }} onClick={submit} disabled={disabled}>
        Ajouter une déduction
      </button>
    </div>
  );
}

// Calcul affiché en clair : honoraires HT − déductions = base, puis montant de chaque participant.
export function FeesBreakdown({ feesHt, deductions, participants, profileLabel, formatCurrency }) {
  const ded = deductionsTotal(deductions);
  const base = netFeesHt(feesHt, deductions);
  return (
    <div style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>
      <div>
        Honoraires HT <strong>{formatCurrency(feesHt || 0)}</strong> − déductions HT <strong>{formatCurrency(ded)}</strong> ={" "}
        base de calcul <strong>{formatCurrency(base)}</strong>
      </div>
      {participants.length > 0 && (
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {participants.map((p, i) => (
            <li key={p.key || p.id || i}>
              {profileLabel(p.user_id) || "—"} ({SIDE_LABELS[p.side] || p.side}, {Number(p.share_pct || 0)} %) :{" "}
              <strong>{formatCurrency(participantAmount(base, p.share_pct))}</strong>
            </li>
          ))}
        </ul>
      )}
      {base < 0 && <p className="error-text" style={{ margin: "4px 0 0" }}>Les déductions dépassent les honoraires HT.</p>}
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
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal admin-modal-xl" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <h2>{title}</h2>
        {fromSellerFiche && (
          <p className="admin-modal-sub">
            {closureInfo?.sellerLabel ? `Vendeur : ${closureInfo.sellerLabel}. ` : ""}
            La fiche vendeur passe « Sous promesse » et reste active ; prochaine relance à la date de
            promesse + le délai « relance sous promesse ». Rien n'est enregistré avant validation de ce formulaire.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div style={sectionStyle}>
            <div style={gridStyle}>
              {!fromSellerFiche && (
                <div style={labelStyle}>
                  Type
                  <div style={{ display: "flex", gap: 14, fontWeight: 400, marginTop: 8 }}>
                    {[
                      ["sale", "Vente"],
                      ["rental", "Location"],
                    ].map(([v, l]) => (
                      <label key={v}>
                        <input type="radio" checked={draft.kind === v} onChange={() => set("kind", v)} /> {l}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={labelStyle}>
                {fromSellerFiche || isRental || promiseLocked ? dateLabel : "Date"}
                {!isRental && !fromSellerFiche && !promiseLocked && (
                  <div style={{ display: "flex", gap: 14, fontWeight: 400, marginTop: 4 }}>
                    <label>
                      <input type="radio" checked={draft.date_kind === "promise"} onChange={() => set("date_kind", "promise")} />{" "}
                      Promesse
                    </label>
                    <label>
                      <input type="radio" checked={draft.date_kind === "sale"} onChange={() => set("date_kind", "sale")} /> Vente
                    </label>
                  </div>
                )}
                <input
                  type="date"
                  aria-label={dateLabel}
                  style={fieldStyle}
                  value={draft.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </div>
            </div>

            <div style={{ ...labelStyle, marginTop: 12 }}>
              Adresse du bien
              <AddressAutocomplete
                value={draft.property.address}
                placeholder="Commencer à taper l'adresse…"
                style={fieldStyle}
                onChange={(text) => setProp("address", text)}
                onSelect={(a) =>
                  setDraft((d) => ({
                    ...d,
                    property: { ...d.property, address: a.address, postal_code: a.postal_code, city: a.city },
                  }))
                }
              />
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontWeight: 400 }}>
                <input
                  style={fieldStyle}
                  placeholder="Code postal"
                  value={draft.property.postal_code}
                  onChange={(e) => setProp("postal_code", e.target.value)}
                />
                <input style={fieldStyle} placeholder="Ville" value={draft.property.city} onChange={(e) => setProp("city", e.target.value)} />
              </div>
            </div>

            {!isRental && !isPromise && (
              <div style={{ marginTop: 12 }}>
                <PartyField
                  title="Vendeur"
                  prefix="seller"
                  draft={draft}
                  set={set}
                  clients={clients}
                  categories={["seller"]}
                />
                {sellerHint && <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: 4 }}>{sellerHint}</div>}
              </div>
            )}

            <div style={{ marginTop: 12 }}>
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
                {buyerHint && <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: 6 }}>{buyerHint}</div>}
                {splitHint && <div style={{ fontSize: "0.8rem", color: "#1d4ed8", marginTop: 4 }}>{splitHint}</div>}
                {!fromSellerFiche && !isRental && !buyerIsClient && (
                  <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(draft.create_after_sale)}
                      onChange={(e) => set("create_after_sale", e.target.checked)}
                    />
                    Créer une fiche après-vente pour l'acquéreur
                    {draft.date_kind === "promise" ? " (à l'acte signé)" : ""}
                  </label>
                )}
              </PartyField>
            </div>

            <div style={{ ...gridStyle, marginTop: 12 }}>
              <label style={labelStyle}>
                Honoraires TTC de notre agence (€) *
                <input style={fieldStyle} inputMode="decimal" value={draft.fees_ttc} onChange={(e) => set("fees_ttc", e.target.value)} />
                <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "#6b7280" }}>
                  {feesHt === null ? "" : `soit ${formatCurrency(feesHt)} HT (TVA ${vatRate} %) · `}
                  partage inter-agences : notre part uniquement
                </span>
              </label>
              {!isRental && (
                <label style={labelStyle}>
                  Prix de vente (€{isPromise ? "" : ", optionnel"})
                  <input style={fieldStyle} inputMode="decimal" value={draft.price} onChange={(e) => set("price", e.target.value)} />
                </label>
              )}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn-outline-small" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "▾" : "▸"} Options avancées
            </button>
            {!showAdvanced && (
              <span style={{ marginLeft: 10, fontSize: "0.82rem", color: participantErrors.length ? "#b91c1c" : "#6b7280" }}>
                {participantsSummary || "Aucun participant"}
                {draft.deductions.length > 0 && ` · ${draft.deductions.length} déduction(s)`}
              </span>
            )}
          </div>

          {showAdvanced && (
            <>
              <div style={sectionStyle}>
                <div style={gridStyle}>
                  <label style={labelStyle}>
                    TVA (%)
                    <input style={fieldStyle} inputMode="decimal" value={draft.vat_rate} onChange={(e) => set("vat_rate", e.target.value)} />
                  </label>
                  <label style={labelStyle}>
                    Type de bien
                    <select style={fieldStyle} value={draft.property.property_type} onChange={(e) => setProp("property_type", e.target.value)}>
                      <option value="">—</option>
                      {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Surface (m²)
                    <input style={fieldStyle} inputMode="decimal" value={draft.property.surface} onChange={(e) => setProp("surface", e.target.value)} />
                  </label>
                </div>
                {(isRental || isPromise) && (
                  <div style={{ marginTop: 12 }}>
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
                  </div>
                )}
              </div>

              {draft.split_locked ? (
                <div style={sectionStyle}>
                  <strong>Répartition entre négociateurs</strong>
                  <p style={{ fontSize: "0.85rem", color: "#6b7280", margin: "4px 0 0" }}>
                    La répartition ne peut être modifiée que par un administrateur.
                  </p>
                </div>
              ) : (
                <div style={sectionStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>Répartition entre négociateurs</strong>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn-outline-small"
                        onClick={() => setParticipants([...draft.participants, { key: newRowKey(), user_id: "", side: "sortie" }], true)}
                      >
                        Ajouter un participant
                      </button>
                      <button type="button" className="btn-outline-small" onClick={() => setParticipants(draft.participants, true)}>
                        Répartition par défaut
                      </button>
                    </div>
                  </div>
                  {draft.participants.map((p) => (
                    <div key={p.key} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                      <select style={{ minWidth: 200 }} value={p.user_id} onChange={(e) => updateParticipant(p.key, "user_id", e.target.value)}>
                        <option value="">— Négociateur —</option>
                        {activeProfiles.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {profileLabel(pr.id)}
                          </option>
                        ))}
                      </select>
                      <select value={p.side} onChange={(e) => updateParticipant(p.key, "side", e.target.value)}>
                        <option value="entree">Entrée</option>
                        <option value="sortie">Sortie</option>
                      </select>
                      <input
                        style={{ ...fieldStyle, width: 90, marginTop: 0 }}
                        inputMode="decimal"
                        value={str(p.share_pct)}
                        onChange={(e) => updateParticipant(p.key, "share_pct", e.target.value)}
                      />
                      <span>%</span>
                      <button
                        type="button"
                        className="btn-outline-small"
                        onClick={() => setParticipants(draft.participants.filter((x) => x.key !== p.key), true)}
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, fontSize: "0.88rem", fontWeight: 600, color: participantErrors.length ? "#b91c1c" : "#047857" }}>
                    Total : {sharesTotal(numericParticipants)} %
                    {participantErrors.length > 0 && <span style={{ fontWeight: 400 }}> · {participantErrors.join(" ")}</span>}
                  </div>
                </div>
  
              )}

              <div style={sectionStyle}>
                <strong>Déductions avant commission</strong>
                <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "4px 0 0" }}>
                  Dépenses extérieures à l'activité de l'agence (ex. commission d'apporteur d'affaires), déduites des
                  honoraires HT avant le calcul des commissions des négociateurs.
                </p>
                {draft.deductions.map((d) => (
                  <div key={d.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8, fontSize: "0.9rem" }}>
                    <span>
                      <strong>{d.label}</strong>
                      {d.beneficiary ? ` · ${d.beneficiary}` : ""} · {formatCurrency(d.amount_ht)} HT
                      <br />
                      <span style={{ color: "#6b7280" }}>{d.reason}</span>
                    </span>
                    <button
                      type="button"
                      className="btn-outline-small"
                      onClick={() => set("deductions", draft.deductions.filter((x) => x.key !== d.key))}
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
                {showDeductionForm ? (
                  <DeductionAddForm
                    onAdd={(d) => {
                      set("deductions", [...draft.deductions, { ...d, key: newRowKey() }]);
                      setShowDeductionForm(false);
                    }}
                  />
                ) : (
                  <button type="button" className="btn-outline-small" style={{ marginTop: 8 }} onClick={() => setShowDeductionForm(true)}>
                    + Ajouter une déduction
                  </button>
                )}
                <div style={{ marginTop: 12 }}>
                  <FeesBreakdown
                    feesHt={feesHt || 0}
                    deductions={draft.deductions}
                    participants={numericParticipants}
                    profileLabel={profileLabel}
                    formatCurrency={formatCurrency}
                  />
                </div>
              </div>

              <label style={{ ...labelStyle, marginTop: 16 }}>
                Notes
                <textarea rows={2} style={{ ...fieldStyle, resize: "vertical" }} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
              </label>
            </>
          )}

          {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Enregistrement…" : isPromise ? "Enregistrer la promesse" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
