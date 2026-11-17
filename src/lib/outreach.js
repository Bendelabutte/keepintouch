// src/lib/outreach.js
// Remerciement après découverte : modèles de messages (sans IA, à partir de la fiche), numéros
// WhatsApp et SMS, liens wa.me / sms: / mailto:, choix de l'agence, libellés de l'historique.
import { formatPhone, isValidEmail, normalizePhone } from "./contact";
import { parseDateStr, todayStr } from "./dates";

export const OUTREACH_CHANNELS = ["whatsapp", "sms", "email"];

export const OUTREACH_TEMPLATES = ["acquereur", "vendeur_rdv", "vendeur_estimation"];

export const SELLER_MESSAGE_LABELS = Object.freeze({
  vendeur_rdv: "Confirmation du rendez-vous",
  vendeur_estimation: "Après l’estimation",
});

const CHANNEL_LABELS = { whatsapp: "WhatsApp", sms: "SMS", email: "email" };

// Espaces insécables (fines ou non) produites par toLocaleString : remplacées par des espaces simples
const NB_SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, "g");

// ---------- Fiches concernées et message par défaut ----------

const hasEstimation = (c) => Boolean(c?.estimation_date || (c?.estimation_value !== null && c?.estimation_value !== undefined && c?.estimation_value !== ""));

// Acquéreur : toujours ; vendeur : une fois l'estimation (date ou valeur) renseignée ;
// jamais l'après-vente ni un dossier clos.
export const outreachKindFor = (client) => {
  if (!client || client.status === "closed") return null;
  if (client.category === "buyer") return "acquereur";
  if (client.category === "seller" && hasEstimation(client)) return "vendeur";
  return null;
};

// Vendeur : estimation à venir → confirmation du rendez-vous ; du jour, passée ou valeur sans date → après l'estimation.
export const defaultSellerMessage = (client, today = todayStr()) => {
  const date = parseDateStr(client?.estimation_date);
  const now = parseDateStr(today);
  return date && now && date > now ? "vendeur_rdv" : "vendeur_estimation";
};

export const defaultTemplateFor = (client, today = todayStr()) => {
  const kind = outreachKindFor(client);
  if (kind === "vendeur") return defaultSellerMessage(client, today);
  return kind;
};

// Bandeau « Remercier après l'estimation » : vendeur actif, estimation du jour ou passée,
// aucun remerciement « après l'estimation » déjà préparé ou envoyé (un échec ne compte pas).
export const estimationThankDue = (client, outreachRows = [], today = todayStr()) => {
  if (outreachKindFor(client) !== "vendeur") return false;
  const date = parseDateStr(client.estimation_date);
  const now = parseDateStr(today);
  if (!date || !now || date > now) return false;
  return !outreachRows.some((o) => o.template === "vendeur_estimation" && o.status !== "echec");
};

// ---------- Dates ----------

