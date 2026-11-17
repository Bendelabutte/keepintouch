import { describe, it, expect } from "vitest";
import {
  agencyChoice,
  areaPhrase,
  brandLine,
  buildOutreachMessages,
  buyerSearchSummary,
  clientEmailError,
  defaultSellerMessage,
  defaultTemplateFor,
  estimationThankDue,
  formatLongDate,
  mailtoLink,
  mobileNumber,
  openingFor,
  outreachKindFor,
  outreachLabel,
  smsLink,
  whatsappLink,
} from "../outreach";

const TODAY = "2026-11-15";
const LOUIS = { first_name: "Louis", last_name: "Ferbos" };
const JUNOT = {
  id: "a1",
  name: "18 Avenue Caulaincourt - Junot",
  google_review_url: "https://g.page/r/abc/review",
  address: "18 rue Caulaincourt, 75018 Paris",
  phone: "0142000000",
};
const LINK = "https://g.page/r/abc/review";

describe("fiches concernées et message par défaut", () => {
  it("acquéreur, vendeur estimé ; ni après-vente, ni vendeur sans estimation, ni dossier clos", () => {
    expect(outreachKindFor({ category: "buyer", status: "active" })).toBe("acquereur");
    expect(outreachKindFor({ category: "seller", status: "active", estimation_value: 450000 })).toBe("vendeur");
    expect(outreachKindFor({ category: "seller", status: "active" })).toBeNull();
    expect(outreachKindFor({ category: "after", status: "active" })).toBeNull();
    expect(outreachKindFor({ category: "buyer", status: "closed" })).toBeNull();
  });

  it("vendeur : date future → confirmation du rendez-vous", () => {
    expect(defaultSellerMessage({ estimation_date: "2026-11-20" }, TODAY)).toBe("vendeur_rdv");
  });

  it("vendeur : date du jour, passée, ou valeur sans date → après l'estimation", () => {
    expect(defaultSellerMessage({ estimation_date: TODAY }, TODAY)).toBe("vendeur_estimation");
    expect(defaultSellerMessage({ estimation_date: "2026-11-02" }, TODAY)).toBe("vendeur_estimation");
    expect(defaultSellerMessage({ estimation_value: 450000 }, TODAY)).toBe("vendeur_estimation");
  });

  it("defaultTemplateFor", () => {
    expect(defaultTemplateFor({ category: "buyer" }, TODAY)).toBe("acquereur");
    expect(defaultTemplateFor({ category: "seller", estimation_date: "2026-11-20" }, TODAY)).toBe("vendeur_rdv");
    expect(defaultTemplateFor({ category: "after" }, TODAY)).toBeNull();
  });
});

describe("estimationThankDue (bandeau « Remercier après l'estimation »)", () => {
  const seller = { category: "seller", status: "active", estimation_date: "2026-11-14" };

  it("estimation passée ou du jour, sans remerciement après estimation", () => {
    expect(estimationThankDue(seller, [], TODAY)).toBe(true);
    expect(estimationThankDue({ ...seller, estimation_date: TODAY }, [], TODAY)).toBe(true);
    expect(estimationThankDue(seller, [{ template: "vendeur_rdv", status: "prepare" }], TODAY)).toBe(true);
    expect(estimationThankDue(seller, [{ template: "vendeur_estimation", status: "echec" }], TODAY)).toBe(true);
  });

  it("pas de bandeau : déjà remercié, estimation future, valeur sans date, acquéreur, dossier clos", () => {
    expect(estimationThankDue(seller, [{ template: "vendeur_estimation", status: "prepare" }], TODAY)).toBe(false);
    expect(estimationThankDue(seller, [{ template: "vendeur_estimation", status: "envoye" }], TODAY)).toBe(false);
    expect(estimationThankDue({ ...seller, estimation_date: "2026-11-16" }, [], TODAY)).toBe(false);
    expect(estimationThankDue({ category: "seller", status: "active", estimation_value: 400000 }, [], TODAY)).toBe(false);
    expect(estimationThankDue({ ...seller, category: "buyer" }, [], TODAY)).toBe(false);
    expect(estimationThankDue({ ...seller, status: "closed" }, [], TODAY)).toBe(false);
  });
});

