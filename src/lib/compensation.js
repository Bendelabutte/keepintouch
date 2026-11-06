// src/lib/compensation.js
// Rémunération (fonctions pures) : commissions, solde dû par l'agence, relevé, projection, factures.
// Mêmes règles que la base (refresh_commissions, vue compensation_balances) :
//   base = base nette HT × share_pct / 100 ; montant HT = base × taux ; dû = HT (+ TVA pour agent_tva).
//   Solde = solde d'ouverture + commissions dues − parts imputées des salaires et paiements.
import { parseDateStr, toDateStr } from "./dates";
import { isPendingPromise, netFeesHt, round2, transactionFeesHt } from "./transactions";

export const COMPENSATION_TYPES = Object.freeze({
  salarie: "Salarié",
  agent_micro: "Agent commercial (micro, sans TVA)",
  agent_tva: "Agent commercial (assujetti TVA)",
});

export const isAgent = (type) => type === "agent_micro" || type === "agent_tva";

// Libellé de la projection selon le type de rémunération
export const projectionLabel = (type) => (type === "salarie" ? "Salaire brut à venir" : "Commissions à venir");

const num = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? 0 : n;
};
const hasValue = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

// Taux applicable : taux exceptionnel du participant, sinon taux du profil selon le côté (null si inconnu).
export const commissionRate = ({ side, rateOverride = null, settings }) => {
  if (hasValue(rateOverride)) return Number(rateOverride);
  const rate = side === "entree" ? settings?.rate_entree : settings?.rate_sortie;
  return hasValue(rate) ? Number(rate) : null;
};

export const vatRateFor = (settings) =>
  settings?.compensation_type === "agent_tva" ? (hasValue(settings?.agent_vat_rate) ? Number(settings.agent_vat_rate) : 20) : 0;

// Montants d'une ligne de commission
export const commissionAmounts = ({ netHt, sharePct, rate, vatRate = 0 }) => {
  const base_ht = round2((num(netHt) * num(sharePct)) / 100);
  const amount_ht = round2((base_ht * num(rate)) / 100);
  return { base_ht, amount_ht, vat_rate: num(vatRate), amount_due: round2(amount_ht * (1 + num(vatRate) / 100)) };
};

// Commission d'un commercial sur une transaction (toutes ses lignes) aux taux de `settings`.
// Retourne null si le type ou un taux manque.
export const transactionCommission = (t, userId, settings) => {
  if (!settings?.compensation_type) return null;
  const netHt = netFeesHt(transactionFeesHt(t), t?.deductions);
  const vatRate = vatRateFor(settings);
  const lines = (t?.participants || []).filter((p) => p?.user_id === userId);
  let amount_ht = 0;
  let amount_due = 0;
  for (const p of lines) {
    const rate = commissionRate({ side: p.side, rateOverride: p.rate_override, settings });
    if (rate === null) return null;
    const a = commissionAmounts({ netHt, sharePct: p.share_pct, rate, vatRate });
    amount_ht += a.amount_ht;
    amount_due += a.amount_due;
  }
  return { amount_ht: round2(amount_ht), amount_due: round2(amount_due), count: lines.length };
};

// Projection sur les promesses en cours (in_progress) : part × taux actuel (+ TVA pour agent_tva).
export const projectedCompensation = (transactions, userId, settings) => {
  let amount_due = 0;
  let count = 0;
  let incomplete = false;
  (Array.isArray(transactions) ? transactions : []).filter(isPendingPromise).forEach((t) => {
    if (!(t.participants || []).some((p) => p.user_id === userId)) return;
    const c = transactionCommission(t, userId, settings);
    count += 1;
    if (c === null) incomplete = true;
    else amount_due += c.amount_due;
  });
  return { amount_due: round2(amount_due), count, incomplete };
};

// Part d'un paiement qui diminue le solde (même formule que la colonne générée imputed_amount)
export const imputedAmount = (p) => round2(num(p?.amount) - num(p?.fixed_part) - num(p?.bonus_part));

const afterOpening = (date, openingDate) => {
  const open = parseDateStr(openingDate);
  if (!open) return true;
  const d = parseDateStr(date);
  return d !== null && d >= open;
};

