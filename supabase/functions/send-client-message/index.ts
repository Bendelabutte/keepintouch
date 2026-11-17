// supabase/functions/send-client-message/index.ts
// Remerciement client : envoi par l'application (Resend) de l'email rédigé dans la fenêtre
// « Remercier le client ». Le texte est écrit et relu par le commercial ; il n'est jamais stocké.
//
// Secrets : RESEND_API_KEY (obligatoire), RESEND_FROM_DOMAIN (facultatif, défaut 18avenue.fr),
// MESSAGE_REDIRECT_TO (DEV UNIQUEMENT : tout part vers cette adresse ; ne jamais le définir en production).
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.
//
// Journal : une ligne client_outreach (channel 'email_app', statut 'envoye' ou 'echec') par tentative,
// qui sert aussi à la limite de 40 emails par utilisateur et par jour.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.1";

const RESEND_API_URL = "https://api.resend.com/emails";
// Même expéditeur que les rappels (send-followup-emails)
const DEFAULT_FROM = "Keepintouch <keepintouch@18avenue.fr>";
const DEFAULT_FROM_DOMAIN = "18avenue.fr";
const MAX_EMAILS_PER_DAY = 40;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 10_000;
const TEMPLATES = ["acquereur", "vendeur_rdv", "vendeur_estimation"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>",]+@[^\s@<>",.]+(\.[^\s@<>",.]+)*\.[A-Za-z]{2,}$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Mise en forme ----------

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Liens https seulement ; la ponctuation finale (« . », « ) »…) reste hors du lien.
const URL_RE = /https:\/\/[^\s<>"']+/g;
const TRAILING_RE = /[.,;:!?)\]»]+$/;

// Texte brut → HTML : échappé, liens https cliquables, retours à la ligne conservés.
export function textToHtml(text: string) {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let url = match[0];
    const trailing = url.match(TRAILING_RE)?.[0] ?? "";
    if (trailing) url = url.slice(0, -trailing.length);
    parts.push(escapeHtml(text.slice(last, start)));
    parts.push(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    last = start + url.length;
  }
  parts.push(escapeHtml(text.slice(last)));
  const html = parts.join("").replace(/\r?\n/g, "<br>\n");
  return `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.5; color: #1f2937;">${html}</div>`;
}

