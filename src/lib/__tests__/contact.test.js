import { describe, it, expect } from "vitest";
import {
  emailError,
  formatPhone,
  formatPhoneInput,
  isValidEmail,
  normalizePhone,
  phoneSearchDigits,
} from "../contact";

describe("normalizePhone", () => {
  it("garde les chiffres d'un numéro français", () => {
    expect(normalizePhone("06 77 66 55 44")).toBe("0677665544");
    expect(normalizePhone("06.77.66.55.44")).toBe("0677665544");
    expect(normalizePhone(" 06-77-66-55-44 ")).toBe("0677665544");
  });

  it("garde le + des numéros internationaux et retire le 0 national après +33", () => {
    expect(normalizePhone("+33 6 77 66 55 44")).toBe("+33677665544");
    expect(normalizePhone("+33 (0)6 77 66 55 44")).toBe("+33677665544");
    expect(normalizePhone("0033 6 77 66 55 44")).toBe("+33677665544");
    expect(normalizePhone("+41 79 123 45 67")).toBe("+41791234567");
  });

  it("vide reste vide", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
  });
});

describe("formatPhone", () => {
  it("affiche par paires", () => {
    expect(formatPhone("0677665544")).toBe("06 77 66 55 44");
    expect(formatPhone("06 77 66 55 44")).toBe("06 77 66 55 44");
  });

  it("affiche un numéro +33 avec l'indicatif", () => {
    expect(formatPhone("+33677665544")).toBe("+33 6 77 66 55 44");
  });

  it("affiche un numéro étranger : indicatif puis paires", () => {
    expect(formatPhone("+41791234567")).toBe("+41 79 12 34 56 7");
  });

  it("formate au fil de la saisie", () => {
    expect(formatPhoneInput("+")).toBe("+");
    expect(formatPhoneInput("067")).toBe("06 7");
    expect(formatPhoneInput("06 77 6")).toBe("06 77 6");
    expect(formatPhoneInput("+336")).toBe("+33 6");
  });

  it("extrait les chiffres pour la recherche", () => {
    expect(phoneSearchDigits("06 77")).toBe("0677");
  });
});

describe("isValidEmail", () => {
  it("accepte une adresse complète et un champ vide", () => {
    expect(isValidEmail("nom@domaine.fr")).toBe(true);
    expect(isValidEmail("prenom.nom+tag@sous.domaine.co.uk")).toBe(true);
    expect(isValidEmail("")).toBe(true);
    expect(isValidEmail("  ")).toBe(true);
  });

  it("refuse une adresse sans arobase, sans domaine ou avec une extension trop courte", () => {
    expect(isValidEmail("nom.domaine.fr")).toBe(false);
    expect(isValidEmail("nom@domaine")).toBe(false);
    expect(isValidEmail("nom@domaine.f")).toBe(false);
    expect(isValidEmail("nom@@domaine.fr")).toBe(false);
    expect(isValidEmail("nom @domaine.fr")).toBe(false);
    expect(isValidEmail("@domaine.fr")).toBe(false);
  });

  it("donne un message seulement si invalide", () => {
    expect(emailError("nom@domaine.fr")).toBe("");
    expect(emailError("nom@domaine")).not.toBe("");
  });
});
