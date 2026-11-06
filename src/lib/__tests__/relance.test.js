import { describe, it, expect } from "vitest";
import {
  RELANCE_DEFAULTS,
  toDays,
  resolveRelanceCfg,
  settingsRowToRelanceConfig,
  relanceConfigToSettingsRow,
  RELANCE_PROMESSE_DAYS,
  promiseRelanceDays,
  relanceCfgForClient,
  PHASE_LABELS,
  followUpForEdit,
  hasNoFollowUp,
  isPhaseChange,
  normalizePhase,
  phaseBadgeClass,
  phaseChangeFollowUp,
  sellerPhaseActions,
  shouldAddPhaseComment,
} from "../relance";
import { addDaysToDate } from "../dates";

const PROMISE_DEFAULT = { promise: { default_next_days: 30 } };

describe("RELANCE_DEFAULTS", () => {
  it("valeurs métier attendues", () => {
    expect(RELANCE_DEFAULTS).toEqual({
      seller: { initial_days: 15, default_next_days: 21 },
      buyer: { initial_days: 14, default_next_days: 21 },
      after: { initial_days: 45, default_next_days: 90 },
    });
  });
});

describe("toDays", () => {
  it("0 est respecté, vide / invalide → fallback", () => {
    expect(toDays(0, 15)).toBe(0);
    expect(toDays("0", 15)).toBe(0);
    expect(toDays(7, 15)).toBe(7);
    expect(toDays(null, 15)).toBe(15);
    expect(toDays(undefined, 15)).toBe(15);
    expect(toDays("", 15)).toBe(15);
    expect(toDays("abc", 15)).toBe(15);
  });
});

describe("resolveRelanceCfg", () => {
  it("config absente → défauts de la catégorie", () => {
    expect(resolveRelanceCfg(null, "seller")).toEqual(RELANCE_DEFAULTS.seller);
    expect(resolveRelanceCfg({}, "buyer")).toEqual(RELANCE_DEFAULTS.buyer);
    expect(resolveRelanceCfg(undefined, "after")).toEqual(RELANCE_DEFAULTS.after);
  });

  it("catégorie inconnue → vendeur", () => {
    expect(resolveRelanceCfg(null, "xyz")).toEqual(RELANCE_DEFAULTS.seller);
  });

  it("champ manquant → défaut champ par champ, 0 conservé", () => {
    expect(resolveRelanceCfg({ after: { initial_days: 0 } }, "after")).toEqual({
      initial_days: 0,
      default_next_days: 90,
    });
  });
});

describe("settingsRowToRelanceConfig / relanceConfigToSettingsRow", () => {
  it("ligne vide → défauts", () => {
    expect(settingsRowToRelanceConfig(null)).toEqual({ ...RELANCE_DEFAULTS, ...PROMISE_DEFAULT });
    expect(settingsRowToRelanceConfig({})).toEqual({ ...RELANCE_DEFAULTS, ...PROMISE_DEFAULT });
  });

  it("respecte 0 et les valeurs saisies", () => {
    const cfg = settingsRowToRelanceConfig({
      seller_first_days: 0,
      seller_repeat_days: 30,
      buyer_first_days: null,
      buyer_repeat_days: 0,
      after_first_days: 60,
      after_repeat1_days: undefined,
      seller_promise_days: 45,
    });
    expect(cfg).toEqual({
      seller: { initial_days: 0, default_next_days: 30 },
      buyer: { initial_days: 14, default_next_days: 0 },
      after: { initial_days: 60, default_next_days: 90 },
      promise: { default_next_days: 45 },
    });
  });

  it("aller-retour config → ligne → config", () => {
    const cfg = {
      seller: { initial_days: 0, default_next_days: 10 },
      buyer: { initial_days: 3, default_next_days: 0 },
      after: { initial_days: 45, default_next_days: 120 },
      promise: { default_next_days: 20 },
    };
    const row = relanceConfigToSettingsRow(cfg);
    expect(row).toEqual({
      seller_first_days: 0,
      seller_repeat_days: 10,
      buyer_first_days: 3,
      buyer_repeat_days: 0,
      after_first_days: 45,
      after_repeat1_days: 120,
      seller_promise_days: 20,
    });
    expect(settingsRowToRelanceConfig(row)).toEqual(cfg);
  });

  it("config vide → défauts uniques (plus de 15/14 partout)", () => {
    expect(relanceConfigToSettingsRow({})).toEqual({
      seller_first_days: 15,
      seller_repeat_days: 21,
      buyer_first_days: 14,
      buyer_repeat_days: 21,
      after_first_days: 45,
      after_repeat1_days: 90,
      seller_promise_days: 30,
    });
  });
});

