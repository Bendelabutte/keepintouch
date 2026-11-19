import { describe, it, expect } from "vitest";
import {
  DEFAULT_OPENING_DATE,
  openingDateMissing,
  allowedPage,
  canSeeCompensation,
  canSeeTransactionFigures,
  canSeeTransactions,
  compensationMissingFields,
  compensationSettingsComplete,
  hiddenNavKeys,
} from "../modules";

const admin = { isAdmin: true, transactionsVisible: false, compensationReadable: 0 };
const commercial = (o = {}) => ({ isAdmin: false, transactionsVisible: false, compensationReadable: 0, ...o });

describe("interrupteur Transactions", () => {
  it("fermé : admin seulement (onglet, pages, chiffres du tableau de bord)", () => {
    expect(canSeeTransactions(admin)).toBe(true);
    expect(canSeeTransactions(commercial())).toBe(false);
    expect(canSeeTransactionFigures(commercial())).toBe(false);
    expect(allowedPage("transactions", commercial())).toBeNull();
    expect(allowedPage("transactions", admin)).toBe("transactions");
  });

  it("ouvert : visible par tous", () => {
    const c = commercial({ transactionsVisible: true });
    expect(canSeeTransactions(c)).toBe(true);
    expect(canSeeTransactionFigures(c)).toBe(true);
    expect(allowedPage("transactions", c)).toBe("transactions");
  });

  it("valeur absente ou non booléenne (réglages non chargés) : fermé", () => {
    expect(canSeeTransactions({ isAdmin: false })).toBe(false);
    expect(canSeeTransactions({ isAdmin: false, transactionsVisible: "true" })).toBe(false);
    expect(canSeeTransactions(null)).toBe(false);
  });
});

describe("interrupteur Rémunération", () => {
  it("un commercial ne voit sa page que si la base lui laisse lire des réglages", () => {
    expect(canSeeCompensation(commercial())).toBe(false);
    expect(canSeeCompensation(commercial({ compensationReadable: 1 }))).toBe(true);
    expect(allowedPage("remuneration", commercial())).toBeNull();
    expect(allowedPage("remuneration", commercial({ compensationReadable: 1 }))).toBe("remuneration");
  });

  it("l'admin voit toujours tout", () => {
    expect(canSeeCompensation(admin)).toBe(true);
    expect(allowedPage("remuneration", admin)).toBe("remuneration");
  });

  it("les deux interrupteurs sont indépendants", () => {
    expect(hiddenNavKeys(commercial())).toEqual(["transactions", "remuneration"]);
    expect(hiddenNavKeys(commercial({ transactionsVisible: true }))).toEqual(["remuneration"]);
    expect(hiddenNavKeys(commercial({ compensationReadable: 2 }))).toEqual(["transactions"]);
    expect(hiddenNavKeys(admin)).toEqual([]);
  });

  it("les autres pages ne sont jamais masquées", () => {
    expect(allowedPage("clients", commercial())).toBe("clients");
    expect(allowedPage("dashboard", commercial())).toBe("dashboard");
  });
});

describe("date d'ouverture obligatoire", () => {
  it("proposée par défaut au 1er janvier 2027", () => {
    expect(DEFAULT_OPENING_DATE).toBe("2027-01-01");
  });

  it("un type ou un taux sans date d'ouverture est refusé", () => {
    expect(openingDateMissing({ compensation_type: "salarie", opening_balance_date: "" })).toBe(true);
    expect(openingDateMissing({ rate_entree: "10", opening_balance_date: null })).toBe(true);
    expect(openingDateMissing({ rate_sortie: 0 })).toBe(true);
    expect(openingDateMissing({ compensation_type: "agent_tva", rate_entree: "50", opening_balance_date: "2027-01-01" })).toBe(false);
  });

  it("réglages vides : la date n'est pas exigée (commercial non paramétré)", () => {
    expect(openingDateMissing({ compensation_type: "", rate_entree: "", rate_sortie: "", opening_balance_date: "" })).toBe(false);
    expect(openingDateMissing(null)).toBe(false);
  });
});

describe("« Visible par le commercial » : réglages complets exigés", () => {
  const complete = { compensation_type: "salarie", rate_entree: "10", rate_sortie: "12,5", opening_balance_date: "2026-12-01" };

  it("type, deux taux et date d'ouverture renseignés", () => {
    expect(compensationSettingsComplete(complete)).toBe(true);
    expect(compensationMissingFields(complete)).toEqual([]);
    expect(compensationSettingsComplete({ ...complete, rate_entree: 0, rate_sortie: 0 })).toBe(true);
  });

  it("un élément manquant suffit à l'interdire", () => {
    expect(compensationSettingsComplete({ ...complete, compensation_type: "" })).toBe(false);
    expect(compensationSettingsComplete({ ...complete, rate_sortie: "" })).toBe(false);
    expect(compensationSettingsComplete({ ...complete, rate_entree: "150" })).toBe(false);
    expect(compensationSettingsComplete({ ...complete, opening_balance_date: null })).toBe(false);
    expect(compensationSettingsComplete(null)).toBe(false);
    expect(compensationMissingFields({})).toEqual(["le type", "les taux entrée et sortie", "la date d'ouverture"]);
    expect(compensationMissingFields({ ...complete, opening_balance_date: "" })).toEqual(["la date d'ouverture"]);
  });
});
