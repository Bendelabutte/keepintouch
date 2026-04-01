// supabase/functions/invite-user/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Configuration serveur manquante." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Non autorisé." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Client "user context" pour identifier l'appelant
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Utilisateur appelant introuvable." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Vérifie que l'appelant est admin dans profiles
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: "Profil appelant introuvable." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (callerProfile.is_active === false || callerProfile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Action réservée aux administrateurs." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "user").trim();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email requis." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!["user", "manager", "admin"].includes(role)) {
      return new Response(
        JSON.stringify({ error: "Rôle invalide." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Vérifie s'il existe déjà un profil avec cet email
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: "Un utilisateur avec cet email existe déjà." }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Envoie l'invitation Supabase Auth
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: "https://www.osmozdev.com/?invite=1",
        data: { role },
      });

    if (inviteError) {
      return new Response(
        JSON.stringify({ error: inviteError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const invitedUserId = inviteData.user?.id;
    if (!invitedUserId) {
      return new Response(
        JSON.stringify({ error: "Invitation créée sans identifiant utilisateur." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Crée ou met à jour le profil
    const { error: upsertError } = await adminClient.from("profiles").upsert(
      {
        id: invitedUserId,
        email,
        role,
        is_active: true,
      },
      { onConflict: "id" }
    );

    if (upsertError) {
      return new Response(
        JSON.stringify({ error: upsertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: `Invitation envoyée à ${email}.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});