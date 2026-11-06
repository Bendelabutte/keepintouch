import { describe, it, expect } from "vitest";
import {
  commissionAmounts,
  commissionRate,
  compensationBalance,
  compensationStatement,
  earnedInYear,
  endOfMonth,
  imputedAmount,
  invoiceStatus,
  isCommissionCounted,
  projectedCompensation,
  projectionLabel,
  transactionCommission,
} from "../compensation";

// Base nette 9 000 HT : honoraires 10 800 TTC (9 000 HT), entrée 50 % et sortie 50 % du même commercial.
const tx = (o = {}) => ({
  kind: "sale",
  status: "cashed",
  fees_ttc: 10800,
  vat_rate: 20,
  fees_ht: 9000,
  deductions: [],
  participants: [
    { id: "p1", user_id: "u", side: "entree", share_pct: 50 },
    { id: "p2", user_id: "u", side: "sortie", share_pct: 50 },
  ],
  ...o,
});
const settings = (type, o = {}) => ({ compensation_type: type, rate_entree: 50, rate_sortie: 50, agent_vat_rate: 20, ...o });

describe("commissions", () => {
  it("agent micro : base 9 000, 50 % des deux côtés → 4 500 HT dus", () => {
    expect(transactionCommission(tx(), "u", settings("agent_micro"))).toEqual({ amount_ht: 4500, amount_due: 4500, count: 2 });
  });

  it("agent assujetti : 4 500 HT + 900 TVA = 5 400 dus", () => {
    expect(transactionCommission(tx(), "u", settings("agent_tva"))).toEqual({ amount_ht: 4500, amount_due: 5400, count: 2 });
    expect(commissionAmounts({ netHt: 9000, sharePct: 50, rate: 50, vatRate: 20 })).toEqual({
      base_ht: 4500,
      amount_ht: 2250,
      vat_rate: 20,
      amount_due: 2700,
    });
  });

  it("salarié : 4 500 de salaire brut dû ; salaire 3 500 dont 1 000 de fixe → 2 500 imputés, solde 2 000", () => {
    const s = settings("salarie");
    expect(transactionCommission(tx(), "u", s).amount_due).toBe(4500);
    const salary = { id: "s1", kind: "salary", paid_at: "2026-03-31", period_month: "2026-03-01", amount: 3500, fixed_part: 1000, bonus_part: 0 };
    expect(imputedAmount(salary)).toBe(2500);
    const entries = [{ id: "e1", amount_due: 4500, earned_at: "2026-03-10" }];
    expect(compensationBalance({ settings: s, entries, payments: [salary] }).balance).toBe(2000);
  });

  it("le taux exceptionnel est prioritaire sur le taux du profil", () => {
    expect(commissionRate({ side: "entree", rateOverride: 70, settings: settings("agent_micro") })).toBe(70);
    expect(commissionRate({ side: "sortie", rateOverride: null, settings: settings("agent_micro", { rate_sortie: 40 }) })).toBe(40);
    const t = tx({ participants: [{ id: "p1", user_id: "u", side: "entree", share_pct: 100, rate_override: 60 }] });
    expect(transactionCommission(t, "u", settings("agent_micro")).amount_due).toBe(5400);
  });

  it("type ou taux manquant : pas de calcul", () => {
    expect(transactionCommission(tx(), "u", null)).toBeNull();
    expect(transactionCommission(tx(), "u", settings("agent_micro", { rate_entree: null }))).toBeNull();
  });

  it("déductions retirées avant le calcul", () => {
    const t = tx({ deductions: [{ amount_ht: 1000 }] });
    expect(transactionCommission(t, "u", settings("agent_micro")).amount_due).toBe(4000);
  });
});

describe("solde d'ouverture et date", () => {
  const s = settings("agent_tva", { opening_balance: 1200, opening_balance_date: "2026-01-01" });
  const entries = [
    { id: "old", amount_due: 999, earned_at: "2025-12-15" },
    { id: "e1", amount_due: 5400, earned_at: "2026-02-10" },
  ];
  const payments = [
    { id: "x", kind: "invoice_payment", paid_at: "2025-12-20", amount: 500 },
    { id: "y", kind: "invoice_payment", paid_at: "2026-02-20", amount: 3000 },
  ];

  it("avant la date d'ouverture : compris dans le solde d'ouverture", () => {
    expect(isCommissionCounted("2025-12-31", "2026-01-01")).toBe(false);
    expect(isCommissionCounted("2026-01-01", "2026-01-01")).toBe(true);
    expect(isCommissionCounted("2020-01-01", null)).toBe(true);
    expect(compensationBalance({ settings: s, entries, payments })).toEqual({
      opening: 1200,
      commissionsDue: 5400,
      imputedPaid: 3000,
      balance: 3600,
    });
  });

  it("relevé chronologique avec solde progressif", () => {
    const rows = compensationStatement({ settings: s, entries, payments, txLabel: () => "12 rue X" });
    expect(rows.map((r) => [r.key, r.amount, r.balance])).toEqual([
      ["opening", null, 1200],
      ["c-e1", 5400, 6600],
      ["p-y", -3000, 3600],
    ]);
    expect(rows[1].link).toBe("12 rue X");
  });

  it("acquis dans l'année", () => {
    expect(earnedInYear(entries, 2026)).toBe(5400);
  });
});

describe("projection et libellés", () => {
  it("promesses en cours : part × taux actuel (+ TVA)", () => {
    const list = [tx({ status: "in_progress" }), tx(), tx({ status: "in_progress", participants: [{ user_id: "z", side: "entree", share_pct: 100 }] })];
    expect(projectedCompensation(list, "u", settings("agent_tva"))).toEqual({ amount_due: 5400, count: 1, incomplete: false });
    expect(projectedCompensation(list, "u", null)).toEqual({ amount_due: 0, count: 1, incomplete: true });
  });

  it("libellé selon le type", () => {
    expect(projectionLabel("salarie")).toBe("Salaire brut à venir");
    expect(projectionLabel("agent_micro")).toBe("Commissions à venir");
  });

  it("salaire saisi par mois : payé le dernier jour du mois", () => {
    expect(endOfMonth("2026-02")).toBe("2026-02-28");
  });
});

describe("statut de facture", () => {
  const invoice = { id: "f1", amount_ttc: 5400 };
  it("aucun paiement, partiel, total", () => {
    expect(invoiceStatus(invoice, [])).toBe("unpaid");
    expect(invoiceStatus(invoice, [{ invoice_id: "f1", amount: 2000 }, { invoice_id: "f2", amount: 9000 }])).toBe("partial");
    expect(invoiceStatus(invoice, [{ invoice_id: "f1", amount: 2000 }, { invoice_id: "f1", amount: 3400 }])).toBe("paid");
  });
});