describe("formatLongDate", () => {
  it("« jeudi 20 novembre », 1er, année seulement si différente", () => {
    expect(formatLongDate("2026-11-20", TODAY)).toBe("vendredi 20 novembre");
    expect(formatLongDate("2026-12-01", TODAY)).toBe("mardi 1er décembre");
    expect(formatLongDate("2027-01-07", TODAY)).toBe("jeudi 7 janvier 2027");
    expect(formatLongDate("", TODAY)).toBe("");
  });
});

describe("areaPhrase et buyerSearchSummary", () => {
  it("préposition déjà présente : gardée, en minuscule, sans préposition ajoutée", () => {
    expect(areaPhrase("A moins d'une heure de Paris")).toBe("à moins d'une heure de Paris");
    expect(areaPhrase("à Montmartre")).toBe("à Montmartre");
    expect(areaPhrase("près du métro Jules Joffrin")).toBe("près du métro Jules Joffrin");
    expect(areaPhrase("Proche Jules Joffrin")).toBe("proche Jules Joffrin");
    expect(areaPhrase("Dans le 17e")).toBe("dans le 17e");
  });

  it("sinon : « dans le » pour un arrondissement, « à » pour le reste, sans majuscule parasite", () => {
    expect(areaPhrase("18e")).toBe("dans le 18e");
    expect(areaPhrase("Paris 17")).toBe("à Paris 17");
    expect(areaPhrase("Montmartre")).toBe("à Montmartre");
    expect(areaPhrase("Aubervilliers")).toBe("à Aubervilliers");
  });

  it("cas réel : maison à moins d'une heure de Paris", () => {
    expect(buyerSearchSummary({ project_type: "Maison", area: "A moins d'une heure de Paris" })).toBe(
      "une maison à moins d'une heure de Paris"
    );
  });

  it("ligne complète et récap partiel", () => {
    expect(buyerSearchSummary({ rooms: 2, area: "18e", budget_max: 300000 })).toBe("un 2 pièces dans le 18e, jusqu'à 300 000 €");
    expect(buyerSearchSummary({ project_type: "Maison", rooms: "4", area: "Montreuil" })).toBe("une maison de 4 pièces à Montreuil");
    expect(buyerSearchSummary({ rooms: 1 })).toBe("un studio");
    expect(buyerSearchSummary({ budget_max: "450 000" })).toBe("un bien jusqu'à 450 000 €");
    expect(buyerSearchSummary({})).toBe("");
  });
});

describe("ouvertures", () => {
  it("acquéreur selon la circonstance", () => {
    expect(openingFor("acquereur", "visite")).toBe("Merci pour la visite et pour le temps que vous m'avez accordé.");
    expect(openingFor("acquereur", "agence")).toBe("Merci pour votre passage à l'agence et pour le temps que vous m'avez accordé.");
    expect(openingFor("acquereur", "telephone")).toBe("Merci pour notre échange téléphonique.");
    expect(openingFor("acquereur", "")).toBe("Merci pour notre échange.");
  });

  it("vendeur, rendez-vous : visite et non précisé → « notre échange »", () => {
    expect(openingFor("vendeur_rdv", "agence")).toBe("Merci pour votre passage à l'agence.");
    expect(openingFor("vendeur_rdv", "telephone")).toBe("Merci pour notre échange téléphonique.");
    expect(openingFor("vendeur_rdv", "visite")).toBe("Merci pour notre échange.");
    expect(openingFor("vendeur_rdv", "")).toBe("Merci pour notre échange.");
  });
});

