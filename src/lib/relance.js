// src/lib/relance.js
// Délais de relance par catégorie : valeurs par défaut uniques et conversions app_settings.
import { addDaysToDate, parseDateStr } from "./dates";

export const RELANCE_DEFAULTS = Object.freeze({
  seller: Object.freeze({ initial_days: 15, default_next_days: 21 }),
  buyer: Object.freeze({ initial_days: 14, default_next_days: 21 }),
  after: Object.freeze({ initial_days: 45, default_next_days: 90 }),
});

// Fiche vendeur « Sous promesse » : 1re relance = date de promesse + ce délai, puis même délai par défaut.
// Surchargé par app_settings.seller_promise_days si renseigné.
export const RELANCE_PROMESSE_DAYS = 30;

export const normalizeCategory = (category) =>
  category === "buyer" ? "buyer" : category === "after" ? "after" : "seller";

// null / undefined / "" / non numérique → fallback ; 0 est une valeur valide.
export const toDays = (value, fallback) => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const resolveRelanceCfg = (config, category) => {
  const cat = normalizeCategory(category);
  const defaults = RELANCE_DEFAULTS[cat];
  const cfg = config?.[cat];
  return {
    initial_days: toDays(cfg?.initial_days, defaults.initial_days),
    default_next_days: toDays(cfg?.default_next_days, defaults.default_next_days),
  };
};

export const promiseRelanceDays = (config) => toDays(config?.promise?.default_next_days, RELANCE_PROMESSE_DAYS);

// Délais applicables à une fiche : ceux de sa catégorie, sauf vendeur ou acquéreur sous promesse.
export const relanceCfgForClient = (config, client) => {
  if (["seller", "buyer"].includes(normalizeCategory(client?.category)) && client?.deal_stage === "sous_promesse") {
    const days = promiseRelanceDays(config);
    return { initial_days: days, default_next_days: days };
  }
  return resolveRelanceCfg(config, client?.category);
};

export const settingsRowToRelanceConfig = (row) => ({
  seller: {
    initial_days: toDays(row?.seller_first_days, RELANCE_DEFAULTS.seller.initial_days),
    default_next_days: toDays(row?.seller_repeat_days, RELANCE_DEFAULTS.seller.default_next_days),
  },
  buyer: {
    initial_days: toDays(row?.buyer_first_days, RELANCE_DEFAULTS.buyer.initial_days),
    default_next_days: toDays(row?.buyer_repeat_days, RELANCE_DEFAULTS.buyer.default_next_days),
  },
  after: {
    initial_days: toDays(row?.after_first_days, RELANCE_DEFAULTS.after.initial_days),
    default_next_days: toDays(row?.after_repeat1_days, RELANCE_DEFAULTS.after.default_next_days),
  },
  promise: {
    default_next_days: toDays(row?.seller_promise_days, RELANCE_PROMESSE_DAYS),
  },
});

export const relanceConfigToSettingsRow = (config) => {
  const seller = resolveRelanceCfg(config, "seller");
  const buyer = resolveRelanceCfg(config, "buyer");
  const after = resolveRelanceCfg(config, "after");
  return {
    seller_first_days: seller.initial_days,
    seller_repeat_days: seller.default_next_days,
    buyer_first_days: buyer.initial_days,
    buyer_repeat_days: buyer.default_next_days,
    after_first_days: after.initial_days,
    after_repeat1_days: after.default_next_days,
    seller_promise_days: promiseRelanceDays(config),
  };
};

// --- Phases vendeur et relance au changement de phase ---
// pre_mandat → mandat → sous_promesse → vendu. Un changement de phase vaut relance : commentaire daté
// (dernière relance), retard remis à zéro, prochaine relance recalculée. Même règle en base
// (fonctions seller_phase_next_due / on_seller_phase_change).

export const SELLER_PHASES = Object.freeze(["pre_mandat", "mandat", "sous_promesse", "vendu"]);

export const PHASE_LABELS = Object.freeze({
  pre_mandat: "Pré-mandat",
  mandat: "Sous mandat",
  sous_promesse: "Sous promesse",
  vendu: "Vendu",
});

export const normalizePhase = (stage) => (SELLER_PHASES.includes(stage) ? stage : "pre_mandat");

export const isPhaseChange = (fromStage, toStage) => normalizePhase(fromStage) !== normalizePhase(toStage);

