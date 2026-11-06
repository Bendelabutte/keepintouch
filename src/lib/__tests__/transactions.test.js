import { describe, it, expect } from "vitest";
import {
  caByUser,
  defaultShares,
  deductionsTotal,
  feesHtFromTtc,
  isSharesTotalValid,
  netFeesHt,
  participantAmount,
  sharesTotal,
  validateParticipants,
  applyDerivedFields,
  deriveDbStatus,
  displayStatus,
  dashboardScope,
  groupParticipantsByUser,
  isPendingPromise,
  participantsVisibleTo,
  pendingStats,
  canEditTransaction,
  canDeleteTransaction,
  isActedTransaction,
} from "../transactions";
import {
  buyerFromClient,
  buyerPayload,
  buyerSplitParticipants,
  matchingClients,
  draftBuyerFiche,
  draftToPayload,
  emptyTransactionDraft,
  isBuyerComplete,
  splitPersonName,
  transactionToDraft,
} from "../transactionDraft";

const shares = (list) => defaultShares(list).map((p) => p.share_pct);

describe("defaultShares — 50 % entrée / 50 % sortie, à parts égales dans chaque côté", () => {
  it("1 négociateur sur un seul côté → 100 %", () => {
    expect(shares([{ user_id: "a", side: "entree" }])).toEqual([100]);
  });

  it("1 négociateur entrée + sortie → 50 / 50", () => {
    const list = [
      { user_id: "louis", side: "entree" },
      { user_id: "louis", side: "sortie" },
    ];
    expect(shares(list)).toEqual([50, 50]);
    expect(sharesTotal(defaultShares(list))).toBe(100);
  });

  it("2 négociateurs, un par côté → 50 / 50", () => {
    expect(shares([{ user_id: "a", side: "entree" }, { user_id: "b", side: "sortie" }])).toEqual([50, 50]);
  });

  it("3 participants : un à l'entrée, deux qui se partagent la sortie → 50 / 25 / 25", () => {
    const list = [
      { user_id: "a", side: "entree" },
      { user_id: "b", side: "sortie" },
      { user_id: "c", side: "sortie" },
    ];
    expect(shares(list)).toEqual([50, 25, 25]);
  });

  it("3 participants dont un négociateur entrée + sortie → 50 / 25 / 25", () => {
    const list = [
      { user_id: "louis", side: "entree" },
      { user_id: "louis", side: "sortie" },
      { user_id: "marie", side: "sortie" },
    ];
    expect(shares(list)).toEqual([50, 25, 25]);
  });

  it("3 à l'entrée : arrondi au centime et total exact de 100 %", () => {
    const list = [
      { user_id: "a", side: "entree" },
      { user_id: "b", side: "entree" },
      { user_id: "c", side: "entree" },
      { user_id: "d", side: "sortie" },
    ];
    expect(shares(list)).toEqual([16.67, 16.67, 16.66, 50]);
    expect(sharesTotal(defaultShares(list))).toBe(100);
  });

  it("conserve les autres champs de chaque ligne", () => {
    expect(defaultShares([{ key: "x", user_id: "a", side: "entree" }])[0]).toMatchObject({ key: "x", user_id: "a" });
  });
});

