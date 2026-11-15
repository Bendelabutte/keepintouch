import { describe, it, expect } from "vitest";
import {
  aiToForm,
  cleanNoteLines,
  mergeAiValues,
  missingMessage,
  missingRequired,
  parseNumber,
  splitAddressComplement,
} from "../aiParse";

// Réponse simulée de parse-client-description pour :
// « Monsieur Bertrand Lama cherche 2 pièces budget max 300 000 euros, travaux ok, tout 18e sauf
//   Goutte d'Or et La Chapelle, pas de rdc, tel 0677665544 et email bertrandlama@hotmail.com »
const LAMA = {
  type: "acquereur",
  fields: {
    prenom: "Bertrand",
    nom: "Lama",
    telephone: "0677665544",
    email: "bertrandlama@hotmail.com",
    budget_max: "300000",
    type_bien: "Appartement",
    nb_pieces: "2",
    secteurs_souhaites: "Paris 18e",
    secteurs_exclus: "Goutte d'Or, La Chapelle",
    contraintes: "pas de rez-de-chaussée, travaux acceptés",
  },
  confidence: {
    prenom: "sur",
    nom: "sur",
    telephone: "sur",
    email: "sur",
    budget_max: "sur",
    type_bien: "a_verifier",
    nb_pieces: "sur",
    secteurs_souhaites: "sur",
    secteurs_exclus: "sur",
    contraintes: "sur",
  },
};

describe("parseNumber", () => {
  it("convertit les montants écrits librement", () => {
    expect(parseNumber("300 000 euros")).toBe(300000);
    expect(parseNumber("300000")).toBe(300000);
    expect(parseNumber("300k")).toBe(300000);
    expect(parseNumber("300 k€")).toBe(300000);
    expect(parseNumber("300K")).toBe(300000);
    expect(parseNumber("1,2 M€")).toBe(1200000);
    expect(parseNumber("1.5 million")).toBe(1500000);
    expect(parseNumber("1.250.000 €")).toBe(1250000);
    expect(parseNumber("450 mille")).toBe(450000);
    expect(parseNumber("300\u202f000\u00a0€")).toBe(300000);
    expect(parseNumber(300000)).toBe(300000);
  });

  it("convertit surfaces et pièces", () => {
    expect(parseNumber("65 m²")).toBe(65);
    expect(parseNumber("65m2")).toBe(65);
    expect(parseNumber("2 pièces")).toBe(2);
    expect(parseNumber("3 mois")).toBe(3);
  });

  it("vide ou sans chiffre → null", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber("deux pièces")).toBeNull();
    expect(parseNumber(Number.NaN)).toBeNull();
  });
});

