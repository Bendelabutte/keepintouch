// src/lib/stats.js
// Indicateurs commerciaux du tableau de bord, calculés à partir d'une liste de clients.
import { parseDateStr } from "./dates";

export const ESTIMATION_MATURITY_DAYS = 90;
export const ESTIMATION_WINDOW_MONTHS = 12;
export const DEFAULT_VAT_RATE = 20;

export const isMandat = (c) => Boolean(c?.mandat_at) || c?.deal_stage === "mandat";
export const isVenteParNous = (c) => c?.sale_result === "vendu_avec_nous";

const ratioPct = (num, den) => (den === 0 ? 0 : Math.round((num / den) * 1000) / 10);

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// commission_ht si la base la fournit, sinon déduite du TTC et du taux de TVA.
export const commissionHt = (c) => {
  if (c?.commission_ht !== null && c?.commission_ht !== undefined && c?.commission_ht !== "") {
    return toNumber(c.commission_ht);
  }
  const ttc = toNumber(c?.commission_ttc);
  if (!ttc) return 0;
  const rate =
    c?.commission_vat_rate === null || c?.commission_vat_rate === undefined || c?.commission_vat_rate === ""
      ? DEFAULT_VAT_RATE
      : toNumber(c.commission_vat_rate);
  return Math.round((ttc / (1 + rate / 100)) * 100) / 100;
};

export const computeStats = (clients, today = new Date()) => {
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

  const encaissedThisYear = list.filter((c) => {
    const d = parseDateStr(c.commission_received_at);
    return d !== null && d >= yearStart && d < yearEnd;
  });

  const caTtc = encaissedThisYear.reduce((sum, c) => sum + toNumber(c.commission_ttc), 0);
  const caHt = encaissedThisYear.reduce((sum, c) => sum + commissionHt(c), 0);

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
    encaissedCount: encaissedThisYear.length,
  };
};
