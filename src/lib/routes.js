// src/lib/routes.js
// Adresses de l'application : une page = une URL (liens partageables, bouton Retour du navigateur).

export const PAGE_PATHS = Object.freeze({
  clients: "/clients",
  transactions: "/transactions",
  remuneration: "/remuneration",
  dashboard: "/tableau-de-bord",
});

// Types de création : segment d'URL → catégorie de fiche.
export const CREATE_TYPES = Object.freeze({
  vendeur: "seller",
  acquereur: "buyer",
  "apres-vente": "after",
});

export const createPathFor = (category) => {
  const slug = Object.keys(CREATE_TYPES).find((k) => CREATE_TYPES[k] === category);
  return `/clients/nouveau/${slug || "vendeur"}`;
};

export const clientPath = (id) => `/clients/${id}`;
export const transactionPath = (id) => (id ? `/transactions/${id}` : "/transactions");

/**
 * Analyse une adresse : { page, clientId?, createCategory?, transactionId? }.
 * page = null pour une adresse inconnue (redirigée vers /clients).
 */
export const parseRoute = (pathname) => {
  const parts = String(pathname || "/")
    .split("/")
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));
  const [head, second, third] = parts;

  if (head === "clients") {
    if (second === "nouveau") {
      const createCategory = CREATE_TYPES[third];
      return createCategory ? { page: "clients", view: "create", createCategory } : { page: null };
    }
    if (second) return { page: "clients", view: "fiche", clientId: second };
    return { page: "clients", view: "list" };
  }
  if (head === "transactions") return { page: "transactions", transactionId: second || null };
  if (head === "remuneration" && !second) return { page: "remuneration" };
  if (head === "tableau-de-bord" && !second) return { page: "dashboard" };
  return { page: null };
};
