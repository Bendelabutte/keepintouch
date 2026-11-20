// src/lib/transactions.js
// Calculs des transactions (fonctions pures) : parts des négociateurs, base nette, CA par commercial.

export const DEFAULT_VAT_RATE = 20;
export const SIDES = Object.freeze(["entree", "sortie"]);

export const TRANSACTION_KIND_LABELS = Object.freeze({ sale: "Vente", rental: "Location" });

// Statut affiché, dérivé des dates (le statut n'est plus saisi à la main).
export const DISPLAY_STATUS_LABELS = Object.freeze({
  promise: "Sous promesse",
  sold: "Vendu",
  rented: "Loué",
  cancelled: "Annulée",
});
export const SIDE_LABELS = Object.freeze({ entree: "Entrée", sortie: "Sortie" });
export const PROPERTY_TYPE_LABELS = Object.freeze({
  appartement: "Appartement",
  maison: "Maison",
  local: "Local",
  parking: "Parking",
  terrain: "Terrain",
  autre: "Autre",
});

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (n) => Math.round((toNumber(n) + Number.EPSILON) * 100) / 100;

// Même formule que la colonne générée transactions.fees_ht.
export const feesHtFromTtc = (feesTtc, vatRate = DEFAULT_VAT_RATE) => {
  if (feesTtc === null || feesTtc === undefined || feesTtc === "") return null;
  const rate = vatRate === null || vatRate === undefined || vatRate === "" ? DEFAULT_VAT_RATE : toNumber(vatRate);
  return round2(toNumber(feesTtc) / (1 + rate / 100));
};

// fees_ht fourni par la base, sinon recalculé depuis le TTC.
export const transactionFeesHt = (t) => {
  if (t?.fees_ht !== null && t?.fees_ht !== undefined && t?.fees_ht !== "") return toNumber(t.fees_ht);
  return feesHtFromTtc(t?.fees_ttc, t?.vat_rate) ?? 0;
};

// Répartit `totalCents` en `n` parts entières, les centimes restants allant aux premières.
const splitCents = (totalCents, n) => {
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
};

// 50 % entrée / 50 % sortie, partagés à parts égales dans chaque côté.
// Si un seul côté est représenté, il reçoit 100 %.
export const defaultShares = (participants) => {
  const list = Array.isArray(participants) ? participants : [];
  const bySide = { entree: [], sortie: [] };
  list.forEach((p, i) => {
    if (bySide[p?.side]) bySide[p.side].push(i);
  });

  const presentSides = SIDES.filter((s) => bySide[s].length > 0);
  const sideCents = presentSides.length === 2 ? 5000 : 10000;
  const shares = new Array(list.length).fill(0);

  presentSides.forEach((side) => {
    const parts = splitCents(sideCents, bySide[side].length);
    bySide[side].forEach((idx, k) => {
      shares[idx] = parts[k];
    });
  });

  return list.map((p, i) => ({ ...p, share_pct: shares[i] }));
};

export const sharesTotal = (participants) =>
  round2((Array.isArray(participants) ? participants : []).reduce((s, p) => s + toNumber(p?.share_pct), 0));

export const isSharesTotalValid = (participants) =>
  Array.isArray(participants) && participants.length > 0 && Math.abs(sharesTotal(participants) - 100) < 0.005;

// Erreurs bloquantes du formulaire de participants (tableau vide = valide).
export const validateParticipants = (participants) => {
  const list = Array.isArray(participants) ? participants : [];
  const errors = [];

  if (list.length === 0) {
    errors.push("Au moins un participant est requis.");
    return errors;
  }
  if (list.some((p) => !p?.user_id)) errors.push("Chaque ligne doit avoir un négociateur.");
  if (list.some((p) => !SIDES.includes(p?.side))) errors.push("Chaque ligne doit avoir un côté (entrée ou sortie).");
  if (list.some((p) => toNumber(p?.share_pct) < 0 || toNumber(p?.share_pct) > 100)) {
    errors.push("Chaque part doit être comprise entre 0 et 100 %.");
  }

  const seen = new Set();
  for (const p of list) {
    if (!p?.user_id || !p?.side) continue;
    const key = `${p.user_id}:${p.side}`;
    if (seen.has(key)) {
      errors.push("Un même négociateur ne peut apparaître qu'une fois par côté.");
      break;
    }
    seen.add(key);
  }

  if (!isSharesTotalValid(list)) {
    errors.push(`Le total des parts doit faire 100 % (actuellement ${sharesTotal(list)} %).`);
  }
  return errors;
};