describe("blocage si le total des parts ≠ 100 %", () => {
  it("total à 90 % → invalide, message explicite", () => {
    const list = [
      { user_id: "a", side: "entree", share_pct: 50 },
      { user_id: "b", side: "sortie", share_pct: 40 },
    ];
    expect(sharesTotal(list)).toBe(90);
    expect(isSharesTotalValid(list)).toBe(false);
    expect(validateParticipants(list).join(" ")).toMatch(/100 %/);
  });

  it("total à 110 % → invalide", () => {
    const list = [
      { user_id: "a", side: "entree", share_pct: 60 },
      { user_id: "b", side: "sortie", share_pct: 50 },
    ];
    expect(isSharesTotalValid(list)).toBe(false);
  });

  it("total à 100 % → valide (y compris parts décimales)", () => {
    const list = [
      { user_id: "a", side: "entree", share_pct: 33.33 },
      { user_id: "b", side: "entree", share_pct: 33.33 },
      { user_id: "c", side: "sortie", share_pct: "33.34" },
    ];
    expect(isSharesTotalValid(list)).toBe(true);
    expect(validateParticipants(list)).toEqual([]);
  });

  it("liste vide, négociateur manquant ou doublon sur un même côté → invalide", () => {
    expect(validateParticipants([])).not.toEqual([]);
    expect(validateParticipants([{ user_id: "", side: "entree", share_pct: 100 }])).not.toEqual([]);
    expect(
      validateParticipants([
        { user_id: "a", side: "entree", share_pct: 50 },
        { user_id: "a", side: "entree", share_pct: 50 },
      ])
    ).not.toEqual([]);
  });
});

describe("base nette et montant par participant", () => {
  it("honoraires 10 000 HT, déduction 1 000 HT, Louis à 50 % → base 9 000, part de Louis 4 500", () => {
    const deductions = [{ label: "Commission apporteur d'affaires", amount_ht: 1000, reason: "Gardien" }];
    const base = netFeesHt(10000, deductions);
    expect(deductionsTotal(deductions)).toBe(1000);
    expect(base).toBe(9000);
    expect(participantAmount(base, 50)).toBe(4500);
  });

  it("sans déduction, la base est égale aux honoraires HT", () => {
    expect(netFeesHt(10000, [])).toBe(10000);
    expect(netFeesHt(10000, undefined)).toBe(10000);
  });

  it("feesHtFromTtc : même formule que la colonne générée", () => {
    expect(feesHtFromTtc(12000, 20)).toBe(10000);
    expect(feesHtFromTtc(1000, 0)).toBe(1000);
    expect(feesHtFromTtc(1000, "")).toBe(833.33);
    expect(feesHtFromTtc("", 20)).toBe(null);
  });
});

describe("caByUser — CA attribué par commercial", () => {
  it("parts partagées et transaction annulée exclue", () => {
    const transactions = [
      {
        status: "cashed",
        fees_ht: 10000,
        participants: [
          { user_id: "louis", side: "entree", share_pct: 50 },
          { user_id: "marie", side: "sortie", share_pct: 25 },
          { user_id: "paul", side: "sortie", share_pct: 25 },
        ],
      },
      {
        status: "signed",
        fees_ttc: 6000,
        vat_rate: 20, // fees_ht recalculé : 5 000
        participants: [
          { user_id: "louis", side: "entree", share_pct: 50 },
          { user_id: "louis", side: "sortie", share_pct: 50 },
        ],
      },
      {
        status: "cancelled",
        fees_ht: 80000,
        participants: [{ user_id: "marie", side: "entree", share_pct: 100 }],
      },
    ];

    expect(caByUser(transactions)).toEqual({ louis: 10000, marie: 2500, paul: 2500 });
  });

  it("le CA attribué porte sur les honoraires bruts, pas sur la base nette", () => {
    const ca = caByUser([
      {
        status: "cashed",
        fees_ht: 10000,
        deductions: [{ amount_ht: 1000 }],
        participants: [{ user_id: "louis", side: "entree", share_pct: 100 }],
      },
    ]);
    expect(ca.louis).toBe(10000);
  });
});