// Une commission n'est due qu'à partir de la date d'ouverture (antérieure : comprise dans le solde d'ouverture)
export const isCommissionCounted = (earnedAt, openingDate) => afterOpening(earnedAt, openingDate);

export const compensationBalance = ({ settings, entries = [], payments = [] }) => {
  const openingDate = settings?.opening_balance_date || null;
  const due = entries
    .filter((e) => isCommissionCounted(e.earned_at, openingDate))
    .reduce((s, e) => s + num(e.amount_due), 0);
  const paid = payments
    .filter((p) => afterOpening(p.paid_at, openingDate))
    .reduce((s, p) => s + imputedAmount(p), 0);
  return {
    opening: round2(num(settings?.opening_balance)),
    commissionsDue: round2(due),
    imputedPaid: round2(paid),
    balance: round2(num(settings?.opening_balance) + due - paid),
  };
};

export const earnedInYear = (entries, year) =>
  round2(
    (Array.isArray(entries) ? entries : [])
      .filter((e) => parseDateStr(e.earned_at)?.getFullYear() === year)
      .reduce((s, e) => s + num(e.amount_due), 0)
  );

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const monthLabel = (date) => {
  const d = parseDateStr(date);
  return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "";
};

// Dernier jour du mois (date de paiement d'un salaire saisi par mois)
export const endOfMonth = (monthStr) => {
  const d = parseDateStr(monthStr && monthStr.length === 7 ? `${monthStr}-01` : monthStr);
  return d ? toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)) : null;
};

// Relevé chronologique : ouverture, commissions (+), salaires et paiements (− part imputée), solde progressif.
// txLabel(transaction_id) et invoiceLabel(invoice_id) fournissent les libellés liés.
export const compensationStatement = ({
  settings,
  entries = [],
  payments = [],
  txLabel = () => "",
  invoiceLabel = () => "",
}) => {
  const openingDate = settings?.opening_balance_date || null;
  const rows = [];
  entries
    .filter((e) => isCommissionCounted(e.earned_at, openingDate))
    .forEach((e) =>
      rows.push({
        key: `c-${e.id}`,
        date: e.earned_at,
        order: 1,
        label: `${e.compensation_type === "salarie" ? "Salaire variable" : "Commission"} ${
          e.side === "entree" ? "entrée" : "sortie"
        } (${num(e.rate)} %)`,
        link: txLabel(e.transaction_id),
        transactionId: e.transaction_id,
        amount: round2(num(e.amount_due)),
      })
    );
  payments
    .filter((p) => afterOpening(p.paid_at, openingDate))
    .forEach((p) => {
      const fixed = num(p.fixed_part);
      const bonus = num(p.bonus_part);
      const detail = fixed || bonus ? ` (brut ${round2(num(p.amount))}, dont fixe ${round2(fixed)}, prime ${round2(bonus)})` : "";
      rows.push({
        key: `p-${p.id}`,
        date: p.paid_at,
        order: 2,
        label: p.kind === "salary" ? `Salaire ${monthLabel(p.period_month)}${detail}` : "Paiement",
        link: p.invoice_id ? invoiceLabel(p.invoice_id) : p.note || "",
        invoiceId: p.invoice_id || null,
        amount: -imputedAmount(p),
        payment: p,
      });
    });
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.order - b.order);

  let balance = num(settings?.opening_balance);
  const out = [
    {
      key: "opening",
      date: openingDate,
      label: "Solde d'ouverture",
      link: "",
      amount: null,
      balance: round2(balance),
    },
  ];
  rows.forEach((r) => {
    balance += r.amount;
    out.push({ ...r, balance: round2(balance) });
  });
  return out;
};

// Statut de facture calculé : à payer, partiellement payée, payée
export const INVOICE_STATUS_LABELS = Object.freeze({ unpaid: "À payer", partial: "Partiellement payée", paid: "Payée" });

export const invoicePaidAmount = (invoice, payments) =>
  round2(
    (Array.isArray(payments) ? payments : [])
      .filter((p) => p.invoice_id === invoice?.id)
      .reduce((s, p) => s + num(p.amount), 0)
  );

export const invoiceStatus = (invoice, payments) => {
  const paid = invoicePaidAmount(invoice, payments);
  if (paid <= 0) return "unpaid";
  return paid + 0.005 >= num(invoice?.amount_ttc) ? "paid" : "partial";
};
