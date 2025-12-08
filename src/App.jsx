// App.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function App() {
  // Auth / session
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // Flow de reset de mot de passe (via lien Supabase)
  const [isResetFlow, setIsResetFlow] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetErrorMsg, setResetErrorMsg] = useState("");
  const [resetDone, setResetDone] = useState(false);

  // Données
  const [clientsRaw, setClientsRaw] = useState([]);
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState("");

  // Profils / commerciaux
  const [profiles, setProfiles] = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [commercials, setCommercials] = useState([]);

  // Commentaires / relances
  const [commentsByClient, setCommentsByClient] = useState({});
  const [commentInputs, setCommentInputs] = useState({}); // clientId -> texte saisi

  // Filtres
  const [currentTab, setCurrentTab] = useState("vendeur"); // vendeur | acquereur | apresvente | tous
  const [statusFilter, setStatusFilter] = useState("arelancer"); // arelancer | encours | tous | clos
  const [commercialFilter, setCommercialFilter] = useState("Tous");

  // Admin
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Auth form
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin"); // signin | signup
  const [authError, setAuthError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Modal ajout / édition client
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null); // null = création
  const [newClient, setNewClient] = useState({
    category: "seller",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    estimation_date: "",
    created_at: "",
    acquisition_date: "",
    property_address: "",
    project_horizon: "Court terme",
    consultant_feeling: "",
    contact_origin: "",
    project_type: "",
    area: "",
    budget_max: "",
    bedrooms: "",
    min_surface: "",
    also_owner: false,
    after_address: "",
    client_birthday: "",
    context: "",
    manual_next_due_date: "",
  });

  // Modal clôture
  const [closureClient, setClosureClient] = useState(null);
  const [closureReason, setClosureReason] = useState("projet_abandonne");

  useEffect(() => {
    document.title = "Keepintouch";
  }, []);

  // ---------- SESSION ----------

  useEffect(() => {
    const initSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) throw error;
        setSession(session || null);
      } catch (err) {
        console.error("Erreur getSession", err);
        setLastError(err.message || "Erreur récupération session");
      } finally {
        setSessionLoading(false);
      }
    };

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Détection du lien de récupération Supabase (type=recovery dans le hash)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    if (hash.includes("type=recovery")) {
      setIsResetFlow(true);
    }
  }, []);

  // ---------- PROFILS / COMMERCIAUX ----------

  useEffect(() => {
    const loadProfiles = async () => {
      if (!session?.user) return;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email")
          .order("email", { ascending: true });

        if (error) throw error;

        setProfiles(data || []);

        const map = {};
        (data || []).forEach((p) => {
          map[p.id] = { email: p.email };
        });
        setProfilesMap(map);
        setCommercials(data || []);

        setIsAdmin(session.user.email === "benjamin@18avenue.fr");
      } catch (err) {
        console.error("Erreur loadProfiles", err);
        setLastError(err.message || "Erreur chargement profils");
      }
    };

    loadProfiles();
  }, [session]);

  const getCommercialEmail = (owner_id) =>
    profilesMap[owner_id]?.email || "";

  // ---------- CLIENTS & COMMENTAIRES ----------

  const fetchClientsFromDb = async () => {
    if (!session?.user) return;
    setIsLoading(true);
    setLastError("");

    try {
      const { data, error } = await supabase.from("clients").select("*");
      if (error) throw error;
      setClientsRaw(data || []);
    } catch (err) {
      console.error("Erreur fetchClients", err);
      setLastError(err.message || "Erreur chargement clients");
      alert(
        "Erreur lors du chargement des clients : " +
          (err.message || "voir console (F12)")
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCommentsFromDb = async () => {
    if (!session?.user) return;

    try {
      const { data, error } = await supabase
        .from("client_comments")
        .select("id, client_id, body, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Erreur chargement client_comments :", error.message);
        return;
      }

      const map = {};
      (data || []).forEach((c) => {
        if (!map[c.client_id]) map[c.client_id] = [];
        map[c.client_id].push(c);
      });
      setCommentsByClient(map);
    } catch (err) {
      console.error("Erreur fetchCommentsFromDb", err);
    }
  };

  useEffect(() => {
    if (!session?.user) return;
    fetchClientsFromDb().then(() => {
      fetchCommentsFromDb();
    });
  }, [session]);

  // ---------- FILTRES ----------

  const tabToCategory = (tab) => {
    switch (tab) {
      case "vendeur":
        return "seller";
      case "acquereur":
        return "buyer";
      case "apresvente":
        return "after";
      default:
        return null;
    }
  };

  const getNextDueDate = (client) => {
    if (client.next_due_date) {
      const d = new Date(client.next_due_date);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (client.next_followup_at) {
      const d = new Date(client.next_followup_at);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (client.estimation_date) {
      const d = new Date(client.estimation_date);
      if (!Number.isNaN(d.getTime())) {
        d.setDate(d.getDate() + 15);
        return d;
      }
    }
    if (client.acquisition_date) {
      const d = new Date(client.acquisition_date);
      if (!Number.isNaN(d.getTime())) {
        d.setDate(d.getDate() + 15);
        return d;
      }
    }
    return null;
  };

  const getFollowupInfo = (client) => {
    const next = getNextDueDate(client);
    if (!next) return { label: "", delayLabel: "", diffDays: null };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = next.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    let delayLabel = "";
    if (diffDays < 0) {
      delayLabel = `${Math.abs(diffDays)} j de retard`;
    } else if (diffDays > 0) {
      delayLabel = `dans ${diffDays} j`;
    } else {
      delayLabel = "à relancer aujourd’hui";
    }

    return {
      label: `Prochaine relance : ${formatDate(next)}`,
      delayLabel,
      diffDays,
    };
  };

  const applyFilters = () => {
    let list = [...clientsRaw];

    const cat = tabToCategory(currentTab);
    if (cat) {
      list = list.filter((c) => c.category === cat);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Statuts / relances
    if (statusFilter === "clos") {
      list = list.filter((c) => c.status === "closed");
    } else if (statusFilter === "encours") {
      list = list.filter((c) => c.status !== "closed");
    } else if (statusFilter === "arelancer") {
      list = list.filter((c) => c.status !== "closed");
      list = list.filter((c) => {
        const next = getNextDueDate(c);
        if (!next) return false;
        const d = new Date(next);
        d.setHours(0, 0, 0, 0);
        return d <= today;
      });
    } else if (statusFilter === "tous") {
      // rien
    }

    // Filtre commercial seulement pour l’admin
    if (isAdmin && commercialFilter !== "Tous") {
      list = list.filter(
        (c) => getCommercialEmail(c.owner_id) === commercialFilter
      );
    }

    list.sort((a, b) => {
      const aNext = getNextDueDate(a);
      const bNext = getNextDueDate(b);
      if (aNext && bNext) return aNext - bNext;
      if (aNext && !bNext) return -1;
      if (!aNext && bNext) return 1;

      const aIns = a.inserted_at ? new Date(a.inserted_at) : null;
      const bIns = b.inserted_at ? new Date(b.inserted_at) : null;
      if (aIns && bIns) return bIns - aIns;
      return 0;
    });

    setClients(list);
  };

  useEffect(() => {
    applyFilters();
  }, [clientsRaw, currentTab, statusFilter, commercialFilter, profilesMap, isAdmin]);

  // ---------- AJOUT / EDIT CLIENT ----------

  const openAddModal = () => {
    setEditingClientId(null);
    setNewClient({
      category:
        currentTab === "acquereur"
          ? "buyer"
          : currentTab === "apresvente"
          ? "after"
          : "seller",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      estimation_date: "",
      created_at: "",
      acquisition_date: "",
      property_address: "",
      project_horizon: "Court terme",
      consultant_feeling: "",
      contact_origin: "",
      project_type: "",
      area: "",
      budget_max: "",
      bedrooms: "",
      min_surface: "",
      also_owner: false,
      after_address: "",
      client_birthday: "",
      context: "",
      manual_next_due_date: "",
    });
    setShowAddModal(true);
  };

  const openEditModal = (client) => {
    setEditingClientId(client.id);
    setNewClient({
      category: client.category || "seller",
      first_name: client.first_name || "",
      last_name: client.last_name || "",
      email: client.email || "",
      phone: client.phone || "",
      estimation_date: client.estimation_date || "",
      created_at: client.created_at || "",
      acquisition_date: client.acquisition_date || "",
      property_address: client.property_address || "",
      project_horizon: client.project_horizon || "Court terme",
      consultant_feeling: client.consultant_feeling || "",
      contact_origin: client.contact_origin || "",
      project_type: client.project_type || "",
      area: client.area || "",
      budget_max: client.budget_max || "",
      bedrooms: client.bedrooms || "",
      min_surface: client.min_surface || "",
      also_owner: client.also_owner || false,
      after_address: client.after_address || "",
      client_birthday: client.client_birthday || "",
      context: client.context || "",
      manual_next_due_date: client.next_due_date || "",
    });
    setShowAddModal(true);
  };

  const handleNewClientChange = (field, value) => {
    setNewClient((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const computeInitialNextDue = (cl) => {
    let base = null;
    if (cl.category === "seller" && cl.estimation_date) {
      base = new Date(cl.estimation_date);
    } else if (cl.category === "buyer" && cl.acquisition_date) {
      base = new Date(cl.acquisition_date);
    } else if (cl.category === "after" && cl.created_at) {
      base = new Date(cl.created_at);
    }
    if (!base) {
      base = new Date();
    }
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + 15);
    return base.toISOString().slice(0, 10);
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    if (!session?.user?.id) {
      alert("Impossible d’identifier le commercial connecté.");
      return;
    }

    if (!newClient.last_name.trim()) {
      alert("Le nom du client est obligatoire.");
      return;
    }
    if (!newClient.phone.trim()) {
      alert("Le téléphone est obligatoire.");
      return;
    }
    if (
      newClient.category === "seller" &&
      !newClient.property_address.trim()
    ) {
      alert("L’adresse du bien est obligatoire pour un vendeur / bailleur.");
      return;
    }

    try {
      setIsLoading(true);
      setLastError("");

      const chosenNext =
        newClient.manual_next_due_date || computeInitialNextDue(newClient);

      const payload = {
        category: newClient.category || "seller",
        first_name: newClient.first_name || null,
        last_name: newClient.last_name || null,
        email: newClient.email || null,
        phone: newClient.phone || null,
        estimation_date:
          newClient.category === "seller"
            ? newClient.estimation_date || null
            : null,
        created_at:
          newClient.category === "after"
            ? newClient.created_at || null
            : newClient.created_at || null,
        acquisition_date:
          newClient.category === "buyer"
            ? newClient.acquisition_date || null
            : null,
        property_address:
          newClient.category === "seller"
            ? newClient.property_address || null
            : null,
        project_horizon:
          newClient.category === "after"
            ? null
            : newClient.project_horizon || null,
        consultant_feeling: newClient.consultant_feeling || null,
        contact_origin: newClient.contact_origin || null,
        project_type: newClient.project_type || null,
        area: newClient.category === "buyer" ? newClient.area || null : null,
        budget_max:
          newClient.category === "buyer" ? newClient.budget_max || null : null,
        bedrooms:
          newClient.category === "buyer" ? newClient.bedrooms || null : null,
        min_surface:
          newClient.category === "buyer"
            ? newClient.min_surface || null
            : null,
        also_owner:
          newClient.category === "buyer" ? !!newClient.also_owner : false,
        after_address:
          newClient.category === "after" ? newClient.after_address || null : null,
        client_birthday:
          newClient.category === "after"
            ? newClient.client_birthday || null
            : null,
        context:
          newClient.category === "after" ? newClient.context || null : null,
      };

      if (editingClientId) {
        const { error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", editingClientId);

        if (error) throw error;
      } else {
        const insertPayload = {
          ...payload,
          owner_id: session.user.id,
          status: "active",
          next_due_date: chosenNext,
          next_due_source: newClient.manual_next_due_date ? "manual" : "auto",
        };

        const { error } = await supabase.from("clients").insert(insertPayload);
        if (error) throw error;
      }

      setShowAddModal(false);
      setEditingClientId(null);
      await fetchClientsFromDb();
    } catch (err) {
      console.error("Erreur sauvegarde client", err);
      setLastError(err.message || "Erreur création / modification client");
      alert(
        "Erreur lors de la sauvegarde du client : " +
          (err.message || "voir console (F12)")
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- COMMENTAIRES / RELANCES ----------

  const handleCommentInputChange = (clientId, text) => {
    setCommentInputs((prev) => ({ ...prev, [clientId]: text }));
  };

  const handleValidateRelance = async (client) => {
    const text = (commentInputs[client.id] || "").trim();
    if (!text) {
      alert("Ajoute un commentaire avant de valider la relance.");
      return;
    }

    try {
      setIsLoading(true);

      const { error: insertErr } = await supabase
        .from("client_comments")
        .insert({
          client_id: client.id,
          body: text,
          author_id: session.user.id,
        });

      if (insertErr) {
        throw new Error(
          "Erreur enregistrement du commentaire : " + insertErr.message
        );
      }

      await fetchCommentsFromDb();

      const next = new Date();
      next.setHours(0, 0, 0, 0);
      next.setDate(next.getDate() + 14);
      const nextStr = next.toISOString().slice(0, 10);

      const { error: updErr } = await supabase
        .from("clients")
        .update({
          next_due_date: nextStr,
          next_due_note: text,
          next_due_source: "manual",
        })
        .eq("id", client.id);

      if (updErr) {
        throw new Error(
          "Commentaire enregistré mais erreur mise à jour de la relance : " +
            updErr.message
        );
      }

      setCommentInputs((prev) => ({ ...prev, [client.id]: "" }));
      await fetchClientsFromDb();
    } catch (err) {
      console.error("Erreur validate relance", err);
      alert(err.message || "Erreur lors de la validation de la relance.");
    } finally {
      setIsLoading(false);
    }
  };

  const openClosureModal = (client) => {
    setClosureClient(client);
    setClosureReason("projet_abandonne");
  };

  const reasonsForClient = (client) => {
    const cat = client?.category;
    if (cat === "buyer") {
      return [
        { value: "achete_avec_nous", label: "A acheté avec nous" },
        {
          value: "achete_autre_agence",
          label: "A acheté avec une autre agence",
        },
        { value: "achete_seul", label: "A trouvé seul" },
        { value: "n_achete_plus", label: "N’achète plus" },
        { value: "ne_repond_plus", label: "Ne répond plus" },
      ];
    }
    if (cat === "after") {
      return [
        { value: "suivi_termine", label: "Suivi après-vente terminé" },
        { value: "ne_souhaite_plus", label: "Ne souhaite plus de suivi" },
      ];
    }
    return [
      { value: "vendu_avec_nous", label: "A vendu avec nous" },
      {
        value: "vendu_autre_agence",
        label: "A vendu avec une autre agence",
      },
      { value: "vendu_seul", label: "A vendu seul" },
      { value: "projet_abandonne", label: "Projet abandonné" },
      {
        value: "ne_souhaite_plus_vendre",
        label: "Ne souhaite plus vendre / louer",
      },
    ];
  };

  const handleConfirmClosure = async (e) => {
    e.preventDefault();
    if (!closureClient) return;

    const client = closureClient;
    const reason = closureReason;

    try {
      const { error } = await supabase.from("client_comments").insert({
        client_id: client.id,
        body: `Client clôturé : ${reason}`,
        author_id: session.user.id,
      });

      if (error) {
        console.warn("Erreur insertion closure comment :", error.message);
      } else {
        await fetchCommentsFromDb();
      }

      const updatePayload = {
        status: "closed",
        closure_reason: reason,
        next_due_date: null,
        next_due_note: null,
        next_due_source: null,
        next_followup_at: null,
      };

      const { error: updErr } = await supabase
        .from("clients")
        .update(updatePayload)
        .eq("id", client.id);

      if (updErr) {
        console.warn("Erreur update status closed :", updErr.message);
      }

      setClosureClient(null);
      await fetchClientsFromDb();
    } catch (err) {
      console.error("Erreur clôture client", err);
      alert("Erreur lors de la clôture du client (voir console).");
    }
  };

  // ---------- LOGOUT ----------

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setClientsRaw([]);
      setClients([]);
      setIsResetFlow(false);
    } catch (err) {
      console.error("Erreur signOut", err);
    }
  };

  // ---------- AUTH ----------

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");

    try {
      if (!authEmail || !authPassword) {
        setAuthError("Email et mot de passe obligatoires.");
        return;
      }

      if (authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;

        alert(
          "Compte créé. Vérifie tes mails si la confirmation est activée, puis connecte-toi."
        );
        setAuthMode("signin");
      }
    } catch (err) {
      console.error("Erreur auth", err);
      setAuthError(err.message || "Erreur de connexion.");
    }
  };

  const handleResetPasswordRequest = async () => {
    if (!authEmail) {
      setAuthError(
        "Renseigne ton email pour recevoir le lien de réinitialisation."
      );
      return;
    }
    setAuthError("");
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      alert("Si cet email existe, un lien de réinitialisation a été envoyé.");
    } catch (err) {
      console.error("Erreur reset password", err);
      setAuthError(err.message || "Erreur lors de l’envoi du lien.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleNewPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetErrorMsg("");
    setResetDone(false);

    if (!newPassword || newPassword.length < 6) {
      setResetErrorMsg("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      setResetDone(true);
      setNewPassword("");
      setIsResetFlow(false);
      if (typeof window !== "undefined") {
        window.location.hash = "";
      }
      alert("Mot de passe mis à jour. Tu peux te reconnecter.");
    } catch (err) {
      console.error("Erreur update password", err);
      setResetErrorMsg(
        err.message || "Erreur lors de la mise à jour du mot de passe."
      );
    }
  };

  // ---------- UTIL ----------

  const formatDate = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR");
  };

  const humanCategory = (cat) => {
    if (cat === "seller") return "Vendeur / Bailleur & Estimation";
    if (cat === "buyer") return "Acquéreur";
    if (cat === "after") return "Après-vente";
    return "Client";
  };

  const humanStatus = (s) => {
    if (!s) return "";
    if (s === "active") return "Actif";
    if (s === "closed") return "Clos";
    return s;
  };

  // ---------- RENDU ----------

  if (sessionLoading) {
    return (
      <div className="app">
        <style>{baseCss}</style>
        <div className="app-center">Chargement de la session…</div>
      </div>
    );
  }

  // Écran de définition d'un nouveau mot de passe après clic sur le lien
  if (isResetFlow && session) {
    return (
      <div className="app auth-screen">
        <style>{baseCss}</style>
        <div className="auth-card">
          <h1>Keepintouch</h1>
          <span className="badge">Rester en contact</span>

          <h2>Définir un nouveau mot de passe</h2>

          <form onSubmit={handleNewPasswordSubmit} className="auth-form">
            <label>
              Nouveau mot de passe
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>

            {resetErrorMsg && (
              <p className="error-text">{resetErrorMsg}</p>
            )}
            {resetDone && (
              <p style={{ fontSize: "0.85rem", color: "#15803d" }}>
                Mot de passe mis à jour avec succès.
              </p>
            )}

            <button type="submit" className="btn-primary">
              Enregistrer le nouveau mot de passe
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app auth-screen">
        <style>{baseCss}</style>
        <div className="auth-card">
          <h1>Keepintouch</h1>
          <span className="badge">Rester en contact</span>

          <h2>{authMode === "signin" ? "Connexion" : "Création de compte"}</h2>

          <form onSubmit={handleAuthSubmit} className="auth-form">
            <label>
              Email
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
              />
            </label>

            {authError && <p className="error-text">{authError}</p>}

            <button type="submit" className="btn-primary">
              {authMode === "signin" ? "Se connecter" : "Créer le compte"}
            </button>
          </form>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 8,
              fontSize: "0.85rem",
            }}
          >
            <button
              className="link-button"
              onClick={() =>
                setAuthMode(authMode === "signin" ? "signup" : "signin")
              }
            >
              {authMode === "signin"
                ? "Créer un nouveau compte"
                : "J’ai déjà un compte, me connecter"}
            </button>

            <button
              className="link-button"
              type="button"
              onClick={handleResetPasswordRequest}
              disabled={resetLoading}
            >
              {resetLoading ? "Envoi..." : "Mot de passe oublié ?"}
            </button>
          </div>

          <p className="footer-text">© Benjamin Rondreux — Osmoz Dev.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <style>{baseCss}</style>

      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <h1>Keepintouch</h1>
          <span className="badge">Rester en contact</span>
        </div>

        <div className="header-right">
          <span className="user-info">
            Connecté : {session.user.email}
            {isAdmin && " (Admin)"}
          </span>

          {isAdmin && (
            <button
              className="btn-secondary"
              onClick={() => setShowAdminPanel(true)}
            >
              Paramètres
            </button>
          )}

          <button className="btn-outline" onClick={handleLogout}>
            Se déconnecter
          </button>
        </div>
      </header>

      {/* Contenu */}
      <main className="main">
        {/* Ligne du haut : onglets + statuts */}
        <div className="top-bar">
          <div className="tabs">
            <button
              className={
                "tab-button" +
                (currentTab === "vendeur" ? " tab-button-active" : "")
              }
              onClick={() => setCurrentTab("vendeur")}
            >
              Vendeur/Bailleur
            </button>
            <button
              className={
                "tab-button" +
                (currentTab === "acquereur" ? " tab-button-active" : "")
              }
              onClick={() => setCurrentTab("acquereur")}
            >
              Acquéreur
            </button>
            <button
              className={
                "tab-button" +
                (currentTab === "apresvente" ? " tab-button-active" : "")
              }
              onClick={() => setCurrentTab("apresvente")}
            >
              Après-vente
            </button>
            <button
              className={
                "tab-button" +
                (currentTab === "tous" ? " tab-button-active" : "")
              }
              onClick={() => setCurrentTab("tous")}
            >
              Tous les types
            </button>
          </div>

          <div className="status-tabs">
            <button
              className={
                "status-button" +
                (statusFilter === "arelancer" ? " status-button-active" : "")
              }
              onClick={() => setStatusFilter("arelancer")}
            >
              À relancer
            </button>
            <button
              className={
                "status-button" +
                (statusFilter === "encours" ? " status-button-active" : "")
              }
              onClick={() => setStatusFilter("encours")}
            >
              En cours
            </button>
            <button
              className={
                "status-button" +
                (statusFilter === "tous" ? " status-button-active" : "")
              }
              onClick={() => setStatusFilter("tous")}
            >
              Tous
            </button>
            <button
              className={
                "status-button" +
                (statusFilter === "clos" ? " status-button-active" : "")
              }
              onClick={() => setStatusFilter("clos")}
            >
              Clos
            </button>
          </div>
        </div>

        {/* Filtres seconde ligne */}
        <div className="filters-row">
          {isAdmin && (
            <div className="filter-group">
              <label htmlFor="commercialFilter">Filtrer par commercial :</label>
              <select
                id="commercialFilter"
                value={commercialFilter}
                onChange={(e) => setCommercialFilter(e.target.value)}
              >
                <option value="Tous">Tous</option>
                {commercials.map((c) => (
                  <option key={c.id} value={c.email}>
                    {c.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button className="btn-primary" onClick={openAddModal}>
            + Ajouter
          </button>
        </div>

        <h2 className="section-title">
          {currentTab === "vendeur" && "Vendeur / Bailleur & Estimation"}
          {currentTab === "acquereur" && "Acquéreur"}
          {currentTab === "apresvente" && "Après-vente"}
          {currentTab === "tous" && "Tous les types"}
        </h2>

        {lastError && <p className="error-text">Erreur : {lastError}</p>}

        {isLoading ? (
          <p>Chargement…</p>
        ) : clients.length === 0 ? (
          <p>Aucun client pour ces filtres.</p>
        ) : (
          <div className="clients-list">
            {clients.map((c) => {
              const name =
                (c.first_name || "") +
                  (c.first_name && c.last_name ? " " : "") +
                  (c.last_name || "") || "(Sans nom)";
              const commercialEmail = getCommercialEmail(c.owner_id);
              const catLabel = humanCategory(c.category);
              const statutLabel = humanStatus(c.status);
              const { label: nextLabel, delayLabel, diffDays } =
                getFollowupInfo(c);
              const comments = commentsByClient[c.id] || [];

              const isBuyer = c.category === "buyer";
              const isAfter = c.category === "after";

              const delayStyle =
                diffDays == null
                  ? {}
                  : diffDays < 0
                  ? {
                      marginLeft: 6,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#fef2f2",
                      color: "#b91c1c",
                      fontSize: "0.75rem",
                    }
                  : {
                      marginLeft: 6,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontSize: "0.75rem",
                    };

              return (
                <div key={c.id} className="client-card">
                  <div className="client-header">
                    <div>
                      {isAdmin && (
                        <div className="client-commercial">
                          Commercial : {commercialEmail || "—"}
                        </div>
                      )}
                      <div className="client-name">{name}</div>
                      {c.email && (
                        <div className="client-line">{c.email}</div>
                      )}
                      {c.phone && (
                        <div className="client-line">{c.phone}</div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {statutLabel && (
                        <div className="badge-status">{statutLabel}</div>
                      )}
                      {nextLabel && (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: "0.8rem",
                            color: "#4b5563",
                          }}
                        >
                          {nextLabel}
                          {delayLabel && (
                            <span style={delayStyle}>{delayLabel}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="client-body">
                    <div className="field-row">
                      <span className="field-key">Catégorie</span>
                      <span className="field-value">{catLabel}</span>
                    </div>

                    {c.contact_origin && (
                      <div className="field-row">
                        <span className="field-key">Origine</span>
                        <span className="field-value">
                          {c.contact_origin}
                        </span>
                      </div>
                    )}

                    {!isBuyer && !isAfter && c.estimation_date && (
                      <div className="field-row">
                        <span className="field-key">Estimation</span>
                        <span className="field-value">
                          {formatDate(c.estimation_date)}
                        </span>
                      </div>
                    )}

                    {isBuyer && c.acquisition_date && (
                      <div className="field-row">
                        <span className="field-key">Date enregistrement</span>
                        <span className="field-value">
                          {formatDate(c.acquisition_date)}
                        </span>
                      </div>
                    )}

                    {isAfter && c.created_at && (
                      <div className="field-row">
                        <span className="field-key">Date de vente</span>
                        <span className="field-value">
                          {formatDate(c.created_at)}
                        </span>
                      </div>
                    )}

                    {!isBuyer && !isAfter && c.property_address && (
                      <div className="field-row">
                        <span className="field-key">Adresse bien</span>
                        <span className="field-value">
                          {c.property_address}
                        </span>
                      </div>
                    )}

                    {isAfter && c.after_address && (
                      <div className="field-row">
                        <span className="field-key">Adresse</span>
                        <span className="field-value">
                          {c.after_address}
                        </span>
                      </div>
                    )}

                    {isBuyer && c.area && (
                      <div className="field-row">
                        <span className="field-key">Secteur</span>
                        <span className="field-value">{c.area}</span>
                      </div>
                    )}

                    {isBuyer && (c.budget_max || c.min_surface) && (
                      <div className="field-row">
                        <span className="field-key">Projet</span>
                        <span className="field-value">
                          {c.budget_max && `Budget max : ${c.budget_max} `}
                          {c.min_surface &&
                            `— Surface min : ${c.min_surface} m²`}
                          {c.bedrooms &&
                            ` — Chambres : ${c.bedrooms}`}
                          {c.also_owner && " — Aussi propriétaire"}
                        </span>
                      </div>
                    )}

                    {!isBuyer && !isAfter && c.project_horizon && (
                      <div className="field-row">
                        <span className="field-key">Horizon projet</span>
                        <span className="field-value">
                          {c.project_horizon}
                        </span>
                      </div>
                    )}

                    {c.consultant_feeling && (
                      <div className="field-row">
                        <span className="field-key">Ressenti</span>
                        <span className="field-value">
                          {c.consultant_feeling}
                        </span>
                      </div>
                    )}

                    {isAfter && c.client_birthday && (
                      <div className="field-row">
                        <span className="field-key">
                          Anniversaire client
                        </span>
                        <span className="field-value">
                          {formatDate(c.client_birthday)}
                        </span>
                      </div>
                    )}

                    {isAfter && c.context && (
                      <div className="field-row">
                        <span className="field-key">Contexte</span>
                        <span className="field-value">{c.context}</span>
                      </div>
                    )}

                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          marginBottom: comments.length ? 4 : 8,
                          color: "#111827",
                          fontWeight: 600,
                        }}
                      >
                        Historique des relances
                      </div>

                      {comments.length > 0 && (
                        <ul
                          style={{
                            listStyle: "none",
                            paddingLeft: 0,
                            marginTop: 0,
                            marginBottom: 6,
                            fontSize: "0.8rem",
                            color: "#4b5563",
                          }}
                        >
                          {comments.map((n) => (
                            <li key={n.id}>
                              <strong>{formatDate(n.created_at)} :</strong>{" "}
                              {n.body}
                            </li>
                          ))}
                        </ul>
                      )}

                      <textarea
                        rows={2}
                        placeholder="Ajouter un commentaire (ex : relancé, client en réflexion…)"
                        value={commentInputs[c.id] || ""}
                        onChange={(e) =>
                          handleCommentInputChange(c.id, e.target.value)
                        }
                        style={{
                          width: "100%",
                          borderRadius: 10,
                          border: "1px solid #d1d5db",
                          padding: "6px 8px",
                          fontSize: "0.85rem",
                          resize: "vertical",
                        }}
                      />
                    </div>
                  </div>

                  <div className="client-footer">
                    {c.status === "active" && (
                      <>
                        <button
                          className="btn-outline-small"
                          onClick={() => handleValidateRelance(c)}
                        >
                          Valider relance
                        </button>
                        <button
                          className="btn-outline-small"
                          onClick={() => openEditModal(c)}
                        >
                          Modifier
                        </button>
                      </>
                    )}
                    <button
                      className="btn-outline-small"
                      onClick={() => openClosureModal(c)}
                    >
                      Clôturer…
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="app-footer">
          © Benjamin Rondreux — Osmoz Dev.
        </footer>
      </main>

      {/* Modal admin */}
      {showAdminPanel && isAdmin && (
        <div
          className="admin-modal-backdrop"
          onClick={() => setShowAdminPanel(false)}
        >
          <div
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Paramètres administrateur</h2>
            <p>
              (À venir : délais de relance par type de client, gestion des
              commerciaux, travail en équipe / partage de portefeuilles, etc.)
            </p>

            <h3>Commerciaux</h3>
            <ul>
              {profiles.map((p) => (
                <li key={p.id}>{p.email}</li>
              ))}
            </ul>

            <button
              className="btn-outline"
              onClick={() => setShowAdminPanel(false)}
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Modal ajout / édition client */}
      {showAddModal && (
        <div
          className="admin-modal-backdrop"
          onClick={() => {
            setShowAddModal(false);
            setEditingClientId(null);
          }}
        >
          <div
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editingClientId ? "Modifier le client" : "Nouveau client"}</h2>
            <form className="auth-form" onSubmit={handleSaveClient}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <label>
                  Type de client
                  <select
                    value={newClient.category}
                    onChange={(e) =>
                      handleNewClientChange("category", e.target.value)
                    }
                  >
                    <option value="seller">Vendeur / Bailleur</option>
                    <option value="buyer">Acquéreur</option>
                    <option value="after">Après-vente</option>
                  </select>
                </label>

                <label>
                  Origine
                  <input
                    type="text"
                    value={newClient.contact_origin}
                    onChange={(e) =>
                      handleNewClientChange(
                        "contact_origin",
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Prénom
                  <input
                    type="text"
                    value={newClient.first_name}
                    onChange={(e) =>
                      handleNewClientChange("first_name", e.target.value)
                    }
                  />
                </label>

                <label>
                  Nom *
                  <input
                    type="text"
                    value={newClient.last_name}
                    onChange={(e) =>
                      handleNewClientChange("last_name", e.target.value)
                    }
                    required
                  />
                </label>

                <label>
                  Email
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={(e) =>
                      handleNewClientChange("email", e.target.value)
                    }
                  />
                </label>

                <label>
                  Téléphone *
                  <input
                    type="text"
                    value={newClient.phone}
                    onChange={(e) =>
                      handleNewClientChange("phone", e.target.value)
                    }
                    required
                  />
                </label>

                {newClient.category === "seller" && (
                  <label>
                    Date remise estimation
                    <input
                      type="date"
                      value={newClient.estimation_date}
                      onChange={(e) =>
                        handleNewClientChange(
                          "estimation_date",
                          e.target.value
                        )
                      }
                    />
                  </label>
                )}

                {newClient.category === "buyer" && (
                  <label>
                    Date enregistrement
                    <input
                      type="date"
                      value={newClient.acquisition_date}
                      onChange={(e) =>
                        handleNewClientChange(
                          "acquisition_date",
                          e.target.value
                        )
                      }
                    />
                  </label>
                )}

                {newClient.category === "after" && (
                  <label>
                    Date de vente
                    <input
                      type="date"
                      value={newClient.created_at}
                      onChange={(e) =>
                        handleNewClientChange("created_at", e.target.value)
                      }
                    />
                  </label>
                )}

                <label>
                  Première relance (facultatif)
                  <input
                    type="date"
                    value={newClient.manual_next_due_date}
                    onChange={(e) =>
                      handleNewClientChange(
                        "manual_next_due_date",
                        e.target.value
                      )
                    }
                  />
                </label>

                {newClient.category !== "buyer" && (
                  <label style={{ gridColumn: "1 / span 2" }}>
                    {newClient.category === "after"
                      ? "Adresse (après-vente)"
                      : "Adresse du bien *"}
                    <input
                      type="text"
                      value={
                        newClient.category === "after"
                          ? newClient.after_address
                          : newClient.property_address
                      }
                      onChange={(e) => {
                        if (newClient.category === "after") {
                          handleNewClientChange(
                            "after_address",
                            e.target.value
                          );
                        } else {
                          handleNewClientChange(
                            "property_address",
                            e.target.value
                          );
                        }
                      }}
                    />
                  </label>
                )}

                {newClient.category === "buyer" && (
                  <>
                    <label>
                      Secteur recherché
                      <input
                        type="text"
                        value={newClient.area}
                        onChange={(e) =>
                          handleNewClientChange("area", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Budget max
                      <input
                        type="text"
                        value={newClient.budget_max}
                        onChange={(e) =>
                          handleNewClientChange(
                            "budget_max",
                            e.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      Surface min (m²)
                      <input
                        type="text"
                        value={newClient.min_surface}
                        onChange={(e) =>
                          handleNewClientChange(
                            "min_surface",
                            e.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      Chambres
                      <input
                        type="text"
                        value={newClient.bedrooms}
                        onChange={(e) =>
                          handleNewClientChange(
                            "bedrooms",
                            e.target.value
                          )
                        }
                      />
                    </label>
                    <label
                      style={{
                        gridColumn: "1 / span 2",
                        display: "flex",
                        alignItems: "center",
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!newClient.also_owner}
                        onChange={(e) =>
                          handleNewClientChange(
                            "also_owner",
                            e.target.checked
                          )
                        }
                        style={{ marginRight: 6 }}
                      />
                      Acquéreur propriétaire (potentiel vendeur)
                    </label>
                  </>
                )}

                {newClient.category === "after" && (
                  <>
                    <label>
                      Anniversaire client
                      <input
                        type="date"
                        value={newClient.client_birthday}
                        onChange={(e) =>
                          handleNewClientChange(
                            "client_birthday",
                            e.target.value
                          )
                        }
                      />
                    </label>
                    <label style={{ gridColumn: "1 / span 2" }}>
                      Contexte
                      <textarea
                        rows={3}
                        value={newClient.context}
                        onChange={(e) =>
                          handleNewClientChange(
                            "context",
                            e.target.value
                          )
                        }
                      />
                    </label>
                  </>
                )}

                {newClient.category !== "after" && (
                  <label style={{ gridColumn: "1 / span 2" }}>
                    Horizon du projet
                    <select
                      value={newClient.project_horizon}
                      onChange={(e) =>
                        handleNewClientChange(
                          "project_horizon",
                          e.target.value
                        )
                      }
                    >
                      <option>Court terme</option>
                      <option>Moyen terme</option>
                      <option>Long terme</option>
                      <option>Estimation sans projet</option>
                    </select>
                  </label>
                )}

                <label style={{ gridColumn: "1 / span 2" }}>
                  Ressenti / commentaire
                  <textarea
                    rows={3}
                    value={newClient.consultant_feeling}
                    onChange={(e) =>
                      handleNewClientChange(
                        "consultant_feeling",
                        e.target.value
                      )
                    }
                  />
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingClientId(null);
                  }}
                >
                  Annuler
                </button>
                <button type="submit" className="btn-primary">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal clôture */}
      {closureClient && (
        <div
          className="admin-modal-backdrop"
          onClick={() => setClosureClient(null)}
        >
          <div
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Clôturer le client</h2>
            <p>
              {closureClient.first_name} {closureClient.last_name}
            </p>

            <form onSubmit={handleConfirmClosure}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {reasonsForClient(closureClient).map((r) => (
                  <label key={r.value} style={{ fontSize: "0.9rem" }}>
                    <input
                      type="radio"
                      value={r.value}
                      checked={closureReason === r.value}
                      onChange={(e) => setClosureReason(e.target.value)}
                      style={{ marginRight: 6 }}
                    />
                    {r.label}
                  </label>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setClosureClient(null)}
                >
                  Annuler
                </button>
                <button type="submit" className="btn-primary">
                  Confirmer la clôture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const baseCss = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f3f4f6;
    color: #111827;
  }
  .app { min-height: 100vh; background: #f3f4f6; color: #111827; }
  .app-center {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
  }
  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 32px;
    background: #ffffff;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .header-left h1 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
  }
  .header-left .badge {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.75rem;
    background: #eef2ff;
    color: #4338ca;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.9rem;
  }
  .user-info { white-space: nowrap; }
  .btn-primary,
  .btn-secondary,
  .btn-outline,
  .btn-outline-small {
    border-radius: 999px;
    padding: 8px 16px;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .btn-primary { background: #111827; color: #ffffff; }
  .btn-primary:hover { background: #1f2933; }
  .btn-secondary { background: #e5e7eb; color: #111827; }
  .btn-secondary:hover { background: #d1d5db; }
  .btn-outline {
    background: transparent;
    border: 1px solid #d1d5db;
    color: #111827;
  }
  .btn-outline:hover { background: #f3f4f6; }
  .btn-outline-small {
    background: transparent;
    border: 1px solid #d1d5db;
    color: #111827;
    padding: 4px 10px;
    font-size: 0.8rem;
    border-radius: 999px;
    cursor: pointer;
  }
  .btn-outline-small:hover { background: #f3f4f6; }
  .main {
    padding: 24px 32px 40px;
    max-width: 1200px;
    margin: 0 auto;
  }
  .top-bar {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .tabs, .status-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tab-button,
  .status-button {
    border-radius: 999px;
    padding: 6px 14px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .tab-button-active,
  .status-button-active {
    background: #111827;
    color: #ffffff;
    border-color: #111827;
  }
  .filters-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
  }
  select {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    font-size: 0.9rem;
  }
  .section-title {
    margin: 8px 0 16px;
    font-size: 1rem;
    font-weight: 600;
  }
  .clients-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .client-card {
    background: #ffffff;
    border-radius: 16px;
    padding: 14px 18px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }
  .client-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
  }
  .client-name {
    font-weight: 600;
    font-size: 1rem;
    margin-bottom: 2px;
  }
  .client-commercial {
    font-size: 0.85rem;
    color: #4b5563;
  }
  .client-line {
    font-size: 0.85rem;
    color: #374151;
  }
  .badge-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    background: #ecfdf5;
    color: #166534;
    border: 1px solid #bbf7d0;
  }
  .client-body {
    font-size: 0.85rem;
    color: #374151;
    margin-bottom: 8px;
  }
  .field-row {
    display: flex;
    gap: 6px;
    margin-bottom: 2px;
  }
  .field-key {
    font-weight: 500;
    min-width: 120px;
  }
  .field-value {
    flex: 1;
    word-break: break-word;
  }
  .client-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .app-footer {
    margin-top: 24px;
    font-size: 0.8rem;
    color: #6b7280;
    text-align: center;
  }
  .error-text {
    color: #b91c1c;
    font-size: 0.85rem;
    margin-bottom: 8px;
  }
  .auth-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .auth-card {
    background: #ffffff;
    padding: 24px 28px;
    border-radius: 18px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.06);
    max-width: 360px;
    width: 100%;
  }
  .auth-card h1 {
    margin: 0 0 4px;
    font-size: 1.4rem;
  }
  .auth-card .badge { margin-bottom: 16px; }
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 12px 0 8px;
  }
  .auth-form label {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
    gap: 4px;
  }
  .auth-form input,
  .auth-form textarea,
  .auth-form select {
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid #d1d5db;
    font-size: 0.9rem;
    resize: vertical;
  }
  .link-button {
    background: none;
    border: none;
    padding: 0;
    color: #2563eb;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .footer-text {
    margin-top: 12px;
    font-size: 0.8rem;
    color: #6b7280;
    text-align: center;
  }
  .admin-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15,23,42,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .admin-modal {
    background: #ffffff;
    padding: 20px 24px;
    border-radius: 16px;
    max-width: 620px;
    width: 100%;
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
  }
  .admin-modal h2 {
    margin-top: 0;
    margin-bottom: 8px;
  }
  .admin-modal h3 {
    margin-top: 16px;
    margin-bottom: 6px;
    font-size: 0.95rem;
  }
  .admin-modal ul {
    padding-left: 18px;
    margin-top: 0;
    font-size: 0.85rem;
  }
  @media (max-width: 768px) {
    .app-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
    .main { padding: 16px; }
  }
`;

export default App;