describe("relances sous promesse", () => {
  it("constante par défaut : 30 jours", () => {
    expect(RELANCE_PROMESSE_DAYS).toBe(30);
    expect(promiseRelanceDays(null)).toBe(30);
    expect(promiseRelanceDays({ promise: { default_next_days: "" } })).toBe(30);
  });

  it("valeur des Paramètres admin prioritaire, 0 respecté", () => {
    expect(promiseRelanceDays({ promise: { default_next_days: 45 } })).toBe(45);
    expect(promiseRelanceDays({ promise: { default_next_days: 0 } })).toBe(0);
  });

  it("au passage en promesse : prochaine relance = date de promesse + 30 jours", () => {
    expect(addDaysToDate("2026-05-02", promiseRelanceDays(RELANCE_DEFAULTS))).toBe("2026-06-01");
  });

  it("fiche vendeur sous promesse : délai dédié pour la 1re relance et les suivantes", () => {
    const config = { ...RELANCE_DEFAULTS, promise: { default_next_days: 40 } };
    expect(relanceCfgForClient(config, { category: "seller", deal_stage: "sous_promesse" })).toEqual({
      initial_days: 40,
      default_next_days: 40,
    });
    expect(relanceCfgForClient(RELANCE_DEFAULTS, { category: "seller", deal_stage: "sous_promesse" })).toEqual({
      initial_days: 30,
      default_next_days: 30,
    });
  });

  it("autres fiches : délais habituels de leur catégorie", () => {
    expect(relanceCfgForClient(RELANCE_DEFAULTS, { category: "seller", deal_stage: "mandat" })).toEqual(
      RELANCE_DEFAULTS.seller
    );
    expect(relanceCfgForClient(RELANCE_DEFAULTS, { category: "buyer", deal_stage: null })).toEqual(
      RELANCE_DEFAULTS.buyer
    );
    expect(relanceCfgForClient(RELANCE_DEFAULTS, null)).toEqual(RELANCE_DEFAULTS.seller);
  });
});

// --- Phases vendeur : changement de phase = relance -----------------------------------------
// today = 29/10/2026 ; délai vendeur par défaut 21 j, sous promesse 30 j.
const TODAY_PHASE = new Date(2026, 9, 29);

describe("phaseChangeFollowUp — règle unique au changement de phase", () => {
  it("→ Sous mandat : aujourd'hui + relance par défaut vendeur", () => {
    expect(phaseChangeFollowUp({ toStage: "mandat", config: RELANCE_DEFAULTS, today: TODAY_PHASE })).toEqual({
      next_due_date: "2026-11-19",
      next_due_source: "auto",
      comment: "Phase : Sous mandat",
    });
  });

  it("→ Sous promesse : date de promesse + relance sous promesse", () => {
    const f = phaseChangeFollowUp({
      toStage: "sous_promesse",
      config: { ...RELANCE_DEFAULTS, promise: { default_next_days: 30 } },
      today: TODAY_PHASE,
      promiseDate: "2026-10-22",
    });
    expect(f).toEqual({ next_due_date: "2026-11-21", next_due_source: "auto", comment: "Phase : Sous promesse" });
  });

  it("→ Vendu : plus de relance, même si une date est saisie", () => {
    expect(
      phaseChangeFollowUp({ toStage: "vendu", config: RELANCE_DEFAULTS, today: TODAY_PHASE, userDate: "2026-12-01" })
    ).toEqual({ next_due_date: null, next_due_source: null, comment: "Phase : Vendu" });
  });

  it("→ Pré-mandat (retour arrière) : aujourd'hui + relance par défaut vendeur", () => {
    const config = { ...RELANCE_DEFAULTS, seller: { initial_days: 15, default_next_days: 10 } };
    expect(phaseChangeFollowUp({ toStage: "pre_mandat", config, today: TODAY_PHASE }).next_due_date).toBe("2026-11-08");
  });

  it("date saisie par l'utilisateur dans le même geste : prioritaire", () => {
    expect(
      phaseChangeFollowUp({ toStage: "mandat", config: RELANCE_DEFAULTS, today: TODAY_PHASE, userDate: "2026-11-03" })
    ).toMatchObject({ next_due_date: "2026-11-03", next_due_source: "manual" });
  });
});

