// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function App() {
  // Auth / session
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // Page (clients vs dashboard)
  const [page, setPage] = useState("clients"); // clients | dashboard

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
  const [nextDueInputs, setNextDueInputs] = useState({}); // clientId -> YYYY-MM-DD (choisi au moment de la relance)

  // Filtres
  const [currentTab, setCurrentTab] = useState("vendeur"); // vendeur | acquereur | apresvente | tous
  const [statusFilter, setStatusFilter] = useState("arelancer"); // arelancer | encours | tous | clos
  const [commercialFilter, setCommercialFilter] = useState("Tous");

  // UI
  const [viewMode, setViewMode] = useState("detail"); // detail | compact
  const [expandedClientId, setExpandedClientId] = useState(null); // un seul client déplié à la fois

  // ✅ Rôles
  const [userRole, setUserRole] = useState("user"); // user | manager | admin
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // ✅ Manager scope (si role=manager)
  const [managedUserIds, setManagedUserIds] = useState([]);

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
    seller_kind: "Vendeur", // ✅ nouveau
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
    sale_reason: "",
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

  // ✅ Paramètres admin : users + délais
  const [adminMsg, setAdminMsg] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [reassignFrom, setReassignFrom] = useState("");
  const [reassignTo, setReassignTo] = useState("");

  // Délais (localStorage + optionnel Supabase app_settings)
  const DEFAULT_RELANCE_CONFIG = {
    seller: { initial_days: 15, default_next_days: 14 },
    buyer: { initial_days: 15, default_next_days: 14 },
    after: { initial_days: 15, default_next_days: 14 },
  };
  const [relanceConfig, setRelanceConfig] = useState(DEFAULT_RELANCE_CONFIG);

  useEffect(() => {
    document.title = "Keepintouch";
  }, []);

  // ---------- UTIL BASE ----------

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

  const pluralize = (n, singular, plural) => (n > 1 ? plural : singular);

  const addDays = (baseDate, days) => {
    const d = baseDate ? new Date(baseDate) : new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const getRelanceCfgForCategory = (category) => {
    const cat = category === "buyer" ? "buyer" : category === "after" ? "after" : "seller";
    return relanceConfig?.[cat] || DEFAULT_RELANCE_CONFIG[cat];
  };

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

  // ---------- RELANCE CONFIG LOAD/SAVE ----------

  const loadRelanceConfig = async () => {
    // 1) localStorage
    try {
      const raw = localStorage.getItem("kit_relance_config_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setRelanceConfig((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch (e) {
      // ignore
    }

    // 2) supabase app_settings (optionnel)
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .eq("key", "relance_config")
        .maybeSingle();

      if (!error && data?.value) {
        setRelanceConfig((prev) => ({ ...prev, ...data.value }));
        try {
          localStorage.setItem("kit_relance_config_v1", JSON.stringify({ ...DEFAULT_RELANCE_CONFIG, ...data.value }));
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // table absente ou RLS -> on reste en local
    }
  };

  const persistRelanceConfig = async (nextCfg) => {
    setRelanceConfig(nextCfg);
    try {
      localStorage.setItem("kit_relance_config_v1", JSON.stringify(nextCfg));
    } catch (e) {
      // ignore
    }

    // tentative d’upsert dans app_settings (si existe)
    try {
      await supabase
        .from("app_settings")
        .upsert({ key: "relance_config", value: nextCfg }, { onConflict: "key" });
    } catch (e) {
      // ignore
    }
  };

  // ---------- PROFILS / COMMERCIAUX ----------

  const fetchProfiles = async (sess) => {
    if (!sess?.user) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, role, team_id, is_active")
        .order("email", { ascending: true });

      if (error) throw error;

      setProfiles(data || []);

      const map = {};
      (data || []).forEach((p) => {
        map[p.id] = { email: p.email, is_active: p.is_active, role: p.role };
      });
      setProfilesMap(map);

      // commerciaux = profils (tu avais ça)
      setCommercials(data || []);

      const myProfile = (data || []).find((p) => p.id === sess.user.id);
      const role = myProfile?.role || "user";
      setUserRole(role);
      setIsAdmin(role === "admin");
      setIsManager(role === "manager");

      // ✅ si user désactivé : on bloque l’usage
      if (myProfile && myProfile.is_active === false) {
        setLastError("Ton compte est désactivé. Contacte un administrateur.");
        // tentative logout propre
        try {
          await supabase.auth.signOut();
        } catch (e) {}
        setSession(null);
      }
    } catch (err) {
      console.error("Erreur loadProfiles", err);
      setLastError(err.message || "Erreur chargement profils");
    }
  };

  useEffect(() => {
    if (!session?.user) return;
    fetchProfiles(session);
    loadRelanceConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ✅ Charger la liste des users managés si manager
  useEffect(() => {
    const loadManaged = async () => {
      if (!session?.user) return;

      if (userRole !== "manager") {
        setManagedUserIds([]);
        return;
      }

      const { data, error } = await supabase
        .from("manager_assignments")
        .select("user_id")
        .eq("manager_id", session.user.id);

      if (error) {
        console.warn("Erreur load manager_assignments:", error.message);
        setManagedUserIds([]);
        return;
      }

      setManagedUserIds((data || []).map((x) => x.user_id));
    };

    loadManaged();
  }, [session, userRole]);

  const getCommercialEmail = (owner_id) => profilesMap[owner_id]?.email || "";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // ✅ délais paramétrables (fallback)
    const cfg = getRelanceCfgForCategory(client.category);

    if (client.estimation_date && client.category === "seller") {
      const d = new Date(client.estimation_date);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + (Number(cfg.initial_days) || 15));
        return d;
      }
    }
    if (client.acquisition_date && client.category === "buyer") {
      const d = new Date(client.acquisition_date);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + (Number(cfg.initial_days) || 15));
        return d;
      }
    }
    if (client.created_at && client.category === "after") {
      const d = new Date(client.created_at);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + (Number(cfg.initial_days) || 15));
        return d;
      }
    }

    return null;
  };

  const getFollowupInfo = (client) => {
    const next = getNextDueDate(client);
    if (!next) return { label: "", delayLabel: "", diffDays: null, nextDate: null };

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
      nextDate: next,
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

    // Filtre commercial pour admin OU manager
    if ((isAdmin || isManager) && commercialFilter !== "Tous") {
      list = list.filter((c) => getCommercialEmail(c.owner_id) === commercialFilter);
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
    setExpandedClientId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientsRaw, currentTab, statusFilter, commercialFilter, profilesMap, isAdmin, isManager, relanceConfig]);

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
      seller_kind: "Vendeur",
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
      sale_reason: "",
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
      seller_kind: client.seller_kind || "Vendeur",
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
      sale_reason: client.sale_reason || "",
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
    const cfg = getRelanceCfgForCategory(cl.category);
    const initialDays = Number(cfg.initial_days) || 15;

    let base = null;
    if (cl.category === "seller" && cl.estimation_date) base = new Date(cl.estimation_date);
    else if (cl.category === "buyer" &&	query_date(cl.acquisition_date)) base = new Date(cl.acquisition_date);
    else if (cl.category === "after" &&	cl.created_at) base = new Date(cl.created_at);

    if (!base) base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + initialDays);
    return base.toISOString().slice(0, 10);
  };

  // petite protection (certaines dates arrivent vides)
  const query_date = (v) => !!v && /^\d{4}-\d{2}-\d{2}/.test(String(v));

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
    if (newClient.category === "seller" && !newClient.property_address.trim()) {
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
          newClient.category === "buyer" ? newClient.min_surface || null : null,
        also_owner:
          newClient.category === "buyer" ? !!newClient.also_owner : false,
        after_address:
          newClient.category === "after" ? newClient.after_address || null : null,
        client_birthday:
          newClient.category === "after"
            ? newClient.client_birthday || null
            : null,
        context: newClient.category === "after" ? newClient.context || null : null,
      };

      // ✅ seller_kind (vendeur/bailleur) — envoyé seulement si rempli
      if (newClient.category === "seller" && (newClient.seller_kind || "").trim()) {
        payload.seller_kind = newClient.seller_kind.trim();
      }

      // ✅ raison vente — envoyé seulement si rempli
      if (newClient.category === "seller" && (newClient.sale_reason || "").trim()) {
        payload.sale_reason = newClient.sale_reason.trim();
      }

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

  const setNextDueForClient = (clientId, yyyymmdd) => {
    setNextDueInputs((prev) => ({ ...prev, [clientId]: yyyymmdd }));
  };

  const handleValidateRelance = async (client) => {
    const text = (commentInputs[client.id] || "").trim();
    if (!text) {
      alert("Ajoute un commentaire avant de valider la relance.");
      return;
    }

    try {
      setIsLoading(true);

      const { error: insertErr } = await supabase.from("client_comments").insert({
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

      const chosen = nextDueInputs[client.id];
      const cfg = getRelanceCfgForCategory(client.category);
      const defaultNext = Number(cfg.default_next_days) || 14;

      const nextStr =
        chosen && /^\d{4}-\d{2}-\d{2}$/.test(chosen)
          ? chosen
          : addDays(new Date(), defaultNext);

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
      setNextDueInputs((prev) => ({ ...prev, [client.id]: "" }));

      await fetchClientsFromDb();
    } catch (err) {
      console.error("Erreur validate relance", err);
      alert(err.message || "Erreur lors de la validation de la relance.");
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- CLOTURE ----------

  const openClosureModal = (client) => {
    setClosureClient(client);
    setClosureReason("projet_abandonne");
  };

  const reasonsForClient = (client) => {
    const cat = client?.category;
    if (cat === "buyer") {
      return [
        { value: "achete_avec_nous", label: "A acheté avec nous" },
        { value: "achete_autre_agence", label: "A acheté avec une autre agence" },
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
      { value: "vendu_autre_agence", label: "A vendu avec une autre agence" },
      { value: "vendu_seul", label: "A vendu seul" },
      { value: "projet_abandonne", label: "Projet abandonné" },
      { value: "ne_souhaite_plus_vendre", label: "Ne souhaite plus vendre / louer" },
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
      setUserRole("user");
      setIsAdmin(false);
      setIsManager(false);
      setManagedUserIds([]);
      setPage("clients");
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
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setResetDone(true);
      setNewPassword("");
      setIsResetFlow(false);
      if (typeof window !== "undefined") window.location.hash = "";
      alert("Mot de passe mis à jour. Tu peux te reconnecter.");
    } catch (err) {
      console.error("Erreur update password", err);
      setResetErrorMsg(
        err.message || "Erreur lors de la mise à jour du mot de passe."
      );
    }
  };

  // ---------- TITRES / SECTIONS ----------

  const statusSuffix = useMemo(() => {
    if (statusFilter === "arelancer") return "à relancer";
    if (statusFilter === "encours") return "en cours";
    if (statusFilter === "clos") return "clos";
    return "";
  }, [statusFilter]);

  const sellerTitle = "Vendeur / Bailleur & Estimation";
  const buyerTitle = "Acquéreur";
  const afterTitle = "Après-vente";

  const sellers = useMemo(
    () => clients.filter((c) => c.category === "seller"),
    [clients]
  );
  const buyers = useMemo(
    () => clients.filter((c) => c.category === "buyer"),
    [clients]
  );
  const afters = useMemo(
    () => clients.filter((c) => c.category === "after"),
    [clients]
  );

  const makeSectionTitle = (base, count) => {
    const sfx = statusSuffix ? ` ${statusSuffix}` : "";
    return `${base} : ${count} ${pluralize(count, "client", "clients")}${sfx}`;
  };

  const emptyTextForCategory = (catKey) => {
    const base =
      catKey === "seller"
        ? "Aucun client vendeur/bailleur"
        : catKey === "buyer"
        ? "Aucun client acquéreur"
        : "Aucun client après-vente";

    if (statusFilter === "tous") return `${base}.`;
    if (statusFilter === "arelancer") return `${base} à relancer.`;
    if (statusFilter === "encours") return `${base} en cours.`;
    if (statusFilter === "clos") return `${base} clos.`;
    return `${base}.`;
  };

  // ---------- COMPACT / DETAIL ----------

  const getLastRelanceDate = (clientId) => {
    const comments = commentsByClient[clientId] || [];
    if (!comments.length) return null;
    const sorted = [...comments].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    return sorted[0]?.created_at || null;
  };

  const DelayPill = ({ diffDays, delayLabel }) => {
    if (diffDays == null || !delayLabel) return null;
    const style =
      diffDays < 0
        ? {
            padding: "2px 8px",
            borderRadius: 999,
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: "0.75rem",
            whiteSpace: "nowrap",
          }
        : {
            padding: "2px 8px",
            borderRadius: 999,
            background: "#eff6ff",
            color: "#1d4ed8",
            fontSize: "0.75rem",
            whiteSpace: "nowrap",
          };
    return <span style={style}>{delayLabel}</span>;
  };

  const renderCompactRow = (client) => {
  const name =
    (client.first_name || "") +
      (client.first_name && client.last_name ? " " : "") +
      (client.last_name || "") || "(Sans nom)";

  const commercialEmail = getCommercialEmail(client.owner_id);
  const { delayLabel, diffDays } = getFollowupInfo(client);

  const lastRel = getLastRelanceDate(client.id);
  const lastRelLabel = lastRel ? formatDate(lastRel) : "—";

  const next = getNextDueDate(client);
  const nextLabel = next ? formatDate(next) : "—";

  const isExpanded = expandedClientId === client.id;

  const leftLine2 = (() => {
    if (client.category === "seller") {
      const addr = client.property_address ? client.property_address : "—";
      const est = client.estimation_date ? formatDate(client.estimation_date) : "—";
      return `Adresse : ${addr}  •  Estimation : ${est}  •  Dernière relance : ${lastRelLabel}  •  Prochaine : ${nextLabel}`;
    }
    if (client.category === "buyer") {
      const sector = client.area ? client.area : "—";
      const budget = client.budget_max ? `Budget : ${client.budget_max}` : null;
      const surf = client.min_surface ? `Surf min : ${client.min_surface} m²` : null;
      const beds = client.bedrooms ? `Chambres : ${client.bedrooms}` : null;
      const parts = [
        `Secteur : ${sector}`,
        budget,
        surf,
        beds,
        client.acquisition_date ? `Enregistrement : ${formatDate(client.acquisition_date)}` : null,
        `Dernière relance : ${lastRelLabel}`,
        `Prochaine : ${nextLabel}`,
      ].filter(Boolean);
      return parts.join("  •  ");
    }
    const addr = client.after_address ? client.after_address : "—";
    const sale = client.created_at ? formatDate(client.created_at) : "—";
    return `Adresse : ${addr}  •  Vente : ${sale}  •  Dernière relance : ${lastRelLabel}  •  Prochaine : ${nextLabel}`;
  })();

  return (
    <div className={"compact-row" + (isExpanded ? " compact-row-expanded" : "")}>
      <button
        className="compact-row-click"
        onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
        type="button"
        title={isExpanded ? "Replier" : "Déplier"}
      >
        <div className="compact-row-main">
          <div className="compact-row-line1">
            <span className="compact-name">{name}</span>
            {(isAdmin || isManager) && (
              <span className="compact-owner">— {commercialEmail || "—"}</span>
            )}
            {!isAdmin && !isManager && client.email && (
              <span className="compact-owner">— {client.email}</span>
            )}
          </div>

          <div className="compact-row-line2" title={leftLine2}>
            {leftLine2}
          </div>
        </div>

        <div className="compact-row-right">
          <DelayPill diffDays={diffDays} delayLabel={delayLabel} />
          <span className="chev">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="compact-expanded">{renderClientDetailCard(client)}</div>
      )}
    </div>
  );
};


  const renderClientDetailCard = (c) => {
    const name =
      (c.first_name || "") +
        (c.first_name && c.last_name ? " " : "") +
        (c.last_name || "") || "(Sans nom)";
    const commercialEmail = getCommercialEmail(c.owner_id);
    const catLabel = humanCategory(c.category);
    const { label: nextLabel, delayLabel, diffDays } = getFollowupInfo(c);
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
      <div className="client-card detail-card-inside">
        <div className="client-header">
          <div>
            {(isAdmin || isManager) && (
              <div className="client-commercial">
                Commercial : {commercialEmail || "—"}
              </div>
            )}
            <div className="client-name">{name}</div>
            {c.email && <div className="client-line">{c.email}</div>}
            {c.phone && <div className="client-line">{c.phone}</div>}
          </div>

          <div style={{ textAlign: "right" }}>
            {nextLabel && (
              <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#4b5563" }}>
                {nextLabel}
                {delayLabel && <span style={delayStyle}>{delayLabel}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="client-body">
          <div className="field-row">
            <span className="field-key">Catégorie</span>
            <span className="field-value">{catLabel}</span>
          </div>

          {!isBuyer && !isAfter && c.seller_kind && (
            <div className="field-row">
              <span className="field-key">Type</span>
              <span className="field-value">{c.seller_kind}</span>
            </div>
          )}

          {c.contact_origin && (
            <div className="field-row">
              <span className="field-key">Origine</span>
              <span className="field-value">{c.contact_origin}</span>
            </div>
          )}

          {!isBuyer && !isAfter && c.estimation_date && (
            <div className="field-row">
              <span className="field-key">Estimation</span>
              <span className="field-value">{formatDate(c.estimation_date)}</span>
            </div>
          )}

          {isBuyer && c.acquisition_date && (
            <div className="field-row">
              <span className="field-key">Date enregistrement</span>
              <span className="field-value">{formatDate(c.acquisition_date)}</span>
            </div>
          )}

          {isAfter && c.created_at && (
            <div className="field-row">
              <span className="field-key">Date de vente</span>
              <span className="field-value">{formatDate(c.created_at)}</span>
            </div>
          )}

          {!isBuyer && !isAfter && c.property_address && (
            <div className="field-row">
              <span className="field-key">Adresse bien</span>
              <span className="field-value">{c.property_address}</span>
            </div>
          )}

          {isAfter && c.after_address && (
            <div className="field-row">
              <span className="field-key">Adresse</span>
              <span className="field-value">{c.after_address}</span>
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
                {c.min_surface && `— Surface min : ${c.min_surface} m²`}
                {c.bedrooms && ` — Chambres : ${c.bedrooms}`}
                {c.also_owner && " — Aussi propriétaire"}
              </span>
            </div>
          )}

          {c.consultant_feeling && (
            <div className="field-row">
              <span className="field-key">Ressenti</span>
              <span className="field-value">{c.consultant_feeling}</span>
            </div>
          )}

          {!isBuyer && !isAfter && c.sale_reason && (
            <div className="field-row">
              <span className="field-key">Raison vente / mise en location</span>
              <span className="field-value">{c.sale_reason}</span>
            </div>
          )}

          {!isBuyer && !isAfter && c.project_horizon && (
            <div className="field-row">
              <span className="field-key">Horizon projet</span>
              <span className="field-value">{c.project_horizon}</span>
            </div>
          )}

          {isAfter && c.client_birthday && (
            <div className="field-row">
              <span className="field-key">Anniversaire client</span>
              <span className="field-value">{formatDate(c.client_birthday)}</span>
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
                {comments
                  .slice()
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .map((n) => (
                    <li key={n.id}>
                      <strong>{formatDate(n.created_at)} :</strong> {n.body}
                    </li>
                  ))}
              </ul>
            )}

            <textarea
              rows={2}
              placeholder="Ajouter un commentaire (ex : relancé, client en réflexion…)"
              value={commentInputs[c.id] || ""}
              onChange={(e) => handleCommentInputChange(c.id, e.target.value)}
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                padding: "6px 8px",
                fontSize: "0.85rem",
                resize: "vertical",
              }}
            />

            <div className="nextdue-row">
              <div className="nextdue-label">Prochaine relance</div>
              <input
                type="date"
                value={nextDueInputs[c.id] || ""}
                onChange={(e) => setNextDueForClient(c.id, e.target.value)}
                className="nextdue-input"
              />
              <button
                type="button"
                className="btn-outline-small"
                onClick={() => setNextDueForClient(c.id, addDays(new Date(), 7))}
                title="Mettre +7 jours"
              >
                +7 j
              </button>
              <button
                type="button"
                className="btn-outline-small"
                onClick={() => setNextDueForClient(c.id, addDays(new Date(), 14))}
                title="Mettre +14 jours"
              >
                +14 j
              </button>
              <button
                type="button"
                className="btn-outline-small"
                onClick={() => setNextDueForClient(c.id, addDays(new Date(), 21))}
                title="Mettre +21 jours"
              >
                +21 j
              </button>
              <button
                type="button"
                className="btn-outline-small"
                onClick={() => setNextDueForClient(c.id, addDays(new Date(), 30))}
                title="Mettre +30 jours"
              >
                +30 j
              </button>
            </div>
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
  };

  const renderClientsBlock = (list, sectionTitle, catKey) => {
    if (isLoading) return <p>Chargement…</p>;
    if (list.length === 0) return <p>{emptyTextForCategory(catKey)}</p>;

    return (
      <>
        <h2 className="section-title">{sectionTitle}</h2>

        {viewMode === "detail" ? (
          <div className="clients-list">
            {list.map((c) => (
              <div key={c.id}>{renderClientDetailCard(c)}</div>
            ))}
          </div>
        ) : (
          <div className="compact-list">
  {list.map((c) => (
    <div key={c.id}>{renderCompactRow(c)}</div>
  ))}
</div>

        )}
      </>
    );
  };

  // ---------- ADMIN: actions users ----------

  const toggleUserActive = async (userId, nextIsActive) => {
    setAdminMsg("");
    if (!userId) return;
    if (userId === session?.user?.id) {
      setAdminMsg("Impossible de désactiver ton propre compte.");
      return;
    }
    setAdminBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: nextIsActive })
        .eq("id", userId);

      if (error) throw error;

      setAdminMsg(nextIsActive ? "Utilisateur réactivé." : "Utilisateur désactivé.");
      await fetchProfiles(session);
    } catch (err) {
      console.error("toggleUserActive", err);
      setAdminMsg("Erreur : " + (err.message || "update profiles"));
    } finally {
      setAdminBusy(false);
    }
  };

  const reassignClientsToUser = async () => {
    setAdminMsg("");
    if (!reassignFrom || !reassignTo) {
      setAdminMsg("Choisis un utilisateur source et une cible.");
      return;
    }
    if (reassignFrom === reassignTo) {
      setAdminMsg("Source et cible identiques.");
      return;
    }
    setAdminBusy(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ owner_id: reassignTo })
        .eq("owner_id", reassignFrom);

      if (error) throw error;

      setAdminMsg("Clients réaffectés.");
      await fetchClientsFromDb();
    } catch (err) {
      console.error("reassignClientsToUser", err);
      setAdminMsg("Erreur : " + (err.message || "update clients.owner_id"));
    } finally {
      setAdminBusy(false);
    }
  };

  const updateRelanceCfgField = (cat, field, value) => {
    const v = Math.max(0, Number(value || 0));
    const next = {
      ...relanceConfig,
      [cat]: {
        ...relanceConfig[cat],
        [field]: v,
      },
    };
    setRelanceConfig(next);
  };

  const saveRelanceCfg = async () => {
    setAdminMsg("");
    setAdminBusy(true);
    try {
      await persistRelanceConfig(relanceConfig);
      setAdminMsg("Délais enregistrés.");
    } catch (err) {
      console.error("saveRelanceCfg", err);
      setAdminMsg("Erreur : " + (err.message || "save config"));
    } finally {
      setAdminBusy(false);
    }
  };

  // ---------- DASHBOARD ----------

  const today0 = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const dueClientsByCategory = (cat) => {
    const list = clientsRaw
      .filter((c) => c.category === cat)
      .filter((c) => c.status !== "closed")
      .filter((c) => {
        const nd = getNextDueDate(c);
        if (!nd) return false;
        const d = new Date(nd);
        d.setHours(0, 0, 0, 0);
        return d <= today0;
      })
      .sort((a, b) => {
        const aN = getNextDueDate(a);
        const bN = getNextDueDate(b);
        if (aN && bN) return aN - bN;
        if (aN && !bN) return -1;
        if (!aN && bN) return 1;
        return 0;
      });

    return list;
  };

  const top5SellerDue = useMemo(() => dueClientsByCategory("seller").slice(0, 5), [clientsRaw, relanceConfig, today0]);
  const top5BuyerDue = useMemo(() => dueClientsByCategory("buyer").slice(0, 5), [clientsRaw, relanceConfig, today0]);
  const top5AfterDue = useMemo(() => dueClientsByCategory("after").slice(0, 5), [clientsRaw, relanceConfig, today0]);

  const activeCounts = useMemo(() => {
    const active = clientsRaw.filter((c) => c.status !== "closed");
    return {
      total: active.length,
      seller: active.filter((c) => c.category === "seller").length,
      buyer: active.filter((c) => c.category === "buyer").length,
      after: active.filter((c) => c.category === "after").length,
    };
  }, [clientsRaw]);

  const computeCompleteness = (c) => {
    const filled = (v) => v !== null && v !== undefined && String(v).trim() !== "";

    // “champs bien remplis” : je prends une liste courte mais significative
    if (c.category === "seller") {
      const fields = [
        filled(c.last_name),
        filled(c.phone),
        filled(c.property_address),
        filled(c.project_horizon),
        filled(c.consultant_feeling),
        filled(c.seller_kind),
      ];
      return fields.filter(Boolean).length / fields.length;
    }
    if (c.category === "buyer") {
      const fields = [
        filled(c.last_name),
        filled(c.phone),
        filled(c.area),
        filled(c.budget_max),
        filled(c.min_surface),
      ];
      return fields.filter(Boolean).length / fields.length;
    }
    // after
    const fields = [
      filled(c.last_name),
      filled(c.phone),
      filled(c.after_address),
      filled(c.created_at),
      filled(c.client_birthday),
      filled(c.context),
    ];
    return fields.filter(Boolean).length / fields.length;
  };

  const scoreInfo = useMemo(() => {
    const active = clientsRaw.filter((c) => c.status !== "closed");
    const hasSeller = active.some((c) => c.category === "seller");
    const hasBuyer = active.some((c) => c.category === "buyer");
    const hasAfter = active.some((c) => c.category === "after");

    const typeUsage =
      (hasSeller ? 0.5 : 0) +
      (hasBuyer ? 0.25 : 0) +
      (hasAfter ? 0.25 : 0);

    // ponctualité : pénalise si des clients restent >24h “à relancer”
    const dueNow = active.filter((c) => {
      const nd = getNextDueDate(c);
      if (!nd) return false;
      const d = new Date(nd);
      d.setHours(0, 0, 0, 0);
      return d <= today0;
    });

    const stale = dueNow.filter((c) => {
      const nd = getNextDueDate(c);
      if (!nd) return false;
      const d = new Date(nd);
      d.setHours(0, 0, 0, 0);
      const diffDays = Math.round((d.getTime() - today0.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= -2; // <= J-2 => >24h de retard
    });

    const timelinessFactor = dueNow.length === 0 ? 1 : Math.max(0, 1 - stale.length / dueNow.length);

    // complétude
    const completenessAvg =
      active.length === 0
        ? 0
        : active.reduce((acc, c) => acc + computeCompleteness(c), 0) / active.length;

    // score final
    const raw =
      10 *
      typeUsage *
      (0.7 + 0.3 * timelinessFactor) *
      (0.6 + 0.4 * completenessAvg);

    const score = Math.max(0, Math.min(10, raw));
    const reasons = [];

    if (!hasSeller) reasons.push("Ajoute au moins 1 vendeur/bailleur (poids 50%).");
    if (!hasBuyer) reasons.push("Ajoute au moins 1 acquéreur (poids 25%).");
    if (!hasAfter) reasons.push("Ajoute au moins 1 après-vente (poids 25%).");

    if (stale.length > 0) reasons.push(`${stale.length} client(s) restent >24h en “à relancer”.`);

    if (active.length > 0) {
      const pct = Math.round(completenessAvg * 100);
      if (pct < 100) reasons.push(`Champs incomplets (≈ ${pct}% complétés).`);
    } else {
      reasons.push("Aucun client actif : la note ne peut pas monter.");
    }

    const tips = [];
    if (stale.length > 0) tips.push("Objectif : zéro client au-delà de J+1 en “à relancer”.");
    if (active.length > 0 && completenessAvg < 1) tips.push("Complète les champs clés (téléphone, adresse, etc.).");
    if (!hasSeller || !hasBuyer || !hasAfter) tips.push("Utilise les 3 types pour viser 10/10.");

    return { score: score.toFixed(1), reasons, tips };
  }, [clientsRaw, relanceConfig, today0]);

  const DashboardCard = ({ title, list, onGo }) => {
  return (
    <div className="dash-card">
      <div className="dash-card-head">
        <div className="dash-title">{title}</div>
      </div>

      {list.length === 0 ? (
        <div className="dash-empty">Aucun client à relancer.</div>
      ) : (
        <ul className="dash-list">
          {list.map((c) => {
            const name =
              (c.first_name || "") +
                (c.first_name && c.last_name ? " " : "") +
                (c.last_name || "") ||
              "(Sans nom)";
            const info = getFollowupInfo(c);
            return (
              <li key={c.id} className="dash-item">
                <div className="dash-item-name">{name}</div>
                <div className="dash-item-sub">{info.delayLabel || "—"}</div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="dash-card-actions">
        <button
          type="button"
          className="btn-outline-small"
          onClick={onGo}
        >
          Aller à “à relancer”
        </button>
      </div>
    </div>
  );
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

            {resetErrorMsg && <p className="error-text">{resetErrorMsg}</p>}
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
            {isManager && " (Manager)"}
          </span>

          <button
            className="btn-secondary"
            onClick={() => setPage(page === "clients" ? "dashboard" : "clients")}
            type="button"
          >
            {page === "clients" ? "Tableau de bord" : "Clients"}
          </button>

          {isAdmin && (
            <button className="btn-secondary" onClick={() => setShowAdminPanel(true)}>
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
        {page === "dashboard" ? (
          <>
          <h2 className="dash-page-title">Tableau de bord</h2>
            <div className="dash-top">
              <div className="dash-kpis">
                <div className="kpi">
                  <div className="kpi-label">Total clients actifs</div>
                  <div className="kpi-value">{activeCounts.total}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Vendeur/Bailleur</div>
                  <div className="kpi-value">{activeCounts.seller}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Acquéreur</div>
                  <div className="kpi-value">{activeCounts.buyer}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Après-vente</div>
                  <div className="kpi-value">{activeCounts.after}</div>
                </div>
              </div>

              <div className="dash-score">
                <div className="dash-score-title">Note d’utilisation</div>
                <div className="dash-score-value">{scoreInfo.score}/10</div>
                <div className="dash-score-sub">
                  {scoreInfo.reasons.slice(0, 2).join(" ")}
                </div>
                {scoreInfo.tips.length > 0 && (
                  <div className="dash-score-tips">
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Pour l’améliorer :</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {scoreInfo.tips.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="dash-grid">
              <DashboardCard
  title="Vendeur/Bailleur — à relancer (top 5)"
  list={top5SellerDue}
  onGo={() => {
    setPage("clients");
    setCurrentTab("vendeur");
    setStatusFilter("arelancer");
    setCommercialFilter("Tous");
    setViewMode("detail");
  }}
/>
              <DashboardCard
  title="Acquéreur — à relancer (top 5)"
  list={top5BuyerDue}
  onGo={() => {
    setPage("clients");
    setCurrentTab("acquereur");
    setStatusFilter("arelancer");
    setCommercialFilter("Tous");
    setViewMode("detail");
  }}
/>
              <DashboardCard
  title="Après-vente — à relancer (top 5)"
  list={top5AfterDue}
  onGo={() => {
    setPage("clients");
    setCurrentTab("apresvente");
    setStatusFilter("arelancer");
    setCommercialFilter("Tous");
    setViewMode("detail");
  }}
/>
            </div>
          </>
        ) : (
          <>
            {/* Ligne du haut : onglets + statuts */}
            <div className="top-bar">
              <div className="tabs">
                <button
                  className={"tab-button" + (currentTab === "vendeur" ? " tab-button-active" : "")}
                  onClick={() => setCurrentTab("vendeur")}
                >
                  Vendeur/Bailleur
                </button>
                <button
                  className={"tab-button" + (currentTab === "acquereur" ? " tab-button-active" : "")}
                  onClick={() => setCurrentTab("acquereur")}
                >
                  Acquéreur
                </button>
                <button
                  className={"tab-button" + (currentTab === "apresvente" ? " tab-button-active" : "")}
                  onClick={() => setCurrentTab("apresvente")}
                >
                  Après-vente
                </button>
                <button
                  className={"tab-button" + (currentTab === "tous" ? " tab-button-active" : "")}
                  onClick={() => setCurrentTab("tous")}
                >
                  Tous les types
                </button>
              </div>

              <div className="status-tabs">
                <button
                  className={"status-button" + (statusFilter === "arelancer" ? " status-button-active" : "")}
                  onClick={() => setStatusFilter("arelancer")}
                >
                  À relancer
                </button>
                <button
                  className={"status-button" + (statusFilter === "encours" ? " status-button-active" : "")}
                  onClick={() => setStatusFilter("encours")}
                >
                  En cours
                </button>
                <button
                  className={"status-button" + (statusFilter === "tous" ? " status-button-active" : "")}
                  onClick={() => setStatusFilter("tous")}
                >
                  Tous
                </button>
                <button
                  className={"status-button" + (statusFilter === "clos" ? " status-button-active" : "")}
                  onClick={() => setStatusFilter("clos")}
                >
                  Clos
                </button>
              </div>
            </div>

            {/* Filtres seconde ligne */}
            <div className="filters-row">
              {(isAdmin || isManager) && (
                <div className="filter-group">
                  <label htmlFor="commercialFilter">Filtrer par commercial :</label>
                  <select
                    id="commercialFilter"
                    value={commercialFilter}
                    onChange={(e) => setCommercialFilter(e.target.value)}
                  >
                    <option value="Tous">Tous</option>

                    {isAdmin &&
                      commercials.map((c) => (
                        <option key={c.id} value={c.email}>
                          {c.email}
                        </option>
                      ))}

                    {isManager &&
                      commercials
                        .filter((p) => p.id === session.user.id || managedUserIds.includes(p.id))
                        .map((c) => (
                          <option key={c.id} value={c.email}>
                            {c.email}
                          </option>
                        ))}
                  </select>
                </div>
              )}

              <div className="view-toggle">
                <button
                  className={"view-button" + (viewMode === "detail" ? " view-button-active" : "")}
                  onClick={() => setViewMode("detail")}
                  type="button"
                >
                  Détail
                </button>
                <button
                  className={"view-button" + (viewMode === "compact" ? " view-button-active" : "")}
                  onClick={() => setViewMode("compact")}
                  type="button"
                >
                  Compact
                </button>
              </div>

              <button className="btn-primary" onClick={openAddModal}>
                + Ajouter
              </button>
            </div>

            {lastError && <p className="error-text">Erreur : {lastError}</p>}

            {/* Sections + compteurs */}
            {currentTab === "tous" ? (
              <>
                {renderClientsBlock(sellers, makeSectionTitle(sellerTitle, sellers.length), "seller")}
                {renderClientsBlock(buyers, makeSectionTitle(buyerTitle, buyers.length), "buyer")}
                {renderClientsBlock(afters, makeSectionTitle(afterTitle, afters.length), "after")}
              </>
            ) : currentTab === "vendeur" ? (
              renderClientsBlock(sellers, makeSectionTitle(sellerTitle, sellers.length), "seller")
            ) : currentTab === "acquereur" ? (
              renderClientsBlock(buyers, makeSectionTitle(buyerTitle, buyers.length), "buyer")
            ) : (
              renderClientsBlock(afters, makeSectionTitle(afterTitle, afters.length), "after")
            )}

            <footer className="app-footer">
              © Benjamin Rondreux — Keepintouch 2.1 — 2026
            </footer>
          </>
        )}
      </main>

      {/* Modal admin */}
      {showAdminPanel && isAdmin && (
        <div className="admin-modal-backdrop" onClick={() => setShowAdminPanel(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Paramètres administrateur</h2>

            {adminMsg && (
              <p style={{ marginTop: 8, color: adminMsg.startsWith("Erreur") ? "#b91c1c" : "#15803d" }}>
                {adminMsg}
              </p>
            )}

            <h3>Utilisateurs</h3>
            <p style={{ fontSize: "0.85rem", color: "#4b5563", marginTop: 4 }}>
              Désactiver un utilisateur le masque dans l’usage. Réaffecter permet de transférer son portefeuille.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Désactiver / réactiver</div>
                <ul style={{ paddingLeft: 18, margin: 0, fontSize: "0.9rem" }}>
                  {profiles.filter(p => p.is_active !== false).map((p) => (
                    <li key={p.id} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{p.email}</span>{" "}
                      <span style={{ color: "#6b7280" }}>
                        — {p.is_active === false ? "désactivé" : "actif"}
                      </span>
                      {p.id !== session.user.id && (
                        <button
                          type="button"
                          className="btn-outline-small"
                          style={{ marginLeft: 8 }}
                          disabled={adminBusy}
                          onClick={() => toggleUserActive(p.id, p.is_active === false)}
                          title={p.is_active === false ? "Réactiver" : "Désactiver"}
                        >
                          {p.is_active === false ? "Réactiver" : "Désactiver"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Réaffecter des clients</div>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 6 }}>
                  De :
                  <select
                    value={reassignFrom}
                    onChange={(e) => setReassignFrom(e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  >
                    <option value="">—</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 10 }}>
                  Vers :
                  <select
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  >
                    <option value="">—</option>
                    {profiles
                      .filter((p) => p.is_active !== false)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.email}
                        </option>
                      ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="btn-outline"
                  disabled={adminBusy}
                  onClick={reassignClientsToUser}
                >
                  Réaffecter
                </button>
              </div>
            </div>

            <h3 style={{ marginTop: 18 }}>Délais de relance</h3>
            <p style={{ fontSize: "0.85rem", color: "#4b5563", marginTop: 4 }}>
              1ère relance = délai après l’enregistrement (estimation / acquisition / vente).
              Relance par défaut = si tu valides sans saisir de date.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
              {["seller", "buyer", "after"].map((cat) => (
                <div key={cat} className="dash-card" style={{ padding: 12 }}>
                  <div className="dash-title" style={{ marginBottom: 10 }}>
                    {cat === "seller" ? "Vendeur/Bailleur" : cat === "buyer" ? "Acquéreur" : "Après-vente"}
                  </div>

                  <label style={{ fontSize: "0.85rem", display: "block", marginBottom: 8 }}>
                    1ère relance (jours)
                    <input
                      type="number"
                      min="0"
                      value={relanceConfig?.[cat]?.initial_days ?? 15}
                      onChange={(e) => updateRelanceCfgField(cat, "initial_days", e.target.value)}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>

                  <label style={{ fontSize: "0.85rem", display: "block" }}>
                    Relance par défaut (jours)
                    <input
                      type="number"
                      min="0"
                      value={relanceConfig?.[cat]?.default_next_days ?? 14}
                      onChange={(e) => updateRelanceCfgField(cat, "default_next_days", e.target.value)}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
              <button className="btn-outline" onClick={() => setShowAdminPanel(false)}>
                Fermer
              </button>
              <button className="btn-primary" onClick={saveRelanceCfg} disabled={adminBusy}>
                Enregistrer les délais
              </button>
            </div>
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
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingClientId ? "Modifier le client" : "Nouveau client"}</h2>
            <form className="auth-form" onSubmit={handleSaveClient}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  Type de client
                  <select
                    value={newClient.category}
                    onChange={(e) => handleNewClientChange("category", e.target.value)}
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
                    onChange={(e) => handleNewClientChange("contact_origin", e.target.value)}
                  />
                </label>

                <label>
                  Prénom
                  <input
                    type="text"
                    value={newClient.first_name}
                    onChange={(e) => handleNewClientChange("first_name", e.target.value)}
                  />
                </label>

                <label>
                  Nom *
                  <input
                    type="text"
                    value={newClient.last_name}
                    onChange={(e) => handleNewClientChange("last_name", e.target.value)}
                    required
                  />
                </label>

                <label>
                  Email
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={(e) => handleNewClientChange("email", e.target.value)}
                  />
                </label>

                <label>
                  Téléphone *
                  <input
                    type="text"
                    value={newClient.phone}
                    onChange={(e) => handleNewClientChange("phone", e.target.value)}
                    required
                  />
                </label>

                {newClient.category === "seller" && (
                  <label>
                    Vendeur / Bailleur
                    <select
                      value={newClient.seller_kind}
                      onChange={(e) => handleNewClientChange("seller_kind", e.target.value)}
                    >
                      <option>Vendeur</option>
                      <option>Bailleur</option>
                    </select>
                  </label>
                )}

                {newClient.category === "seller" && (
                  <label>
                    Date remise estimation
                    <input
                      type="date"
                      value={newClient.estimation_date}
                      onChange={(e) => handleNewClientChange("estimation_date", e.target.value)}
                    />
                  </label>
                )}

                {newClient.category === "buyer" && (
                  <label>
                    Date enregistrement
                    <input
                      type="date"
                      value={newClient.acquisition_date}
                      onChange={(e) => handleNewClientChange("acquisition_date", e.target.value)}
                    />
                  </label>
                )}

                {newClient.category === "after" && (
                  <label>
                    Date de vente
                    <input
                      type="date"
                      value={newClient.created_at}
                      onChange={(e) => handleNewClientChange("created_at", e.target.value)}
                    />
                  </label>
                )}

                <label>
                  Première relance (facultatif)
                  <input
                    type="date"
                    value={newClient.manual_next_due_date}
                    onChange={(e) => handleNewClientChange("manual_next_due_date", e.target.value)}
                  />
                </label>

                {newClient.category !== "buyer" && (
                  <label style={{ gridColumn: "1 / span 2" }}>
                    {newClient.category === "after" ? "Adresse (après-vente)" : "Adresse du bien *"}
                    <input
                      type="text"
                      value={newClient.category === "after" ? newClient.after_address : newClient.property_address}
                      onChange={(e) => {
                        if (newClient.category === "after") {
                          handleNewClientChange("after_address", e.target.value);
                        } else {
                          handleNewClientChange("property_address", e.target.value);
                        }
                      }}
                    />
                  </label>
                )}

                {newClient.category === "seller" && (
                  <label style={{ gridColumn: "1 / span 2" }}>
                    Raison de la vente / mise en location
                    <input
                      type="text"
                      value={newClient.sale_reason}
                      onChange={(e) => handleNewClientChange("sale_reason", e.target.value)}
                      placeholder="ex : mutation, divorce, succession, investissement…"
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
                        onChange={(e) => handleNewClientChange("area", e.target.value)}
                      />
                    </label>
                    <label>
                      Budget max
                      <input
                        type="text"
                        value={newClient.budget_max}
                        onChange={(e) => handleNewClientChange("budget_max", e.target.value)}
                      />
                    </label>
                    <label>
                      Surface min (m²)
                      <input
                        type="text"
                        value={newClient.min_surface}
                        onChange={(e) => handleNewClientChange("min_surface", e.target.value)}
                      />
                    </label>
                    <label>
                      Chambres
                      <input
                        type="text"
                        value={newClient.bedrooms}
                        onChange={(e) => handleNewClientChange("bedrooms", e.target.value)}
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
                        onChange={(e) => handleNewClientChange("also_owner", e.target.checked)}
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
                        onChange={(e) => handleNewClientChange("client_birthday", e.target.value)}
                      />
                    </label>
                    <label style={{ gridColumn: "1 / span 2" }}>
                      Contexte
                      <textarea
                        rows={2}
                        value={newClient.context}
                        onChange={(e) => handleNewClientChange("context", e.target.value)}
                      />
                    </label>
                  </>
                )}

                {newClient.category !== "after" && (
                  <label style={{ gridColumn: "1 / span 2" }}>
                    Horizon du projet
                    <select
                      value={newClient.project_horizon}
                      onChange={(e) => handleNewClientChange("project_horizon", e.target.value)}
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
                    rows={2}
                    value={newClient.consultant_feeling}
                    onChange={(e) => handleNewClientChange("consultant_feeling", e.target.value)}
                  />
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
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
        <div className="admin-modal-backdrop" onClick={() => setClosureClient(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
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

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn-outline" onClick={() => setClosureClient(null)}>
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

  .view-toggle { display: flex; gap: 8px; align-items: center; }
  .view-button {
    border-radius: 999px;
    padding: 6px 14px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .view-button-active {
    background: #111827;
    color: #ffffff;
    border-color: #111827;
  }

  .section-title {
    margin: 14px 0 10px;
    font-size: 1rem;
    font-weight: 600;
  }
.dash-page-title{
  margin: 0 0 12px;
  font-size: 1.25rem;
  font-weight: 800;
  color: #111827;
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
  .detail-card-inside { margin-top: 10px; }

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

  .compact-list { display: flex; flex-direction: column; gap: 10px; }
  .compact-row {
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    overflow: hidden;
  }
  .compact-row-expanded { border-color: #d1d5db; }
  .compact-row-click {
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }
  .compact-row-main { min-width: 0; flex: 1; }
  .compact-row-line1 {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 4px;
    min-width: 0;
  }
  .compact-name { font-weight: 700; font-size: 1rem; }
  .compact-owner { color: #6b7280; font-size: 0.85rem; white-space: nowrap; }
  .compact-row-line2 {
    color: #374151;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.1px;
  }
  .compact-row-right {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 2px;
    flex-shrink: 0;
  }
  .chev { color: #6b7280; font-size: 0.9rem; }

  .compact-expanded {
    padding: 0 12px 12px;
  }

  .nextdue-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .nextdue-label { font-size: 0.85rem; color: #111827; font-weight: 600; }
  .nextdue-input {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    font-size: 0.9rem;
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
  .auth-card h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .auth-card .badge { margin-bottom: 16px; }
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 10px 0 6px;
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
    padding: 7px 10px;
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
    padding: 16px 20px;
    border-radius: 16px;
    max-width: 920px;
    width: 100%;
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
  }
  .admin-modal h2 { margin-top: 0; margin-bottom: 8px; }
  .admin-modal h3 { margin-top: 16px; margin-bottom: 6px; font-size: 0.95rem; }
  .admin-modal ul { padding-left: 18px; margin-top: 0; font-size: 0.85rem; }

  /* Dashboard */
  .dash-top{
    display:grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  .dash-kpis{
    display:grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .kpi{
    background:#fff;
    border:1px solid #e5e7eb;
    border-radius:16px;
    padding:12px 14px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }
  .kpi-label{ font-size:0.8rem; color:#6b7280; margin-bottom:6px; }
  .kpi-value{ font-size:1.3rem; font-weight:700; color:#111827; }

  .dash-score{
    background:#fff;
    border:1px solid #e5e7eb;
    border-radius:16px;
    padding:12px 14px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }
  .dash-score-title{ font-size:0.85rem; color:#6b7280; margin-bottom:6px; }
  .dash-score-value{ font-size:1.6rem; font-weight:800; }
  .dash-score-sub{ font-size:0.85rem; color:#374151; margin-top:6px; }
  .dash-score-tips{ margin-top:10px; font-size:0.85rem; color:#374151; }

  .dash-grid{
    display:grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .dash-card-head{
  margin-bottom: 8px;
}

.dash-card-actions{
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

  .dash-card{
    background:#fff;
    border:1px solid #e5e7eb;
    border-radius:16px;
    padding:14px 16px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }
  .dash-title{
    font-weight:700;
    margin-bottom:10px;
  }
  .dash-empty{ color:#6b7280; font-size:0.9rem; }
  .dash-list{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
  .dash-item-name{ font-weight:700; font-size:0.95rem; }
  .dash-item-sub{ color:#6b7280; font-size:0.85rem; }

  @media (max-width: 1000px) {
    .dash-top{ grid-template-columns: 1fr; }
    .dash-kpis{ grid-template-columns: repeat(2, 1fr); }
    .dash-grid{ grid-template-columns: 1fr; }
  }

  @media (max-width: 768px) {
    .app-header { flex-direction: column; align-items: flex-start; gap: 8px; }
    .main { padding: 16px; }
    .compact-row-line2 { white-space: normal; }
  }
`;

export default App;
