import { describe, it, expect } from "vitest";
import { agenciesOfUser, agencyErrors, agencyPayload, profileName, searchProfiles } from "../agencies";

describe("agencyErrors", () => {
  it("nom obligatoire, lien d'avis en https:// s'il est donné", () => {
    expect(agencyErrors({ name: "Ramey" })).toEqual({});
    expect(agencyErrors({ name: " " }).name).toBeTruthy();
    expect(agencyErrors({ name: "Ramey", google_review_url: "http://g.page/r/x" }).google_review_url).toBeTruthy();
    expect(agencyErrors({ name: "Ramey", google_review_url: "https://g.page/r x" }).google_review_url).toBeTruthy();
    expect(agencyErrors({ name: "Ramey", google_review_url: " https://g.page/r/x/review " })).toEqual({});
  });
});

describe("agencyPayload", () => {
  it("nettoie et met à null les champs vides", () => {
    expect(agencyPayload({ name: " Ramey ", google_review_url: "", address: " 18 rue Ramey ", phone: "01 42 00 00 00" })).toEqual({
      name: "Ramey",
      google_review_url: null,
      address: "18 rue Ramey",
      phone: "0142000000",
    });
  });
});

describe("agenciesOfUser", () => {
  it("plusieurs agences par utilisateur, triées par nom", () => {
    const agencies = [
      { id: "r", name: "Ramey" },
      { id: "b", name: "Batignolles" },
      { id: "m", name: "Montmartre" },
    ];
    const members = [
      { agency_id: "r", user_id: "u1" },
      { agency_id: "b", user_id: "u1" },
      { agency_id: "m", user_id: "u2" },
    ];
    expect(agenciesOfUser(agencies, members, "u1").map((a) => a.id)).toEqual(["b", "r"]);
    expect(agenciesOfUser(agencies, members, "u3")).toEqual([]);
  });
});

describe("searchProfiles", () => {
  const profiles = [
    { id: "1", first_name: "Louis", last_name: "Ferbos", email: "louis@18avenue.fr" },
    { id: "2", first_name: "Hélène", last_name: "Durand", email: "helene@18avenue.fr" },
    { id: "3", first_name: "Léo", last_name: "Martin", email: "leo@18avenue.fr", is_active: false },
  ];

  it("par nom, accents ignorés, profils actifs hors membres", () => {
    expect(searchProfiles(profiles, "helene").map((p) => p.id)).toEqual(["2"]);
    expect(searchProfiles(profiles, "FERB").map((p) => p.id)).toEqual(["1"]);
    expect(searchProfiles(profiles, "leo")).toEqual([]);
    expect(searchProfiles(profiles, "18avenue", ["1"]).map((p) => p.id)).toEqual(["2"]);
    expect(searchProfiles(profiles, "  ")).toEqual([]);
  });

  it("profileName : prénom nom, sinon email", () => {
    expect(profileName(profiles[0])).toBe("Louis Ferbos");
    expect(profileName({ email: "x@y.fr" })).toBe("x@y.fr");
  });
});