describe("aiToForm", () => {
  it("exemple Bertrand Lama : fiche acquéreur pré-remplie", () => {
    const { category, values, marks } = aiToForm(LAMA, "buyer");
    expect(category).toBe("buyer");
    expect(values).toEqual({
      first_name: "Bertrand",
      last_name: "Lama",
      phone: "06 77 66 55 44",
      email: "bertrandlama@hotmail.com",
      budget_max: "300000",
      project_type: "Appartement",
      rooms: "2",
      area: "Paris 18e",
      context: "Secteurs exclus : Goutte d'Or, La Chapelle\nContraintes : pas de rez-de-chaussée, travaux acceptés",
    });
    expect(marks.project_type).toBe("a_verifier");
    expect(marks.last_name).toBe("sur");
    expect(marks.context).toBe("sur");
    expect(missingRequired({ category, ...values })).toEqual([]);
  });

  it("type « auto » : la catégorie vient de l'IA", () => {
    expect(aiToForm(LAMA).category).toBe("buyer");
    expect(aiToForm({ type: "vendeur", fields: {} }).category).toBe("seller");
    expect(aiToForm({ type: "apres_vente", fields: {} }).category).toBe("after");
    expect(aiToForm({ fields: {} }).category).toBe("seller");
  });

  it("n'invente rien : champ absent → absent du formulaire", () => {
    const { values, marks } = aiToForm({ type: "acquereur", fields: { nom: "Lama" }, confidence: {} }, "buyer");
    expect(values).toEqual({ last_name: "Lama" });
    expect(marks).toEqual({ last_name: "sur" });
  });

  it("convertit les nombres et signale une fourchette à vérifier", () => {
    const { values, marks } = aiToForm(
      { fields: { budget_max: "300k", surface_min: "40 m²", nb_pieces: "entre 2 et 3" }, confidence: {} },
      "buyer"
    );
    expect(values.budget_max).toBe("300000");
    expect(values.min_surface).toBe("40");
    expect(values.rooms).toBe("2");
    expect(marks.budget_max).toBe("sur");
    expect(marks.rooms).toBe("a_verifier");
  });

  it("téléphone mis en forme, email en minuscules, invalides à vérifier", () => {
    const ok = aiToForm({ fields: { telephone: "+33 6 77 66 55 44", email: " Bertrand.Lama@Hotmail.com " } }, "buyer");
    expect(ok.values.phone).toBe("+33 6 77 66 55 44");
    expect(ok.values.email).toBe("bertrand.lama@hotmail.com");
    expect(ok.marks.phone).toBe("sur");
    expect(ok.marks.email).toBe("sur");

    const bad = aiToForm({ fields: { telephone: "06 77 66", email: "bertrand arobase hotmail" } }, "buyer");
    expect(bad.values.phone).toBe("06 77 66");
    expect(bad.marks.phone).toBe("a_verifier");
    expect(bad.marks.email).toBe("a_verifier");
  });

  it("cas réel El Habibi : voie seule, pièces dans leur champ, notes en lignes courtes", () => {
    // « propriétaire d'un 3 pièces au 18 rue Ramey 5e étage. Nom El Habibi, 48m², veut une estimation »
    // Réponse simulée telle qu'elle est arrivée avant correction (adresse avec l'étage, phrase en notes)
    const ai = {
      type: "vendeur",
      fields: {
        nom: "El Habibi",
        adresse_bien: "18 rue Ramey, 5e étage",
        type_bien: "",
        nb_pieces: "3",
        surface_min: "48",
        notes: "Propriétaire souhaitant une estimation de son bien. Surface indiquée : 48 m².",
      },
      confidence: {},
    };
    const { category, values, marks } = aiToForm(ai);
    expect(category).toBe("seller");
    expect(values.property_address).toBe("18 rue Ramey");
    expect(marks.property_address).toBe("a_verifier");
    expect(values.rooms).toBe("3");
    expect(values.consultant_feeling).toBe("Surface : 48 m²\nComplément d’adresse : 5e étage");
    // aucune phrase, aucune répétition
    expect(values.consultant_feeling).not.toMatch(/Propriétaire|estimation|pièces|Bien :/);
    expect(values.context).toBeUndefined();
  });

  it("cas réel El Habibi, réponse corrigée de la fonction (complement_adresse séparé)", () => {
    const { values } = aiToForm(
      {
        type: "vendeur",
        fields: { nom: "El Habibi", adresse_bien: "18 rue Ramey", complement_adresse: "5e étage", nb_pieces: "3", surface_min: "48" },
        confidence: { complement_adresse: "sur" },
      },
      "seller"
    );
    expect(values.property_address).toBe("18 rue Ramey");
    expect(values.rooms).toBe("3");
    expect(values.consultant_feeling).toBe("Surface : 48 m²\nComplément d’adresse : 5e étage");
  });

  it("ressenti réduit au motif du contact : omis", () => {
    const { values } = aiToForm({ fields: { nom: "X", ressenti: "Propriétaire souhaitant une estimation." } }, "seller");
    expect(values.consultant_feeling).toBeUndefined();
  });

  it("vendeur : adresse, date, pièces, raison ; le reste en lignes dans le ressenti", () => {
    const { values, marks } = aiToForm(
      {
        type: "vendeur",
        fields: {
          nom: "Durand",
          adresse_bien: "12 rue Ordener, 75018 Paris",
          date_estimation: "2026-11-09",
          horizon: "Moyen terme",
          raison_vente: "Mutation à Lyon",
          type_bien: "Appartement",
          nb_pieces: "3",
          surface_min: "62",
          ressenti: "Vendeur pressé",
          contraintes: "occupé jusqu'en mars",
        },
        confidence: { date_estimation: "a_verifier" },
      },
      "seller"
    );
    expect(values.property_address).toBe("12 rue Ordener, 75018 Paris");
    expect(marks.property_address).toBe("a_verifier");
    expect(values.estimation_date).toBe("2026-11-09");
    expect(marks.estimation_date).toBe("a_verifier");
    expect(values.rooms).toBe("3");
    expect(values.project_horizon).toBe("Moyen terme");
    expect(values.sale_reason).toBe("Mutation à Lyon");
    expect(values.consultant_feeling).toBe(
      "Vendeur pressé\nType de bien : Appartement\nSurface : 62 m²\nContraintes : occupé jusqu'en mars"
    );
    expect(values.context).toBeUndefined();
  });

  it("date invalide : pas dans le champ date, mais conservée en note", () => {
    const { values } = aiToForm({ fields: { date_estimation: "mardi dernier" } }, "seller");
    expect(values.estimation_date).toBeUndefined();
    expect(values.consultant_feeling).toBe("Date d’estimation : mardi dernier");
  });

  it("valeurs hors liste (type de bien, horizon) non forcées dans les listes", () => {
    const { values } = aiToForm({ fields: { type_bien: "Loft", horizon: "Bientôt" } }, "buyer");
    expect(values.project_type).toBeUndefined();
    expect(values.project_horizon).toBeUndefined();
    expect(values.context).toBe("Type de bien : Loft");
  });

  it("après-vente : adresse, pièces et lignes de notes dans le contexte, phrases écartées", () => {
    const { values } = aiToForm(
      {
        fields: {
          adresse_bien: "3 rue Lepic, bât. B",
          nb_pieces: "2",
          notes: "Emménagement : janvier\nLe client est très sympathique et a acheté récemment.",
        },
      },
      "after"
    );
    expect(values.after_address).toBe("3 rue Lepic");
    expect(values.context).toBe("Pièces : 2\nComplément d’adresse : bât. B\nEmménagement : janvier");
  });
});

