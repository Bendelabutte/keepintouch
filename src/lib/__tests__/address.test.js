import { describe, it, expect } from "vitest";
import {
  buildAddressSearchUrl,
  formatAddressLabel,
  mapAddressFeature,
  mapAddressResponse,
  pickGeocodeMatch,
  resolveAddressText,
  splitAddress,
} from "../address";

// Extrait d'une réponse réelle de data.geopf.fr/geocodage/search (q=12 rue de rivoli par)
const RESPONSE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [2.35995, 48.855602] },
      properties: {
        label: "12 Rue de Rivoli 75004 Paris",
        housenumber: "12",
        name: "12 Rue de Rivoli",
        postcode: "75004",
        citycode: "75104",
        city: "Paris",
        type: "housenumber",
        street: "Rue de Rivoli",
        _type: "address",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [2.3362, 48.862442] },
      properties: {
        label: "Rue de Rivoli 75001 Paris",
        name: "Rue de Rivoli",
        postcode: "75001",
        city: "Paris",
        type: "street",
        _type: "address",
      },
    },
  ],
  query: "12 rue de rivoli par",
};

describe("mapping réponse Géoplateforme → adresse", () => {
  it("numéro + rue, code postal, ville et libellé « numéro rue, code postal ville »", () => {
    expect(mapAddressResponse(RESPONSE)).toEqual([
      { address: "12 Rue de Rivoli", postal_code: "75004", city: "Paris", label: "12 Rue de Rivoli, 75004 Paris" },
      { address: "Rue de Rivoli", postal_code: "75001", city: "Paris", label: "Rue de Rivoli, 75001 Paris" },
    ]);
  });

  it("commune seule : pas d'adresse de rue", () => {
    expect(
      mapAddressFeature({ properties: { name: "Amiens", postcode: "80000", city: "Amiens", type: "municipality" } })
    ).toEqual({ address: "", postal_code: "80000", city: "Amiens", label: "80000 Amiens" });
  });

  it("réponse vide, invalide ou feature incomplète → liste vide, sans erreur", () => {
    expect(mapAddressResponse(null)).toEqual([]);
    expect(mapAddressResponse({})).toEqual([]);
    expect(mapAddressResponse({ features: [{}, { properties: {} }] })).toEqual([]);
  });

  it("formatAddressLabel ignore les morceaux absents", () => {
    expect(formatAddressLabel({ address: "1 rue X", postal_code: "", city: "Lyon" })).toBe("1 rue X, Lyon");
    expect(formatAddressLabel({})).toBe("");
  });

  it("URL de recherche : autocomplete, limite et index adresse", () => {
    const url = new URL(buildAddressSearchUrl(" 8 bd du port "));
    expect(url.origin + url.pathname).toBe("https://data.geopf.fr/geocodage/search");
    expect(url.searchParams.get("q")).toBe("8 bd du port");
    expect(url.searchParams.get("autocomplete")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("index")).toBe("address");
  });
});

describe("splitAddress — découpage local sur le code postal", () => {
  it("« … 75018 paris » et « …, 75018 Paris »", () => {
    expect(splitAddress("7 rue Felix Ziem 75018 paris")).toEqual({
      address: "7 rue Felix Ziem",
      postal_code: "75018",
      city: "paris",
    });
    expect(splitAddress("7 rue Felix Ziem, 75018 Paris")).toEqual({
      address: "7 rue Felix Ziem",
      postal_code: "75018",
      city: "Paris",
    });
  });

  it("espaces multiples et ville composée", () => {
    expect(splitAddress("  3  bis avenue  Foch   94100   Saint-Maur-des-Fossés ")).toEqual({
      address: "3 bis avenue Foch",
      postal_code: "94100",
      city: "Saint-Maur-des-Fossés",
    });
  });

  it("sans code postal à 5 chiffres → tout dans address", () => {
    expect(splitAddress("Résidence les Pins, bât. B")).toEqual({ address: "Résidence les Pins, bât. B", postal_code: "", city: "" });
    expect(splitAddress("12 rue X 7501 Paris")).toEqual({ address: "12 rue X 7501 Paris", postal_code: "", city: "" });
    expect(splitAddress(null)).toEqual({ address: "", postal_code: "", city: "" });
  });
});

const feature = (props) => ({ features: [{ properties: { type: "housenumber", ...props } }] });

describe("pickGeocodeMatch — résultat API retenu seulement s'il est fiable", () => {
  const ziem = feature({ name: "7 Rue Félix Ziem", postcode: "75018", city: "Paris", score: 0.97 });

  it("score suffisant et code postal identique → name / postcode / city", () => {
    expect(pickGeocodeMatch("7 rue Felix Ziem 75018 paris", ziem)).toMatchObject({
      address: "7 Rue Félix Ziem",
      postal_code: "75018",
      city: "Paris",
    });
  });

  it("score insuffisant → null", () => {
    expect(pickGeocodeMatch("7 rue Felix Ziem 75018 paris", feature({ name: "Voie Z/18", postcode: "75018", city: "Paris", score: 0.3 }))).toBe(null);
  });

  it("code postal différent du texte → null", () => {
    expect(pickGeocodeMatch("7 rue Felix Ziem 75018 paris", feature({ name: "7 Rue Felix Ziem", postcode: "21000", city: "Dijon", score: 0.97 }))).toBe(null);
  });

  it("sans code postal : la ville doit figurer dans le texte (évite « Dijon » pour « 7 rue felix ziem »)", () => {
    const dijon = feature({ name: "7 Rue Felix Ziem", postcode: "21000", city: "Dijon", score: 0.97 });
    expect(pickGeocodeMatch("7 rue felix ziem", dijon)).toBe(null);
    expect(pickGeocodeMatch("7 rue felix ziem dijon", dijon)).toMatchObject({ city: "Dijon" });
  });
});

describe("resolveAddressText — API, sinon découpage local, sinon tout dans address", () => {
  const okFetch = (json) => async () => ({ ok: true, json: async () => json });

  it("a) résultat API fiable", async () => {
    const fetchImpl = okFetch(feature({ name: "7 Rue Félix Ziem", postcode: "75018", city: "Paris", score: 0.97 }));
    expect(await resolveAddressText("7 rue Felix Ziem 75018 paris", { fetchImpl })).toEqual({
      address: "7 Rue Félix Ziem",
      postal_code: "75018",
      city: "Paris",
    });
  });

  it("b) API indisponible → découpage sur le code postal", async () => {
    const fetchImpl = async () => {
      throw new Error("réseau");
    };
    expect(await resolveAddressText("7 rue Felix Ziem 75018 paris", { fetchImpl })).toEqual({
      address: "7 rue Felix Ziem",
      postal_code: "75018",
      city: "paris",
    });
  });

  it("c) ni résultat fiable ni code postal → tout dans address", async () => {
    const fetchImpl = okFetch({ features: [] });
    expect(await resolveAddressText("Résidence les Pins", { fetchImpl })).toEqual({
      address: "Résidence les Pins",
      postal_code: "",
      city: "",
    });
  });
});
