// src/lib/transactionDraft.js
// Brouillon du formulaire de transaction : conversions ligne Supabase ↔ formulaire ↔ RPC.
// Le formulaire n'expose qu'une date : vente → date de promesse OU date de vente ; location → date du bail.
// Statut et date d'encaissement sont dérivés à l'enregistrement (applyDerivedFields).
import { DEFAULT_VAT_RATE, applyDerivedFields, defaultShares } from "./transactions";
import { formatPhone, normalizePhone } from "./contact";

let keySeq = 0;
export const newRowKey = () => `row-${Date.now()}-${keySeq++}`;

const str = (v) => (v === null || v === undefined ? "" : String(v));

const fullName = (first, last) => [first, last].map((x) => str(x).trim()).filter(Boolean).join(" ");

// Libellé libre existant (« Jean Dupont ») → prénom = premier mot, nom = le reste.
export const splitPersonName = (label) => {
  const parts = str(label).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first_name: "", last_name: parts[0] || "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
};

export const parseDecimal = (value) => {
  const normalized = str(value).replace(/\s/g, "").replace(",", ".").trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

// Bloc acquéreur unique (promesse, vendu par moi, nouvelle vente). Seuls prénom et nom sont obligatoires.
export const BUYER_FIELDS = Object.freeze([
  "first_name",
  "last_name",
  "phone",
  "email",
  "client_birthday",
  "contact_origin",
  "context",
]);

export const emptyBuyer = () => Object.fromEntries(BUYER_FIELDS.map((k) => [k, ""]));

// Téléphone affiché par paires dans le formulaire, normalisé à l'enregistrement (buyerPayload).
export const buyerFromData = (data) => ({
  ...emptyBuyer(),
  ...Object.fromEntries(BUYER_FIELDS.map((k) => [k, k === "phone" ? formatPhone(data?.[k]) : str(data?.[k])])),
});

export const isBuyerComplete = (b) => str(b?.first_name).trim() !== "" && str(b?.last_name).trim() !== "";

// Bloc acquéreur → charge utile des RPC (champs vides retirés).
export const buyerPayload = (b) =>
  Object.fromEntries(
    BUYER_FIELDS.map((k) => [k, k === "phone" ? normalizePhone(b?.[k]) : str(b?.[k]).trim()]).filter(([, v]) => v !== "")
  );

export const emptyTransactionDraft = ({ kind = "sale", userId = null } = {}) => ({
  id: null,
  kind,
  property: { id: null, address: "", postal_code: "", city: "", property_type: "", surface: "" },
  seller_mode: "free",
  seller_client_id: "",
  seller_first_name: "",
  seller_last_name: "",
  buyer_mode: "free",
  buyer_client_id: "",
  buyer: emptyBuyer(),
  create_after_sale: true, // vente en saisie libre : créer la fiche après-vente de l'acquéreur
  price: "",
  fees_ttc: "",
  vat_rate: String(DEFAULT_VAT_RATE),
  date_kind: "sale", // vente : "promise" | "sale"
  date: "",
  preliminary_date: "",
  original: null, // { deed_date, fees_received_at, status } en modification
  split_locked: false, // modification par un non-admin : la répartition n'est pas renvoyée
  notes: "",
  participants: userId
    ? defaultShares([
        { key: newRowKey(), user_id: userId, side: "entree" },
        { key: newRowKey(), user_id: userId, side: "sortie" },
      ])
    : [],
  deductions: [],
});

export const transactionToDraft = (t, { canEditSplit = true } = {}) => {
  const seller = splitPersonName(t.seller_label);
  const hasBuyerDraft = Boolean(t.buyer_draft);
  return {
    id: t.id,
    kind: t.kind,
    property: {
      id: t.property?.id || t.property_id || null,
      address: str(t.property?.address),
      postal_code: str(t.property?.postal_code),
      city: str(t.property?.city),
      property_type: str(t.property?.property_type),
      surface: str(t.property?.surface),
    },
    seller_mode: t.seller_client_id ? "client" : "free",
    seller_client_id: str(t.seller_client_id),
    seller_first_name: seller.first_name,
    seller_last_name: seller.last_name,
    buyer_mode: t.buyer_client_id ? "client" : "free",
    buyer_client_id: str(t.buyer_client_id),
    buyer: hasBuyerDraft ? buyerFromData(t.buyer_draft) : buyerFromData(splitPersonName(t.buyer_label)),
    // Un acquéreur saisi à la promesse reste en attente de sa fiche ; sinon pas de création implicite.
    create_after_sale: hasBuyerDraft,
    price: str(t.price),
    fees_ttc: str(t.fees_ttc),
    vat_rate: str(t.vat_rate ?? DEFAULT_VAT_RATE),
    date_kind: t.kind === "sale" && !t.deed_date && (t.preliminary_date || t.status === "in_progress") ? "promise" : "sale",
    date: str(t.deed_date || t.preliminary_date),
    preliminary_date: str(t.preliminary_date),
    original: { deed_date: t.deed_date || null, fees_received_at: t.fees_received_at || null, status: t.status },
    split_locked: !canEditSplit,
    notes: str(t.notes),
    participants: (t.participants || []).map((p) => ({ ...p, key: p.id || newRowKey() })),
    deductions: (t.deductions || []).map((d) => ({ ...d, key: d.id || newRowKey() })),
  };
};

// Date unique du formulaire → preliminary_date / deed_date.
const draftDates = (d) => {
  const date = d.date || null;
  if (d.kind === "rental") return { preliminary_date: null, deed_date: date };
  if (d.date_kind === "promise") return { preliminary_date: date, deed_date: null };
  return { preliminary_date: d.preliminary_date || null, deed_date: date };
};

const draftFields = (d) => {
  const fields = {
    id: d.id || null,
    kind: d.kind,
    property: {
      id: d.property.id || null,
      address: d.property.address,
      postal_code: d.property.postal_code,
      city: d.property.city,
      property_type: d.property.property_type || null,
      surface: parseDecimal(d.property.surface),
    },
    seller_client_id: d.seller_mode === "client" ? d.seller_client_id || null : null,
    seller_label: d.seller_mode === "free" ? fullName(d.seller_first_name, d.seller_last_name) : null,
    buyer_client_id: d.buyer_mode === "client" ? d.buyer_client_id || null : null,
    buyer_label: d.buyer_mode === "free" ? fullName(d.buyer?.first_name, d.buyer?.last_name) : null,
    price: parseDecimal(d.price),
    fees_ttc: parseDecimal(d.fees_ttc),
    vat_rate: parseDecimal(d.vat_rate) ?? DEFAULT_VAT_RATE,
    notes: d.notes,
    deductions: d.deductions.map((x) => ({
      id: x.id || null,
      label: x.label,
      beneficiary: x.beneficiary || null,
      amount_ht: parseDecimal(x.amount_ht),
      reason: x.reason,
    })),
  };
  // Répartition verrouillée : la clé est omise, la base conserve les lignes existantes.
  if (!d.split_locked) {
    fields.participants = d.participants.map((p) => ({
      user_id: p.user_id,
      side: p.side,
      share_pct: parseDecimal(p.share_pct) ?? 0,
    }));
  }
  return fields;
};

// Charge utile des RPC save_transaction / save_transaction_with_buyer / record_promise.
export const draftToPayload = (d) => applyDerivedFields({ ...draftFields(d), ...draftDates(d) }, d.original);

// Acquéreur à transmettre avec la transaction (RPC save_transaction_with_buyer), ou null :
// fiche après-vente créée tout de suite pour une vente signée, conservée en attente pour une promesse.
export const shouldCreateAfterSale = (d) =>
  d.kind === "sale" && d.buyer_mode === "free" && Boolean(d.create_after_sale) && str(d.buyer?.last_name).trim() !== "";

export const draftBuyerFiche = (d) => (shouldCreateAfterSale(d) ? buyerPayload(d.buyer) : null);


// --- Acquéreur existant ---

// Minuscules sans accents ; téléphone réduit à ses chiffres.
const norm = (v) => str(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const digits = (v) => str(v).replace(/\D/g, "");

export const BUYER_MATCH_MIN_CHARS = 2;

// Fiches visibles correspondant au bloc acquéreur (toutes catégories), dès 2 caractères dans prénom,
// nom, téléphone ou email. Tous les critères saisis doivent correspondre ; actives d'abord.
export const matchingClients = (clients, buyer, { limit = 6, excludeIds = [] } = {}) => {
  const criteria = [];
  const first = norm(buyer?.first_name);
  const last = norm(buyer?.last_name);
  const phone = digits(buyer?.phone);
  const email = norm(buyer?.email);
  if (first.length >= BUYER_MATCH_MIN_CHARS) criteria.push((c) => norm(c.first_name).includes(first));
  if (last.length >= BUYER_MATCH_MIN_CHARS) criteria.push((c) => norm(c.last_name).includes(last));
  if (phone.length >= BUYER_MATCH_MIN_CHARS) criteria.push((c) => digits(c.phone).includes(phone));
  if (email.length >= BUYER_MATCH_MIN_CHARS) criteria.push((c) => norm(c.email).includes(email));
  if (criteria.length === 0) return [];
  const excluded = new Set(excludeIds.filter(Boolean));
  return (Array.isArray(clients) ? clients : [])
    .filter((c) => c && !excluded.has(c.id) && criteria.every((match) => match(c)))
    .sort((a, b) => (a.status === "closed") - (b.status === "closed"))
    .slice(0, limit);
};

// Fiche choisie → bloc acquéreur (affichage ; la fiche elle-même n'est pas modifiée).
export const buyerFromClient = (c) => buyerFromData(c);

// Fiche acquéreur d'un autre commercial que le propriétaire du mandat : répartition proposée
// = propriétaire du mandat à l'entrée 50 %, propriétaire de la fiche acquéreur à la sortie 50 %.
// null si les deux sont la même personne (la répartition en cours est conservée).
export const buyerSplitParticipants = ({ mandateOwnerId, buyerOwnerId }) => {
  if (!mandateOwnerId || !buyerOwnerId || mandateOwnerId === buyerOwnerId) return null;
  return defaultShares([
    { key: newRowKey(), user_id: mandateOwnerId, side: "entree" },
    { key: newRowKey(), user_id: buyerOwnerId, side: "sortie" },
  ]);
};