export const deductionsTotal = (deductions) =>
  round2((Array.isArray(deductions) ? deductions : []).reduce((s, d) => s + toNumber(d?.amount_ht), 0));

// Base de calcul des commissions : honoraires HT − déductions HT.
export const netFeesHt = (feesHt, deductions) => round2(toNumber(feesHt) - deductionsTotal(deductions));

// Part isolée (sans répartition). Pour les parts d'une transaction, utiliser participantAmounts :
// arrondies une à une, elles peuvent dépasser la base d'un centime (12 966,67 à 50/50 → 2 × 6 483,34).
export const participantAmount = (netFees, sharePct) => round2((toNumber(netFees) * toNumber(sharePct)) / 100);

// Division entière arrondie au plus proche, le demi s'éloignant de zéro (comme round() de la base).
const roundDiv = (n, den) => (n < 0 ? -1 : 1) * Math.floor((Math.abs(n) * 2 + den) / (2 * den));

const PCT_SCALE = 10000; // parts en dix-millièmes de pour cent : calcul en entiers, sans erreur de flottant

// Ligne qui reçoit l'écart de centimes : la plus grande part ; à égalité, la sortie avant l'entrée,
// puis le plus grand user_id, puis la dernière ligne. Même ordre que refresh_commissions (20261120100000).
const remainderIndex = (list, pcts) => {
  let best = -1;
  list.forEach((p, i) => {
    if (best < 0) return void (best = i);
    const b = list[best];
    const cmp =
      pcts[i] - pcts[best] ||
      String(p?.side || "").localeCompare(String(b?.side || "")) ||
      (String(p?.user_id || "") < String(b?.user_id || "") ? -1 : String(p?.user_id || "") > String(b?.user_id || "") ? 1 : 0);
    if (cmp >= 0) best = i;
  });
  return best;
};

// Parts d'une transaction, dans l'ordre des participants : chaque part est arrondie au centime, puis
// l'écart avec le total attendu (montant × somme des parts, donc le montant lui-même à 100 %) est
// attribué à une seule ligne. Les parts totalisent ainsi toujours exactement la base.
export const participantAmounts = (netFees, participants) => {
  const list = Array.isArray(participants) ? participants : [];
  if (list.length === 0) return [];
  const netCents = Math.round(round2(netFees) * 100);
  const pcts = list.map((p) => Math.round(toNumber(p?.share_pct) * PCT_SCALE));
  const den = 100 * PCT_SCALE;
  const cents = pcts.map((pct) => roundDiv(netCents * pct, den));
  const target = roundDiv(netCents * pcts.reduce((s, x) => s + x, 0), den);
  cents[remainderIndex(list, pcts)] += target - cents.reduce((s, x) => s + x, 0);
  return cents.map((c) => c / 100);
};

// Part de chaque personne (entrée + sortie cumulées) : { user_id: montant }.
export const amountsByUser = (netFees, participants) => {
  const list = Array.isArray(participants) ? participants : [];
  const cents = {};
  participantAmounts(netFees, list).forEach((a, i) => {
    const id = list[i]?.user_id;
    if (id) cents[id] = (cents[id] || 0) + Math.round(a * 100);
  });
  return Object.fromEntries(Object.entries(cents).map(([id, c]) => [id, c / 100]));
};

export const isCancelled = (t) => t?.status === "cancelled";

