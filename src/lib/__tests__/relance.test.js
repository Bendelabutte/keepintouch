import { describe, it, expect } from "vitest";
import {
  RELANCE_DEFAULTS,
  toDays,
  resolveRelanceCfg,
  settingsRowToRelanceConfig,
  relanceConfigToSettingsRow,
} from "../relance";

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
    expect(settingsRowToRelanceConfig(null)).toEqual(RELANCE_DEFAULTS);
    expect(settingsRowToRelanceConfig({})).toEqual(RELANCE_DEFAULTS);
  });

  it("respecte 0 et les valeurs saisies", () => {
    const cfg = settingsRowToRelanceConfig({
      seller_first_days: 0,
      seller_repeat_days: 30,
      buyer_first_days: null,
      buyer_repeat_days: 0,
      after_first_days: 60,
      after_repeat1_days: undefined,
    });
    expect(cfg).toEqual({
      seller: { initial_days: 0, default_next_days: 30 },
      buyer: { initial_days: 14, default_next_days: 0 },
      after: { initial_days: 60, default_next_days: 90 },
    });
  });

  it("aller-retour config → ligne → config", () => {
    const cfg = {
      seller: { initial_days: 0, default_next_days: 10 },
      buyer: { initial_days: 3, default_next_days: 0 },
      after: { initial_days: 45, default_next_days: 120 },
    };
    const row = relanceConfigToSettingsRow(cfg);
    expect(row).toEqual({
      seller_first_days: 0,
      seller_repeat_days: 10,
      buyer_first_days: 3,
      buyer_repeat_days: 0,
      after_first_days: 45,
      after_repeat1_days: 120,
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
    });
  });
});
