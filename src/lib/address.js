// src/lib/address.js
// Géocodage Géoplateforme IGN (remplaçante de l'API Adresse) : construction de l'URL et mapping de la réponse.
// Réponse : GeoJSON FeatureCollection ; chaque feature.properties contient
// label, name (« 12 Rue de Rivoli »), postcode, city, type (housenumber | street | locality | municipality).

export const GEOCODE_URL = "https://data.geopf.fr/geocodage/search";
export const ADDRESS_MIN_CHARS = 3;
export const ADDRESS_LIMIT = 5;

export const buildAddressSearchUrl = (query, limit = ADDRESS_LIMIT) => {
  const params = new URLSearchParams({
    q: String(query || "").trim(),
    autocomplete: "1",
    limit: String(limit),
    index: "address",
  });
  return `${GEOCODE_URL}?${params.toString()}`;
};

// Libellé enregistré dans les fiches clients : « numéro rue, code postal ville ».
export const formatAddressLabel = ({ address, postal_code, city } = {}) => {
  const town = [postal_code, city].filter(Boolean).join(" ").trim();
  return [address, town].filter(Boolean).join(", ");
};

export const mapAddressFeature = (feature) => {
  const p = feature?.properties;
  if (!p) return null;
  const postal_code = p.postcode ? String(p.postcode) : "";
  const city = p.city ? String(p.city) : "";
  // Pour une commune seule, name vaut le nom de la commune : pas de « numéro + rue ».
  const address = p.type === "municipality" ? "" : String(p.name || "").trim();
  if (!address && !city) return null;
  return { address, postal_code, city, label: formatAddressLabel({ address, postal_code, city }) };
};

export const mapAddressResponse = (json) =>
  (Array.isArray(json?.features) ? json.features : []).map(mapAddressFeature).filter(Boolean);

// --- Découpage d'une adresse saisie en texte libre (fiches clients) ---

export const GEOCODE_MIN_SCORE = 0.7;

const normalize = (v) =>
  String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const POSTCODE_RE = /^(.*?)[\s,]*\b(\d{5})\s+(.+?)\s*$/;

// Cas sans API : « 7 rue X 75018 Paris » ou « 7 rue X, 75018 Paris » → {address, postal_code, city}.
// Sans code postal à 5 chiffres, tout reste dans address.
export const splitAddress = (text) => {
  const raw = String(text || "").trim().replace(/\s+/g, " ");
  const m = POSTCODE_RE.exec(raw);
  if (!m) return { address: raw, postal_code: "", city: "" };
  return { address: m[1].replace(/[\s,]+$/, "").trim(), postal_code: m[2], city: m[3].replace(/^[\s,]+/, "") };
};

// Le premier résultat de l'API n'est retenu que s'il est fiable : score suffisant, et code postal
// identique à celui du texte (ou, sans code postal, ville présente dans le texte). Sinon null.
export const pickGeocodeMatch = (text, json, minScore = GEOCODE_MIN_SCORE) => {
  const feature = json?.features?.[0];
  const mapped = mapAddressFeature(feature);
  if (!mapped || !mapped.address || Number(feature.properties.score) < minScore) return null;

  const typed = splitAddress(text);
  if (typed.postal_code) {
    if (typed.postal_code !== mapped.postal_code) return null;
  } else if (!mapped.city || !` ${normalize(text)} `.includes(` ${normalize(mapped.city)} `)) {
    return null;
  }
  return mapped;
};

// a) API Géoplateforme (limit=1) ; b) découpage sur le code postal ; c) tout dans address.
// Ne lève jamais d'erreur : en cas d'échec réseau ou de délai dépassé, on passe au découpage local.
export const resolveAddressText = async (text, { fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {}) => {
  const raw = String(text || "").trim();
  if (!raw) return { address: "", postal_code: "", city: "" };

  if (raw.length >= ADDRESS_MIN_CHARS && typeof fetchImpl === "function") {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const url = `${GEOCODE_URL}?${new URLSearchParams({ q: raw, limit: "1", index: "address" })}`;
      const res = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
      if (res.ok) {
        const match = pickGeocodeMatch(raw, await res.json());
        if (match) return { address: match.address, postal_code: match.postal_code, city: match.city };
      }
    } catch {
      // repli sur le découpage local
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return splitAddress(raw);
};