describe("statut dérivé des dates", () => {
  it("vente avec promesse seule → 'in_progress', affichée « Sous promesse », pas d'encaissement", () => {
    const p = applyDerivedFields({ kind: "sale", preliminary_date: "2026-05-02", deed_date: null });
    expect(p.status).toBe("in_progress");
    expect(p.fees_received_at).toBe(null);
    expect(displayStatus(p)).toBe("promise");
  });

  it("vente avec date de vente → 'cashed', « Vendu », fees_received_at = deed_date", () => {
    const p = applyDerivedFields({ kind: "sale", preliminary_date: "2026-05-02", deed_date: "2026-08-10" });
    expect(p.status).toBe("cashed");
    expect(p.fees_received_at).toBe("2026-08-10");
    expect(p.preliminary_date).toBe("2026-05-02");
    expect(displayStatus(p)).toBe("sold");
  });

  it("location → 'cashed', « Loué », fees_received_at = date du bail, pas de date de promesse", () => {
    const p = applyDerivedFields({ kind: "rental", preliminary_date: "2026-01-01", deed_date: "2026-09-01" });
    expect(p.status).toBe("cashed");
    expect(p.fees_received_at).toBe("2026-09-01");
    expect(p.preliminary_date).toBe(null);
    expect(displayStatus(p)).toBe("rented");
    expect(deriveDbStatus({ kind: "rental" })).toBe("cashed");
  });

  it("annulée → « Annulée » quelles que soient les dates", () => {
    expect(displayStatus({ kind: "sale", status: "cancelled", deed_date: "2026-08-10" })).toBe("cancelled");
    expect(displayStatus({ kind: "rental", status: "cancelled" })).toBe("cancelled");
  });

  it("reprises de l'historique ('cashed' ou 'signed', même sans date) → « Vendu »", () => {
    expect(displayStatus({ kind: "sale", status: "cashed", fees_received_at: "2025-03-01" })).toBe("sold");
    expect(displayStatus({ kind: "sale", status: "signed", deed_date: null })).toBe("sold");
  });

  it("modification : date d'encaissement corrigée par un admin conservée si la date de vente ne change pas", () => {
    const original = { deed_date: "2026-08-10", fees_received_at: "2026-09-15" };
    expect(applyDerivedFields({ kind: "sale", deed_date: "2026-08-10" }, original).fees_received_at).toBe("2026-09-15");
    expect(applyDerivedFields({ kind: "sale", deed_date: "2026-08-20" }, original).fees_received_at).toBe("2026-08-20");
  });
});

describe("formulaire : date unique → dates en base", () => {
  const base = (over) => ({ ...emptyTransactionDraft({ userId: "louis" }), fees_ttc: "12000", ...over });

  it("participants par défaut : le commercial connecté à 100 % (entrée 50 + sortie 50)", () => {
    const p = draftToPayload(base({ date: "2026-08-10" }));
    expect(p.participants).toEqual([
      { user_id: "louis", side: "entree", share_pct: 50 },
      { user_id: "louis", side: "sortie", share_pct: 50 },
    ]);
    expect(p.vat_rate).toBe(20);
  });

  it("vente « Promesse » → preliminary_date, sous promesse", () => {
    const p = draftToPayload(base({ date_kind: "promise", date: "2026-05-02" }));
    expect(p).toMatchObject({ preliminary_date: "2026-05-02", deed_date: null, status: "in_progress", fees_received_at: null });
  });

  it("vente « Vente » → deed_date, vendu, encaissement = date de vente", () => {
    const p = draftToPayload(base({ date_kind: "sale", date: "2026-08-10" }));
    expect(p).toMatchObject({ deed_date: "2026-08-10", status: "cashed", fees_received_at: "2026-08-10" });
  });

  it("location → deed_date (date du bail), loué", () => {
    const p = draftToPayload(base({ kind: "rental", date: "2026-09-01" }));
    expect(p).toMatchObject({ preliminary_date: null, deed_date: "2026-09-01", status: "cashed", fees_received_at: "2026-09-01" });
  });

  it("aller-retour : une vente sous promesse rouvre le formulaire en mode « Promesse »", () => {
    const d = transactionToDraft({ id: "t1", kind: "sale", preliminary_date: "2026-05-02", deed_date: null, participants: [] });
    expect(d.date_kind).toBe("promise");
    expect(d.date).toBe("2026-05-02");
  });
});