// Vente actée ou location signée (« signed » : reprise historique).
export const isActedTransaction = (t) => t?.status === "cashed" || t?.status === "signed";

// Verrouillage : c'est la VALIDATION par l'admin qui verrouille (même règle que la base,
// can_edit_transaction). Promesse, vente actée ou location : modifiable tant qu'elle n'est pas validée.
export const isValidated = (t) => Boolean(t?.validated_at);

export const VALIDATED_LOCK_MESSAGE = "Validée par l’administrateur : modification réservée à l’administrateur";

// Seule une transaction actée ou louée se valide, jamais une promesse (même règle que validate_transaction).
export const canBeValidated = (t) => !!t && isActedTransaction(t) && !isValidated(t);

// Badge d'information, visible par tous : « Validée », ou « À valider » sur une vente actée ou une
// location non validée ; promesse et transaction annulée : aucun badge.
export const validationLabel = (t) => (isCancelled(t) ? null : isValidated(t) ? "Validée" : canBeValidated(t) ? "À valider" : null);

// Admin toujours ; créateur ou participant tant que la transaction n'est pas validée
export const canEditTransaction = (t, userId, isAdmin) =>
  !!isAdmin ||
  (!!t && !isValidated(t) && (t.created_by === userId || (t.participants || []).some((p) => p.user_id === userId)));

// Vente actée (ou reprise « signed ») : elle a clos la fiche du vendeur et créé ou converti celle de
// l'acquéreur. Même règle que la base (20261118110000) : annulation réservée à l'admin, qui remet les
// fiches en état ; suppression seulement une fois annulée ; une location n'est pas concernée.
export const isActedSale = (t) => !!t && t.kind !== "rental" && isActedTransaction(t);

export const canCancelTransaction = (t, userId, isAdmin) =>
  !!t && !isCancelled(t) && canEditTransaction(t, userId, isAdmin) && (!!isAdmin || !isActedSale(t));

export const canDeleteTransaction = (t, userId, isAdmin) =>
  !!t && !isActedSale(t) && (!!isAdmin || (t.created_by === userId && !isValidated(t)));

// Fiche acquéreur reliée à une vente : par son propriétaire, son manager ou un admin
// (même règle que buyer_fiche_transition). viewer = { userId, isAdmin, managedUserIds }
export const canLinkBuyerFiche = (client, viewer) =>
  !!client &&
  (!!viewer?.isAdmin ||
    (!!client.owner_id &&
      (client.owner_id === viewer?.userId || (viewer?.managedUserIds || []).includes(client.owner_id))));

// Filtre « À valider » et bouton « Valider » (admin) : ventes actées et locations non validées
export const isAwaitingValidation = canBeValidated;

const hasDate = (v) => v !== null && v !== undefined && String(v).trim() !== "";

// Statut en base calculé à l'enregistrement :
// vente avec date de vente (deed_date) ou location → 'cashed' ; vente sous promesse → 'in_progress'.
export const deriveDbStatus = ({ kind, deed_date } = {}) =>
  kind === "rental" || hasDate(deed_date) ? "cashed" : "in_progress";

// Statut affiché. Les reprises de l'historique ('cashed' ou 'signed', parfois sans date) s'affichent « Vendu ».
export const displayStatus = (t) => {
  if (isCancelled(t)) return "cancelled";
  if (t?.kind === "rental") return "rented";
  if (hasDate(t?.deed_date) || t?.status === "cashed" || t?.status === "signed") return "sold";
  return "promise";
};

// Champs dérivés à l'enregistrement : status et fees_received_at = deed_date.
// En modification, une date d'encaissement corrigée par un admin est conservée tant que la date
// de vente / de bail ne change pas.
export const applyDerivedFields = (payload, original = null) => {
  const deed = hasDate(payload?.deed_date) ? payload.deed_date : null;
  const keepAdminDate =
    original && hasDate(original.fees_received_at) && deed !== null && original.deed_date === deed;
  return {
    ...payload,
    preliminary_date: payload?.kind === "rental" ? null : payload?.preliminary_date || null,
    deed_date: deed,
    move_in_date: null,
    status: deriveDbStatus({ kind: payload?.kind, deed_date: deed }),
    fees_received_at: keepAdminDate ? original.fees_received_at : deed,
  };
};

