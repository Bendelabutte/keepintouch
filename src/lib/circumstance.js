// src/lib/circumstance.js
// Circonstance du premier échange (clients.contact_circumstance) : libellés, et valeur déduite
// de l'origine du contact (texte libre) quand la circonstance n'est pas renseignée.

export const CIRCUMSTANCES = Object.freeze(["visite", "agence", "telephone"]);

// Formulaire et fiche
export const CIRCUMSTANCE_LABELS = Object.freeze({
  visite: "Visite d’un bien",
  agence: "Passage à l’agence",
  telephone: "Téléphone",
});

// Fenêtre « Remercier » (libellés courts)
export const CIRCUMSTANCE_SHORT_LABELS = Object.freeze({ visite: "Visite", agence: "Agence", telephone: "Téléphone" });

export const NOT_SPECIFIED = "Non précisé";

const fold = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .trim();

// Correspondances retenues sur l'origine : seulement les cas sans ambiguïté.
// « vitrine », « panneau », « site », « recommandation »… ne disent rien de la circonstance.
const ORIGIN_RULES = [
  ["telephone", /\b(appel|appels|appele|telephone|telephonique|tel|coup de fil)\b/],
  ["agence", /\b(passage|passe|passee|venue?s? (?:a|en) l'agence|venue?s? en agence|en agence|a l'agence|spontane en agence)\b/],
  ["visite", /\b(visite|visites|portes ouvertes)\b(?! virtuelle)/],
];

/** Origine du contact (texte libre) → circonstance, ou "" si rien de clair (ou plusieurs pistes). */
export const circumstanceFromOrigin = (origin) => {
  const o = fold(origin);
  if (!o) return "";
  const found = ORIGIN_RULES.filter(([, re]) => re.test(o)).map(([key]) => key);
  return found.length === 1 ? found[0] : "";
};

/** Circonstance d'une fiche : saisie, sinon déduite de l'origine. { value, inferred } ; value "" = non précisé. */
export const clientCircumstance = (client) => {
  const saved = client?.contact_circumstance;
  if (CIRCUMSTANCES.includes(saved)) return { value: saved, inferred: false };
  const guess = circumstanceFromOrigin(client?.contact_origin);
  return { value: guess, inferred: Boolean(guess) };
};

/** Libellé affiché dans la fiche, ou null si non précisé. */
export const circumstanceDisplay = (client) => {
  const { value, inferred } = clientCircumstance(client);
  if (!value) return null;
  return inferred ? `${CIRCUMSTANCE_LABELS[value]} (d’après l’origine)` : CIRCUMSTANCE_LABELS[value];
};