describe("groupParticipantsByUser — une ligne par personne", () => {
  it("entrée + sortie d'une même personne regroupées, ordre conservé", () => {
    expect(
      groupParticipantsByUser([
        { user_id: "benjamin", side: "entree", share_pct: 50 },
        { user_id: "marie", side: "sortie", share_pct: 25 },
        { user_id: "benjamin", side: "sortie", share_pct: "25" },
      ])
    ).toEqual([
      { user_id: "benjamin", share_pct: 75, sides: ["entree", "sortie"] },
      { user_id: "marie", share_pct: 25, sides: ["sortie"] },
    ]);
  });

  it("un seul négociateur entrée + sortie → 100 %, montant = base nette", () => {
    const [g] = groupParticipantsByUser([
      { user_id: "benjamin", side: "entree", share_pct: 50 },
      { user_id: "benjamin", side: "sortie", share_pct: 50 },
    ]);
    expect(g.share_pct).toBe(100);
    expect(participantAmount(16666.67, g.share_pct)).toBe(16666.67);
  });

  it("liste vide ou lignes sans négociateur ignorées", () => {
    expect(groupParticipantsByUser(undefined)).toEqual([]);
    expect(groupParticipantsByUser([{ user_id: "", side: "entree", share_pct: 50 }])).toEqual([]);
  });
});


const BUYER = {
  first_name: "Jean",
  last_name: "Dupont",
  phone: "0601020304",
  email: "",
  client_birthday: "1980-04-12",
  contact_origin: "vitrine",
  context: "",
};

describe("bloc acquéreur unique", () => {
  const base = (over) => ({ ...emptyTransactionDraft({ userId: "louis" }), fees_ttc: "12000", date: "2026-08-10", ...over });

  it("buyer_label et seller_label = « Prénom Nom »", () => {
    const p = draftToPayload(
      base({ buyer: { ...BUYER, first_name: " Jean " }, seller_first_name: "", seller_last_name: "Martin" })
    );
    expect(p.buyer_label).toBe("Jean Dupont");
    expect(p.seller_label).toBe("Martin");
  });

  it("seuls prénom et nom sont obligatoires ; champs vides retirés de la charge utile", () => {
    expect(isBuyerComplete({ first_name: "Jean", last_name: "Dupont" })).toBe(true);
    expect(isBuyerComplete({ first_name: "", last_name: "Dupont" })).toBe(false);
    expect(buyerPayload(BUYER)).toEqual({
      first_name: "Jean",
      last_name: "Dupont",
      phone: "0601020304",
      client_birthday: "1980-04-12",
      contact_origin: "vitrine",
    });
  });

  it("nouvelle vente, case cochée (par défaut) → acquéreur transmis avec la transaction", () => {
    expect(draftBuyerFiche(base({ buyer: BUYER }))).toMatchObject({ first_name: "Jean", last_name: "Dupont" });
  });

  it("case décochée, location, fiche existante ou nom vide → rien à créer", () => {
    expect(draftBuyerFiche(base({ buyer: BUYER, create_after_sale: false }))).toBe(null);
    expect(draftBuyerFiche(base({ buyer: BUYER, kind: "rental" }))).toBe(null);
    expect(draftBuyerFiche(base({ buyer: BUYER, buyer_mode: "client", buyer_client_id: "c1" }))).toBe(null);
    expect(draftBuyerFiche(base({ buyer: { ...BUYER, last_name: "" } }))).toBe(null);
  });

  it("modification : libellé existant découpé, pas de création implicite de fiche", () => {
    expect(splitPersonName("Jean Pierre Dupont")).toEqual({ first_name: "Jean", last_name: "Pierre Dupont" });
    expect(splitPersonName("Dupont")).toEqual({ first_name: "", last_name: "Dupont" });
    const d = transactionToDraft({ id: "t1", kind: "sale", status: "cashed", buyer_label: "Jean Dupont", participants: [] });
    expect(d.buyer).toMatchObject({ first_name: "Jean", last_name: "Dupont" });
    expect(d.create_after_sale).toBe(false);
  });
});

