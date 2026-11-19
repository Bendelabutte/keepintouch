// src/lib/modules.js
// Interrupteurs de mise en service (fonctions pures). Mêmes règles que la base
// (migration 20261118100000_mise_en_service.sql) :
//   Transactions : app_settings.modules_transactions_visible ; fermé → onglet, pages et chiffres issus
//     des transactions réservés à l'admin.
//   Rémunération : profiles.compensation_visible, par commercial ; l'admin voit toujours tout.
//     Un commercial (ou son manager) ne lit des réglages que s'ils sont ouverts : la base ne renvoie
//     alors aucune ligne, ce qui sert de signal à l'interface.

// access = { isAdmin, transactionsVisible, compensationReadable }
//   transactionsVisible : valeur de app_settings.modules_transactions_visible
//   compensationReadable : nombre de réglages de rémunération que la base laisse lire à l'utilisateur
export const canSeeTransactions = (access) => Boolean(access?.isAdmin || access?.transactionsVisible === true);

export const canSeeCompensation = (access) => Boolean(access?.isAdmin || Number(access?.compensationReadable) > 0);

// Chiffres du tableau de bord issus des transactions (CA, CA en attente, graphique) : même règle
export const canSeeTransactionFigures = canSeeTransactions;

// Onglets de navigation masqués
export const hiddenNavKeys = (access) => [
  ...(canSeeTransactions(access) ? [] : ["transactions"]),
  ...(canSeeCompensation(access) ? [] : ["remuneration"]),
];

// Page demandée par l'adresse : null si elle n'est pas accessible (redirection vers les clients)
export const allowedPage = (page, access) => {
  if (page === "transactions" && !canSeeTransactions(access)) return null;
  if (page === "remuneration" && !canSeeCompensation(access)) return null;
  return page;
};

// Date d'ouverture proposée par défaut dans les réglages de rémunération
export const DEFAULT_OPENING_DATE = "2027-01-01";

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== "";

// Un type ou un taux ne s'enregistre jamais sans date d'ouverture (même règle que
// save_compensation_settings) : sans elle, toutes les ventes passées ouvriraient une commission.
export const openingDateMissing = (s) =>
  !filled(s?.opening_balance_date) && (filled(s?.compensation_type) || filled(s?.rate_entree) || filled(s?.rate_sortie));
const isRate = (v) => {
  if (!filled(v)) return false;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100;
};

// « Visible par le commercial » ne peut être coché que si le type, les deux taux et la date
// d'ouverture sont renseignés (valeurs du formulaire ou de la base).
export const compensationSettingsComplete = (s) =>
  filled(s?.compensation_type) && isRate(s?.rate_entree) && isRate(s?.rate_sortie) && filled(s?.opening_balance_date);

// Ce qui manque, pour l'expliquer sous la case
export const compensationMissingFields = (s) => [
  ...(filled(s?.compensation_type) ? [] : ["le type"]),
  ...(isRate(s?.rate_entree) && isRate(s?.rate_sortie) ? [] : ["les taux entrée et sortie"]),
  ...(filled(s?.opening_balance_date) ? [] : ["la date d'ouverture"]),
];
