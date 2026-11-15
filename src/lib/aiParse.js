// src/lib/aiParse.js
// Saisie rapide : réponse de la fonction parse-client-description → champs du formulaire de fiche.
// Fonctions pures : correspondance, conversion des nombres, fusion sans écraser les corrections
// manuelles, liste des champs obligatoires manquants.
import { formatPhone, isValidEmail, normalizeEmail, normalizePhone } from "./contact";

// Catégorie de fiche ↔ type attendu par la fonction serveur
export const API_TYPES = Object.freeze({ seller: "vendeur", buyer: "acquereur", after: "apres_vente" });
export const CATEGORY_OF_TYPE = Object.freeze({ vendeur: "seller", acquereur: "buyer", apres_vente: "after" });

export const MAX_DESCRIPTION_LENGTH = 4000;

export const PROPERTY_KINDS = ["Appartement", "Maison", "Terrain", "Local commercial", "Immeuble", "Autre"];
export const HORIZONS = ["Court terme", "Moyen terme", "Long terme", "Estimation sans projet"];

const SURE = "sur";
const CHECK = "a_verifier";

const blank = (v) => String(v ?? "").trim() === "";

// ---------- Nombres ----------

const MULTIPLIERS = [
  [/^(millions?|m)$/, 1e6],
  [/^(mille|k)$/, 1e3],
];

/**
 * Montant, surface ou nombre écrit librement → nombre, ou null.
 * « 300 000 euros », « 300k », « 300 k€ », « 1,2 M », « 1.250.000 », « 65 m² », 300000.
 */