// Chaîne côté front de « Sous promesse » → « Vente signée » (les RPC record_promise / sign_promise_sale
// appliquent les mêmes règles en base).
describe("promesse → vente → fiche après-vente", () => {
  const promiseDraft = () => ({
    ...emptyTransactionDraft({ userId: "louis" }),
    seller_mode: "client",
    seller_client_id: "vendeur-1",
    date_kind: "promise",
    date: "2026-05-02",
    price: "450000",
    fees_ttc: "18000",
    buyer: BUYER,
  });

  it("promesse : in_progress, date de promesse, pas d'encaissement, propriétaire à 100 %", () => {
    const p = draftToPayload(promiseDraft());
    expect(p).toMatchObject({
      kind: "sale",
      seller_client_id: "vendeur-1",
      preliminary_date: "2026-05-02",
      deed_date: null,
      status: "in_progress",
      fees_received_at: null,
      buyer_label: "Jean Dupont",
    });
    expect(groupParticipantsByUser(p.participants)).toEqual([
      { user_id: "louis", share_pct: 100, sides: ["entree", "sortie"] },
    ]);
    expect(isPendingPromise(p)).toBe(true);
    expect(displayStatus(p)).toBe("promise");
  });

  it("vente signée : seule la date de vente → cashed, encaissement = date de vente, plus en attente", () => {
    const promise = { ...draftToPayload(promiseDraft()), buyer_draft: buyerPayload(BUYER) };
    const sold = applyDerivedFields({ ...promise, deed_date: "2026-08-10" }, { deed_date: null, fees_received_at: null });
    expect(sold).toMatchObject({ status: "cashed", deed_date: "2026-08-10", fees_received_at: "2026-08-10" });
    expect(sold.preliminary_date).toBe("2026-05-02");
    expect(isPendingPromise(sold)).toBe(false);
    expect(displayStatus(sold)).toBe("sold");
    // L'acquéreur conservé à la promesse alimente la fiche après-vente
    expect(sold.buyer_draft).toMatchObject({ first_name: "Jean", last_name: "Dupont", contact_origin: "vitrine" });
  });

  it("modification d'une promesse : rouverte en mode promesse, acquéreur en attente conservé", () => {
    const d = transactionToDraft({
      id: "t1",
      kind: "sale",
      status: "in_progress",
      preliminary_date: "2026-05-02",
      deed_date: null,
      buyer_draft: buyerPayload(BUYER),
      participants: [],
    });
    expect(d.date_kind).toBe("promise");
    expect(d.buyer).toMatchObject({ first_name: "Jean", contact_origin: "vitrine" });
    expect(d.create_after_sale).toBe(true);
  });

  it("répartition verrouillée (non-admin) : les participants ne sont pas renvoyés", () => {
    const d = transactionToDraft(
      { id: "t1", kind: "sale", status: "cashed", deed_date: "2026-08-10", participants: [{ id: "p1", user_id: "louis", side: "entree", share_pct: 100 }] },
      { canEditSplit: false }
    );
    expect("participants" in draftToPayload(d)).toBe(false);
    expect("participants" in draftToPayload({ ...d, split_locked: false })).toBe(true);
  });
});

describe("promesse annulée", () => {
  it("annulée : affichée « Annulée », sort du CA en attente", () => {
    const tx = [
      { kind: "sale", status: "in_progress", fees_ht: 10000, participants: [{ user_id: "louis", share_pct: 100 }] },
      { kind: "sale", status: "cancelled", fees_ht: 50000, participants: [{ user_id: "louis", share_pct: 100 }] },
    ];
    expect(displayStatus(tx[1])).toBe("cancelled");
    expect(pendingStats(tx)).toEqual({ count: 1, feesHt: 10000, netHt: 10000 });
  });
});