describe("parcours mandat → promesse → acte", () => {
  it("chaque étape recalcule la relance ; une fois vendue, la fiche n'a plus de suivi", () => {
    const config = { ...RELANCE_DEFAULTS, promise: { default_next_days: 30 } };
    const steps = [
      phaseChangeFollowUp({ toStage: "mandat", config, today: TODAY_PHASE }),
      phaseChangeFollowUp({ toStage: "sous_promesse", config, today: TODAY_PHASE, promiseDate: "2026-11-02" }),
      phaseChangeFollowUp({ toStage: "vendu", config, today: TODAY_PHASE }),
    ];
    expect(steps.map((s) => s.next_due_date)).toEqual(["2026-11-19", "2026-12-02", null]);
    expect(steps.map((s) => s.comment)).toEqual(["Phase : Sous mandat", "Phase : Sous promesse", "Phase : Vendu"]);

    const soldFiche = { category: "seller", status: "closed", deal_stage: "vendu", estimation_date: "2025-07-02" };
    expect(hasNoFollowUp(soldFiche)).toBe(true);
  });
});

describe("promesse annulée → retour sous mandat", () => {
  it("relance recalculée depuis aujourd'hui, pas depuis l'ancienne date de promesse", () => {
    const f = phaseChangeFollowUp({ toStage: "mandat", config: RELANCE_DEFAULTS, today: TODAY_PHASE });
    expect(isPhaseChange("sous_promesse", "mandat")).toBe(true);
    expect(f.next_due_date).toBe("2026-11-19");
    expect(f.comment).toBe("Phase : Sous mandat");
  });
});

describe("changement de phase via « Modifier »", () => {
  const base = { config: RELANCE_DEFAULTS, today: TODAY_PHASE, originalDate: "2026-10-01" };

  it("phase inchangée → aucune relance recalculée", () => {
    expect(followUpForEdit({ ...base, fromStage: "mandat", toStage: "mandat", manualDate: "2026-10-01" })).toBe(null);
    expect(followUpForEdit({ ...base, fromStage: null, toStage: "pre_mandat", manualDate: "" })).toBe(null);
  });

  it("pré-mandat → sous mandat, date d'origine conservée dans le formulaire → recalcul", () => {
    expect(
      followUpForEdit({ ...base, fromStage: "pre_mandat", toStage: "mandat", manualDate: "2026-10-01" })
    ).toMatchObject({ next_due_date: "2026-11-19", next_due_source: "auto" });
  });

  it("date modifiée par l'utilisateur dans le même geste → sa date l'emporte", () => {
    expect(
      followUpForEdit({ ...base, fromStage: "pre_mandat", toStage: "mandat", manualDate: "2026-11-05" })
    ).toMatchObject({ next_due_date: "2026-11-05", next_due_source: "manual" });
  });
});

describe("affichage d'une fiche vendue", () => {
  it("libellé, badge et absence de relance (même avec une date d'estimation ancienne)", () => {
    const sold = { category: "seller", status: "closed", deal_stage: "vendu", estimation_date: "2025-07-02" };
    expect(PHASE_LABELS[normalizePhase(sold.deal_stage)]).toBe("Vendu");
    expect(phaseBadgeClass("vendu")).toBe("stage-badge stage-badge-vendu");
    expect(phaseBadgeClass("sous_promesse")).toBe("stage-badge stage-badge-promesse");
    expect(phaseBadgeClass(undefined)).toBe("stage-badge stage-badge-premandat");
    expect(hasNoFollowUp(sold)).toBe(true);
  });

  it("le bug observé : fiche clôturée restée « sous_promesse » → toujours sans relance ni retard", () => {
    expect(hasNoFollowUp({ category: "seller", status: "closed", deal_stage: "sous_promesse" })).toBe(true);
    expect(hasNoFollowUp({ category: "seller", status: "active", deal_stage: "sous_promesse" })).toBe(false);
  });
});