// CA attribué : somme de fees_ht × share_pct / 100 par utilisateur (honoraires BRUTS, annulées exclues).
// Parts réparties au centime (participantAmounts) : le CA des participants totalise les honoraires.
// `amountOf` permet le même calcul sur une autre base (ex. TTC).
export const caByUser = (transactions, amountOf = transactionFeesHt) => {
  const totals = {};
  (Array.isArray(transactions) ? transactions : []).forEach((t) => {
    if (!t || isCancelled(t)) return;
    Object.entries(amountsByUser(amountOf(t), t.participants)).forEach(([id, a]) => {
      totals[id] = (totals[id] || 0) + a;
    });
  });
  Object.keys(totals).forEach((k) => {
    totals[k] = round2(totals[k]);
  });
  return totals;
};

// Une ligne par personne (entrée + sortie cumulées), dans l'ordre de première apparition.
export const groupParticipantsByUser = (participants) => {
  const byUser = new Map();
  (Array.isArray(participants) ? participants : []).forEach((p) => {
    if (!p?.user_id) return;
    const g = byUser.get(p.user_id) || { user_id: p.user_id, share_pct: 0, sides: [] };
    g.share_pct = round2(g.share_pct + toNumber(p.share_pct));
    if (p.side && !g.sides.includes(p.side)) g.sides.push(p.side);
    byUser.set(p.user_id, g);
  });
  return [...byUser.values()];
};

// --- Visibilité par rôle ---
// viewer = { userId, isAdmin, isManager, managedUserIds }
// Même règle que la RLS de transaction_participants (défense en profondeur côté front) :
// admin → toutes les lignes ; manager → les siennes et celles de son équipe ; commercial → la sienne.
export const participantsVisibleTo = (participants, viewer) => {
  const list = Array.isArray(participants) ? participants : [];
  if (viewer?.isAdmin) return list;
  const allowed = new Set([viewer?.userId, ...(viewer?.isManager ? viewer?.managedUserIds || [] : [])]);
  return list.filter((p) => allowed.has(p?.user_id));
};

// Blocs du tableau de bord visibles : CA agence et comparatif réservés à l'admin (comparatif aussi au manager).
export const dashboardScope = (viewer) => ({
  agencyCa: Boolean(viewer?.isAdmin),
  comparison: Boolean(viewer?.isAdmin || viewer?.isManager),
  teamFilter: Boolean(viewer?.isAdmin || viewer?.isManager),
});

// --- CA en attente (ventes sous promesse) ---
export const isPendingPromise = (t) => t?.kind === "sale" && t?.status === "in_progress";

// userIds null → agence : honoraires HT bruts et base nette des promesses en cours.
// userIds tableau → part de base nette HT de ces commerciaux (projection).
export const pendingStats = (transactions, userIds = null) => {
  const pending = (Array.isArray(transactions) ? transactions : []).filter(isPendingPromise);
  if (userIds === null || userIds === undefined) {
    return {
      count: pending.length,
      feesHt: round2(pending.reduce((s, t) => s + transactionFeesHt(t), 0)),
      netHt: round2(pending.reduce((s, t) => s + netFeesHt(transactionFeesHt(t), t.deductions), 0)),
    };
  }
  const ids = new Set(userIds);
  let count = 0;
  let share = 0;
  pending.forEach((t) => {
    if (!(t.participants || []).some((p) => ids.has(p.user_id))) return;
    count += 1;
    const byUser = amountsByUser(netFeesHt(transactionFeesHt(t), t.deductions), t.participants);
    share += Object.entries(byUser).reduce((s, [id, a]) => s + (ids.has(id) ? a : 0), 0);
  });
  return { count, shareNetHt: round2(share) };
};