describe("CA en attente (ventes sous promesse)", () => {
  const tx = [
    {
      kind: "sale",
      status: "in_progress",
      fees_ht: 10000,
      deductions: [{ amount_ht: 1000 }],
      participants: [
        { user_id: "louis", side: "entree", share_pct: 50 },
        { user_id: "marie", side: "sortie", share_pct: 50 },
      ],
    },
    {
      kind: "sale",
      status: "in_progress",
      fees_ttc: 6000,
      vat_rate: 20,
      participants: [
        { user_id: "louis", side: "entree", share_pct: 50 },
        { user_id: "louis", side: "sortie", share_pct: 50 },
      ],
    },
    { kind: "sale", status: "cashed", fees_ht: 99999, participants: [{ user_id: "louis", share_pct: 100 }] },
    { kind: "rental", status: "cashed", fees_ht: 99999, participants: [{ user_id: "louis", share_pct: 100 }] },
  ];

  it("agence : honoraires HT bruts, nombre de promesses et base nette", () => {
    expect(pendingStats(tx)).toEqual({ count: 2, feesHt: 15000, netHt: 14000 });
  });

  it("commercial : sa part de base nette (projection)", () => {
    // Louis : 9 000 × 50 % + 5 000 × 100 %
    expect(pendingStats(tx, ["louis"])).toEqual({ count: 2, shareNetHt: 9500 });
    expect(pendingStats(tx, ["marie"])).toEqual({ count: 1, shareNetHt: 4500 });
    expect(pendingStats(tx, ["paul"])).toEqual({ count: 0, shareNetHt: 0 });
  });
});

describe("visibilité des montants par rôle", () => {
  const participants = [
    { user_id: "louis", side: "entree", share_pct: 50 },
    { user_id: "marie", side: "sortie", share_pct: 30 },
    { user_id: "paul", side: "sortie", share_pct: 20 },
  ];

  it("commercial : uniquement sa ligne", () => {
    expect(participantsVisibleTo(participants, { userId: "louis" }).map((p) => p.user_id)).toEqual(["louis"]);
    expect(participantsVisibleTo(participants, { userId: "inconnu" })).toEqual([]);
  });

  it("manager : sa ligne et celles de son équipe, pas les autres", () => {
    const viewer = { userId: "chef", isManager: true, managedUserIds: ["marie"] };
    expect(participantsVisibleTo(participants, viewer).map((p) => p.user_id)).toEqual(["marie"]);
  });

  it("une liste d'équipe sans le rôle manager n'élargit pas la vue", () => {
    const viewer = { userId: "louis", isManager: false, managedUserIds: ["marie", "paul"] };
    expect(participantsVisibleTo(participants, viewer).map((p) => p.user_id)).toEqual(["louis"]);
  });

  it("admin : tout", () => {
    expect(participantsVisibleTo(participants, { userId: "admin", isAdmin: true })).toHaveLength(3);
  });

  it("tableau de bord : CA agence admin seulement, comparatif admin et manager", () => {
    expect(dashboardScope({ isAdmin: true })).toEqual({ agencyCa: true, comparison: true, teamFilter: true });
    expect(dashboardScope({ isManager: true })).toEqual({ agencyCa: false, comparison: true, teamFilter: true });
    expect(dashboardScope({})).toEqual({ agencyCa: false, comparison: false, teamFilter: false });
  });

  it("commercial : avec ses seules lignes, le CA attribué ne contient que sa part", () => {
    const visible = [{ status: "cashed", fees_ht: 10000, participants: participantsVisibleTo(participants, { userId: "louis" }) }];
    expect(caByUser(visible)).toEqual({ louis: 5000 });
  });
});