export const parseNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value ?? "")
    .toLowerCase()
    .replace(/m²|m2/g, " ")
    .replace(/\u00a0|\u202f/g, " ");
  const m = s.match(/(\d[\d ',.]*)(?:\s*(millions?|mille|k|m)\b)?/);
  if (!m) return null;
  let digits = m[1].replace(/[ ']/g, "").replace(/[.,]$/, "");
  // Séparateurs de milliers (1.250.000 / 1,250,000) ou décimale (1,2 / 1.5)
  if (/^\d{1,3}([.,]\d{3})+$/.test(digits)) digits = digits.replace(/[.,]/g, "");
  else digits = digits.replace(",", ".");
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  const mult = MULTIPLIERS.find(([re]) => re.test(m[2] || ""))?.[1] || 1;
  return Math.round(n * mult * 100) / 100;
};

// Plusieurs nombres (« entre 250 et 300k ») : la valeur retenue est à vérifier.
const severalNumbers = (value) => (String(value ?? "").match(/\d+(?:[ .,]\d{3})*/g) || []).length > 1;

const numberText = (value) => {
  const n = parseNumber(value);
  return n === null ? "" : String(n);
};

const amountLabel = (value) => {
  const n = parseNumber(value);
  return n === null ? String(value) : `${n.toLocaleString("fr-FR").replace(/\u202f/g, " ")} €`;
};

const isIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const validPhone = (normalized) => /^0\d{9}$/.test(normalized) || /^\+\d{8,15}$/.test(normalized);

// ---------- Adresse : la voie seulement ----------
// Même liste que la fonction parse-client-description (ADDRESS_EXTRAS) : à garder identiques.
// Étage, porte, bâtiment, escalier, digicode, interphone, appartement, cour : jamais dans l'adresse.
const ADDRESS_EXTRAS = [
  /(?:au\s+)?\d{1,2}\s*(?:ère|er|re|ème|eme|e|è|°)?\s*étage\b/,
  /(?:au\s+)?(?:dernier|premier)\s+étage\b/,
  /étage\s*:?\s*\d{1,2}\b/,
  /(?:au\s+)?rez[\s-]de[\s-]chauss[ée]e\b/,
  /(?:au\s+)?\brdc\b/,
  /(?:au\s+)?sous[\s-]sol\b/,
  /\bporte\s+(?:de\s+)?(?:gauche|droite|face|du\s+fond|n°\s*\d+|\d+[a-z]?\b|[a-z]\b)/,
  /\b(?:bâtiment|batiment)\s+[a-z0-9]{1,3}\b/,
  /\b(?:bât|bat)(?:\.\s*|\s+)[a-z0-9]{1,2}\b/,
  /\b(?:escalier|esc\.)\s*[a-z0-9]{1,3}\b/,
  /\b(?:digicode|code(?:\s+(?:porte|d['’]entrée|immeuble))?)\s*:?\s*[a-z]?\d[0-9a-z#*]{2,}\b/,
  /\binterphone\s*:?\s*[a-zà-ÿ0-9-]+/,
  /\b(?:appartement|appt?\.?)\s*(?:n°\s*)?\d+\b/,
  /(?:au\s+)?fond\s+de\s+(?:la\s+)?cour\b/,
  /\b(?:dans\s+la|sur|côté)\s+cour\b/,
];
const ADDRESS_EXTRAS_RE = new RegExp(ADDRESS_EXTRAS.map((r) => r.source).join("|"), "giu");
const CONNECTOR = /^(?:au|à|et|-|–)$/i;

/** « 18 rue Ramey, 5e étage » → { address: "18 rue Ramey", complement: "5e étage" } */
export function splitAddressComplement(text) {
  const extras = [];
  const rest = String(text ?? "").replace(ADDRESS_EXTRAS_RE, (m) => {
    extras.push(m.replace(/^au\s+/i, "").trim());
    return ",";
  });
  const address = rest
    .split(",")
    .map((p) =>
      p
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^(?:au|à|et|-|–)\s+|\s+(?:au|à|et|-|–)$/gi, "")
        .trim()
    )
    .filter((p) => p && !CONNECTOR.test(p))
    .join(", ");
  return { address, complement: extras.join(", ") };
}

// Liste « a, b » sans doublon (insensible à la casse)
const joinUnique = (...parts) => {
  const seen = new Set();
  return parts
    .flatMap((p) => String(p || "").split(","))
    .map((p) => p.trim())
    .filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()))
    .join(", ");
};

// ---------- Notes : lignes « Libellé : valeur » seulement ----------

const fold = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

// Libellés déjà portés par un champ du formulaire, par une ligne construite ici ou par le type de
// fiche (motif du contact) : une ligne de notes de l'IA qui commence ainsi est écartée.
const REDUNDANT_LABELS = [
  "surface", "superficie", "piece", "nombre de piece", "adresse", "complement", "etage", "budget",
  "secteur", "type", "bien", "nom", "prenom", "tel", "email", "mail", "motif", "demande", "objet",
  "besoin", "souhait", "horizon", "origine", "raison", "contrainte", "ressenti", "date", "estimation",
  "proprietaire", "client", "categorie", "projet",
];
// Écartés aussi avec une précision (« Surface habitable », « Adresse exacte »), mais pas « Nom du syndic »
const REDUNDANT_PREFIXES = [
  "surface", "superficie", "piece", "nombre de piece", "adresse", "complement", "etage", "budget",
  "secteur", "type", "date", "motif", "demande", "objet", "contrainte", "raison", "origine", "horizon",
];
const NOTE_LINE = /^([^:]{2,40}?)\s*:\s*(.{1,160})$/;
// Motif du contact, déjà porté par le type de fiche
const MOTIVE = /\b(estimation|estimer|faire estimer|souhait\w*\s+(?:vendre|acheter|estimer)|veut\s+(?:vendre|acheter))\b/i;

/** Garde les seules lignes « Libellé : valeur » utiles de l'IA ; jamais de phrase ni de répétition. */
export function cleanNoteLines(text) {
  return String(text ?? "")
    .split(/\r?\n|;\s+/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter((l) => {
      const m = l.match(NOTE_LINE);
      if (!m) return false;
      const label = fold(m[1]);
      if (REDUNDANT_LABELS.some((r) => label === r || label === `${r}s`)) return false;
      if (REDUNDANT_PREFIXES.some((r) => label.startsWith(`${r} `) || label.startsWith(`${r}s `))) return false;
      return !MOTIVE.test(m[2]);
    });
}

// ---------- Correspondance réponse IA → formulaire ----------

/**
 * ai = { type, fields: { prenom, nom, … }, confidence: { champ: "sur" | "a_verifier" } }
 * category : catégorie du formulaire ; absente (saisie rapide « auto ») → celle trouvée par l'IA.
 * Renvoie { category, values, marks } : values ne contient que les champs remplis (texte, comme
 * le formulaire), marks donne pour chacun « sur » ou « a_verifier ».
 * Ce qui n'a pas de colonne dédiée (secteurs exclus, contraintes…) va dans les notes de la fiche.
 */
export function aiToForm(ai, category) {
  const f = ai?.fields || {};
  const conf = ai?.confidence || {};
  const cat = category || CATEGORY_OF_TYPE[ai?.type] || "seller";
  const values = {};
  const marks = {};

  // sources : clés IA à l'origine de la valeur (la plus douteuse l'emporte)
  const put = (field, value, sources, forceCheck = false) => {
    if (blank(value)) return;
    values[field] = String(value).trim();
    marks[field] = forceCheck || sources.some((k) => conf[k] === CHECK) ? CHECK : SURE;
  };
  const has = (k) => !blank(f[k]);

  put("first_name", f.prenom, ["prenom"]);
  put("last_name", f.nom, ["nom"]);
  if (has("telephone")) {
    const n = normalizePhone(f.telephone);
    if (n.replace("+", "")) put("phone", formatPhone(n), ["telephone"], !validPhone(n));
  }
  if (has("email")) {
    const email = normalizeEmail(f.email).replace(/\s+/g, "").toLowerCase();
    put("email", email, ["email"], !isValidEmail(email));
  }
  put("contact_origin", f.origine_contact, ["origine_contact"]);

  // Notes : uniquement des lignes « Libellé : valeur » pour ce qui n'a pas de champ dans ce type
  // de fiche. Une information qui a son champ n'y est jamais répétée.
  const notes = [];
  const noteSources = [];
  const note = (k, line) => {
    if (!has(k) || notes.includes(line)) return;
    notes.push(line);
    noteSources.push(k);
  };

  const horizon = HORIZONS.includes(f.horizon) ? f.horizon : "";
  const kind = PROPERTY_KINDS.includes(f.type_bien) ? f.type_bien : "";
  const surfaceLine = `Surface : ${numberText(f.surface_min) || f.surface_min} m²`;

  // Adresse : la voie dans le champ (toujours à vérifier tant qu'elle n'est pas confirmée dans la
  // liste d'adresses), étage, porte, digicode… en « Complément d'adresse »
  const split = splitAddressComplement(f.adresse_bien);
  const complement = joinUnique(f.complement_adresse, split.complement);
  const putAddress = (field) => {
    if (split.address) put(field, split.address, ["adresse_bien"], true);
  };

  if (cat === "seller") {
    putAddress("property_address");
    if (isIsoDate(f.date_estimation)) put("estimation_date", f.date_estimation, ["date_estimation"]);
    else note("date_estimation", `Date d’estimation : ${f.date_estimation}`);
    if (has("nb_pieces")) put("rooms", numberText(f.nb_pieces), ["nb_pieces"], severalNumbers(f.nb_pieces));
    put("project_horizon", horizon, ["horizon"]);
    put("sale_reason", f.raison_vente, ["raison_vente"]);
    note("type_bien", `Type de bien : ${f.type_bien}`);
    note("surface_min", surfaceLine);
    note("budget_max", `Budget : ${amountLabel(f.budget_max)}`);
  } else if (cat === "buyer") {
    if (has("budget_max")) put("budget_max", numberText(f.budget_max), ["budget_max"], severalNumbers(f.budget_max));
    put("project_type", kind, ["type_bien"]);
    if (has("nb_pieces")) put("rooms", numberText(f.nb_pieces), ["nb_pieces"], severalNumbers(f.nb_pieces));
    if (has("surface_min")) put("min_surface", numberText(f.surface_min), ["surface_min"], severalNumbers(f.surface_min));
    put("area", f.secteurs_souhaites, ["secteurs_souhaites"]);
    put("project_horizon", horizon, ["horizon"]);
    if (!kind) note("type_bien", `Type de bien : ${f.type_bien}`);
    if (split.address) note("adresse_bien", `Adresse : ${split.address}`);
  } else {
    putAddress("after_address");
    note("type_bien", `Type de bien : ${f.type_bien}`);
    if (has("nb_pieces")) note("nb_pieces", `Pièces : ${numberText(f.nb_pieces) || f.nb_pieces}`);
    note("surface_min", surfaceLine);
  }

  if (complement && (cat !== "buyer" || split.address)) {
    notes.push(`Complément d’adresse : ${complement}`);
    noteSources.push(...["complement_adresse", "adresse_bien"].filter(has));
  }
  note("secteurs_exclus", `Secteurs exclus : ${f.secteurs_exclus}`);
  note("contraintes", `Contraintes : ${f.contraintes}`);
  for (const line of cleanNoteLines(f.notes)) note("notes", line);

  // Ressenti : une impression du commercial, jamais le motif du contact reformulé
  const feeling = has("ressenti") && !MOTIVE.test(f.ressenti) ? String(f.ressenti).trim() : "";

  // Vendeur : pas de champ « Notes », les lignes vont dans « Ressenti du conseiller »
  if (cat === "seller") {
    put("consultant_feeling", [feeling, ...notes].filter((x) => !blank(x)).join("\n"), [feeling ? "ressenti" : "", ...noteSources]);
  } else {
    put("context", notes.join("\n"), noteSources);
    put("consultant_feeling", feeling, ["ressenti"]);
  }

  return { category: cat, values, marks };
}

// ---------- Fusion dans le formulaire ----------

/**
 * Applique les champs proposés par l'IA sans écraser ce que l'utilisateur a saisi ou corrigé.
 * Un champ est remplacé seulement s'il est vide, à sa valeur par défaut, ou encore égal à ce que
 * l'IA y avait mis au remplissage précédent (previous).
 * Renvoie { values, applied, kept } : kept = champs laissés tels quels car modifiés à la main.
 */
export function mergeAiValues(current, proposed, { previous = {}, defaults = {} } = {}) {
  const values = { ...current };
  const applied = [];
  const kept = [];
  for (const [field, value] of Object.entries(proposed || {})) {
    const cur = current?.[field];
    const untouched =
      blank(cur) ||
      (field in defaults && String(cur) === String(defaults[field] ?? "")) ||
      (field in previous && String(cur) === String(previous[field]));
    if (untouched) {
      values[field] = value;
      applied.push(field);
    } else if (String(cur) !== String(value)) {
      kept.push(field);
    }
  }
  return { values, applied, kept };
}

// ---------- Champs obligatoires ----------

/** Champs obligatoires manquants, dans l'ordre du formulaire : [{ field, label }]. */
export function missingRequired(values) {
  const v = values || {};
  const missing = [];
  if (blank(v.last_name)) missing.push({ field: "last_name", label: "le nom" });
  if (blank(v.phone) && blank(v.email)) missing.push({ field: "phone", label: "un téléphone ou un email" });
  else if (!isValidEmail(v.email)) missing.push({ field: "email", label: "un email valide" });
  if ((v.category || "seller") === "seller" && blank(v.property_address)) {
    missing.push({ field: "property_address", label: "l’adresse du bien" });
  }
  return missing;
}

export const missingMessage = (missing) =>
  missing?.length ? `À compléter : ${missing.map((m) => m.label).join(", ")}.` : "";
