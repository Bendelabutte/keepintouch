// Tests de sanitize() (filet de sécurité sur l'adresse).
// Lancer depuis ce dossier :
//   deno test --node-modules-dir=none --allow-env --allow-net --allow-read index_test.ts
import { assertEquals } from "jsr:@std/assert@1";

Deno.env.set("PARSE_CLIENT_DESCRIPTION_TEST", "1");
const { sanitize, splitAddressComplement } = await import("./index.ts");

Deno.test("cas réel El Habibi : l'étage quitte l'adresse", () => {
  const out = sanitize(
    {
      type_fiche: "vendeur",
      nom: "El Habibi",
      adresse_bien: "18 rue Ramey, 5e étage",
      complement_adresse: "",
      nb_pieces: "3",
      surface_min: "48",
      a_verifier: [],
    },
    "auto"
  );
  assertEquals(out.type, "vendeur");
  assertEquals(out.fields.adresse_bien, "18 rue Ramey");
  assertEquals(out.fields.complement_adresse, "5e étage");
  assertEquals(out.confidence.adresse_bien, "a_verifier");
  assertEquals(out.fields.nb_pieces, "3");
});

Deno.test("complément déjà donné par l'IA : fusion sans doublon", () => {
  const out = sanitize(
    { adresse_bien: "18 rue Ramey au 5e étage", complement_adresse: "5e étage, digicode 1234B", a_verifier: [] },
    "vendeur"
  );
  assertEquals(out.fields.adresse_bien, "18 rue Ramey");
  assertEquals(out.fields.complement_adresse, "5e étage, digicode 1234B");
});

Deno.test("adresse déjà propre : inchangée", () => {
  const out = sanitize({ adresse_bien: "12 rue Ordener, 75018 Paris", a_verifier: [] }, "vendeur");
  assertEquals(out.fields.adresse_bien, "12 rue Ordener, 75018 Paris");
  assertEquals(out.fields.complement_adresse, undefined);
  assertEquals(out.confidence.adresse_bien, "sur");
});

Deno.test("motifs d'étage, porte, bâtiment, digicode", () => {
  const cases: [string, string, string][] = [
    ["18 rue Ramey 5ème étage 75018 Paris", "18 rue Ramey, 75018 Paris", "5ème étage"],
    ["3 rue Lepic, RDC", "3 rue Lepic", "RDC"],
    ["3 rue Lepic, bât. B, porte gauche", "3 rue Lepic", "bât. B, porte gauche"],
    ["3 rue Lepic code 1234", "3 rue Lepic", "code 1234"],
    ["3 rue Lepic, escalier C, 2e étage, au fond de la cour", "3 rue Lepic", "escalier C, 2e étage, fond de la cour"],
    ["7 rue de la Porte Blanche", "7 rue de la Porte Blanche", ""],
    ["10 rue des Batignolles", "10 rue des Batignolles", ""],
  ];
  for (const [input, address, complement] of cases) {
    assertEquals(splitAddressComplement(input), { address, complement }, input);
  }
});

Deno.test("circonstance : gardée seulement si le texte la dit explicitement", () => {
  const raw = { type_fiche: "acquereur", nom: "Lama", circonstance: "visite", a_verifier: [] };
  const cases: [string, string, string | undefined][] = [
    ["visite", "Je suis en visite avec M. Lama, cherche 2 pièces", "visite"],
    ["agence", "À l'agence avec Mme Durand, budget 400k", "agence"],
    ["agence", "Passage agence de M. Lama", "agence"],
    ["telephone", "Au téléphone avec M. Lama", "telephone"],
    ["telephone", "Il m'a appelé ce matin pour un 3 pièces", "telephone"],
    ["telephone", "Il s'appelle Lama, cherche un 3 pièces", undefined],
    ["visite", "M. Lama cherche un 2 pièces dans le 18e", undefined],
    ["salon", "Rencontré au salon de l'immobilier", undefined],
  ];
  for (const [circonstance, text, expected] of cases) {
    const out = sanitize({ ...raw, circonstance }, "auto", text);
    assertEquals(out.fields.circonstance, expected, text);
  }
});

Deno.test("circonstance vide : absente des champs", () => {
  const out = sanitize({ type_fiche: "vendeur", nom: "Lama", circonstance: "", a_verifier: [] }, "auto", "Au téléphone avec M. Lama");
  assertEquals(out.fields.circonstance, undefined);
});
