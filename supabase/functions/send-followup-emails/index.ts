// supabase/functions/send-followup-emails/index.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.56.1";

const RESEND_API_URL = "https://api.resend.com/emails";
const APP_URL = "https://www.osmozdev.com/";
const FROM = "Keepintouch <keepintouch@18avenue.fr>";
const PAGE_SIZE = 1000;
// Fenêtre de rattrapage des emails de retard (si un envoi quotidien a sauté)
const LATE_CATCH_UP_DAYS = 7;

type ClientRow = {
  id: string;
  owner_id: string;
  category: "seller" | "buyer" | "after";
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  property_address: string | null;
  after_address: string | null;
  next_due_date: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean | null;
};

// ---------- Utilitaires ----------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}

// Date du jour à Paris, au format YYYY-MM-DD
function todayInParis(): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffInDays(dueStr: string, todayStr: string): number {
  const due = Date.parse(`${dueStr.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayStr}T00:00:00Z`);
  return Math.round((due - today) / 86_400_000);
}

function formatDateFr(dateStr: string | null): string {
  if (!dateStr) return "date non renseignée";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function categoryLabel(category: ClientRow["category"]): string {
  if (category === "seller") return "Vendeur / Bailleur";
  if (category === "buyer") return "Acquéreur";
  return "Après-vente";
}

function clientDisplayName(c: ClientRow): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || "(Sans nom)";
}

function clientAddress(c: ClientRow): string {
  return c.property_address || c.after_address || "Adresse non renseignée";
}

function greeting(p: ProfileRow | null): string {
  if (!p) return "Bonjour,";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return full ? `Bonjour ${escapeHtml(full)},` : "Bonjour,";
}

// ---------- Gabarit email unique ----------

function renderEmail({
  owner,
  introHtml,
  bodyHtml = "",
  footerNote,
}: {
  owner: ProfileRow | null;
  introHtml: string;
  bodyHtml?: string;
  footerNote?: string;
}): string {
  return `
  <p>${greeting(owner)}</p>
  <p>${introHtml}</p>
  ${bodyHtml}
  <p>Connectez-vous à Keepintouch pour mettre à jour vos dossiers.</p>
  <p>
    <a href="${APP_URL}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;">
      Ouvrir Keepintouch
    </a>
  </p>
  ${footerNote ? `<p style="font-size:12px;color:#6b7280;">${footerNote}</p>` : ""}
`;
}

function clientDetailsHtml(c: ClientRow): string {
  return `
  <p><strong>Catégorie :</strong> ${escapeHtml(categoryLabel(c.category))}</p>
  <p><strong>Adresse :</strong> ${escapeHtml(clientAddress(c))}</p>
  <p><strong>Date prévue :</strong> ${escapeHtml(formatDateFr(c.next_due_date))}</p>
`;
}

// ---------- Accès externes ----------