describe("buildOutreachMessages", () => {
  const buyer = { first_name: "Claire", category: "buyer", rooms: 2, area: "18e", budget_max: 300000 };
  const seller = { first_name: "Paul", category: "seller", estimation_date: "2026-11-20", property_address: "18 rue Ramey, 75018 Paris" };
  const build = (template, client, extra = {}) =>
    buildOutreachMessages({ template, client, sender: LOUIS, agency: JUNOT, today: TODAY, ...extra });

  it("acquéreur : texte court (visite)", () => {
    expect(build("acquereur", buyer, { circumstance: "visite" }).short).toBe(
      "Bonjour Claire, merci pour la visite et pour le temps que vous m'avez accordé. " +
        "J'ai bien noté votre recherche : un 2 pièces dans le 18e, jusqu'à 300 000 €. " +
        "Je vous recontacte dès qu'un bien correspondant à vos critères se présente.\n" +
        `Votre avis compte beaucoup pour nous : ${LINK}\n` +
        "Merci pour votre confiance,\n" +
        "Louis Ferbos – 18 Avenue Caulaincourt - Junot"
    );
  });

  it("acquéreur : email (téléphone)", () => {
    const m = build("acquereur", buyer, { circumstance: "telephone" });
    expect(m.emailSubject).toBe("Votre recherche avec 18 Avenue");
    expect(m.emailBody).toBe(
      [
        "Bonjour Claire,",
        "Merci pour notre échange téléphonique. J'ai bien noté votre recherche : un 2 pièces dans le 18e, jusqu'à 300 000 €.",
        "Je vous contacterai dès qu'un bien correspondant à vos critères se présentera. N'hésitez pas à me tenir informé de l'évolution de votre projet.",
        `Votre avis compte beaucoup pour nous : ${LINK}`,
        "Merci encore pour votre confiance.",
        "Bien cordialement,\nLouis Ferbos\n18 Avenue Caulaincourt - Junot\n18 rue Caulaincourt, 75018 Paris\n01 42 00 00 00",
      ].join("\n\n")
    );
  });

  it("acquéreur sans récap ni prénom", () => {
    const m = build("acquereur", { category: "buyer" });
    expect(m.short.startsWith("Bonjour, merci pour notre échange. J'ai bien noté votre recherche. Je vous recontacte")).toBe(true);
    expect(m.emailBody).toContain("Merci pour notre échange. J'ai bien noté votre recherche.\n\n");
    expect(m.emailBody.startsWith("Bonjour,\n\n")).toBe(true);
  });

  it("vendeur, rendez-vous : date, adresse, aucune demande d'avis", () => {
    const m = build("vendeur_rdv", seller, { circumstance: "agence" });
    expect(m.short).toBe(
      "Bonjour Paul, merci pour votre passage à l'agence. Comme convenu, je viendrai découvrir votre bien le vendredi 20 novembre afin de vous remettre rapidement un avis de valeur.\n" +
        "Merci pour votre confiance,\nLouis Ferbos – 18 Avenue Caulaincourt - Junot"
    );
    expect(m.emailSubject).toBe("Confirmation de notre rendez-vous");
    expect(m.emailBody).toBe(
      [
        "Bonjour Paul,",
        "Merci pour votre passage à l'agence. Comme convenu, je viendrai découvrir votre bien au 18 rue Ramey, 75018 Paris le vendredi 20 novembre afin de vous remettre rapidement un avis de valeur.",
        "D'ici là, n'hésitez pas à me contacter pour toute question.",
        "Merci pour votre confiance.",
        "Bien cordialement,\nLouis Ferbos\n18 Avenue Caulaincourt - Junot\n18 rue Caulaincourt, 75018 Paris\n01 42 00 00 00",
      ].join("\n\n")
    );
    expect(`${m.short} ${m.emailBody}`).not.toMatch(/avis compte|g\.page/);
  });

  it("vendeur, rendez-vous sans adresse ni date : morceaux omis", () => {
    const m = build("vendeur_rdv", { first_name: "Paul" });
    expect(m.emailBody).toContain("Comme convenu, je viendrai découvrir votre bien afin de vous remettre");
  });

  it("vendeur, après l'estimation", () => {
    const m = build("vendeur_estimation", seller, { circumstance: "telephone" });
    expect(m.short).toBe(
      "Bonjour Paul, merci pour votre accueil et pour le temps que vous m'avez consacré. Je vous adresse mon avis de valeur dans les meilleurs délais.\n" +
        `Votre avis compte beaucoup pour nous : ${LINK}\n` +
        "Merci pour votre confiance,\nLouis Ferbos – 18 Avenue Caulaincourt - Junot"
    );
    expect(m.emailSubject).toBe("Merci pour votre accueil");
    expect(m.emailBody).toContain(
      "Bonjour Paul,\n\nMerci pour votre accueil et pour le temps que vous m'avez consacré lors de la visite de votre bien. Je vous adresse mon avis de valeur dans les meilleurs délais.\n\n" +
        "Je reste à votre disposition pour toute question d'ici là.\n\n" +
        `Votre avis compte beaucoup pour nous : ${LINK}\n\nMerci encore pour votre confiance.\n\nBien cordialement,`
    );
  });

  it("sans lien d'avis ou sans agence : phrase d'avis retirée entière", () => {
    const noLink = build("acquereur", buyer, { agency: { ...JUNOT, google_review_url: "" } });
    expect(noLink.short).not.toContain("avis compte");
    expect(noLink.emailBody).not.toContain("avis compte");
    expect(noLink.short).toContain("se présente.\nMerci pour votre confiance,");

    const noAgency = build("vendeur_estimation", { first_name: "Paul" }, { agency: null });
    expect(noAgency.short).toBe(
      "Bonjour Paul, merci pour votre accueil et pour le temps que vous m'avez consacré. Je vous adresse mon avis de valeur dans les meilleurs délais.\n" +
        "Merci pour votre confiance,\nLouis Ferbos – 18 Avenue"
    );
  });

  it("ne demande jamais 5 étoiles", () => {
    for (const template of ["acquereur", "vendeur_rdv", "vendeur_estimation"]) {
      const m = build(template, buyer);
      expect(`${m.short} ${m.emailBody}`).not.toMatch(/étoile|5\s*\*/i);
    }
  });
});

