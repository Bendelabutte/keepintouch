// supabase/functions/send-followup-emails/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_URL = "https://api.resend.com/emails";

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

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function diffInDays(dateStr: string, today: Date) {
  const due = new Date(`${dateStr}T00:00:00.000Z`);
  const today0 = new Date(`${toDateOnly(today)}T00:00:00.000Z`);
  return Math.round((due.getTime() - today0.getTime()) / (1000 * 60 * 60 * 24));
}

function clientDisplayName(c: ClientRow) {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || "(Sans nom)";
}

function clientAddress(c: ClientRow) {
  return c.property_address || c.after_address || "Adresse non renseignée";
}

function ownerDisplayName(p: ProfileRow | null) {
  if (!p) return "Bonjour";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return full ? `Bonjour ${full},` : "Bonjour,";
}

async function sendEmail({
  resendApiKey,
  to,
  subject,
  html,
}: {
  resendApiKey: string;
  to: string;
  subject: string;
  html: string;
}) {
  const resp = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Keepintouch <keepintouch@18avenue.fr>",
      to: [to],
      subject,
      html,
    }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data?.message || data?.error || "Erreur Resend");
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
      return new Response(
        JSON.stringify({ error: "Configuration serveur manquante." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

const today = new Date();

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
const emailGlobalFrequencyDays = Number(settingsRow?.email_global_frequency_days ?? 1);

const { data: clients, error: clientsError } = await admin
  .from("clients")
  .select(
    "id, owner_id, category, status, first_name, last_name, email, phone, property_address, after_address, next_due_date"
  )
  .neq("status", "closed")
  .not("next_due_date", "is", null);

    if (clientsError) throw clientsError;

    const ownerIds = [...new Set((clients || []).map((c) => c.owner_id).filter(Boolean))];

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, email, first_name, last_name, is_active")
      .in("id", ownerIds);

    if (profilesError) throw profilesError;

    const profilesMap = new Map<string, ProfileRow>();
    (profiles || []).forEach((p) => profilesMap.set(p.id, p));

    let sentTomorrow = 0;
    let sentLate = 0;
    let sentGlobal = 0;

    const overdueByUser = new Map<string, ClientRow[]>();

    for (const client of (clients || []) as ClientRow[]) {
      if (!client.owner_id || !client.next_due_date) continue;

      const owner = profilesMap.get(client.owner_id) || null;
      if (!owner?.email || owner.is_active === false) continue;

      const diff = diffInDays(client.next_due_date, today);

      if (diff <= -1) {
        if (!overdueByUser.has(client.owner_id)) overdueByUser.set(client.owner_id, []);
        overdueByUser.get(client.owner_id)!.push(client);
      }

      // J-1
      if (emailTomorrowEnabled && diff === 1) {
        const { data: existing } = await admin
          .from("notification_logs")
          .select("id")
          .eq("user_id", client.owner_id)
          .eq("client_id", client.id)
          .eq("notification_type", "followup_tomorrow")
          .eq("notification_date", toDateOnly(today))
          .maybeSingle();

        if (!existing) {
        const dueLabel = client.next_due_date
  ? new Date(`${client.next_due_date}T00:00:00.000Z`).toLocaleDateString("fr-FR")
  : "date non renseignée";

const categoryLabel =
  client.category === "seller"
    ? "Vendeur / Bailleur"
    : client.category === "buyer"
    ? "Acquéreur"
    : "Après-vente";

const addressLabel = clientAddress(client) || "adresse non renseignée";

const subject = `Relance prévue demain — ${clientDisplayName(client)}`;
const html = `
  <p>${ownerDisplayName(owner)}</p>

  <p>Une relance est prévue demain pour <strong>${clientDisplayName(client)}</strong>.</p>

  <p><strong>Catégorie :</strong> ${categoryLabel}</p>
  <p><strong>Adresse :</strong> ${addressLabel}</p>
  <p><strong>Date prévue :</strong> ${dueLabel}</p>

  <p>Connectez-vous à Keepintouch pour mettre à jour ce dossier.</p>

  <p>
    <a href="https://www.osmozdev.com/" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;">
      Ouvrir Keepintouch
    </a>
  </p>
`;

          await sendEmail({
            resendApiKey,
            to: owner.email,
            subject,
            html,
          });

          await admin.from("notification_logs").insert({
            user_id: client.owner_id,
            client_id: client.id,
            notification_type: "followup_tomorrow",
            notification_date: toDateOnly(today),
            meta: { next_due_date: client.next_due_date },
          });

          sentTomorrow += 1;
        }
      }

            // Retard paramétrable
      if (emailLateEnabled && diff === -emailLateDays) {
        const { data: existing } = await admin
          .from("notification_logs")
          .select("id")
          .eq("user_id", client.owner_id)
          .eq("client_id", client.id)
          .eq("notification_type", "followup_late_3d")
          .eq("notification_date", toDateOnly(today))
          .maybeSingle();

        if (!existing) {
          const dueLabel = client.next_due_date
  ? new Date(`${client.next_due_date}T00:00:00.000Z`).toLocaleDateString("fr-FR")
  : "date non renseignée";

const categoryLabel =
  client.category === "seller"
    ? "Vendeur / Bailleur"
    : client.category === "buyer"
    ? "Acquéreur"
    : "Après-vente";

const addressLabel = clientAddress(client) || "adresse non renseignée";

const subject = `Relance en retard — ${clientDisplayName(client)}`;
const html = `
  <p>${ownerDisplayName(owner)}</p>

  <p>La relance de <strong>${clientDisplayName(client)}</strong> a désormais <strong>3 jours de retard</strong>.</p>

  <p><strong>Catégorie :</strong> ${categoryLabel}</p>
  <p><strong>Adresse :</strong> ${addressLabel}</p>
  <p><strong>Date prévue :</strong> ${dueLabel}</p>

  <p>Connectez-vous à Keepintouch pour mettre à jour ce dossier.</p>

  <p>
    <a href="https://www.osmozdev.com/" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;">
      Ouvrir Keepintouch
    </a>
  </p>
`;

          await sendEmail({
            resendApiKey,
            to: owner.email,
            subject,
            html,
          });

          await admin.from("notification_logs").insert({
            user_id: client.owner_id,
            client_id: client.id,
            notification_type: "followup_late_3d",
            notification_date: toDateOnly(today),
            meta: { next_due_date: client.next_due_date },
          });

          sentLate += 1;
        }
      }
    }

    // Alerte globale : 3 clients en retard ou plus
    for (const [userId, lateClients] of overdueByUser.entries()) {
            if (!emailGlobalEnabled) continue;
      if (lateClients.length < emailGlobalThreshold) continue;

      const owner = profilesMap.get(userId) || null;
      if (!owner?.email || owner.is_active === false) continue;

           const frequencyStartDate = toDateOnly(
        addDays(today, -(Math.max(1, emailGlobalFrequencyDays) - 1))
      );

      const { data: existingLogs } = await admin
        .from("notification_logs")
        .select("id, notification_date")
        .eq("user_id", userId)
        .is("client_id", null)
        .eq("notification_type", "followup_global_overdue")
        .gte("notification_date", frequencyStartDate);

      if ((existingLogs || []).length > 0) continue;

    const subject = `Alerte relances — ${lateClients.length} clients en retard`;

const listHtml = lateClients
  .slice(0, 8)
  .map((c) => {
    const dueLabel = c.next_due_date
      ? new Date(`${c.next_due_date}T00:00:00.000Z`).toLocaleDateString("fr-FR")
      : "date non renseignée";

    const addressLabel = clientAddress(c) || "adresse non renseignée";

    return `<li><strong>${clientDisplayName(c)}</strong> — ${addressLabel} — relance prévue le ${dueLabel}</li>`;
  })
  .join("");

const html = `
  <p>${ownerDisplayName(owner)}</p>

  <p>Vous avez actuellement <strong>${lateClients.length} clients en retard de relance</strong>.</p>

  <p>Voici un aperçu des dossiers à traiter en priorité :</p>

  <ul>${listHtml}</ul>

  <p>Connectez-vous à Keepintouch pour mettre à jour vos dossiers.</p>

  <p>
    <a href="https://www.osmozdev.com/" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;">
      Ouvrir Keepintouch
    </a>
  </p>

  <p style="font-size:12px;color:#6b7280;">
    Cet email affiche un aperçu des dossiers en retard. Le détail complet est disponible dans votre espace Keepintouch.
  </p>
`;

      await sendEmail({
        resendApiKey,
        to: owner.email,
        subject,
        html,
      });

      await admin.from("notification_logs").insert({
        user_id: userId,
        client_id: null,
        notification_type: "followup_global_overdue",
        notification_date: toDateOnly(today),
        meta: { overdue_count: lateClients.length },
      });

      sentGlobal += 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_tomorrow: sentTomorrow,
        sent_late_3d: sentLate,
        sent_global: sentGlobal,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erreur inconnue",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});