async function sendEmail(resendApiKey: string, to: string, subject: string, html: string) {
  const resp = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Resend ${resp.status}: ${data?.message || data?.error || "erreur inconnue"}`);
  }
  return data;
}

async function fetchActiveClients(admin: SupabaseClient): Promise<ClientRow[]> {
  const all: ClientRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("clients")
      .select(
        "id, owner_id, category, status, first_name, last_name, email, phone, property_address, after_address, next_due_date"
      )
      .neq("status", "closed")
      .not("next_due_date", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    all.push(...((data ?? []) as ClientRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return all;
}

async function logNotification(
  admin: SupabaseClient,
  row: {
    user_id: string;
    client_id: string | null;
    notification_type: string;
    notification_date: string;
    meta: Record<string, unknown>;
  }
) {
  const { error } = await admin.from("notification_logs").insert(row);
  if (error) console.error("notification_logs insert:", error);
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Méthode non autorisée." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !cronSecret) {
    console.error("send-followup-emails: configuration manquante");
    return json({ error: "Configuration serveur manquante." }, 500);
  }

  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!safeEqual(provided, cronSecret)) {
    return json({ error: "Non autorisé." }, 401);
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const today = todayInParis();

    // Paramètres
    const { data: settingsRow, error: settingsError } = await admin
      .from("app_settings")
      .select(
        "email_tomorrow_enabled, email_late_enabled, email_late_days, email_global_enabled, email_global_threshold, email_global_frequency_days"
      )
      .limit(1)
      .maybeSingle();

    if (settingsError) throw settingsError;

    const emailTomorrowEnabled = settingsRow?.email_tomorrow_enabled ?? true;
    const emailLateEnabled = settingsRow?.email_late_enabled ?? true;
    const emailLateDays = Number(settingsRow?.email_late_days ?? 3);
    const emailGlobalEnabled = settingsRow?.email_global_enabled ?? true;
    const emailGlobalThreshold = Number(settingsRow?.email_global_threshold ?? 3);
    const emailGlobalFrequencyDays = Math.max(1, Number(settingsRow?.email_global_frequency_days ?? 1));

    // Clients et commerciaux
    const clients = await fetchActiveClients(admin);
    const ownerIds = [...new Set(clients.map((c) => c.owner_id).filter(Boolean))];

    if (ownerIds.length === 0) {
      return json({ success: true, sent_tomorrow: 0, sent_late: 0, sent_global: 0 });
    }

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, email, first_name, last_name, is_active")
      .in("id", ownerIds);

    if (profilesError) throw profilesError;

    const profilesMap = new Map<string, ProfileRow>();
    (profiles ?? []).forEach((p) => profilesMap.set(p.id, p as ProfileRow));

    let sentTomorrow = 0;
    let sentLate = 0;
    let sentGlobal = 0;

    const overdueByUser = new Map<string, ClientRow[]>();

    for (const client of clients) {
      if (!client.owner_id || !client.next_due_date) continue;

      const owner = profilesMap.get(client.owner_id) ?? null;
      if (!owner?.email || owner.is_active === false) continue;

      const diff = diffInDays(client.next_due_date, today);

      if (diff <= -1) {
        if (!overdueByUser.has(client.owner_id)) overdueByUser.set(client.owner_id, []);
        overdueByUser.get(client.owner_id)!.push(client);
      }

      // Relance prévue demain
      if (emailTomorrowEnabled && diff === 1) {
        const { data: existing, error } = await admin
          .from("notification_logs")
          .select("id")
          .eq("user_id", client.owner_id)
          .eq("client_id", client.id)
          .eq("notification_type", "followup_tomorrow")
          .eq("notification_date", today)
          .limit(1);

        if (error) throw error;

        if (!existing?.length) {
          const name = clientDisplayName(client);
          await sendEmail(
            resendApiKey,
            owner.email,
            `Relance prévue demain — ${name}`,
            renderEmail({
              owner,
              introHtml: `Une relance est prévue demain pour <strong>${escapeHtml(name)}</strong>.`,
              bodyHtml: clientDetailsHtml(client),
            })
          );

          await logNotification(admin, {
            user_id: client.owner_id,
            client_id: client.id,
            notification_type: "followup_tomorrow",
            notification_date: today,
            meta: { next_due_date: client.next_due_date },
          });

          sentTomorrow += 1;
        }
      }

      // Relance en retard : un seul email par échéance, avec rattrapage limité
      const lateMin = -emailLateDays;
      const lateMax = -(emailLateDays + LATE_CATCH_UP_DAYS - 1);

      if (emailLateEnabled && diff <= lateMin && diff >= lateMax) {
        const { data: existing, error } = await admin
          .from("notification_logs")
          .select("id")
          .eq("user_id", client.owner_id)
          .eq("client_id", client.id)
          .eq("notification_type", "followup_late_3d")
          .eq("meta->>next_due_date", client.next_due_date)
          .limit(1);

        if (error) throw error;

        if (!existing?.length) {
          const name = clientDisplayName(client);
          const daysLate = -diff;
          await sendEmail(
            resendApiKey,
            owner.email,
            `Relance en retard — ${name}`,
            renderEmail({
              owner,
              introHtml: `La relance de <strong>${escapeHtml(name)}</strong> a désormais <strong>${daysLate} jour${daysLate > 1 ? "s" : ""} de retard</strong>.`,
              bodyHtml: clientDetailsHtml(client),
            })
          );

          await logNotification(admin, {
            user_id: client.owner_id,
            client_id: client.id,
            notification_type: "followup_late_3d",
            notification_date: today,
            meta: { next_due_date: client.next_due_date },
          });

          sentLate += 1;
        }
      }
    }

    // Alerte globale
    if (emailGlobalEnabled) {
      const frequencyStartDate = addDaysToDateStr(today, -(emailGlobalFrequencyDays - 1));

      for (const [userId, lateClients] of overdueByUser.entries()) {
        if (lateClients.length < emailGlobalThreshold) continue;

        const owner = profilesMap.get(userId) ?? null;
        if (!owner?.email || owner.is_active === false) continue;

        const { data: existingLogs, error } = await admin
          .from("notification_logs")
          .select("id")
          .eq("user_id", userId)
          .is("client_id", null)
          .eq("notification_type", "followup_global_overdue")
          .gte("notification_date", frequencyStartDate)
          .limit(1);

        if (error) throw error;
        if (existingLogs?.length) continue;

        const listHtml = lateClients
          .slice(0, 8)
          .map(
            (c) =>
              `<li><strong>${escapeHtml(clientDisplayName(c))}</strong> — ${escapeHtml(clientAddress(c))} — relance prévue le ${escapeHtml(formatDateFr(c.next_due_date))}</li>`
          )
          .join("");

        await sendEmail(
          resendApiKey,
          owner.email,
          `Alerte relances — ${lateClients.length} clients en retard`,
          renderEmail({
            owner,
            introHtml: `Vous avez actuellement <strong>${lateClients.length} clients en retard de relance</strong>. Voici un aperçu des dossiers à traiter en priorité :`,
            bodyHtml: `<ul>${listHtml}</ul>`,
            footerNote:
              "Cet email affiche un aperçu des dossiers en retard. Le détail complet est disponible dans votre espace Keepintouch.",
          })
        );

        await logNotification(admin, {
          user_id: userId,
          client_id: null,
          notification_type: "followup_global_overdue",
          notification_date: today,
          meta: { overdue_count: lateClients.length },
        });

        sentGlobal += 1;
      }
    }

    return json({
      success: true,
      today,
      sent_tomorrow: sentTomorrow,
      sent_late: sentLate,
      sent_global: sentGlobal,
    });
  } catch (err) {
    console.error("send-followup-emails:", err);
    return json({ error: "Erreur interne." }, 500);
  }
});