describe("brandLine", () => {
  it("nom de l'agence tel quel, « 18 Avenue » sans agence", () => {
    expect(brandLine({ name: "18 Avenue Caulaincourt - Junot" })).toBe("18 Avenue Caulaincourt - Junot");
    expect(brandLine({ name: "  " })).toBe("18 Avenue");
    expect(brandLine(null)).toBe("18 Avenue");
  });
});

describe("mobileNumber", () => {
  it("06 et 07 deviennent 336 / 337", () => {
    expect(mobileNumber("06 77 66 55 44")).toEqual({ number: "33677665544", error: "" });
    expect(mobileNumber("07.12.34.56.78").number).toBe("33712345678");
  });

  it("+33 conservé, 0 national retiré", () => {
    expect(mobileNumber("+33 6 77 66 55 44").number).toBe("33677665544");
    expect(mobileNumber("+33 (0)7 12 34 56 78").number).toBe("33712345678");
    expect(mobileNumber("0033677665544").number).toBe("33677665544");
  });

  it("numéro étranger conservé", () => {
    expect(mobileNumber("+44 7911 123456").number).toBe("447911123456");
    expect(mobileNumber("+1 415 555 2671").number).toBe("14155552671");
  });

  it("fixe refusé", () => {
    expect(mobileNumber("01 42 00 00 00").error).toMatch(/fixe/);
    expect(mobileNumber("+33 1 42 00 00 00").error).toMatch(/fixe/);
    expect(mobileNumber("09 70 00 00 00").number).toBe("");
  });

  it("absent ou incomplet refusé", () => {
    expect(mobileNumber("").error).toMatch(/pas de numéro/);
    expect(mobileNumber("06 77 66").error).toMatch(/pas reconnu/);
    expect(mobileNumber("+33 6 77").number).toBe("");
  });
});

