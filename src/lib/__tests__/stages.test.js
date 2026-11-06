import { describe, it, expect } from "vitest";
import {
  actedSaleForSeller,
  mandatePayload,
  mandatePotential,
  mandateFormFromClient,
  promisePrefillFromMandate,
  reopenConfirmation,
  sellerTimeline,
  visibleSellerSections,
} from "../stages";
import { ESTIMATION_FOLLOWUP_NOTE, initialFollowUp } from "../relance";
import { emptyTransactionDraft } from "../transactionDraft";

const states = (steps) => steps.map((s) => `${s.key}:${s.state}`);

describe("frise des étapes vendeur", () => {
  const base = { category: "seller", status: "active", estimation_date: "2026-01-15" };

  it("pré-mandat : seule l'estimation est atteinte", () => {
    expect(states(sellerTimeline({ ...base, deal_stage: "pre_mandat" }))).toEqual([
      "estimation:current",
      "mandat:todo",
      "promesse:todo",
      "vendu:todo",
    ]);
  });

  it("sous mandat : date du mandat affichée, promesse à venir", () => {
    const steps = sellerTimeline({ ...base, deal_stage: "mandat", mandat_at: "2026-02-01T10:00:00Z" });
    expect(states(steps)).toEqual(["estimation:done", "mandat:current", "promesse:todo", "vendu:todo"]);
    expect(steps[1].date).toBe("2026-02-01T10:00:00Z");
    expect(steps[2].date).toBeNull();
  });

  it("sous promesse : date de promesse lue depuis la transaction", () => {
    const steps = sellerTimeline(
      { ...base, deal_stage: "sous_promesse", mandat_at: "2026-02-01" },
      { promiseDate: "2026-04-02" }
    );
    expect(states(steps)).toEqual(["estimation:done", "mandat:done", "promesse:current", "vendu:todo"]);
    expect(steps[2].date).toBe("2026-04-02");
  });

  it("vendu : toutes les étapes franchies, date de l'acte", () => {
    const steps = sellerTimeline(
      { ...base, status: "closed", deal_stage: "vendu", mandat_at: "2026-02-01" },
      { promiseDate: "2026-04-02", deedDate: "2026-06-30" }
    );
    expect(states(steps)).toEqual(["estimation:done", "mandat:done", "promesse:done", "vendu:done"]);
    expect(steps[3].date).toBe("2026-06-30");
  });

  it("clos pour un autre motif : dernière étape « Clos » avec sa date, étapes non atteintes vides", () => {
    const steps = sellerTimeline({
      ...base,
      status: "closed",
      deal_stage: "mandat",
      mandat_at: "2026-02-01",
      closed_at: "2026-03-10T09:00:00Z",
    });
    expect(states(steps)).toEqual(["estimation:done", "mandat:done", "promesse:todo", "clos:done"]);
    expect(steps[3].label).toBe("Clos");
    expect(steps[3].date).toBe("2026-03-10T09:00:00Z");
  });

  it("sections visibles selon l'étape atteinte", () => {
    expect(visibleSellerSections({ ...base, deal_stage: "pre_mandat" })).toMatchObject({ mandat: false, promesse: false, synthese: false });
    expect(visibleSellerSections({ ...base, deal_stage: "mandat" })).toMatchObject({ mandat: true, promesse: false });
    expect(visibleSellerSections({ ...base, status: "closed", deal_stage: "vendu" })).toMatchObject({
      mandat: true,
      promesse: true,
      synthese: true,
    });
  });
});

