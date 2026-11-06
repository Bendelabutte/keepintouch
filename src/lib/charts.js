// src/lib/charts.js
// Graphique du tableau de bord (fonctions pures) : honoraires cumulés par mois, de janvier à décembre.
//   « Promesses signées » : ventes par mois de preliminary_date, annulées exclues ;
//   « Ventes actées »     : ventes encaissées (status cashed) par mois de deed_date.
// Agence (userIds null) : honoraires HT bruts. Commercial(s) : part de base nette HT
// (honoraires HT − déductions) × share_pct, comme le reste du tableau de bord commercial.
import { parseDateStr } from "./dates";
import { isCancelled, netFeesHt, round2, transactionFeesHt } from "./transactions";

export const CHART_MODES = Object.freeze({
  promises: { label: "Promesses signées", dateField: "preliminary_date" },
  deeds: { label: "Ventes actées", dateField: "deed_date" },
});

export const MONTH_LABELS = Object.freeze([
  "janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc.",
]);
export const MONTH_FULL_LABELS = Object.freeze([
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]);

// « signed » : reprises de l'historique, affichées « Vendu » comme « cashed ».
const isActed = (t) => t?.status === "cashed" || t?.status === "signed";

// Transaction retenue pour le mode, ou null. Retourne la date du mode.
export const chartDateOf = (t, mode) => {
  if (!t || t.kind !== "sale" || isCancelled(t)) return null;
  if (mode === "deeds" && !isActed(t)) return null;
  const field = CHART_MODES[mode]?.dateField;
  return field ? parseDateStr(t[field]) : null;
};

// Montant d'une transaction pour une courbe : agence → HT brut ; commerciaux → leur part nette HT.
export const chartAmountOf = (t, userIds = null) => {
  const feesHt = transactionFeesHt(t);
  if (userIds === null || userIds === undefined) return feesHt;
  const ids = new Set(userIds);
  const net = netFeesHt(feesHt, t?.deductions);
  return (t?.participants || [])
    .filter((p) => ids.has(p?.user_id))
    .reduce((s, p) => s + (net * (Number(p.share_pct) || 0)) / 100, 0);
};

// Années présentes dans les données (les deux modes), plus l'année en cours ; ordre décroissant.
export const chartYears = (transactions, today = new Date()) => {
  const years = new Set([parseDateStr(today).getFullYear()]);
  (Array.isArray(transactions) ? transactions : []).forEach((t) => {
    Object.keys(CHART_MODES).forEach((mode) => {
      const d = chartDateOf(t, mode);
      if (d) years.add(d.getFullYear());
    });
  });
  return [...years].sort((a, b) => b - a);
};

// 12 valeurs cumulées depuis janvier. Année en cours : mois à venir → null (la courbe s'arrête).
export const monthlyCumulative = (transactions, { year, mode, userIds = null, today = new Date() }) => {
  const monthly = new Array(12).fill(0);
  (Array.isArray(transactions) ? transactions : []).forEach((t) => {
    const d = chartDateOf(t, mode);
    if (!d || d.getFullYear() !== year) return;
    monthly[d.getMonth()] += chartAmountOf(t, userIds);
  });
  const now = parseDateStr(today);
  const lastMonth = year === now.getFullYear() ? now.getMonth() : year > now.getFullYear() ? -1 : 11;
  let total = 0;
  return monthly.map((v, m) => {
    total += v;
    return m <= lastMonth ? round2(total) : null;
  });
};

// series : [{ key, label, userIds }] → lignes Recharts [{ month, label, fullLabel, [key]: valeur }].
export const buildChartData = (transactions, { year, mode, series, today = new Date() }) => {
  const curves = (series || []).map((s) => ({
    key: s.key,
    values: monthlyCumulative(transactions, { year, mode, userIds: s.userIds ?? null, today }),
  }));
  return MONTH_LABELS.map((label, m) => {
    const row = { month: m, label, fullLabel: `${MONTH_FULL_LABELS[m]} ${year}` };
    curves.forEach((c) => {
      row[c.key] = c.values[m];
    });
    return row;
  });
};

// Courbes affichées selon le rôle. Commercial : la sienne ; manager : son équipe (une courbe) ;
// admin : « Agence » (si cochée) puis les commerciaux sélectionnés.
export const chartSeriesFor = ({ isAdmin, isManager, userId, teamIds = [], showAgency = true, selected = [] }) => {
  if (isAdmin) {
    return [
      ...(showAgency ? [{ key: "agency", label: "Agence", userIds: null }] : []),
      ...selected.map((p) => ({ key: `u_${p.id}`, label: p.label, userIds: [p.id] })),
    ];
  }
  if (isManager) {
    return [{ key: "team", label: "Mon équipe", userIds: [...new Set([userId, ...teamIds].filter(Boolean))] }];
  }
  return [{ key: "me", label: "Ma part", userIds: [userId] }];
};