describe("liens", () => {
  const text = "Bonjour Élodie, jusqu'à 300 000 €\nLouis – 18 Avenue";

  it("wa.me : texte encodé (accents, €, retours à la ligne)", () => {
    const url = whatsappLink("33677665544", text);
    expect(url.startsWith("https://wa.me/33677665544?text=")).toBe(true);
    expect(url).toContain("%C3%89lodie");
    expect(url).toContain("%E2%82%AC");
    expect(url).toContain("%0A");
    expect(url).not.toMatch(/\s/);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(text);
  });

  it("sms: au format ?&body=", () => {
    const url = smsLink("33677665544", text);
    expect(url.startsWith("sms:+33677665544?&body=")).toBe(true);
    expect(decodeURIComponent(url.split("&body=")[1])).toBe(text);
  });

  it("mailto: objet et corps encodés, CRLF", () => {
    const url = mailtoLink(" claire@exemple.fr ", "Votre recherche avec 18 Avenue", "Bonjour,\n\nMerci & à bientôt ?");
    expect(url.startsWith("mailto:claire@exemple.fr?subject=Votre%20recherche%20avec%2018%20Avenue&body=")).toBe(true);
    expect(url).toContain("Bonjour%2C%0D%0A%0D%0AMerci%20%26%20%C3%A0%20bient%C3%B4t%20%3F");
    expect(url).not.toMatch(/\s/);
  });

  it("email de la fiche requis et valide", () => {
    expect(clientEmailError("")).toMatch(/pas d’adresse/);
    expect(clientEmailError("claire@")).toMatch(/pas valide/);
    expect(clientEmailError("claire@exemple.fr")).toBe("");
  });
});

describe("agencyChoice", () => {
  const A = { id: "a", name: "Ramey" };
  const B = { id: "b", name: "Batignolles" };
  const OLD = { id: "z", name: "Ancienne", archived_at: "2026-01-01" };

  it("une seule agence : prise d'office, pas de sélecteur", () => {
    expect(agencyChoice({ myAgencies: [A, OLD], allAgencies: [A, B, OLD], storedId: "b" })).toEqual({
      showPicker: false,
      options: [A],
      selectedId: "a",
    });
  });

  it("plusieurs agences : sélecteur, dernier choix mémorisé, sinon la première", () => {
    expect(agencyChoice({ myAgencies: [A, B], storedId: "b" })).toMatchObject({ showPicker: true, selectedId: "b" });
    expect(agencyChoice({ myAgencies: [A, B], storedId: null })).toMatchObject({ selectedId: "a" });
    expect(agencyChoice({ myAgencies: [A, B], storedId: "inconnue" })).toMatchObject({ selectedId: "a" });
    expect(agencyChoice({ myAgencies: [A, B], storedId: "" })).toMatchObject({ selectedId: "" });
  });

  it("aucune agence : choix parmi toutes les agences non archivées, aucune par défaut", () => {
    const r = agencyChoice({ myAgencies: [], allAgencies: [A, B, OLD], storedId: null });
    expect(r.showPicker).toBe(true);
    expect(r.options).toEqual([A, B]);
    expect(r.selectedId).toBe("");
    expect(agencyChoice({ myAgencies: [], allAgencies: [A, B], storedId: "b" }).selectedId).toBe("b");
  });
});

describe("outreachLabel", () => {
  it("libellés de l'historique", () => {
    expect(outreachLabel({ channel: "whatsapp", template: "acquereur", status: "prepare" })).toBe("Remerciement préparé par WhatsApp");
    expect(outreachLabel({ channel: "sms", template: "vendeur_estimation", status: "prepare" })).toBe("Remerciement préparé par SMS");
    expect(outreachLabel({ channel: "email", template: "acquereur", status: "prepare" })).toBe("Remerciement préparé dans la messagerie");
    expect(outreachLabel({ channel: "email_app", template: "acquereur", status: "envoye" })).toBe("Remerciement envoyé par email");
    expect(outreachLabel({ channel: "email_app", template: "acquereur", status: "echec" })).toMatch(/Échec/);
    expect(outreachLabel({ channel: "whatsapp", template: "vendeur_rdv", status: "prepare" })).toBe(
      "Confirmation de rendez-vous préparée par WhatsApp"
    );
    expect(outreachLabel({ channel: "email_app", template: "vendeur_rdv", status: "envoye" })).toBe(
      "Confirmation de rendez-vous envoyée par email"
    );
  });
});