describe("mandat et pré-remplissage de la promesse", () => {
  it("fenêtre de mandat pré-remplie, montants facultatifs", () => {
    expect(mandateFormFromClient({ listing_price: 350000, planned_fees_ttc: 15000 })).toEqual({
      listing_price: "350000",
      planned_fees_ttc: "15000",
      mandate_type: "",
    });
    expect(mandatePayload({ listing_price: "", planned_fees_ttc: "", mandate_type: "" })).toEqual({
      payload: { listing_price: null, planned_fees_ttc: null, mandate_type: null },
    });
    expect(mandatePayload({ listing_price: "350 000", planned_fees_ttc: "15000,50", mandate_type: "exclusif" })).toEqual({
      payload: { listing_price: 350000, planned_fees_ttc: 15000.5, mandate_type: "exclusif" },
    });
    expect(mandatePayload({ listing_price: "abc" }).error).toBeTruthy();
  });

  it("le formulaire de promesse reprend le prix et les honoraires du mandat", () => {
    const draft = promisePrefillFromMandate(emptyTransactionDraft({ kind: "sale", userId: "u1" }), {
      listing_price: 350000,
      planned_fees_ttc: 15000,
    });
    expect(draft.price).toBe("350000");
    expect(draft.fees_ttc).toBe("15000");
  });

  it("sans mandat chiffré, la promesse reste vide ; une saisie existante n'est pas écrasée", () => {
    const empty = promisePrefillFromMandate(emptyTransactionDraft({ kind: "sale" }), { listing_price: null });
    expect(empty.price).toBe("");
    expect(empty.fees_ttc).toBe("");
    const kept = promisePrefillFromMandate({ ...emptyTransactionDraft({ kind: "sale" }), price: "340000" }, { listing_price: 350000 });
    expect(kept.price).toBe("340000");
  });

  it("potentiel sous mandat : honoraires prévus des fiches actives sous mandat", () => {
    const clients = [
      { category: "seller", status: "active", deal_stage: "mandat", planned_fees_ttc: 12000 },
      { category: "seller", status: "active", deal_stage: "mandat", planned_fees_ttc: null },
      { category: "seller", status: "active", deal_stage: "sous_promesse", planned_fees_ttc: 9000 },
      { category: "seller", status: "closed", deal_stage: "mandat", planned_fees_ttc: 5000 },
    ];
    expect(mandatePotential(clients)).toEqual({ feesTtc: 12000, count: 2, withFees: 1 });
  });
});

describe("réouverture d'une fiche vendue avec nous", () => {
  const seller = { id: "s1", category: "seller", status: "closed", deal_stage: "vendu" };
  const txs = [
    { id: "t0", seller_client_id: "s1", status: "cancelled", deed_date: "2026-05-01", fees_ttc: 1000 },
    { id: "t1", seller_client_id: "s1", status: "cashed", deed_date: "2026-06-30", fees_ttc: 15000 },
    { id: "t2", seller_client_id: "s2", status: "cashed", deed_date: "2026-07-01", fees_ttc: 9000 },
  ];
  const fmt = { formatDate: (d) => d.split("-").reverse().join("/"), formatCurrency: (n) => `${n} €` };

  it("retrouve la vente actée liée et annonce son annulation", () => {
    expect(actedSaleForSeller(seller, txs).id).toBe("t1");
    const { transaction, text } = reopenConfirmation(seller, txs, fmt);
    expect(transaction.id).toBe("t1");
    expect(text).toBe("Cette vente du 30/06/2026, 15000 € d’honoraires, sera annulée et ses commissions supprimées.");
  });

  it("sans vente actée liée, pas de confirmation particulière", () => {
    expect(reopenConfirmation({ ...seller, id: "s3" }, txs, fmt)).toEqual({ transaction: null, text: null });
    expect(reopenConfirmation({ id: "s1", category: "buyer" }, txs, fmt).transaction).toBeNull();
  });
});

describe("1re relance d'une estimation passée", () => {
  const today = new Date(2026, 10, 6);

  it("lendemain déjà passé : relance aujourd'hui, même note", () => {
    expect(initialFollowUp({ category: "seller", estimation_date: "2026-10-20" }, null, today)).toEqual({
      next_due_date: "2026-11-06",
      next_due_note: ESTIMATION_FOLLOWUP_NOTE,
    });
  });

  it("estimation d'hier : lendemain = aujourd'hui", () => {
    expect(initialFollowUp({ category: "seller", estimation_date: "2026-11-05" }, null, today).next_due_date).toBe("2026-11-06");
  });

  it("estimation à venir : lendemain de l'estimation", () => {
    expect(initialFollowUp({ category: "seller", estimation_date: "2026-11-12" }, null, today).next_due_date).toBe("2026-11-13");
  });
});
