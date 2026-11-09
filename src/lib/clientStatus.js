// src/lib/clientStatus.js
// Dossiers clos et filtres de statut de la liste clients.
import { parseDateStr } from "./dates";

// Mêmes libellés qu'en base (closure_reason_label).
export const CLOSURE_REASON_LABELS = Object.freeze({
  vendu_avec_nous: "Vendu avec nous",
  vendu_autre_agence: "Vendu par une autre agence",
  vendu_seul: "Vendu par le vendeur en direct",
  projet_abandonne: "Projet abandonné",
  ne_souhaite_plus_vendre: "Ne souhaite plus vendre / louer",
  achete_avec_nous: "A acheté avec nous",
  achete_autre_agence: "A acheté avec une autre agence",
  achete_seul: "A trouvé seul",
  n_achete_plus: "N’achète plus",
  ne_repond_plus: "Ne répond plus",
  suivi_termine: "Suivi après-vente terminé",
  ne_souhaite_plus: "Ne souhaite plus de suivi",
  vente_annulee: "Vente annulée",
});

export const closureReasonLabel = (reason) =>
  CLOSURE_REASON_LABELS[reason] || (String(reason ?? "").trim() || "Motif non renseigné");

export const isClosedClient = (c) => c?.status === "closed";

// Badge de liste : « Vendu » pour une fiche vendeur vendue (avec nous ou non), « Clos » sinon.
export const closedBadgeLabel = (c) => {
  if (!isClosedClient(c)) return "";
  const reason = c.closure_reason || c.sale_result;
  return c.category === "seller" && (c.deal_stage === "vendu" || String(reason || "").startsWith("vendu_"))
    ? "Vendu"
    : "Clos";
};

// Date de clôture affichée : closed_at, sinon date de vente pour les anciennes fiches vendues.
export const closedDate = (c) => c?.closed_at || c?.sold_at || c?.sale_completed_at || null;

// Dates clés d'un dossier clos, dans l'ordre chronologique du parcours.
// extra : { promiseDate, deedDate } venant de la transaction liée.
export const closedDossierDates = (c, { promiseDate = null, deedDate = null } = {}) => {
  const rows = [{ key: "created", label: "Création", date: c?.inserted_at || c?.created_at || null }];
  if (c?.category === "seller") {
    rows.push({ key: "estimation", label: "Estimation", date: c.estimation_date || null });
    rows.push({ key: "mandat", label: "Mandat", date: c.mandat_at || null });
    rows.push({ key: "promise", label: "Promesse", date: promiseDate });
  }
  const deed = deedDate || (c?.deal_stage === "vendu" ? c?.sold_at || c?.sale_completed_at : null);
  rows.push(deed ? { key: "deed", label: "Acte", date: deed } : { key: "closed", label: "Clôture", date: closedDate(c) });
  return rows.filter((r) => r.date);
};

// --- Filtres de statut ---

export const STATUS_FILTERS = Object.freeze([
  { key: "arelancer", label: "À relancer" },
  { key: "tous", label: "Tous" },
  { key: "clos", label: "Clos" },
]);

export const DEFAULT_STATUS_FILTER = "tous";

const startOfDay = (d) => {
  const x = parseDateStr(d);
  return x ? x.getTime() : null;
};

// Fiche active dont la prochaine relance est aujourd'hui ou dépassée.
export const isDueForFollowUp = (c, nextDue, today = new Date()) => {
  if (isClosedClient(c) || !nextDue) return false;
  const due = startOfDay(nextDue);
  return due !== null && due <= startOfDay(today);
};

// « Tous » = toutes les fiches actives ; « Clos » = uniquement les closes.
export const matchesStatusFilter = (c, filter, nextDue, today = new Date()) => {
  if (filter === "clos") return isClosedClient(c);
  if (filter === "arelancer") return isDueForFollowUp(c, nextDue, today);
  return !isClosedClient(c);
};

export const statusFilterCounts = (list, getNextDue, today = new Date()) =>
  Object.fromEntries(
    STATUS_FILTERS.map(({ key }) => [
      key,
      (list || []).filter((c) => matchesStatusFilter(c, key, getNextDue(c), today)).length,
    ])
  );