/** « jeudi 20 novembre », « samedi 1er novembre », année ajoutée si ce n'est pas l'année en cours. */
export const formatLongDate = (value, today = todayStr()) => {
  const d = parseDateStr(value);
  if (!d) return "";
  const now = parseDateStr(today) || new Date();
  const weekday = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const month = d.toLocaleDateString("fr-FR", { month: "long" });
  const day = d.getDate() === 1 ? "1er" : String(d.getDate());
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${weekday} ${day} ${month}${year}`;
};

// ---------- Récapitulatif de la recherche (acquéreur) ----------

const KIND_NOUNS = {
  appartement: "un appartement",
  maison: "une maison",
  terrain: "un terrain",
  "local commercial": "un local commercial",
  immeuble: "un immeuble",
};

const cleanNumber = (value) => {
  const n = Number(String(value ?? "").replace(NB_SPACES, "").replace(/[\s€]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Montant en euros, espaces simples (les espaces fines insécables coûtent cher en SMS).
export const formatEuros = (value) => `${Math.round(value).toLocaleString("fr-FR").replace(NB_SPACES, " ")} €`;

// « 18e », « 18ème », « 18 eme », « 1er » en tête : arrondissement → « dans le 18e »
const ARRONDISSEMENT_RE = /^\d{1,2}\s*(e|è|ème|eme|er)\b/i;

// Secteur qui commence déjà par une préposition ou une expression de lieu : gardé tel quel
// (« à moins d'une heure de Paris », « près du métro Jules Joffrin »), sans préposition ajoutée.
const LOCATION_WORDS = [
  "à", "a", "dans", "en", "au", "aux", "sur", "près", "pres", "proche", "proximité", "proximite", "autour",
  "vers", "entre", "moins", "côté", "cote", "du", "non", "pas", "hors", "le long", "aux alentours", "alentours",
  "environs", "secteur", "quartier", "limite", "jusqu'à", "jusqu’à",
];
const LOCATION_RE = new RegExp(`^(?:${LOCATION_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=[\\s'’]|$)`, "i");

export const areaPhrase = (area) => {
  const a = String(area ?? "").trim().replace(/\s+/g, " ");
  if (!a) return "";
  if (LOCATION_RE.test(a)) {
    // Premier mot = préposition, jamais un nom propre : minuscule ; « A » seul vaut « à »
    if (/^a(?=\s)/i.test(a)) return `à${a.slice(1)}`;
    return a.charAt(0).toLowerCase() + a.slice(1);
  }
  return ARRONDISSEMENT_RE.test(a) ? `dans le ${a}` : `à ${a}`;
};

// « un 2 pièces dans le 18e, jusqu'à 300 000 € » ; seuls les champs remplis, "" si rien.
export const buyerSearchSummary = (client = {}) => {
  const kindKey = String(client.project_type ?? "").trim().toLowerCase();
  const kind = KIND_NOUNS[kindKey] || "";
  const rooms = cleanNumber(client.rooms);
  const roomsInt = rooms ? Math.round(rooms) : null;
  const area = areaPhrase(client.area);
  const budget = cleanNumber(client.budget_max);

  let noun;
  if (roomsInt && (!kind || kindKey === "appartement")) {
    noun = roomsInt === 1 ? "un studio" : `un ${roomsInt} pièces`;
  } else if (roomsInt && kind) {
    noun = `${kind} de ${roomsInt} pièce${roomsInt > 1 ? "s" : ""}`;
  } else {
    noun = kind;
  }

  if (!noun && !area && !budget) return "";
  const head = [noun || "un bien", area].filter(Boolean).join(" ");
  if (!budget) return head;
  return `${head}${noun || area ? "," : ""} jusqu'à ${formatEuros(budget)}`;
};

// ---------- Messages ----------

const clean = (v) => String(v ?? "").trim();

// Nom de l'agence tel quel (il contient souvent déjà « 18 Avenue ») ; sans agence : « 18 Avenue ».
export const brandLine = (agency) => clean(agency?.name) || "18 Avenue";

const reviewUrl = (agency) => {
  const url = clean(agency?.google_review_url);
  return /^https:\/\/\S+$/.test(url) ? url : "";
};

// Ouvertures selon la circonstance ("" = non précisé)
const OPENINGS = {
  acquereur: {
    visite: "Merci pour la visite et pour le temps que vous m'avez accordé.",
    agence: "Merci pour votre passage à l'agence et pour le temps que vous m'avez accordé.",
    telephone: "Merci pour notre échange téléphonique.",
    "": "Merci pour notre échange.",
  },
  vendeur_rdv: {
    agence: "Merci pour votre passage à l'agence.",
    telephone: "Merci pour notre échange téléphonique.",
    "": "Merci pour notre échange.",
  },
};

export const openingFor = (template, circumstance = "") => {
  const table = OPENINGS[template];
  if (!table) return "";
  return table[circumstance] || table[""];
};

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// « au 18 rue Ramey » ; une adresse sans numéro : « situé rue Ramey »
const addressPhrase = (address) => {
  const a = clean(address);
  if (!a) return "";
  return /^\d/.test(a) ? ` au ${a}` : ` situé ${a}`;
};

/**
 * Textes du message.
 * template : "acquereur" | "vendeur_rdv" | "vendeur_estimation" ; circumstance : "visite" | "agence" | "telephone" | "" ;
 * client : fiche ; sender : { first_name, last_name } ; agency : { name, google_review_url, address, phone } ou null.
 * Retourne { short, emailSubject, emailBody } (short : WhatsApp et SMS).
 */
export const buildOutreachMessages = ({ template, client = {}, sender = {}, agency = null, circumstance = "", today = todayStr() }) => {
  const firstName = clean(client.first_name);
  const link = reviewUrl(agency);
  const brand = brandLine(agency);
  const senderFull = [clean(sender.first_name), clean(sender.last_name)].filter(Boolean).join(" ");
  const shortSignature = senderFull ? `${senderFull} – ${brand}` : brand;
  const opening = openingFor(template, circumstance);
  const review = link ? `Votre avis compte beaucoup pour nous : ${link}` : "";
  const date = formatLongDate(client.estimation_date, today);
  const onDate = date ? ` le ${date}` : "";

  let shortBody;
  let paragraphs;
  let emailSubject;

  if (template === "acquereur") {
    const recap = buyerSearchSummary(client);
    const noted = recap ? `J'ai bien noté votre recherche : ${recap}.` : "J'ai bien noté votre recherche.";
    shortBody = [
      `${opening} ${noted} Je vous recontacte dès qu'un bien correspondant à vos critères se présente.`,
      review,
    ];
    emailSubject = "Votre recherche avec 18 Avenue";
    paragraphs = [
      `${opening} ${noted}`,
      "Je vous contacterai dès qu'un bien correspondant à vos critères se présentera. N'hésitez pas à me tenir informé de l'évolution de votre projet.",
      review,
      "Merci encore pour votre confiance.",
    ];
  } else if (template === "vendeur_rdv") {
    // Confirmation du rendez-vous : aucune demande d'avis
    shortBody = [`${opening} Comme convenu, je viendrai découvrir votre bien${onDate} afin de vous remettre rapidement un avis de valeur.`];
    emailSubject = "Confirmation de notre rendez-vous";
    paragraphs = [
      `${opening} Comme convenu, je viendrai découvrir votre bien${addressPhrase(client.property_address)}${onDate} afin de vous remettre rapidement un avis de valeur.`,
      "D'ici là, n'hésitez pas à me contacter pour toute question.",
      "Merci pour votre confiance.",
    ];
  } else {
    shortBody = [
      "Merci pour votre accueil et pour le temps que vous m'avez consacré. Je vous adresse mon avis de valeur dans les meilleurs délais.",
      review,
    ];
    emailSubject = "Merci pour votre accueil";
    paragraphs = [
      "Merci pour votre accueil et pour le temps que vous m'avez consacré lors de la visite de votre bien. Je vous adresse mon avis de valeur dans les meilleurs délais.",
      "Je reste à votre disposition pour toute question d'ici là.",
      review,
      "Merci encore pour votre confiance.",
    ];
  }

  // Texte court : « Bonjour Claire, merci… » (ouverture en minuscule après la virgule)
  const [first, ...rest] = shortBody;
  const short = [
    `${firstName ? `Bonjour ${firstName},` : "Bonjour,"} ${lowerFirst(first)}`,
    ...rest,
    "Merci pour votre confiance,",
    shortSignature,
  ]
    .filter(Boolean)
    .join("\n");

  const signature = [
    "Bien cordialement,",
    senderFull,
    brand,
    clean(agency?.address),
    clean(agency?.phone) ? formatPhone(agency.phone) : "",
  ].filter(Boolean);

  const emailBody = [firstName ? `Bonjour ${firstName},` : "Bonjour,", ...paragraphs, signature.join("\n")]
    .filter(Boolean)
    .join("\n\n");

  return { short, emailSubject, emailBody };
};

// ---------- Numéros ----------

const FR_MOBILE_RE = /^0[67]\d{8}$/;
const FR_INTL_RE = /^\+33\d{9}$/;
const FR_INTL_MOBILE_RE = /^\+33[67]\d{8}$/;
const INTL_RE = /^\+\d{8,15}$/;

/**
 * Numéro pour WhatsApp et les SMS : mobile français (06, 07, +336, +337) ou numéro étranger (+…).
 * Retourne { number, error } : number = chiffres internationaux sans « + » (0677665544 → 33677665544).
 */
export const mobileNumber = (phone) => {
  const n = normalizePhone(phone);
  if (!n) return { number: "", error: "La fiche n’a pas de numéro de téléphone." };
  if (FR_MOBILE_RE.test(n)) return { number: `33${n.slice(1)}`, error: "" };
  if (FR_INTL_MOBILE_RE.test(n)) return { number: n.slice(1), error: "" };
  if (/^0[1-589]\d{8}$/.test(n) || FR_INTL_RE.test(n)) {
    return { number: "", error: "Le numéro de la fiche est un fixe : il faut un mobile (06 ou 07)." };
  }
  if (INTL_RE.test(n) && !n.startsWith("+33")) return { number: n.slice(1), error: "" };
  return { number: "", error: "Le numéro de la fiche n’est pas reconnu comme un mobile." };
};

// ---------- Liens ----------

export const whatsappLink = (number, text) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

// « ?&body= » : seul format compris à la fois par iOS et Android.
export const smsLink = (number, text) => `sms:+${number}?&body=${encodeURIComponent(text)}`;

// RFC 6068 : retours à la ligne en CRLF, objet et corps encodés.
const crlf = (s) => String(s ?? "").replace(/\r?\n/g, "\r\n");

export const mailtoLink = (email, subject, body) =>
  `mailto:${clean(email)}?subject=${encodeURIComponent(crlf(subject))}&body=${encodeURIComponent(crlf(body))}`;

export const clientEmailError = (email) => {
  if (!clean(email)) return "La fiche n’a pas d’adresse email.";
  return isValidEmail(email) ? "" : "L’adresse email de la fiche n’est pas valide.";
};

// ---------- Choix de l'agence ----------

/**
 * myAgencies : agences de l'utilisateur ; allAgencies : toutes les agences ;
 * storedId : dernier choix ("" = aucune agence, null = jamais choisi).
 * Agences archivées exclues. Une seule agence : prise d'office, pas de sélecteur.
 * 0 agence : choix parmi toutes les agences ; plusieurs : parmi les siennes (la 1re par défaut).
 */
export const agencyChoice = ({ myAgencies = [], allAgencies = [], storedId = null }) => {
  const active = (list) => list.filter((a) => a && !a.archived_at);
  const mine = active(myAgencies);
  if (mine.length === 1) return { showPicker: false, options: mine, selectedId: mine[0].id };
  const options = mine.length ? mine : active(allAgencies);
  const keepStored = storedId === "" || options.some((a) => a.id === storedId);
  return { showPicker: true, options, selectedId: keepStored ? storedId : mine[0]?.id || "" };
};

export const agencyStorageKey = (userId) => `kit_outreach_agency_${userId || "anon"}`;

// ---------- Historique ----------

export const outreachLabel = (row) => {
  const rdv = row.template === "vendeur_rdv";
  const noun = rdv ? "Confirmation de rendez-vous" : "Remerciement";
  const e = rdv ? "e" : "";
  if (row.channel === "email_app") {
    return row.status === "envoye" ? `${noun} envoyé${e} par email` : `Échec de l’envoi ${rdv ? "de la confirmation de rendez-vous" : "du remerciement"} par email`;
  }
  if (row.channel === "email") return `${noun} préparé${e} dans la messagerie`;
  return `${noun} préparé${e} par ${CHANNEL_LABELS[row.channel] || row.channel}`;
};