// Retourne { next_due_date, next_due_source, comment }.
// userDate : date saisie par l'utilisateur dans le même geste (prioritaire, sauf pour « Vendu »).
export const phaseChangeFollowUp = ({ toStage, config, today = new Date(), promiseDate = null, userDate = null }) => {
  const stage = normalizePhase(toStage);
  const comment = `Phase : ${PHASE_LABELS[stage]}`;
  if (stage === "vendu") return { next_due_date: null, next_due_source: null, comment };
  if (userDate) return { next_due_date: userDate, next_due_source: "manual", comment };
  if (stage === "sous_promesse") {
    return {
      next_due_date: addDaysToDate(promiseDate || today, promiseRelanceDays(config)),
      next_due_source: "auto",
      comment,
    };
  }
  return {
    next_due_date: addDaysToDate(today, resolveRelanceCfg(config, "seller").default_next_days),
    next_due_source: "auto",
    comment,
  };
};

// Fiche sans relance : clôturée ou vendue (jamais de retard affiché).
export const hasNoFollowUp = (client) => client?.status === "closed" || client?.deal_stage === "vendu";

export const phaseBadgeClass = (stage) =>
  "stage-badge " +
  ({
    mandat: "stage-badge-mandat",
    sous_promesse: "stage-badge-promesse",
    vendu: "stage-badge-vendu",
  }[normalizePhase(stage)] || "stage-badge-premandat");

// Formulaire « Modifier » : null si la phase ne change pas ; sinon relance recalculée, la date saisie
// par l'utilisateur (différente de la date d'origine) restant prioritaire.
export const followUpForEdit = ({ fromStage, toStage, originalDate = "", manualDate = "", config, today = new Date() }) => {
  if (!isPhaseChange(fromStage, toStage)) return null;
  const userDate = manualDate && manualDate !== (originalDate || "") ? manualDate : null;
  return phaseChangeFollowUp({ toStage, config, today, userDate });
};

// Même règle que le trigger on_seller_phase_comment : « Phase : … » seulement pour un changement de
// phase sans commentaire d'action (promesse, promesse annulée et acte signé écrivent le leur).
export const shouldAddPhaseComment = ({ fromStage, toStage, status = "active", hasActionComment = false }) =>
  isPhaseChange(fromStage, toStage) &&
  !hasActionComment &&
  (status !== "closed" || normalizePhase(toStage) === "vendu");

// Actions de phase d'une fiche vendeur active, dans l'ordre d'affichage (primary = action principale).
export const sellerPhaseActions = (client) => {
  if (client?.category !== "seller" || client?.status !== "active") return [];
  switch (normalizePhase(client.deal_stage)) {
    case "pre_mandat":
      return [
        { key: "to_mandat", label: "Passer sous mandat", primary: true },
        { key: "to_promise", label: "Passer sous promesse", primary: false },
      ];
    case "mandat":
      return [{ key: "to_promise", label: "Passer sous promesse", primary: true }];
    case "sous_promesse":
      return [
        { key: "deed_signed", label: "Acte signé", primary: true, hint: "Vente définitive chez le notaire" },
        { key: "promise_cancelled", label: "Promesse annulée", primary: false },
      ];
    default:
      return [];
  }
};

// --- Première relance à la création d'une fiche ---
// Vendeur avec date d'estimation : lendemain de l'estimation (aujourd'hui s'il est déjà passé), note
// « Envoyer l'estimation » ; une fois
// cette relance validée, la suivante suit le délai par défaut vendeur (validation normale).
// Sinon : date de référence de la catégorie (enregistrement acquéreur, vente après-vente, ou
// aujourd'hui) + 1re relance de la catégorie.
export const ESTIMATION_FOLLOWUP_NOTE = "Envoyer l’estimation";

export const initialFollowUp = (client, config, today = new Date()) => {
  const cat = normalizeCategory(client?.category);
  if (cat === "seller" && parseDateStr(client?.estimation_date)) {
    // Lendemain de l'estimation, ou aujourd'hui si ce lendemain est déjà passé
    const next = addDaysToDate(client.estimation_date, 1);
    const todayDate = addDaysToDate(today, 0);
    return { next_due_date: next < todayDate ? todayDate : next, next_due_note: ESTIMATION_FOLLOWUP_NOTE };
  }
  const base =
    (cat === "buyer" && parseDateStr(client?.acquisition_date)) ||
    (cat === "after" && (parseDateStr(client?.sale_completed_at) || parseDateStr(client?.created_at))) ||
    today;
  return { next_due_date: addDaysToDate(base, resolveRelanceCfg(config, cat).initial_days), next_due_note: null };
};
