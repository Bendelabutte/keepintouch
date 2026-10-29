// src/lib/relance.js
// Délais de relance par catégorie : valeurs par défaut uniques et conversions app_settings.

export const RELANCE_DEFAULTS = Object.freeze({
  seller: Object.freeze({ initial_days: 15, default_next_days: 21 }),
  buyer: Object.freeze({ initial_days: 14, default_next_days: 21 }),
  after: Object.freeze({ initial_days: 45, default_next_days: 90 }),
});

export const normalizeCategory = (category) =>
  category === "buyer" ? "buyer" : category === "after" ? "after" : "seller";

// null / undefined / "" / non numérique → fallback ; 0 est une valeur valide.
export const toDays = (value, fallback) => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const resolveRelanceCfg = (config, category) => {
  const cat = normalizeCategory(category);
  const defaults = RELANCE_DEFAULTS[cat];
  const cfg = config?.[cat];
  return {
    initial_days: toDays(cfg?.initial_days, defaults.initial_days),
    default_next_days: toDays(cfg?.default_next_days, defaults.default_next_days),
  };
};

export const settingsRowToRelanceConfig = (row) => ({
  seller: {
    initial_days: toDays(row?.seller_first_days, RELANCE_DEFAULTS.seller.initial_days),
    default_next_days: toDays(row?.seller_repeat_days, RELANCE_DEFAULTS.seller.default_next_days),
  },
  buyer: {
    initial_days: toDays(row?.buyer_first_days, RELANCE_DEFAULTS.buyer.initial_days),
    default_next_days: toDays(row?.buyer_repeat_days, RELANCE_DEFAULTS.buyer.default_next_days),
  },
  after: {
    initial_days: toDays(row?.after_first_days, RELANCE_DEFAULTS.after.initial_days),
    default_next_days: toDays(row?.after_repeat1_days, RELANCE_DEFAULTS.after.default_next_days),
  },
});

export const relanceConfigToSettingsRow = (config) => {
  const seller = resolveRelanceCfg(config, "seller");
  const buyer = resolveRelanceCfg(config, "buyer");
  const after = resolveRelanceCfg(config, "after");
  return {
    seller_first_days: seller.initial_days,
    seller_repeat_days: seller.default_next_days,
    buyer_first_days: buyer.initial_days,
    buyer_repeat_days: buyer.default_next_days,
    after_first_days: after.initial_days,
    after_repeat1_days: after.default_next_days,
  };
};