describe("splitAddressComplement (filet de sécurité front)", () => {
  it("retire étage, porte, bâtiment, digicode de l'adresse", () => {
    expect(splitAddressComplement("18 rue Ramey, 5e étage")).toEqual({ address: "18 rue Ramey", complement: "5e étage" });
    expect(splitAddressComplement("18 rue Ramey au 5e étage")).toEqual({ address: "18 rue Ramey", complement: "5e étage" });
    expect(splitAddressComplement("18 rue Ramey 5ème étage 75018 Paris")).toEqual({
      address: "18 rue Ramey, 75018 Paris",
      complement: "5ème étage",
    });
    expect(splitAddressComplement("3 rue Lepic, RDC")).toEqual({ address: "3 rue Lepic", complement: "RDC" });
    expect(splitAddressComplement("3 rue Lepic, bât. B, porte gauche, code 1234")).toEqual({
      address: "3 rue Lepic",
      complement: "bât. B, porte gauche, code 1234",
    });
    expect(splitAddressComplement("3 rue Lepic, escalier C, au fond de la cour")).toEqual({
      address: "3 rue Lepic",
      complement: "escalier C, fond de la cour",
    });
  });

  it("ne touche pas aux noms de voie qui ressemblent à un motif", () => {
    expect(splitAddressComplement("7 rue de la Porte Blanche").address).toBe("7 rue de la Porte Blanche");
    expect(splitAddressComplement("10 rue des Batignolles").address).toBe("10 rue des Batignolles");
    expect(splitAddressComplement("2 rue du Code Civil").address).toBe("2 rue du Code Civil");
    expect(splitAddressComplement("12 rue Ordener, 75018 Paris")).toEqual({ address: "12 rue Ordener, 75018 Paris", complement: "" });
  });
});

