import { describe, it, expect } from "vitest";
import {
  BALANCE_HELP,
  balanceDisplay,
  commissionAmounts,
  commissionLines,
  commissionRate,
  commissionTotals,
  commissionWord,
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

describe("détail des commissions d'une transaction", () => {
  // Base nette 12 966,67 à 50/50 : parts 6 483,34 (entrée) + 6 483,33 (sortie, qui porte l'écart d'un
  // centime) = 12 966,67 ; commissions calculées sur ces parts : 972,50 (15 %) et 648,33 (10 %).
  const participants = [
    { id: "p1", user_id: "a", side: "entree", share_pct: 50 },
    { id: "p2", user_id: "b", side: "sortie", share_pct: 50 },
  ];
  const settingsByUser = {
    a: settings("agent_micro", { rate_entree: 15, rate_sortie: 15 }),
    b: settings("salarie", { rate_entree: 10, rate_sortie: 10 }),
  };

  it("sans ligne figée : estimation au taux du profil, part et commission par ligne", () => {
    const lines = commissionLines({ netHt: 12966.67, participants, settingsByUser });
    expect(lines[0]).toMatchObject({ base_ht: 6483.34, rate: 15, amount_ht: 972.5, compensation_type: "agent_micro", frozen: false });
    expect(lines[1]).toMatchObject({ base_ht: 6483.33, rate: 10, amount_ht: 648.33, compensation_type: "salarie", frozen: false });
    expect(Math.round((lines[0].base_ht + lines[1].base_ht) * 100)).toBe(1296667);
    expect(commissionWord(lines[0].compensation_type)).toBe("commission");
    expect(commissionWord(lines[1].compensation_type)).toBe("salaire variable");
    expect(commissionTotals(lines, 12966.67)).toEqual({
      total: 1620.83,
      complete: true,
      label: "Total des commissions et salaires variables",
      agencyRest: 11345.84,
    });
  });

  it("ligne figée : taux, type et montants de commission_entries, même si le profil a changé", () => {
    const entries = [{ participant_id: "p1", base_ht: 6483.34, rate: 20, amount_ht: 1296.67, compensation_type: "salarie" }];
    const [line] = commissionLines({ netHt: 12966.67, participants: [participants[0]], entries, settingsByUser });
    expect(line).toMatchObject({ rate: 20, amount_ht: 1296.67, compensation_type: "salarie", frozen: true });
    expect(commissionTotals([line], 12966.67).label).toBe("Total des salaires variables");
  });

  it("taux exceptionnel prioritaire ; taux ou type inconnu : pas de montant ni de reste agence", () => {
    const withOverride = [{ ...participants[0], rate_override: 30 }];
    expect(commissionLines({ netHt: 10000, participants: withOverride, settingsByUser })[0]).toMatchObject({ rate: 30, amount_ht: 1500 });
    const lines = commissionLines({ netHt: 10000, participants, settingsByUser: { a: settingsByUser.a } });
    expect(lines[1]).toMatchObject({ base_ht: 5000, rate: null, amount_ht: null, compensation_type: null });
    expect(commissionTotals(lines, 10000)).toMatchObject({ total: 750, complete: false, agencyRest: null, label: "Total des commissions" });
  });
});

describe("arrondi : commissions calculées sur les parts réparties au centime", () => {
  it("un commercial à l'entrée et à la sortie (50/50) d'une base impaire : parts = base, pas un centime de plus", () => {
    // 12 966,67 : parts 6 483,34 + 6 483,33 ; à 15 % : 972,50 + 972,50 = 1 945,00 (12 966,67 × 15 % = 1 945,0005)
    const t = tx({ fees_ht: 12966.67 });
    const s = settings("agent_micro", { rate_entree: 15, rate_sortie: 15 });
    expect(transactionCommission(t, "u", s)).toEqual({ amount_ht: 1945, amount_due: 1945, count: 2 });
    const lines = commissionLines({ netHt: 12966.67, participants: t.participants, settingsByUser: { u: s } });
    expect(lines.map((l) => l.base_ht)).toEqual([6483.34, 6483.33]);
  });

  it("3 participants à 33,33 / 33,33 / 33,34 % : parts = base, commission de chacun sur sa part", () => {
    const participants = [
      { id: "p1", user_id: "a", side: "entree", share_pct: 33.33 },
      { id: "p2", user_id: "b", side: "entree", share_pct: 33.33 },
      { id: "p3", user_id: "c", side: "sortie", share_pct: 33.34 },
    ];
    const s = settings("agent_micro", { rate_entree: 40, rate_sortie: 40 });
    const lines = commissionLines({ netHt: 12966.67, participants, settingsByUser: { a: s, b: s, c: s } });
    // 4 321,79 + 4 321,79 + 4 323,09 = 12 966,67 (la troisième part, la plus grande, porte l'écart)
    expect(lines.map((l) => l.base_ht)).toEqual([4321.79, 4321.79, 4323.09]);
    expect(lines.map((l) => l.amount_ht)).toEqual([1728.72, 1728.72, 1729.24]);
    expect(commissionTotals(lines, 12966.67)).toMatchObject({ total: 5186.68, agencyRest: 7779.99 });
    // projection d'un seul des trois : sa part dépend de toutes les lignes de la transaction
    const t = tx({ status: "in_progress", fees_ht: 12966.67, participants });
    expect(transactionCommission(t, "c", s)).toEqual({ amount_ht: 1729.24, amount_due: 1729.24, count: 1 });
  });

  it("commissionAmounts : part fournie (baseHt) prioritaire sur netHt × part", () => {
    expect(commissionAmounts({ baseHt: 6483.33, rate: 10 })).toMatchObject({ base_ht: 6483.33, amount_ht: 648.33 });
    expect(commissionAmounts({ netHt: 12966.67, sharePct: 50, rate: 10 })).toMatchObject({ base_ht: 6483.34 });
  });
});

describe("présentation du solde : dû, à jour, avance", () => {
  it("solde positif : dû par l'agence (salarié et agent)", () => {
    for (const type of ["salarie", "agent_micro", "agent_tva"]) {
      expect(balanceDisplay(1250.5, type)).toEqual({
        state: "due",
        title: "Solde dû par l'agence",
        amount: 1250.5,
        sub: "Montant restant à vous verser.",
      });
      expect(balanceDisplay(1250.5, type, { own: false }).sub).toBe("Montant restant à lui verser.");
    }
  });

  it("solde nul : à jour (salarié et agent), sans montant négatif ni « −0 »", () => {
    for (const type of ["salarie", "agent_micro"]) {
      expect(balanceDisplay(0, type)).toEqual({ state: "settled", title: "Solde à jour", amount: 0, sub: "" });
      expect(balanceDisplay(-0.004, type).state).toBe("settled");
      expect(balanceDisplay("0.00", type, { own: false }).title).toBe("Solde à jour");
    }
  });

  it("solde négatif, salarié : avance sur salaire variable, montant positif", () => {
    expect(balanceDisplay(-555, "salarie")).toEqual({
      state: "advance",
      title: "Avance sur salaire variable",
      amount: 555,
      sub: "Les sommes versées dépassent le variable acquis à ce jour. Cette avance sera compensée par vos prochaines ventes.",
    });
    expect(balanceDisplay(-555, "salarie", { own: false }).sub).toBe(
      "Les sommes versées dépassent le variable acquis à ce jour. Cette avance sera compensée par ses prochaines ventes."
    );
  });

  it("solde négatif, agent : avance sur commissions, montant positif", () => {
    for (const type of ["agent_micro", "agent_tva"]) {
      expect(balanceDisplay(-555, type)).toMatchObject({ state: "advance", title: "Avance sur commissions", amount: 555 });
    }
    expect(balanceDisplay("-12.30", "agent_tva", { own: false })).toMatchObject({ title: "Avance sur commissions", amount: 12.3 });
  });

  it("salarié qui vit sur ses avances : le solde du relevé devient une avance", () => {
    const s = settings("salarie", { opening_balance: 0, opening_balance_date: "2026-01-01" });
    const entries = [{ id: "e1", amount_due: 1945, earned_at: "2026-02-10", compensation_type: "salarie", side: "entree", rate: 15 }];
    const payments = [
      { id: "s1", kind: "salary", paid_at: "2026-01-31", period_month: "2026-01-01", amount: 3000, fixed_part: 1750, bonus_part: 0 },
      { id: "s2", kind: "salary", paid_at: "2026-02-28", period_month: "2026-02-01", amount: 3000, fixed_part: 1750, bonus_part: 0 },
    ];
    const { balance } = compensationBalance({ settings: s, entries, payments });
    expect(balance).toBe(-555);
    expect(balanceDisplay(balance, "salarie")).toMatchObject({ title: "Avance sur salaire variable", amount: 555 });
    const rows = compensationStatement({ settings: s, entries, payments });
    expect(rows.map((r) => balanceDisplay(r.balance, "salarie").state)).toEqual(["settled", "advance", "due", "advance"]);
  });

  it("bulle d'aide : calcul, part fixe et primes non imputées, notion d'avance", () => {
    expect(BALANCE_HELP).toContain("solde d'ouverture");
    expect(BALANCE_HELP).toContain("part fixe");
    expect(BALANCE_HELP).toContain("primes");
    expect(BALANCE_HELP).toContain("avance");
    expect(BALANCE_HELP.split(". ").length).toBe(3);
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
