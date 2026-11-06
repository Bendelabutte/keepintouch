// src/lib/stages.js
// Fiche vendeur qui évolue avec les étapes : frise, sections visibles, données de mandat,
// pré-remplissage de la promesse, réouverture d'une fiche vendue, potentiel sous mandat.
import { normalizePhase } from "./relance";
import { closedDate, isClosedClient } from "./clientStatus";
import { transactionFeesHt } from "./transactions";

export const MANDATE_TYPES = Object.freeze({ simple: "Simple", exclusif: "Exclusif" });

const PHASE_RANK = { pre_mandat: 0, mandat: 1, sous_promesse: 2, vendu: 3 };

// Rang atteint : la phase, complétée par les dates connues (une fiche close garde la trace
// des étapes franchies avant sa clôture).
const reachedRank = (c, { promiseDate }) => {
  let rank = PHASE_RANK[normalizePhase(c?.deal_stage)];
  if (c?.mandat_at) rank = Math.max(rank, 1);
  if (promiseDate) rank = Math.max(rank, 2);
  return rank;
};

/**
 * Frise Estimation → Sous mandat → Sous promesse → Vendu (ou Clos).
 * Retourne [{ key, label, date, state: "done" | "current" | "todo" }].
 * extra : { promiseDate, deedDate } lus depuis la transaction liée.
 */
export const sellerTimeline = (c, { promiseDate = null, deedDate = null } = {}) => {
  const sold = normalizePhase(c?.deal_stage) === "vendu";
  const closed = isClosedClient(c);
  const rank = sold ? 3 : reachedRank(c, { promiseDate });

  const steps = [
    { key: "estimation", label: "Estimation", date: c?.estimation_date || c?.inserted_at || c?.created_at || null },
    { key: "mandat", label: "Sous mandat", date: c?.mandat_at || null },
    { key: "promesse", label: "Sous promesse", date: promiseDate },
    sold || !closed
      ? { key: "vendu", label: "Vendu", date: sold ? deedDate || c?.sold_at || c?.sale_completed_at || null : null }
      : { key: "clos", label: "Clos", date: closedDate(c) },
  ];

  // Étape finale atteinte : vendue, ou close pour un autre motif
  const finalReached = sold || closed;
  return steps.map((s, i) => {
    let state;
    if (i === 3) state = finalReached ? "done" : rank === 3 ? "current" : "todo";
    else if (i < rank || (i === rank && finalReached)) state = "done";
    else if (i === rank) state = "current";
    else state = "todo";
    return { ...s, date: state === "todo" ? null : s.date, state };
  });
};

// Sections de la fiche vendeur affichées selon l'étape atteinte.
export const visibleSellerSections = (c, { promiseDate = null } = {}) => {
  const rank = normalizePhase(c?.deal_stage) === "vendu" ? 3 : reachedRank(c, { promiseDate });
  return {
    estimation: true,
    mandat: rank >= 1,
    promesse: rank >= 2,
    synthese: isClosedClient(c),
  };
};

const toNumberOrNull = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Fenêtre « Passer sous mandat » : valeurs pré-remplies depuis la fiche, toutes facultatives.
export const mandateFormFromClient = (c) => ({
  listing_price: c?.listing_price != null ? String(c.listing_price) : "",
  planned_fees_ttc: c?.planned_fees_ttc != null ? String(c.planned_fees_ttc) : "",
  mandate_type: c?.mandate_type || "",
});

// Charge utile de la mise sous mandat (montants vides → null). Erreur si un montant est invalide.
export const mandatePayload = (form) => {
  const out = {};
  for (const key of ["listing_price", "planned_fees_ttc"]) {
    const raw = form?.[key];
    const n = toNumberOrNull(raw);
    if (raw !== undefined && String(raw).trim() !== "" && (n === null || n < 0)) {
      return { error: key === "listing_price" ? "Prix de mise en vente invalide." : "Honoraires prévus invalides." };
    }
    out[key] = n;
  }
  out.mandate_type = MANDATE_TYPES[form?.mandate_type] ? form.mandate_type : null;
  return { payload: out };
};

// Formulaire de promesse : prix et honoraires repris du mandat quand ils sont connus.
export const promisePrefillFromMandate = (draft, c) => ({
  ...draft,
  price: draft.price || (c?.listing_price != null ? String(c.listing_price) : ""),
  fees_ttc: draft.fees_ttc || (c?.planned_fees_ttc != null ? String(c.planned_fees_ttc) : ""),
});

// Transaction actée liée à une fiche vendeur (la plus récente), sinon null.
export const actedSaleForSeller = (c, transactions) =>
  (transactions || [])
    .filter((t) => t.seller_client_id === c?.id && (t.status === "cashed" || t.status === "signed"))
    .sort((a, b) => String(b.deed_date || "").localeCompare(String(a.deed_date || "")))[0] || null;

// Confirmation de réouverture : texte explicite si une vente actée sera annulée.
export const reopenConfirmation = (c, transactions, { formatDate, formatCurrency }) => {
  const tx = c?.category === "seller" ? actedSaleForSeller(c, transactions) : null;
  if (!tx) return { transaction: null, text: null };
  const date = tx.deed_date || tx.fees_received_at;
  const fees = tx.fees_ttc != null ? formatCurrency(tx.fees_ttc) : "—";
  return {
    transaction: tx,
    text: `Cette vente du ${date ? formatDate(date) : "—"}, ${fees} d’honoraires, sera annulée et ses commissions supprimées.`,
  };
};

// Tableau de bord admin : honoraires prévus des fiches actives sous mandat.
export const mandatePotential = (clients) =>
  (clients || [])
    .filter((c) => c.category === "seller" && c.status !== "closed" && normalizePhase(c.deal_stage) === "mandat")
    .reduce(
      (acc, c) => {
        const fees = Number(c.planned_fees_ttc);
        if (Number.isFinite(fees) && fees > 0) {
          acc.feesTtc += fees;
          acc.withFees += 1;
        }
        acc.count += 1;
        return acc;
      },
      { feesTtc: 0, count: 0, withFees: 0 }
    );

// Section « Promesse » : lue depuis la transaction (promesse en cours, sinon vente actée).
export const promiseInfoForSeller = (c, transactions) => {
  const list = (transactions || []).filter((t) => t.seller_client_id === c?.id && t.kind === "sale" && t.status !== "cancelled");
  const tx =
    list.filter((t) => t.status === "in_progress").sort((a, b) => String(b.preliminary_date || "").localeCompare(String(a.preliminary_date || "")))[0] ||
    actedSaleForSeller(c, list);
  if (!tx) return null;
  return {
    transactionId: tx.id,
    date: tx.preliminary_date || null,
    price: tx.price ?? null,
    feesTtc: tx.fees_ttc ?? null,
    feesHt: transactionFeesHt(tx),
    buyerLabel:
      [tx.buyer?.first_name, tx.buyer?.last_name].filter(Boolean).join(" ").trim() || tx.buyer_label || null,
    buyerClientId: tx.buyer_client_id || null,
    status: tx.status,
  };
};
