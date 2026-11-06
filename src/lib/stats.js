// src/lib/stats.js
// Indicateurs commerciaux du tableau de bord.
// Taux de conversion : fiches clients. CA : transactions encaissées (honoraires HT bruts).
import { parseDateStr } from "./dates";
import { caByUser, isCancelled, round2, transactionFeesHt } from "./transactions";

export const ESTIMATION_MATURITY_DAYS = 90;
export const ESTIMATION_WINDOW_MONTHS = 12;

// « Sous promesse » et « Vendu » viennent après le mandat : comptent comme mandat.
export const isMandat = (c) =>
  Boolean(c?.mandat_at) || ["mandat", "sous_promesse", "vendu"].includes(c?.deal_stage);
export const isVenteParNous = (c) => c?.sale_result === "vendu_avec_nous";

const ratioPct = (num, den) => (den === 0 ? 0 : Math.round((num / den) * 1000) / 10);

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// options.transactions : transactions visibles, avec leurs participants.
// options.userIds : null → CA de l'agence (honoraires HT bruts) ;
//                   tableau → CA attribué à ces commerciaux (fees_ht × share_pct / 100).
export const computeStats = (clients, today = new Date(), { transactions = [], userIds = null } = {}) => {
  const list = Array.isArray(clients) ? clients : [];
  const today0 = parseDateStr(today) || parseDateStr(new Date());

  const matureLimit = new Date(today0);
  matureLimit.setDate(matureLimit.getDate() - ESTIMATION_MATURITY_DAYS);

  const oldLimit = new Date(today0);
  oldLimit.setMonth(oldLimit.getMonth() - ESTIMATION_WINDOW_MONTHS);

  const year = today0.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // Estimation → mandat : le numérateur est toujours un sous-ensemble du dénominateur.
  const estimationsBase = list.filter((c) => {
    const d = parseDateStr(c.estimation_date);
    return d !== null && d >= oldLimit && d <= matureLimit;
  });
  const mandatsFromEstimations = estimationsBase.filter(isMandat);

  // Mandat → vente : tous les dossiers passés sous mandat.
  const mandats = list.filter(isMandat);
  const ventes = mandats.filter(isVenteParNous);

  // CA : honoraires encaissés dans l'année (fees_received_at), transactions annulées exclues.
  const cashedThisYear = (Array.isArray(transactions) ? transactions : []).filter((t) => {
    if (!t || isCancelled(t)) return false;
    const d = parseDateStr(t.fees_received_at);
    return d !== null && d >= yearStart && d < yearEnd;
  });

  let caHt;
  let caTtc;
  let encaissedCount;

  if (userIds === null || userIds === undefined) {
    caHt = round2(cashedThisYear.reduce((sum, t) => sum + transactionFeesHt(t), 0));
    caTtc = round2(cashedThisYear.reduce((sum, t) => sum + toNumber(t.fees_ttc), 0));
    encaissedCount = cashedThisYear.length;
  } else {
    const ids = [...new Set(userIds)];
    const sumFor = (byUser) => round2(ids.reduce((sum, id) => sum + (byUser[id] || 0), 0));
    caHt = sumFor(caByUser(cashedThisYear));
    caTtc = sumFor(caByUser(cashedThisYear, (t) => toNumber(t.fees_ttc)));
    encaissedCount = cashedThisYear.filter((t) =>
      (t.participants || []).some((p) => ids.includes(p.user_id))
    ).length;
  }

  return {
    estimations: estimationsBase.length,
    mandatsFromEstimations: mandatsFromEstimations.length,
    txEstimationMandat: ratioPct(mandatsFromEstimations.length, estimationsBase.length),
    mandats: mandats.length,
    ventes: ventes.length,
    txMandatVente: ratioPct(ventes.length, mandats.length),
    year,
    caTtc,
    caHt,
    encaissedCount,
  };
};
