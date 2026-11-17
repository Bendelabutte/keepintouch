// src/lib/agencies.js
// Agences : validation du formulaire admin, appartenance des utilisateurs, recherche de profils.
import { normalizePhone } from "./contact";

export const EMPTY_AGENCY = { name: "", google_review_url: "", address: "", phone: "" };

export const REVIEW_URL_HINT = "Sur votre fiche Google, cliquez sur Demander des avis, puis copiez le lien.";

// Erreurs par champ ({} si valide). Lien d'avis facultatif, mais en https:// s'il est donné.
export const agencyErrors = (values) => {
  const errors = {};
  if (!String(values?.name ?? "").trim()) errors.name = "Le nom de l’agence est obligatoire.";
  const url = String(values?.google_review_url ?? "").trim();
  if (url && !/^https:\/\/\S+$/.test(url)) errors.google_review_url = "Le lien doit commencer par https:// (sans espace).";
  return errors;
};

// Valeurs du formulaire → ligne agencies (vides → null)
export const agencyPayload = (values) => {
  const text = (v) => String(v ?? "").trim() || null;
  return {
    name: String(values.name ?? "").trim(),
    google_review_url: text(values.google_review_url),
    address: text(values.address),
    phone: normalizePhone(values.phone) || null,
  };
};

// Agences d'un utilisateur, triées par nom (archivées comprises : au filtrage de l'appelant).
export const agenciesOfUser = (agencies = [], members = [], userId) => {
  const ids = new Set(members.filter((m) => m.user_id === userId).map((m) => m.agency_id));
  return agencies.filter((a) => ids.has(a.id)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
};

const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const profileName = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || p?.email || "";

// Profils actifs, hors excludeIds, dont le prénom, le nom ou l'email contient la recherche (accents ignorés).
export const searchProfiles = (profiles = [], query = "", excludeIds = []) => {
  const q = fold(query).trim();
  if (!q) return [];
  const excluded = new Set(excludeIds);
  return profiles
    .filter((p) => p.is_active !== false && !excluded.has(p.id))
    .filter((p) => fold(`${p.first_name || ""} ${p.last_name || ""} ${p.email || ""}`).includes(q))
    .sort((a, b) => profileName(a).localeCompare(profileName(b), "fr"))
    .slice(0, 8);
};