describe("cleanNoteLines", () => {
  it("ne garde que les lignes « Libellé : valeur » sans redite ni motif", () => {
    expect(
      cleanNoteLines(
        "Propriétaire souhaitant une estimation de son bien.\nSurface indiquée : 48 m²\nMotif : estimation\nNom du syndic : Foncia\n- Cave : oui"
      )
    ).toEqual(["Nom du syndic : Foncia", "Cave : oui"]);
    expect(cleanNoteLines("")).toEqual([]);
  });
});

describe("mergeAiValues : non-écrasement des corrections manuelles", () => {
  const defaults = { project_horizon: "Court terme", last_name: "", phone: "" };

  it("premier remplissage : champs vides et valeurs par défaut remplacés", () => {
    const current = { category: "buyer", last_name: "", phone: "", project_horizon: "Court terme", email: "" };
    const { values, applied, kept } = mergeAiValues(
      current,
      { last_name: "Lama", project_horizon: "Moyen terme" },
      { defaults }
    );
    expect(values.last_name).toBe("Lama");
    expect(values.project_horizon).toBe("Moyen terme");
    expect(applied).toEqual(["last_name", "project_horizon"]);
    expect(kept).toEqual([]);
  });

  it("second appui : ce qui a été corrigé à la main est conservé", () => {
    const previous = { last_name: "Lamma", phone: "06 77 66 55 44", budget_max: "300000" };
    // l'utilisateur a corrigé le nom ; téléphone et budget sont restés tels que l'IA les avait mis
    const current = { last_name: "Lama", phone: "06 77 66 55 44", budget_max: "300000", area: "" };
    const proposed = { last_name: "Lamma", phone: "06 11 22 33 44", budget_max: "320000", area: "Paris 18e" };
    const { values, applied, kept } = mergeAiValues(current, proposed, { previous, defaults });
    expect(values.last_name).toBe("Lama");
    expect(values.phone).toBe("06 11 22 33 44");
    expect(values.budget_max).toBe("320000");
    expect(values.area).toBe("Paris 18e");
    expect(kept).toEqual(["last_name"]);
    expect(applied).toEqual(["phone", "budget_max", "area"]);
  });

  it("une saisie manuelle avant tout remplissage n'est jamais remplacée", () => {
    const { values, kept } = mergeAiValues({ email: "moi@agence.fr" }, { email: "autre@x.fr" });
    expect(values.email).toBe("moi@agence.fr");
    expect(kept).toEqual(["email"]);
  });

  it("ne modifie pas l'objet d'origine", () => {
    const current = { last_name: "" };
    mergeAiValues(current, { last_name: "Lama" });
    expect(current.last_name).toBe("");
  });
});

describe("missingRequired", () => {
  it("liste précisément ce qui manque, dans l'ordre du formulaire", () => {
    const missing = missingRequired({ category: "seller", last_name: "", phone: "", email: "", property_address: "" });
    expect(missing.map((m) => m.field)).toEqual(["last_name", "phone", "property_address"]);
    expect(missingMessage(missing)).toBe("À compléter : le nom, un téléphone ou un email, l’adresse du bien.");
  });

  it("téléphone OU email suffit ; l'adresse n'est exigée que pour un vendeur", () => {
    expect(missingRequired({ category: "buyer", last_name: "Lama", email: "a@b.fr" })).toEqual([]);
    expect(missingRequired({ category: "after", last_name: "Lama", phone: "0677665544" })).toEqual([]);
  });

  it("email invalide signalé", () => {
    expect(missingRequired({ category: "buyer", last_name: "Lama", email: "lama@" })).toEqual([
      { field: "email", label: "un email valide" },
    ]);
  });

  it("rien ne manque → message vide", () => {
    expect(missingMessage([])).toBe("");
  });
});
