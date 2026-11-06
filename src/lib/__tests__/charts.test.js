import { describe, it, expect } from "vitest";
import {
  buildChartData,
  chartAmountOf,
  chartDateOf,
  chartSeriesFor,
  chartYears,
  monthlyCumulative,
} from "../charts";

const sale = (o) => ({
  kind: "sale",
  status: "in_progress",
  fees_ht: 10000,
  deductions: [],
  participants: [
    { user_id: "a", side: "entree", share_pct: 50 },
    { user_id: "b", side: "sortie", share_pct: 50 },
  ],
  ...o,
});

const TX = [
  sale({ preliminary_date: "2026-01-15" }),
  sale({ preliminary_date: "2026-03-02", deed_date: "2026-06-10", status: "cashed", fees_ht: 6000 }),
  sale({ preliminary_date: "2026-03-20", status: "cancelled", fees_ht: 99999 }),
  sale({ preliminary_date: "2025-11-05", deed_date: "2026-02-01", status: "cashed", fees_ht: 4000,
    deductions: [{ amount_ht: 1000 }] }),
  { kind: "rental", status: "cashed", deed_date: "2026-04-01", fees_ht: 2000, participants: [] },
];
const TODAY = new Date(2026, 6, 15); // 15 juillet 2026

describe("charts : sélection des transactions", () => {
  it("promesses : ventes par date de promesse, annulées et locations exclues", () => {
    expect(chartDateOf(TX[0], "promises")?.getMonth()).toBe(0);
    expect(chartDateOf(TX[2], "promises")).toBeNull();
    expect(chartDateOf(TX[4], "promises")).toBeNull();
  });

  it("ventes actées : status cashed, par date de l'acte", () => {
    expect(chartDateOf(TX[0], "deeds")).toBeNull();
    expect(chartDateOf(TX[1], "deeds")?.getMonth()).toBe(5);
    expect(chartDateOf(TX[4], "deeds")).toBeNull();
  });
});

describe("charts : montants", () => {
  it("agence : honoraires HT bruts", () => {
    expect(chartAmountOf(TX[3])).toBe(4000);
  });

  it("commercial : sa part de base nette HT (déductions retirées)", () => {
    expect(chartAmountOf(TX[3], ["a"])).toBe(1500);
    expect(chartAmountOf(TX[3], ["a", "b"])).toBe(3000);
    expect(chartAmountOf(TX[3], ["z"])).toBe(0);
  });
});

describe("charts : cumul mensuel", () => {
  it("promesses 2026 cumulées depuis janvier ; mois à venir vides", () => {
    const v = monthlyCumulative(TX, { year: 2026, mode: "promises", today: TODAY });
    expect(v.slice(0, 7)).toEqual([10000, 10000, 16000, 16000, 16000, 16000, 16000]);
    expect(v.slice(7)).toEqual([null, null, null, null, null]);
  });

  it("ventes actées 2026 pour le commercial a", () => {
    const v = monthlyCumulative(TX, { year: 2026, mode: "deeds", userIds: ["a"], today: TODAY });
    expect(v.slice(0, 7)).toEqual([0, 1500, 1500, 1500, 1500, 4500, 4500]);
  });

  it("année passée : les 12 mois sont remplis", () => {
    const v = monthlyCumulative(TX, { year: 2025, mode: "promises", today: TODAY });
    expect(v).toHaveLength(12);
    expect(v[10]).toBe(4000);
    expect(v[11]).toBe(4000);
  });

  it("buildChartData : une ligne par mois, une clé par courbe, libellé de mois pour l'infobulle", () => {
    const data = buildChartData(TX, {
      year: 2026,
      mode: "promises",
      series: [{ key: "agency", userIds: null }, { key: "u_b", userIds: ["b"] }],
      today: TODAY,
    });
    expect(data).toHaveLength(12);
    expect(data[2]).toMatchObject({ month: 2, label: "mars", fullLabel: "mars 2026", agency: 16000, u_b: 8000 });
  });
});

describe("charts : années et courbes par rôle", () => {
  it("années présentes dans les données + année en cours, décroissantes", () => {
    expect(chartYears(TX, TODAY)).toEqual([2026, 2025]);
    expect(chartYears([], new Date(2027, 0, 2))).toEqual([2027]);
  });

  it("commercial : sa courbe ; manager : son équipe ; admin : agence + sélection", () => {
    expect(chartSeriesFor({ userId: "a" })).toEqual([{ key: "me", label: "Ma part", userIds: ["a"] }]);
    expect(chartSeriesFor({ isManager: true, userId: "m", teamIds: ["m", "a"] })[0].userIds).toEqual(["m", "a"]);
    const admin = chartSeriesFor({ isAdmin: true, selected: [{ id: "a", label: "Alice" }] });
    expect(admin.map((s) => s.key)).toEqual(["agency", "u_a"]);
    expect(chartSeriesFor({ isAdmin: true, showAgency: false, selected: [] })).toEqual([]);
  });
});