describe("acquéreur existant", () => {
  const clients = [
    { id: "1", category: "buyer", status: "active", first_name: "Élodie", last_name: "Martin", phone: "06 12 34 56 78", email: "elodie@x.fr", owner_id: "b" },
    { id: "2", category: "after", status: "active", first_name: "Paul", last_name: "Martinez", phone: "0700000000", owner_id: "a" },
    { id: "3", category: "seller", status: "closed", first_name: "Eloi", last_name: "Martin", owner_id: "a" },
    { id: "4", category: "seller", status: "active", first_name: "Jean", last_name: "Durand", owner_id: "a" },
  ];

  it("aucune suggestion sous 2 caractères", () => {
    expect(matchingClients(clients, { last_name: "M" })).toEqual([]);
    expect(matchingClients(clients, {})).toEqual([]);
  });

  it("dès 2 caractères, toutes catégories, sans accents, actives d'abord", () => {
    expect(matchingClients(clients, { last_name: "mart" }).map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(matchingClients(clients, { first_name: "elo" }).map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("téléphone (chiffres seuls) et email ; tous les critères saisis doivent correspondre", () => {
    expect(matchingClients(clients, { phone: "0612" }).map((c) => c.id)).toEqual(["1"]);
    expect(matchingClients(clients, { email: "ELODIE" }).map((c) => c.id)).toEqual(["1"]);
    expect(matchingClients(clients, { first_name: "paul", last_name: "martin" }).map((c) => c.id)).toEqual(["2"]);
  });

  it("la fiche vendeur de la transaction est exclue", () => {
    expect(matchingClients(clients, { last_name: "dur" }, { excludeIds: ["4"] })).toEqual([]);
  });

  it("acquéreur d'un autre commercial : mandat entrée 50 %, fiche acquéreur sortie 50 %", () => {
    const split = buyerSplitParticipants({ mandateOwnerId: "a", buyerOwnerId: "b" });
    expect(split.map(({ user_id, side, share_pct }) => ({ user_id, side, share_pct }))).toEqual([
      { user_id: "a", side: "entree", share_pct: 50 },
      { user_id: "b", side: "sortie", share_pct: 50 },
    ]);
    expect(buyerSplitParticipants({ mandateOwnerId: "a", buyerOwnerId: "a" })).toBeNull();
  });

  it("fiche choisie : buyer_client_id envoyé, pas de libellé libre ni de fiche après-vente créée", () => {
    const d = {
      ...emptyTransactionDraft({ kind: "sale", userId: "a" }),
      buyer_mode: "client",
      buyer_client_id: "1",
      buyer: buyerFromClient(clients[0]),
      fees_ttc: "1200",
      date_kind: "promise",
      date: "2026-03-01",
    };
    const payload = draftToPayload(d);
    expect(payload.buyer_client_id).toBe("1");
    expect(payload.buyer_label).toBeNull();
    expect(draftBuyerFiche(d)).toBeNull();
  });
});

describe("verrouillage des ventes actées", () => {
  const me = "u1";
  const base = { created_by: me, validated_at: null, participants: [{ user_id: me }] };
  const promise = { ...base, status: "in_progress" };
  const acted = { ...base, status: "cashed" };

  it("une promesse non validée reste modifiable par le créateur et les participants", () => {
    expect(canEditTransaction(promise, me, false)).toBe(true);
    expect(canEditTransaction({ ...promise, created_by: "u2" }, me, false)).toBe(true);
    expect(canEditTransaction(promise, "u3", false)).toBe(false);
    expect(canDeleteTransaction(promise, me, false)).toBe(true);
  });

  it("une promesse validée n'est plus modifiable par un non-admin", () => {
    expect(canEditTransaction({ ...promise, validated_at: "2026-10-01" }, me, false)).toBe(false);
  });

  it("une vente actée ou une location signée, validée ou non, est réservée à l'admin", () => {
    const cases = [acted, { ...acted, validated_at: "2026-10-01" }, { ...acted, kind: "rental" }, { ...base, status: "signed" }];
    for (const t of cases) {
      expect(isActedTransaction(t)).toBe(true);
      expect(canEditTransaction(t, me, false)).toBe(false);
      expect(canDeleteTransaction(t, me, false)).toBe(false);
      expect(canEditTransaction(t, me, true)).toBe(true);
      expect(canDeleteTransaction(t, me, true)).toBe(true);
    }
  });

  it("une promesse ou une transaction annulée n'est pas une vente actée", () => {
    expect(isActedTransaction(promise)).toBe(false);
    expect(isActedTransaction({ status: "cancelled" })).toBe(false);
    expect(isActedTransaction(null)).toBe(false);
  });
});