describe("actions de phase sur la fiche vendeur", () => {
  const keys = (c) => sellerPhaseActions(c).map((a) => `${a.key}${a.primary ? "*" : ""}`);

  it("pré-mandat : « Passer sous mandat » (principal) puis « Passer sous promesse »", () => {
    expect(sellerPhaseActions({ category: "seller", status: "active", deal_stage: "pre_mandat" })).toEqual([
      { key: "to_mandat", label: "Passer sous mandat", primary: true },
      { key: "to_promise", label: "Passer sous promesse", primary: false },
    ]);
    expect(keys({ category: "seller", status: "active", deal_stage: null })).toEqual(["to_mandat*", "to_promise"]);
  });

  it("sous mandat : « Passer sous promesse » seul, en principal", () => {
    expect(keys({ category: "seller", status: "active", deal_stage: "mandat" })).toEqual(["to_promise*"]);
  });

  it("sous promesse : « Acte signé » (principal) puis « Promesse annulée »", () => {
    const actions = sellerPhaseActions({ category: "seller", status: "active", deal_stage: "sous_promesse" });
    expect(actions.map((a) => a.label)).toEqual(["Acte signé", "Promesse annulée"]);
    expect(actions[0]).toMatchObject({ primary: true, hint: "Vente définitive chez le notaire" });
  });

  it("vendue, close ou autre catégorie : aucune action", () => {
    expect(sellerPhaseActions({ category: "seller", status: "closed", deal_stage: "vendu" })).toEqual([]);
    expect(sellerPhaseActions({ category: "seller", status: "closed", deal_stage: "mandat" })).toEqual([]);
    expect(sellerPhaseActions({ category: "buyer", status: "active" })).toEqual([]);
  });
});

describe("un seul commentaire par action", () => {
  it("« Passer sous mandat » et « Modifier » : commentaire de phase", () => {
    expect(shouldAddPhaseComment({ fromStage: "pre_mandat", toStage: "mandat" })).toBe(true);
    expect(shouldAddPhaseComment({ fromStage: "mandat", toStage: "pre_mandat" })).toBe(true);
  });

  it("promesse, promesse annulée, acte signé : le commentaire d'action suffit", () => {
    expect(shouldAddPhaseComment({ fromStage: "mandat", toStage: "sous_promesse", hasActionComment: true })).toBe(false);
    expect(shouldAddPhaseComment({ fromStage: "sous_promesse", toStage: "mandat", hasActionComment: true })).toBe(false);
    expect(
      shouldAddPhaseComment({ fromStage: "sous_promesse", toStage: "vendu", status: "closed", hasActionComment: true })
    ).toBe(false);
  });

  it("pas de changement de phase, ou clôture pour un autre motif : aucun commentaire de phase", () => {
    expect(shouldAddPhaseComment({ fromStage: "mandat", toStage: "mandat" })).toBe(false);
    expect(shouldAddPhaseComment({ fromStage: "sous_promesse", toStage: "mandat", status: "closed" })).toBe(false);
  });
});

describe("acquéreur sous promesse", () => {
  it("relance selon le délai sous promesse, puis délai acquéreur une fois la promesse annulée", () => {
    expect(relanceCfgForClient(RELANCE_DEFAULTS, { category: "buyer", deal_stage: "sous_promesse" })).toEqual({
      initial_days: 30,
      default_next_days: 30,
    });
    expect(relanceCfgForClient(RELANCE_DEFAULTS, { category: "buyer", deal_stage: null })).toEqual({
      initial_days: 14,
      default_next_days: 21,
    });
  });
});
