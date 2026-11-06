// src/lib/contact.js
// Téléphone et email : normalisation pour le stockage, affichage par paires, validation.

// Stockage : chiffres seuls (0677665544), ou « + » et chiffres pour l'international (+33677665544).
// « 00 » en tête vaut « + » ; le 0 national après +33 est retiré (+33 06… → +336…).
export const normalizePhone = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  const intl = raw.startsWith("+") || raw.startsWith("00");
  if (!intl) return digits;
  if (raw.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("330")) digits = "33" + digits.slice(3);
  return "+" + digits;
};

const pairs = (digits) => (digits.match(/.{1,2}/g) || []).join(" ");

// Affichage : « 06 77 66 55 44 », « +33 6 77 66 55 44 », autre pays : indicatif puis paires.
export const formatPhone = (value) => {
  const n = normalizePhone(value);
  if (!n.startsWith("+")) return pairs(n);
  const digits = n.slice(1);
  if (!digits) return "+";
  if (digits.startsWith("33")) {
    const rest = digits.slice(2);
    return ["+33", rest.slice(0, 1), pairs(rest.slice(1))].filter(Boolean).join(" ");
  }
  return ["+" + digits.slice(0, 2), pairs(digits.slice(2))].filter(Boolean).join(" ");
};

// Saisie : même format qu'à l'affichage, le « + » tapé seul est conservé.
export const formatPhoneInput = (value) => {
  const raw = String(value ?? "");
  if (raw.trim() === "+") return "+";
  return formatPhone(raw);
};

// Pour la recherche : chiffres seuls (« 06 77 » trouve 0677665544).
export const phoneSearchDigits = (value) => String(value ?? "").replace(/\D/g, "");

// Une arobase, un domaine, une extension d'au moins 2 lettres. Vide = valide (facultatif).
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

export const isValidEmail = (value) => {
  const v = String(value ?? "").trim();
  return v === "" || EMAIL_RE.test(v);
};

export const EMAIL_ERROR = "Adresse email invalide (exemple : nom@domaine.fr).";

export const emailError = (value) => (isValidEmail(value) ? "" : EMAIL_ERROR);

export const normalizeEmail = (value) => String(value ?? "").trim();

// Fiche client : au moins un moyen de contact (téléphone ou email).
export const contactError = (values) =>
  !String(values?.phone || "").trim() && !String(values?.email || "").trim() ? "Renseignez un téléphone ou un email." : "";
