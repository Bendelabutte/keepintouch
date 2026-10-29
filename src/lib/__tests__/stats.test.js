import { describe, it, expect } from "vitest";
import { computeStats, commissionHt } from "../stats";

// today = 19/10/2026 → estimations matures : entre le 19/10/2025 et le 21/07/2026 inclus.
const TODAY = new Date(2026, 9, 19);

describe("computeStats — estimation → mandat", () => {
  it("cas qui affichait 200 % : mandats hors base exclus du numérateur", () => {
    const clients = [
      // 2 estimations matures, dont 1 passée sous mandat
      { estimation_date: "2026-03-01", mandat_at: "2026-03-20T10:00:00Z" },
      { estimation_date: "2026-04-15", deal_stage: "pre_mandat" },
      // estimation trop récente (< 90 j) mais déjà sous mandat
      { estimation_date: "2026-09-30", deal_stage: "mandat" },
      // mandats sans estimation (créés directement sous mandat)
      { deal_stage: "mandat", mandat_at: "2026-05-01T09:00:00Z" },
      { mandat_at: "2025-01-10T09:00:00Z" },
    ];
    // Ancien calcul du comparatif : tous les mandats (4) / estimations matures (2) = 200 %
    const s = computeStats(clients, TODAY);
    expect(s.estimations).toBe(2);
    expect(s.mandatsFromEstimations).toBe(1);
    expect(s.txEstimationMandat).toBe(50);
    expect(s.mandats).toBe(4);
  });

  it("ne dépasse jamais 100 %", () => {
    const clients = [
      { estimation_date: "2026-01-10", deal_stage: "mandat" },
      { estimation_date: "2026-02-10", mandat_at: "2026-02-20T00:00:00Z" },
      ...Array.from({ length: 10 }, () => ({ deal_stage: "mandat" })),
    ];
    const s = computeStats(clients, TODAY);
    expect(s.txEstimationMandat).toBe(100);
    expect(s.mandatsFromEstimations).toBeLessThanOrEqual(s.estimations);
  });

  it("bornes de la fenêtre : 90 jours et 12 mois inclus, au-delà exclus", () => {
    const s = computeStats(
      [
        { estimation_date: "2026-07-21" }, // today - 90 j : inclus
        { estimation_date: "2026-07-22" }, // today - 89 j : exclu
        { estimation_date: "2025-10-19" }, // today - 12 mois : inclus
        { estimation_date: "2025-10-18" }, // exclu
        { estimation_date: "pas une date" },
      ],
      TODAY
    );
    expect(s.estimations).toBe(2);
  });

  it("aucune estimation → 0 %", () => {
    expect(computeStats([], TODAY).txEstimationMandat).toBe(0);
    expect(computeStats(null, TODAY).estimations).toBe(0);
  });
});

describe("computeStats — mandat → vente", () => {
  it("ventes = mandats vendus par nous", () => {
    const s = computeStats(
      [
        { mandat_at: "2026-01-01", sale_result: "vendu_avec_nous" },
        { deal_stage: "mandat" },
        { deal_stage: "mandat", sale_result: "vendu_autre_agence" },
        { mandat_at: "2026-02-01" },
      ],
      TODAY
    );
    expect(s.mandats).toBe(4);
    expect(s.ventes).toBe(1);
    expect(s.txMandatVente).toBe(25);
  });
});

describe("computeStats — CA de l'année en cours", () => {
  it("somme TTC et HT des commissions encaissées dans l'année de today", () => {
    const s = computeStats(
      [
        { commission_received_at: "2026-01-01", commission_ttc: 12000, commission_ht: 10000 },
        { commission_received_at: "2026-12-31", commission_ttc: 6000, commission_vat_rate: 20 },
        { commission_received_at: "2025-12-31", commission_ttc: 99999, commission_ht: 99999 },
        { commission_received_at: "2027-01-01", commission_ttc: 99999 },
        { commission_ttc: 5000 }, // pas encaissée
      ],
      TODAY
    );
    expect(s.year).toBe(2026);
    expect(s.encaissedCount).toBe(2);
    expect(s.caTtc).toBe(18000);
    expect(s.caHt).toBe(15000);
  });

  it("commissionHt : colonne fournie, sinon TTC / (1 + TVA)", () => {
    expect(commissionHt({ commission_ht: 800, commission_ttc: 1200 })).toBe(800);
    expect(commissionHt({ commission_ht: 0, commission_ttc: 1200 })).toBe(0);
    expect(commissionHt({ commission_ttc: 1200, commission_vat_rate: 20 })).toBe(1000);
    expect(commissionHt({ commission_ttc: 1000, commission_vat_rate: 0 })).toBe(1000);
    expect(commissionHt({ commission_ttc: 1200 })).toBe(1000); // TVA absente → 20 %
    expect(commissionHt({})).toBe(0);
  });
});
