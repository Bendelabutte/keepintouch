import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATUS_FILTER,
  closedBadgeLabel,
  closedDossierDates,
  closureReasonLabel,
  matchesStatusFilter,
  statusFilterCounts,
} from "../clientStatus";
import { ESTIMATION_FOLLOWUP_NOTE, initialFollowUp } from "../relance";

const today = new Date(2026, 10, 6);

describe("filtres de statut", () => {
  const list = [
    { id: "late", status: "active", next: "2026-11-01" },
    { id: "today", status: "active", next: "2026-11-06" },
    { id: "later", status: "active", next: "2026-11-20" },
    { id: "none", status: "active", next: null },
    { id: "closed", status: "closed", next: "2026-11-01" },
  ];
  const next = (c) => c.next;
  const ids = (filter) => list.filter((c) => matchesStatusFilter(c, filter, c.next, today)).map((c) => c.id);

  it("« À relancer » : fiches actives dont la relance est aujourd'hui ou dépassée", () => {
    expect(ids("arelancer")).toEqual(["late", "today"]);
  });

  it("« Tous » : toutes les fiches actives ; « Clos » : uniquement les closes", () => {
    expect(ids("tous")).toEqual(["late", "today", "later", "none"]);
    expect(ids("clos")).toEqual(["closed"]);
  });

  it("compteurs par filtre, « Tous » par défaut", () => {
    expect(statusFilterCounts(list, next, today)).toEqual({ arelancer: 2, tous: 4, clos: 1 });
    expect(DEFAULT_STATUS_FILTER).toBe("tous");
  });
});

describe("dossiers clos", () => {
  it("libellé du motif, motif inconnu affiché tel quel", () => {
    expect(closureReasonLabel("vendu_autre_agence")).toBe("Vendu par une autre agence");
    expect(closureReasonLabel("ancien_motif")).toBe("ancien_motif");
    expect(closureReasonLabel(null)).toBe("Motif non renseigné");
  });

  it("badge « Vendu » pour un vendeur vendu, « Clos » sinon", () => {
    expect(closedBadgeLabel({ status: "closed", category: "seller", deal_stage: "vendu" })).toBe("Vendu");
    expect(closedBadgeLabel({ status: "closed", category: "seller", closure_reason: "vendu_seul" })).toBe("Vendu");
    expect(closedBadgeLabel({ status: "closed", category: "seller", closure_reason: "projet_abandonne" })).toBe("Clos");
    expect(closedBadgeLabel({ status: "closed", category: "buyer", closure_reason: "achete_avec_nous" })).toBe("Clos");
    expect(closedBadgeLabel({ status: "active", category: "seller" })).toBe("");
  });

  it("dates clés d'une vente avec nous : création, estimation, mandat, promesse, acte", () => {
    const c = {
      status: "closed",
      category: "seller",
      deal_stage: "vendu",
      inserted_at: "2026-01-10T09:00:00Z",
      estimation_date: "2026-01-15",
      mandat_at: "2026-02-01T10:00:00Z",
      sold_at: "2026-06-30",
      closed_at: "2026-06-30T12:00:00Z",
    };
    const rows = closedDossierDates(c, { promiseDate: "2026-04-02", deedDate: "2026-06-30" });
    expect(rows.map((r) => r.label)).toEqual(["Création", "Estimation", "Mandat", "Promesse", "Acte"]);
  });

  it("dossier abandonné : dates disponibles puis clôture", () => {
    const c = { status: "closed", category: "seller", inserted_at: "2026-01-10", closed_at: "2026-03-01T08:00:00Z" };
    expect(closedDossierDates(c).map((r) => r.label)).toEqual(["Création", "Clôture"]);
  });
});

describe("1re relance à la création", () => {
  it("vendeur avec date d'estimation : lendemain de l'estimation, note « Envoyer l'estimation »", () => {
    expect(initialFollowUp({ category: "seller", estimation_date: "2026-11-10" }, null, today)).toEqual({
      next_due_date: "2026-11-11",
      next_due_note: ESTIMATION_FOLLOWUP_NOTE,
    });
  });

  it("vendeur sans date d'estimation : comportement inchangé (aujourd'hui + 1re relance vendeur)", () => {
    expect(initialFollowUp({ category: "seller" }, { seller: { initial_days: 15 } }, today)).toEqual({
      next_due_date: "2026-11-21",
      next_due_note: null,
    });
  });

  it("acquéreur : date d'enregistrement + 1re relance acquéreur", () => {
    expect(initialFollowUp({ category: "buyer", acquisition_date: "2026-11-01" }, { buyer: { initial_days: 14 } }, today))
      .toEqual({ next_due_date: "2026-11-15", next_due_note: null });
  });
});