const displayName = (first: string, last: string) =>
  [first, last]
    .map((s) => String(s ?? "").replace(/["<>\r\n\\]/g, "").trim())
    .filter(Boolean)
    .join(" ");

/**
 * Expéditeur : « Prénom Nom <email> » si l'email du commercial est sur le domaine autorisé chez Resend,
 * sinon l'expéditeur des rappels. Reply-To et Bcc : toujours le commercial.
 * redirectTo (DEV) : seul destinataire, sans Bcc, objet préfixé « [DEV → destinataire réel] ».
 */
export function buildEnvelope(opts: {
  senderEmail: string;
  senderFirst: string;
  senderLast: string;
  clientEmail: string;
  subject: string;
  fromDomain: string;
  redirectTo?: string;
}) {
  const senderEmail = opts.senderEmail.trim();
  const domain = senderEmail.split("@").pop()?.toLowerCase() ?? "";
  const name = displayName(opts.senderFirst, opts.senderLast);
  const ownDomain = domain === opts.fromDomain.trim().toLowerCase();
  const from = ownDomain ? (name ? `"${name}" <${senderEmail}>` : senderEmail) : DEFAULT_FROM;
  const redirect = (opts.redirectTo ?? "").trim();
  if (redirect) {
    return {
      from,
      to: [redirect],
      bcc: [] as string[],
      reply_to: senderEmail,
      subject: `[DEV → ${opts.clientEmail}] ${opts.subject}`,
    };
  }
  return { from, to: [opts.clientEmail], bcc: [senderEmail], reply_to: senderEmail, subject: opts.subject };
}

// Début de la journée en cours à Paris, en ISO (limite quotidienne)
export function startOfParisDay(now = new Date()) {
  const day = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // Décalage de Paris à cette date (+01:00 ou +02:00)
  const offsetPart = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "longOffset" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = offsetPart?.replace("GMT", "") || "+00:00";
  return new Date(`${day}T00:00:00${offset}`).toISOString();
}

// ---------- Handler ----------

// Variable posée par les tests (index_test.ts) pour importer les fonctions sans démarrer le serveur
if (!Deno.env.get("SEND_CLIENT_MESSAGE_TEST")) Deno.serve(handler);

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromDomain = Deno.env.get("RESEND_FROM_DOMAIN") || DEFAULT_FROM_DOMAIN;
  const redirectTo = Deno.env.get("MESSAGE_REDIRECT_TO") || "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey || !resendApiKey) {
    console.error("send-client-message : configuration incomplète (secrets manquants).");
    return json({ error: "Service indisponible pour le moment." }, 500);
  }

  // 1. Utilisateur connecté (JWT) et actif (profil)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Non autorisé." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Session expirée : reconnectez-vous." }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, email, first_name, last_name, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile || profile.is_active === false) {
    return json({ error: "Compte inactif ou introuvable." }, 403);
  }
  const senderEmail = String(profile.email || user.email || "").trim();
  if (!EMAIL_RE.test(senderEmail)) return json({ error: "Votre profil n’a pas d’adresse email valide." }, 400);

  // 2. Entrée
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }
  const clientId = String(body?.client_id ?? "");
  const template = String(body?.template ?? "");
  const agencyIdRaw = body?.agency_id ? String(body.agency_id) : "";
  const subject = typeof body?.subject === "string" ? body.subject.replace(/[\r\n]+/g, " ").trim() : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!UUID_RE.test(clientId)) return json({ error: "Fiche invalide." }, 400);
  if (!TEMPLATES.includes(template)) return json({ error: "Modèle invalide." }, 400);
  if (agencyIdRaw && !UUID_RE.test(agencyIdRaw)) return json({ error: "Agence invalide." }, 400);
  if (!subject) return json({ error: "L’objet est vide." }, 400);
  if (!text) return json({ error: "Le message est vide." }, 400);
  if (subject.length > MAX_SUBJECT_LENGTH) return json({ error: "Objet trop long : 200 caractères maximum." }, 400);
  if (text.length > MAX_BODY_LENGTH) return json({ error: "Message trop long : 10 000 caractères maximum." }, 400);

  // 3. Fiche lue avec les droits de l'utilisateur (RLS) : refus si elle ne lui est pas visible
  const { data: client, error: clientError } = await userClient
    .from("clients")
    .select("id, email")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError) {
    console.error("send-client-message : lecture de la fiche impossible :", clientError.code);
    return json({ error: "Service indisponible pour le moment." }, 500);
  }
  if (!client) return json({ error: "Fiche introuvable ou non accessible." }, 404);
  const clientEmail = String(client.email || "").trim();
  if (!EMAIL_RE.test(clientEmail)) return json({ error: "La fiche n’a pas d’adresse email valide." }, 400);

  // Agence : seulement si elle existe (sinon journalisée sans agence)
  let agencyId: string | null = null;
  if (agencyIdRaw) {
    const { data: agency } = await adminClient.from("agencies").select("id").eq("id", agencyIdRaw).maybeSingle();
    agencyId = agency?.id ?? null;
  }

  // 4. Limite : 40 emails par utilisateur et par jour (tentatives en échec comprises)
  const { count, error: countError } = await adminClient
    .from("client_outreach")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("channel", "email_app")
    .gte("created_at", startOfParisDay());
  if (countError) {
    console.error("send-client-message : lecture du journal impossible :", countError.code);
    return json({ error: "Service indisponible pour le moment." }, 500);
  }
  if ((count ?? 0) >= MAX_EMAILS_PER_DAY) {
    return json(
      { error: "Limite atteinte : 40 emails par jour. Utilisez « Ouvrir dans ma messagerie » ou réessayez demain." },
      429
    );
  }

  // 5. Envoi
  const envelope = buildEnvelope({
    senderEmail,
    senderFirst: profile.first_name || "",
    senderLast: profile.last_name || "",
    clientEmail,
    subject,
    fromDomain,
    redirectTo,
  });

  let sent = false;
  try {
    const resp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: envelope.from,
        to: envelope.to,
        ...(envelope.bcc.length ? { bcc: envelope.bcc } : {}),
        reply_to: envelope.reply_to,
        subject: envelope.subject,
        html: textToHtml(text),
        text,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("send-client-message : Resend", resp.status, data?.name || data?.message || "erreur inconnue");
    } else {
      sent = true;
    }
  } catch {
    console.error("send-client-message : Resend injoignable.");
  }

  const { error: logError } = await adminClient.from("client_outreach").insert({
    client_id: clientId,
    user_id: user.id,
    agency_id: agencyId,
    channel: "email_app",
    template,
    status: sent ? "envoye" : "echec",
  });
  if (logError) console.error("send-client-message : écriture du journal impossible :", logError.code);

  if (!sent) {
    return json({ error: "L’email n’a pas pu être envoyé. Réessayez ou utilisez « Ouvrir dans ma messagerie »." }, 502);
  }
  return json({ ok: true, redirected: Boolean(redirectTo) });
}
