import { describe, it, expect } from "vitest";
import { circumstanceDisplay, circumstanceFromOrigin, clientCircumstance } from "../circumstance";

describe("circumstanceFromOrigin", () => {
  it("correspondances claires", () => {
    expect(circumstanceFromOrigin("Passage agence")).toBe("agence");
    expect(circumstanceFromOrigin("passage")).toBe("agence");
    expect(circumstanceFromOrigin("Venu à l'agence")).toBe("agence");
    expect(circumstanceFromOrigin("Appel entrant")).toBe("telephone");
    expect(circumstanceFromOrigin("Téléphone")).toBe("telephone");
    expect(circumstanceFromOrigin("tel")).toBe("telephone");
    expect(circumstanceFromOrigin("Visite rue Lepic")).toBe("visite");
  });

  it("sans correspondance claire : non précisé", () => {
    for (const o of ["Recommandation", "Panneau", "Site internet", "Vitrine", "SeLoger", "Visite virtuelle", "", null]) {
      expect(circumstanceFromOrigin(o)).toBe("");
    }
    // Deux pistes : on ne choisit pas
    expect(circumstanceFromOrigin("Passage puis appel")).toBe("");
  });
});

describe("clientCircumstance", () => {
  it("saisie prioritaire, sinon déduite de l'origine", () => {
    expect(clientCircumstance({ contact_circumstance: "visite", contact_origin: "Appel" })).toEqual({ value: "visite", inferred: false });
    expect(clientCircumstance({ contact_circumstance: null, contact_origin: "Appel" })).toEqual({ value: "telephone", inferred: true });
    expect(clientCircumstance({ contact_origin: "Panneau" })).toEqual({ value: "", inferred: false });
  });

  it("libellé de la fiche", () => {
    expect(circumstanceDisplay({ contact_circumstance: "agence" })).toBe("Passage à l’agence");
    expect(circumstanceDisplay({ contact_origin: "Appel" })).toBe("Téléphone (d’après l’origine)");
    expect(circumstanceDisplay({})).toBeNull();
  });
});
