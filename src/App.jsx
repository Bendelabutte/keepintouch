// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { baseCss } from "./styles/baseCss";

import Header from "./components/Header";
import DashboardCard from "./components/DashboardCard";
import CompactRow from "./components/CompactRow";
import ClientDetailCard from "./components/ClientDetailCard";
import AdminModal from "./components/AdminModal";
import ClientModal from "./components/ClientModal";
import ClosureModal from "./components/ClosureModal";
import ProfileModal from "./components/ProfileModal";
import ReleaseNotesModal from "./components/ReleaseNotesModal";

function App() {
  // Auth / session
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // Page
  const [page, setPage] = useState("clients");

  // Flow reset mdp
  const [isResetFlow, setIsResetFlow] = useState(false);
  const [isInviteFlow, setIsInviteFlow] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetErrorMsg, setResetErrorMsg] = useState("");
  const [resetDone, setResetDone] = useState(false);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const [profileForm, setProfileForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirm_password: "",
  });

  const [inviteProfileForm, setInviteProfileForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    password: "",
    confirm_password: "",
  });

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
  const [commentInputs, setCommentInputs] = useState({});
  const [nextDueInputs, setNextDueInputs] = useState({});

  // Filtres
  const [currentTab, setCurrentTab] = useState("vendeur");
  const [statusFilter, setStatusFilter] = useState("arelancer");
  const [commercialFilter, setCommercialFilter] = useState("Tous");
  const [dashboardCommercialFilter, setDashboardCommercialFilter] = useState("Tous");
  const [sellerStageFilter, setSellerStageFilter] = useState("premandat");
  const [searchTerm, setSearchTerm] = useState("");

  // UI
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem("kit_view_mode") || "compact";
    } catch (e) {
      return "compact";
    }
  });
  const [expandedClientId, setExpandedClientId] = useState(null);
const RELEASE_NOTES_VERSION = "v3";
const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  // Rôles
  const [userRole, setUserRole] = useState("user");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Manager scope
  const [managedUserIds, setManagedUserIds] = useState([]);

  // Auth form
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Modal ajout / édition client
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [newClient, setNewClient] = useState({
    category: "seller",
    seller_kind: "Vendeur",
    deal_stage: "pre_mandat",
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
  const [afterSaleForm, setAfterSaleForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    sale_date: "",
    commission_ttc: "",
    commission_vat_rate: "20",
    client_birthday: "",
    contact_origin: "",
    consultant_feeling: "",
    context: "",
  });

  // Admin
  const [adminMsg, setAdminMsg] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [reassignFrom, setReassignFrom] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");

  // Délais
  const DEFAULT_RELANCE_CONFIG = {
    seller: { initial_days: 15, default_next_days: 21 },
    buyer: { initial_days: 14, default_next_days: 21 },
    after: { initial_days: 45, default_next_days: 90 },
  };
  const [relanceConfig, setRelanceConfig] = useState(DEFAULT_RELANCE_CONFIG);

  const DEFAULT_EMAIL_NOTIFICATION_CONFIG = {
    tomorrow_enabled: true,
    late_enabled: true,
    late_days: 3,
    global_enabled: true,
    global_threshold: 3,
    global_frequency_days: 1,
  };

  const [emailNotificationConfig, setEmailNotificationConfig] = useState(
    DEFAULT_EMAIL_NOTIFICATION_CONFIG
  );

  useEffect(() => {
    document.title = "Keepintouch";
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("kit_view_mode", viewMode);
    } catch (e) {}
  }, [viewMode]);

useEffect(() => {
  if (!session?.user?.id) return;

  try {
    const key = `kit_release_notes_seen_${RELEASE_NOTES_VERSION}`;
    const alreadySeen = localStorage.getItem(key) === "true";
    setShowReleaseNotes(!alreadySeen);
  } catch (e) {
    setShowReleaseNotes(true);
  }
}, [session]);

  // ---------- UTIL BASE ----------

  const formatDate = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR");
  };

  const formatCurrency = (value) => {
    const n = Number(value || 0);
    return n.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

  const parseDecimalInput = (value) => {
    if (value === null || value === undefined) return null;
    const normalized = String(value).replace(/\s/g, "").replace(",", ".").trim();
    if (!normalized) return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
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

  const getSellerStageLabel = (c) => {
    const v = (c?.deal_stage || "").toLowerCase();
    if (v === "mandat") return "Sous mandat";
    return "Pré-mandat";
  };

  const normalizeText = (v) =>
    String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash || "";
    const search = window.location.search || "";

    if (hash.includes("type=recovery")) {
      setIsResetFlow(true);
    }

    if (search.includes("invite=1")) {
      setIsInviteFlow(true);
    }
  }, []);

  // ---------- RELANCE CONFIG LOAD/SAVE ----------

  const loadRelanceConfig = async () => {
    try {
      const raw = localStorage.getItem("kit_relance_config_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setRelanceConfig((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch (e) {}

    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select(
          "email_tomorrow_enabled, email_late_enabled, email_late_days, email_global_enabled, email_global_threshold, email_global_frequency_days"
        )
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setEmailNotificationConfig({
          tomorrow_enabled: data.email_tomorrow_enabled ?? true,
          late_enabled: data.email_late_enabled ?? true,
          late_days: Number(data.email_late_days ?? 3),
          global_enabled: data.email_global_enabled ?? true,
          global_threshold: Number(data.email_global_threshold ?? 3),
          global_frequency_days: Number(data.email_global_frequency_days ?? 1),
        });
      }
    } catch (e) {}

    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const mapped = {
          seller: {
            initial_days: Number(data.seller_first_days || 15),
            default_next_days: Number(data.seller_repeat_days || 21),
          },
          buyer: {
            initial_days: Number(data.buyer_first_days || 14),
            default_next_days: Number(data.buyer_repeat_days || 21),
          },
          after: {
            initial_days: Number(data.after_first_days || 45),
            default_next_days: Number(data.after_repeat1_days || 90),
          },
        };

        setRelanceConfig(mapped);

        try {
          localStorage.setItem("kit_relance_config_v1", JSON.stringify(mapped));
        } catch (e) {}
      }
    } catch (e) {}
  };

  const persistRelanceConfig = async (nextCfg) => {
  setRelanceConfig(nextCfg);

  try {
    localStorage.setItem("kit_relance_config_v1", JSON.stringify(nextCfg));
  } catch (e) {}

  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return;

    const payload = {
      seller_first_days: Number(nextCfg.seller.initial_days || 15),
      seller_repeat_days: Number(nextCfg.seller.default_next_days || 21),
      buyer_first_days: Number(nextCfg.buyer.initial_days || 14),
      buyer_repeat_days: Number(nextCfg.buyer.default_next_days || 21),
      after_first_days: Number(nextCfg.after.initial_days || 45),
      after_repeat1_days: Number(nextCfg.after.default_next_days || 90),
    };

    const { error: updateError } = await supabase
      .from("app_settings")
      .update(payload)
      .eq("id", data.id);

    if (updateError) throw updateError;
  } catch (e) {
    console.error("persistRelanceConfig", e);
  }
};

  // ---------- PROFILS / COMMERCIAUX ----------

  const fetchProfiles = async (sess) => {
    if (!sess?.user) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, role, team_id, is_active, first_name, last_name, phone")
        .order("email", { ascending: true });

      if (error) throw error;

      setProfiles(data || []);

      const map = {};
      (data || []).forEach((p) => {
        map[p.id] = {
          email: p.email,
          is_active: p.is_active,
          role: p.role,
          first_name: p.first_name || "",
          last_name: p.last_name || "",
          phone: p.phone || "",
        };
      });
      setProfilesMap(map);

      setCommercials(data || []);

      const myProfile = (data || []).find((p) => p.id === sess.user.id);
      if (myProfile) {
        setProfileForm({
          first_name: myProfile.first_name || "",
          last_name: myProfile.last_name || "",
          phone: myProfile.phone || "",
        });
      }

      const role = myProfile?.role || "user";
      setUserRole(role);
      setIsAdmin(role === "admin");
      setIsManager(role === "manager");

      if (myProfile && myProfile.is_active === false) {
        setLastError("Ton compte est désactivé. Contacte un administrateur.");
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

  const getCommercialLabel = (owner_id) => {
    const p = profilesMap[owner_id];
    if (!p) return "";
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return fullName || p.email || "";
  };

  const getProfileLabel = (profile) => {
    if (!profile) return "";
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    return fullName || profile.email || "";
  };

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
      alert("Erreur lors du chargement des clients : " + (err.message || "voir console (F12)"));
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

  const query_date = (v) => !!v && /^\d{4}-\d{2}-\d{2}/.test(String(v));

  const getNextDueDate = (client) => {
    if (client.next_due_date) {
      const d = new Date(client.next_due_date);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (client.next_followup_at) {
      const d = new Date(client.next_followup_at);
      if (!Number.isNaN(d.getTime())) return d;
    }

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
    if (diffDays < 0) delayLabel = `${Math.abs(diffDays)} j de retard`;
    else if (diffDays > 0) delayLabel = `dans ${diffDays} j`;
    else delayLabel = "à relancer aujourd’hui";

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
    if (cat) list = list.filter((c) => c.category === cat);

    if (cat === "seller") {
      if (sellerStageFilter === "mandat") {
        list = list.filter((c) => (c.deal_stage || "pre_mandat") === "mandat");
      } else if (sellerStageFilter === "premandat") {
        list = list.filter((c) => (c.deal_stage || "pre_mandat") !== "mandat");
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
    }

    if ((isAdmin || isManager) && commercialFilter !== "Tous") {
      list = list.filter((c) => getCommercialEmail(c.owner_id) === commercialFilter);
    }

    const q = normalizeText(searchTerm);
    if (q) {
      list = list.filter((c) => {
        const haystack = normalizeText(
          [
            c.first_name,
            c.last_name,
            c.property_address,
            c.after_address,
            c.email,
            c.phone,
          ]
            .filter(Boolean)
            .join(" ")
        );
        return haystack.includes(q);
      });
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
  }, [
    clientsRaw,
    currentTab,
    statusFilter,
    commercialFilter,
    profilesMap,
    isAdmin,
    isManager,
    relanceConfig,
    sellerStageFilter,
    searchTerm,
  ]);

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
      deal_stage: "pre_mandat",
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
      deal_stage: client.deal_stage || "pre_mandat",
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

  const handleAfterSaleFormChange = (field, value) => {
    setAfterSaleForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const computeInitialNextDue = (cl) => {
    const cfg = getRelanceCfgForCategory(cl.category);
    const initialDays = Number(cfg.initial_days) || 15;

    let base = null;
    if (cl.category === "seller" && cl.estimation_date) base = new Date(cl.estimation_date);
    else if (cl.category === "buyer" && query_date(cl.acquisition_date))
      base = new Date(cl.acquisition_date);
    else if (cl.category === "after" && cl.created_at) base = new Date(cl.created_at);

    if (!base) base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + initialDays);
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
    if (newClient.category === "seller" && !newClient.property_address.trim()) {
      alert("L’adresse du bien est obligatoire pour un vendeur / bailleur.");
      return;
    }

    try {
      setIsLoading(true);
      setLastError("");

      const chosenNext = newClient.manual_next_due_date || computeInitialNextDue(newClient);

      const payload = {
        category: newClient.category || "seller",
        first_name: newClient.first_name || null,
        last_name: newClient.last_name || null,
        email: newClient.email || null,
        phone: newClient.phone || null,
        estimation_date: newClient.category === "seller" ? newClient.estimation_date || null : null,
        created_at:
          newClient.category === "after"
            ? newClient.created_at || null
            : newClient.created_at || null,
        acquisition_date: newClient.category === "buyer" ? newClient.acquisition_date || null : null,
        property_address: newClient.category === "seller" ? newClient.property_address || null : null,
        project_horizon: newClient.category === "after" ? null : newClient.project_horizon || null,
        consultant_feeling: newClient.consultant_feeling || null,
        contact_origin: newClient.contact_origin || null,
        project_type: newClient.project_type || null,
        area: newClient.category === "buyer" ? newClient.area || null : null,
        budget_max: newClient.category === "buyer" ? newClient.budget_max || null : null,
        bedrooms: newClient.category === "buyer" ? newClient.bedrooms || null : null,
        min_surface: newClient.category === "buyer" ? newClient.min_surface || null : null,
        also_owner: newClient.category === "buyer" ? !!newClient.also_owner : false,
        after_address: newClient.category === "after" ? newClient.after_address || null : null,
        client_birthday: newClient.category === "after" ? newClient.client_birthday || null : null,
        context: newClient.category === "after" ? newClient.context || null : null,
      };

      if (newClient.category === "seller" && (newClient.seller_kind || "").trim()) {
        payload.seller_kind = newClient.seller_kind.trim();
      }

      if (newClient.category === "seller" && (newClient.sale_reason || "").trim()) {
        payload.sale_reason = newClient.sale_reason.trim();
      }

      if (newClient.category === "seller") {
        payload.deal_stage = (newClient.deal_stage || "pre_mandat").trim();
      }

      if (editingClientId) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editingClientId);
        if (error) throw error;
      } else {
        const insertPayload = {
          ...payload,
          owner_id: session.user.id,
          status: "active",
          next_due_date: chosenNext,
          next_due_source: newClient.manual_next_due_date ? "manual" : "auto",
          mandat_at:
            newClient.category === "seller" && newClient.deal_stage === "mandat"
              ? new Date().toISOString()
              : null,
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
      alert("Erreur lors de la sauvegarde du client : " + (err.message || "voir console (F12)"));
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- INVITATION UTILISATEUR ----------

  const handleInviteUser = async () => {
    setAdminMsg("");

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setAdminMsg("Erreur : renseigne une adresse email.");
      return;
    }

    setAdminBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email,
          role: inviteRole,
        },
      });

      if (error) {
        throw new Error(error.message || "Erreur appel fonction.");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setAdminMsg(data?.message || "Invitation envoyée.");
      setInviteEmail("");
      setInviteRole("user");
      await fetchProfiles(session);
    } catch (err) {
      console.error("handleInviteUser", err);
      setAdminMsg("Erreur : " + (err.message || "échec de l’invitation"));
    } finally {
      setAdminBusy(false);
    }
  };

  // ---------- DEAL STAGE ----------

  const handleSetDealStage = async (client, stage) => {
    try {
      setIsLoading(true);

      const updatePayload = { deal_stage: stage };
      if (stage === "mandat" && !client.mandat_at) {
        updatePayload.mandat_at = new Date().toISOString();
      }

      const { error } = await supabase.from("clients").update(updatePayload).eq("id", client.id);
      if (error) throw error;

      await supabase.from("client_comments").insert({
        client_id: client.id,
        body: `Phase mise à jour : ${stage === "mandat" ? "Sous mandat" : "Pré-mandat"}`,
        author_id: session.user.id,
      });

      await fetchCommentsFromDb();
      await fetchClientsFromDb();
    } catch (err) {
      console.error("Erreur update deal_stage", err);
      alert(err.message || "Erreur lors du passage en mandat.");
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
        throw new Error("Erreur enregistrement du commentaire : " + insertErr.message);
      }

      await fetchCommentsFromDb();

      const chosen = nextDueInputs[client.id];
      const cfg = getRelanceCfgForCategory(client.category);
      const defaultNext = Number(cfg.default_next_days) || 14;

      const nextStr =
        chosen && /^\d{4}-\d{2}-\d{2}$/.test(chosen) ? chosen : addDays(new Date(), defaultNext);

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
          "Commentaire enregistré mais erreur mise à jour de la relance : " + updErr.message
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
    const todayStr = new Date().toISOString().slice(0, 10);

    setClosureClient(client);
    setClosureReason("projet_abandonne");
    setAfterSaleForm({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      sale_date: todayStr,
      commission_ttc: "",
      commission_vat_rate: "20",
      client_birthday: "",
      contact_origin: "",
      consultant_feeling: "",
      context: "",
    });
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
      { value: "vendu_avec_nous", label: "Vendu par moi" },
      { value: "vendu_autre_agence", label: "Vendu par une autre agence" },
      { value: "vendu_seul", label: "Vendu par le vendeur en direct" },
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
      setIsLoading(true);

      if (client.category === "seller" && reason === "vendu_avec_nous") {
        if (!afterSaleForm.last_name.trim()) {
          alert("Le nom de l’acquéreur est obligatoire.");
          return;
        }

        if (!afterSaleForm.phone.trim()) {
          alert("Le téléphone de l’acquéreur est obligatoire.");
          return;
        }

        if (!afterSaleForm.sale_date) {
          alert("La date encaissement / vente finale est obligatoire.");
          return;
        }

        const commissionTtc = parseDecimalInput(afterSaleForm.commission_ttc);
        if (commissionTtc === null || commissionTtc <= 0) {
          alert("La commission TTC doit être renseignée et supérieure à 0.");
          return;
        }

        const vatRate = parseDecimalInput(afterSaleForm.commission_vat_rate);
        if (vatRate === null || vatRate < 0) {
          alert("Le taux de TVA doit être valide.");
          return;
        }

        const saleDate = afterSaleForm.sale_date;
        const nextAfterDue = addDays(new Date(saleDate), 90);

        const updatePayload = {
          category: "after",
          status: "active",
          first_name: afterSaleForm.first_name || null,
          last_name: afterSaleForm.last_name || null,
          email: afterSaleForm.email || null,
          phone: afterSaleForm.phone || null,
          created_at: saleDate,
          after_address: client.property_address || client.after_address || null,
          client_birthday: afterSaleForm.client_birthday || null,
          contact_origin: afterSaleForm.contact_origin || null,
          consultant_feeling: afterSaleForm.consultant_feeling || null,
          context: afterSaleForm.context || null,
          next_due_date: nextAfterDue,
          next_due_note: null,
          next_due_source: "auto",
          next_followup_at: null,
          closure_reason: null,
          closed_at: null,
          closed_by: null,
          deal_stage: null,
          sale_result: "vendu_avec_nous",
          sale_completed_at: saleDate,
          converted_to_after_sale_at: new Date().toISOString(),
          sold_at: saleDate,
          commission_received_at: saleDate,
          commission_ttc: commissionTtc,
          commission_vat_rate: vatRate,
          estimation_date: null,
          acquisition_date: null,
          property_address: null,
          project_horizon: null,
          sale_reason: null,
          seller_kind: null,
          project_type: null,
          area: null,
          budget_max: null,
          bedrooms: null,
          min_surface: null,
          also_owner: false,
        };

        const { error: updErr } = await supabase
          .from("clients")
          .update(updatePayload)
          .eq("id", client.id);

        if (updErr) throw updErr;

        const { error: commentErr } = await supabase.from("client_comments").insert({
          client_id: client.id,
          body:
            `Vente conclue par le commercial le ${formatDate(saleDate)}. ` +
            `Commission TTC : ${formatCurrency(commissionTtc)}. ` +
            `Client basculé automatiquement en après-vente.`,
          author_id: session.user.id,
        });

        if (commentErr) {
          console.warn("Erreur insertion commentaire bascule après-vente :", commentErr.message);
        }

        setClosureClient(null);
        await fetchCommentsFromDb();
        await fetchClientsFromDb();
        return;
      }

      const commentBody = `Client clôturé : ${reason}`;

      const { error: commentErr } = await supabase.from("client_comments").insert({
        client_id: client.id,
        body: commentBody,
        author_id: session.user.id,
      });

      if (commentErr) {
        console.warn("Erreur insertion closure comment :", commentErr.message);
      } else {
        await fetchCommentsFromDb();
      }

      const nowIso = new Date().toISOString();
      const updatePayload = {
        status: "closed",
        closure_reason: reason,
        next_due_date: null,
        next_due_note: null,
        next_due_source: null,
        next_followup_at: null,
        closed_at: nowIso,
        closed_by: session.user.id,
      };

      if (client.category === "seller") {
        updatePayload.sale_result = reason;

        if (reason === "vendu_autre_agence" || reason === "vendu_seul") {
          updatePayload.sale_completed_at = nowIso.slice(0, 10);
        }
      }

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
    } finally {
      setIsLoading(false);
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

      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
    } catch (err) {
      console.error("Erreur auth", err);
      setAuthError(err.message || "Erreur de connexion.");
    }
  };

  const handleResetPasswordRequest = async () => {
    if (!authEmail) {
      setAuthError("Renseigne ton email pour recevoir le lien de réinitialisation.");
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
      setResetErrorMsg(err.message || "Erreur lors de la mise à jour du mot de passe.");
    }
  };

  const handleInvitePasswordSubmit = async (e) => {
    e.preventDefault();
    setResetErrorMsg("");
    setResetDone(false);

    const firstName = inviteProfileForm.first_name.trim();
    const lastName = inviteProfileForm.last_name.trim();
    const phone = inviteProfileForm.phone.trim();
    const password = inviteProfileForm.password;
    const confirmPassword = inviteProfileForm.confirm_password;

    if (!firstName) {
      setResetErrorMsg("Le prénom est obligatoire.");
      return;
    }

    if (!lastName) {
      setResetErrorMsg("Le nom est obligatoire.");
      return;
    }

    if (!phone) {
      setResetErrorMsg("Le téléphone est obligatoire.");
      return;
    }

    if (!password || password.length < 6) {
      setResetErrorMsg("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }

    if (password !== confirmPassword) {
      setResetErrorMsg("Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      setIsLoading(true);

      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone,
        })
        .eq("id", session.user.id);

      if (profileError) throw profileError;

      setResetDone(true);
      setInviteProfileForm({
        first_name: "",
        last_name: "",
        phone: "",
        password: "",
        confirm_password: "",
      });
      setIsInviteFlow(false);

      if (typeof window !== "undefined") {
        window.history.replaceState({}, document.title, "/");
      }

      await fetchProfiles(session);

      alert("Compte finalisé. Vous pouvez maintenant utiliser Keepintouch.");
    } catch (err) {
      console.error("Erreur finalisation invitation", err);
      setResetErrorMsg(err.message || "Erreur lors de la finalisation du compte.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteProfileFormChange = (field, value) => {
    setInviteProfileForm((prev) => ({
      ...prev,
      [field]: value,
    }));
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

  const sellers = useMemo(() => clients.filter((c) => c.category === "seller"), [clients]);
  const buyers = useMemo(() => clients.filter((c) => c.category === "buyer"), [clients]);
  const afters = useMemo(() => clients.filter((c) => c.category === "after"), [clients]);

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
    const sorted = [...comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return sorted[0]?.created_at || null;
  };

  const isMobileView =
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;

  const renderClientDetailCard = (c) => (
    <ClientDetailCard
      c={c}
      isAdmin={isAdmin}
      isManager={isManager}
      getCommercialEmail={getCommercialEmail}
      humanCategory={humanCategory}
      getFollowupInfo={getFollowupInfo}
      commentsByClient={commentsByClient}
      formatDate={formatDate}
      commentInputs={commentInputs}
      handleCommentInputChange={handleCommentInputChange}
      nextDueInputs={nextDueInputs}
      setNextDueForClient={setNextDueForClient}
      addDays={addDays}
      handleValidateRelance={handleValidateRelance}
      openEditModal={openEditModal}
      openClosureModal={openClosureModal}
      getSellerStageLabel={getSellerStageLabel}
      handleSetDealStage={handleSetDealStage}
    />
  );

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
              <div key={c.id}>
                <CompactRow
                  client={c}
                  isAdmin={isAdmin}
                  isManager={isManager}
                  expandedClientId={expandedClientId}
                  setExpandedClientId={setExpandedClientId}
                  getCommercialEmail={getCommercialEmail}
                  getFollowupInfo={getFollowupInfo}
                  getNextDueDate={getNextDueDate}
                  formatDate={formatDate}
                  getLastRelanceDate={getLastRelanceDate}
                  renderClientDetailCard={renderClientDetailCard}
                  getSellerStageLabel={getSellerStageLabel}
                />
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  // ---------- ADMIN ----------

  const toggleUserActive = async (userId, nextIsActive) => {
    setAdminMsg("");
    if (!userId) return;
    if (userId === session?.user?.id) {
      setAdminMsg("Impossible de désactiver ton propre compte.");
      return;
    }
    setAdminBusy(true);
    try {
      const { error } = await supabase.from("profiles").update({ is_active: nextIsActive }).eq("id", userId);
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
      const { error } = await supabase.from("clients").update({ owner_id: reassignTo }).eq("owner_id", reassignFrom);
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

  const updateEmailNotificationField = (field, value) => {
    const numericFields = ["late_days", "global_threshold", "global_frequency_days"];

    setEmailNotificationConfig((prev) => ({
      ...prev,
      [field]: numericFields.includes(field) ? Math.max(1, Number(value || 1)) : value,
    }));
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

  const saveAdminSettings = async () => {
  setAdminMsg("");
  setAdminBusy(true);

  try {
    const { data, error: fetchError } = await supabase
      .from("app_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!data) throw new Error("Aucune ligne app_settings trouvée.");

    const relancePayload = {
      seller_first_days: Number(relanceConfig?.seller?.initial_days ?? 15),
      seller_repeat_days: Number(relanceConfig?.seller?.default_next_days ?? 14),
      buyer_first_days: Number(relanceConfig?.buyer?.initial_days ?? 15),
      buyer_repeat_days: Number(relanceConfig?.buyer?.default_next_days ?? 14),
      after_first_days: Number(relanceConfig?.after?.initial_days ?? 15),
      after_repeat1_days: Number(relanceConfig?.after?.default_next_days ?? 14),
      updated_at: new Date().toISOString(),
    };

    const emailPayload = {
      email_tomorrow_enabled: !!emailNotificationConfig.tomorrow_enabled,
      email_late_enabled: !!emailNotificationConfig.late_enabled,
      email_late_days: Math.max(1, Number(emailNotificationConfig.late_days || 3)),
      email_global_enabled: !!emailNotificationConfig.global_enabled,
      email_global_threshold: Math.max(1, Number(emailNotificationConfig.global_threshold || 3)),
      email_global_frequency_days: Math.max(
        1,
        Number(emailNotificationConfig.global_frequency_days || 1)
      ),
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("app_settings")
      .update({
        ...relancePayload,
        ...emailPayload,
      })
      .eq("id", data.id);

    if (updateError) throw updateError;

    setAdminMsg("Paramètres enregistrés.");
  } catch (err) {
    console.error("saveAdminSettings", err);
    setAdminMsg("Erreur : " + (err.message || "save admin settings"));
  } finally {
    setAdminBusy(false);
  }
};

  const saveEmailNotificationConfig = async () => {
  setAdminMsg("");
  setAdminBusy(true);

  try {
    const { data, error: fetchError } = await supabase
      .from("app_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!data) throw new Error("Aucune ligne app_settings trouvée.");

    const payload = {
      email_tomorrow_enabled: !!emailNotificationConfig.tomorrow_enabled,
      email_late_enabled: !!emailNotificationConfig.late_enabled,
      email_late_days: Math.max(1, Number(emailNotificationConfig.late_days || 3)),
      email_global_enabled: !!emailNotificationConfig.global_enabled,
      email_global_threshold: Math.max(1, Number(emailNotificationConfig.global_threshold || 3)),
      email_global_frequency_days: Math.max(
        1,
        Number(emailNotificationConfig.global_frequency_days || 1)
      ),
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("app_settings")
      .update(payload)
      .eq("id", data.id);

    if (updateError) throw updateError;

    setAdminMsg("Paramètres email enregistrés.");
  } catch (err) {
    console.error("saveEmailNotificationConfig", err);
    setAdminMsg("Erreur : " + (err.message || "save email config"));
  } finally {
    setAdminBusy(false);
  }
};

  const handleProfileFormChange = (field, value) => {
    setProfileForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePasswordFormChange = (field, value) => {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveMyProfile = async (e) => {
    e.preventDefault();
    setProfileMsg("");

    const firstName = profileForm.first_name.trim();
    const lastName = profileForm.last_name.trim();
    const phone = profileForm.phone.trim();

    if (!firstName) {
      setProfileMsg("Erreur : le prénom est obligatoire.");
      return;
    }

    if (!lastName) {
      setProfileMsg("Erreur : le nom est obligatoire.");
      return;
    }

    if (!phone) {
      setProfileMsg("Erreur : le téléphone est obligatoire.");
      return;
    }

    setProfileBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone,
        })
        .eq("id", session.user.id);

      if (error) throw error;

      setProfileMsg("Profil enregistré.");
      await fetchProfiles(session);
    } catch (err) {
      console.error("handleSaveMyProfile", err);
      setProfileMsg("Erreur : " + (err.message || "impossible d’enregistrer le profil"));
    } finally {
      setProfileBusy(false);
    }
  };

  const handleChangeMyPassword = async (e) => {
    e.preventDefault();
    setProfileMsg("");

    const password = passwordForm.password;
    const confirmPassword = passwordForm.confirm_password;

    if (!password || password.length < 6) {
      setProfileMsg("Erreur : le mot de passe doit faire au moins 6 caractères.");
      return;
    }

    if (password !== confirmPassword) {
      setProfileMsg("Erreur : les mots de passe ne correspondent pas.");
      return;
    }

    setProfileBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setPasswordForm({
        password: "",
        confirm_password: "",
      });

      setProfileMsg("Mot de passe mis à jour.");
    } catch (err) {
      console.error("handleChangeMyPassword", err);
      setProfileMsg("Erreur : " + (err.message || "impossible de changer le mot de passe"));
    } finally {
      setProfileBusy(false);
    }
  };

  // ---------- DASHBOARD ----------

  const currentProfile = useMemo(
    () => profiles.find((p) => p.id === session?.user?.id) || null,
    [profiles, session]
  );

  const dashboardFilterOptions = useMemo(() => {
    if (!session?.user) return [];

    if (isAdmin) {
      return commercials;
    }

    if (isManager) {
      return commercials.filter(
        (p) => p.id === session.user.id || managedUserIds.includes(p.id)
      );
    }

    return commercials.filter((p) => p.id === session.user.id);
  }, [commercials, isAdmin, isManager, managedUserIds, session]);

  const accessibleComparisonClientsRaw = useMemo(() => {
    if (!session?.user) return [];

    if (isAdmin) {
      return clientsRaw;
    }

    if (isManager) {
      const allowedEmails = dashboardFilterOptions.map((p) => p.email);
      return clientsRaw.filter((c) => allowedEmails.includes(getCommercialEmail(c.owner_id)));
    }

    return clientsRaw.filter((c) => c.owner_id === session.user.id);
  }, [clientsRaw, dashboardFilterOptions, isAdmin, isManager, session]);

  const dashboardClientsRaw = useMemo(() => {
    if (!session?.user) return [];

    if (isAdmin) {
      if (dashboardCommercialFilter === "Tous") return clientsRaw;
      return clientsRaw.filter(
        (c) => getCommercialEmail(c.owner_id) === dashboardCommercialFilter
      );
    }

    if (isManager) {
      const allowedProfiles = commercials.filter(
        (p) => p.id === session.user.id || managedUserIds.includes(p.id)
      );
      const allowedEmails = allowedProfiles.map((p) => p.email);

      if (dashboardCommercialFilter === "Tous") {
        return clientsRaw.filter((c) =>
          allowedEmails.includes(getCommercialEmail(c.owner_id))
        );
      }

      return clientsRaw.filter(
        (c) => getCommercialEmail(c.owner_id) === dashboardCommercialFilter
      );
    }

    return clientsRaw.filter((c) => c.owner_id === session.user.id);
  }, [
    clientsRaw,
    dashboardCommercialFilter,
    session,
    isAdmin,
    isManager,
    commercials,
    managedUserIds,
  ]);

  const dashboardCommercialDisplay = useMemo(() => {
    if (!session?.user) return "";

    if (!isAdmin && !isManager) {
      return currentProfile ? getProfileLabel(currentProfile) : "";
    }

    if (dashboardCommercialFilter === "Tous") {
      return isAdmin ? "Toute l’équipe" : "Mon équipe";
    }

    const selected = dashboardFilterOptions.find(
      (p) => p.email === dashboardCommercialFilter
    );

    return selected ? getProfileLabel(selected) : dashboardCommercialFilter;
  }, [
    session,
    isAdmin,
    isManager,
    currentProfile,
    dashboardCommercialFilter,
    dashboardFilterOptions,
  ]);

  const today0 = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const dueClientsByCategory = (cat) => {
    const list = dashboardClientsRaw
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

  const top5SellerDue = useMemo(
    () => dueClientsByCategory("seller").slice(0, 5),
    [dashboardClientsRaw, relanceConfig, today0]
  );
  const top5BuyerDue = useMemo(
    () => dueClientsByCategory("buyer").slice(0, 5),
    [dashboardClientsRaw, relanceConfig, today0]
  );
  const top5AfterDue = useMemo(
    () => dueClientsByCategory("after").slice(0, 5),
    [dashboardClientsRaw, relanceConfig, today0]
  );

  const activeCounts = useMemo(() => {
    const active = dashboardClientsRaw.filter((c) => c.status !== "closed");
    return {
      total: active.length,
      seller: active.filter((c) => c.category === "seller").length,
      buyer: active.filter((c) => c.category === "buyer").length,
      after: active.filter((c) => c.category === "after").length,
    };
  }, [dashboardClientsRaw]);

  const computeCompleteness = (c) => {
    const filled = (v) => v !== null && v !== undefined && String(v).trim() !== "";

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
    const active = dashboardClientsRaw.filter((c) => c.status !== "closed");
    const hasSeller = active.some((c) => c.category === "seller");
    const hasBuyer = active.some((c) => c.category === "buyer");
    const hasAfter = active.some((c) => c.category === "after");

    const typeUsage = (hasSeller ? 0.5 : 0) + (hasBuyer ? 0.25 : 0) + (hasAfter ? 0.25 : 0);

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
      return diffDays <= -2;
    });

    const timelinessFactor = dueNow.length === 0 ? 1 : Math.max(0, 1 - stale.length / dueNow.length);

    const completenessAvg =
      active.length === 0
        ? 0
        : active.reduce((acc, c) => acc + computeCompleteness(c), 0) / active.length;

    const raw = 10 * typeUsage * (0.7 + 0.3 * timelinessFactor) * (0.6 + 0.4 * completenessAvg);
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
    if (active.length > 0 && completenessAvg < 1)
      tips.push("Complète les champs clés (téléphone, adresse, etc.).");
    if (!hasSeller || !hasBuyer || !hasAfter)
      tips.push("Utilise les 3 types pour viser 10/10.");

    return { score: score.toFixed(1), reasons, tips };
  }, [dashboardClientsRaw, relanceConfig, today0]);

  const estimationMandatStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const matureLimit = new Date(today);
    matureLimit.setDate(matureLimit.getDate() - 90);

    const oldLimit = new Date(today);
    oldLimit.setMonth(oldLimit.getMonth() - 12);

    const base = dashboardClientsRaw.filter((c) => {
      if (!c.estimation_date) return false;
      const d = new Date(c.estimation_date);
      if (Number.isNaN(d.getTime())) return false;
      return d >= oldLimit && d <= matureLimit;
    });

    const converted = base.filter((c) => {
      return Boolean(c.mandat_at) || c.deal_stage === "mandat";
    });

    const estimations = base.length;
    const mandats = converted.length;
    const conversionPct =
      estimations === 0 ? 0 : Math.round((mandats / estimations) * 1000) / 10;

    return {
      estimations,
      mandats,
      conversionPct,
    };
  }, [dashboardClientsRaw]);

  const mandatVenteStats = useMemo(() => {
    const mandats = dashboardClientsRaw.filter(
      (c) => Boolean(c.mandat_at) || c.deal_stage === "mandat"
    );

    const ventesParNous = mandats.filter((c) => c.sale_result === "vendu_avec_nous");

    const mandatsCount = mandats.length;
    const ventesCount = ventesParNous.length;
    const conversionPct =
      mandatsCount === 0 ? 0 : Math.round((ventesCount / mandatsCount) * 1000) / 10;

    return {
      mandats: mandatsCount,
      ventes: ventesCount,
      conversionPct,
    };
  }, [dashboardClientsRaw]);

  const commercialRevenueStats = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);

    const encaissedThisYear = dashboardClientsRaw.filter((c) => {
      if (!c.commission_received_at) return false;
      const d = new Date(c.commission_received_at);
      if (Number.isNaN(d.getTime())) return false;
      return d >= start && d < end;
    });

    const totalTtc = encaissedThisYear.reduce(
      (sum, c) => sum + Number(c.commission_ttc || 0),
      0
    );

    const totalHt = encaissedThisYear.reduce(
      (sum, c) => sum + Number(c.commission_ht || 0),
      0
    );

    return {
      year,
      totalTtc,
      totalHt,
      count: encaissedThisYear.length,
    };
  }, [dashboardClientsRaw]);

  const comparisonRows = useMemo(() => {
    if (!(isAdmin || isManager)) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const matureLimit = new Date(today);
    matureLimit.setDate(matureLimit.getDate() - 90);

    const oldLimit = new Date(today);
    oldLimit.setMonth(oldLimit.getMonth() - 12);

    const year = today.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    return dashboardFilterOptions
      .map((profile) => {
        const email = profile.email;
        const ownerClients = accessibleComparisonClientsRaw.filter(
          (c) => getCommercialEmail(c.owner_id) === email
        );

        const active = ownerClients.filter((c) => c.status !== "closed");

        const estimationsBase = ownerClients.filter((c) => {
          if (!c.estimation_date) return false;
          const d = new Date(c.estimation_date);
          if (Number.isNaN(d.getTime())) return false;
          return d >= oldLimit && d <= matureLimit;
        });

        const mandats = ownerClients.filter(
          (c) => Boolean(c.mandat_at) || c.deal_stage === "mandat"
        );

        const ventes = mandats.filter((c) => c.sale_result === "vendu_avec_nous");

        const dueNow = active.filter((c) => {
          const nd = getNextDueDate(c);
          if (!nd) return false;
          const d = new Date(nd);
          d.setHours(0, 0, 0, 0);
          return d <= today0;
        });

        const late2 = dueNow.filter((c) => {
          const nd = getNextDueDate(c);
          if (!nd) return false;
          const d = new Date(nd);
          d.setHours(0, 0, 0, 0);
          const diffDays = Math.round((d.getTime() - today0.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= -2;
        });

        const encaissedThisYear = ownerClients.filter((c) => {
          if (!c.commission_received_at) return false;
          const d = new Date(c.commission_received_at);
          if (Number.isNaN(d.getTime())) return false;
          return d >= yearStart && d < yearEnd;
        });

        const caTtc = encaissedThisYear.reduce(
          (sum, c) => sum + Number(c.commission_ttc || 0),
          0
        );

        const caHt = encaissedThisYear.reduce(
          (sum, c) => sum + Number(c.commission_ht || 0),
          0
        );

        const txEstimationMandat =
          estimationsBase.length === 0
            ? 0
            : Math.round((mandats.length / estimationsBase.length) * 1000) / 10;

        const txMandatVente =
          mandats.length === 0
            ? 0
            : Math.round((ventes.length / mandats.length) * 1000) / 10;

        return {
          id: profile.id,
          email,
          label: getProfileLabel(profile),
          activeCount: active.length,
          estimations: estimationsBase.length,
          mandats: mandats.length,
          ventes: ventes.length,
          txEstimationMandat,
          txMandatVente,
          caTtc,
          caHt,
          dueCount: dueNow.length,
          late2Count: late2.length,
        };
      })
      .sort((a, b) => {
        if (b.caTtc !== a.caTtc) return b.caTtc - a.caTtc;
        if (b.ventes !== a.ventes) return b.ventes - a.ventes;
        if (b.mandats !== a.mandats) return b.mandats - a.mandats;
        return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
      });
  }, [
    isAdmin,
    isManager,
    dashboardFilterOptions,
    accessibleComparisonClientsRaw,
    today0,
  ]);

  const comparisonMaxCa = useMemo(() => {
    if (!comparisonRows.length) return 0;
    return Math.max(...comparisonRows.map((r) => r.caTtc), 0);
  }, [comparisonRows]);

const handleCloseReleaseNotesPermanently = () => {
  try {
    const key = `kit_release_notes_seen_${RELEASE_NOTES_VERSION}`;
    localStorage.setItem(key, "true");
  } catch (e) {}
  setShowReleaseNotes(false);
};

const handleCloseReleaseNotesTemporary = () => {
  setShowReleaseNotes(false);
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

  if (isInviteFlow && session) {
    return (
      <div className="app auth-screen">
        <style>{baseCss}</style>
        <div className="auth-card">
          <h1>Keepintouch</h1>
          <span className="badge">Rester en contact</span>

          <h2>Finaliser votre compte</h2>
          <p
            style={{
              fontSize: "0.9rem",
              color: "#4b5563",
              marginTop: 0,
              lineHeight: 1.4,
            }}
          >
            Votre invitation a bien été acceptée. Renseignez vos informations et choisissez
            votre mot de passe.
          </p>

          <form onSubmit={handleInvitePasswordSubmit} className="auth-form">
            <label>
              Prénom
              <input
                type="text"
                value={inviteProfileForm.first_name}
                onChange={(e) => handleInviteProfileFormChange("first_name", e.target.value)}
                required
              />
            </label>

            <label>
              Nom
              <input
                type="text"
                value={inviteProfileForm.last_name}
                onChange={(e) => handleInviteProfileFormChange("last_name", e.target.value)}
                required
              />
            </label>

            <label>
              Téléphone
              <input
                type="text"
                value={inviteProfileForm.phone}
                onChange={(e) => handleInviteProfileFormChange("phone", e.target.value)}
                required
              />
            </label>

            <label>
              Mot de passe
              <input
                type="password"
                value={inviteProfileForm.password}
                onChange={(e) => handleInviteProfileFormChange("password", e.target.value)}
                required
              />
            </label>

            <label>
              Confirmer le mot de passe
              <input
                type="password"
                value={inviteProfileForm.confirm_password}
                onChange={(e) => handleInviteProfileFormChange("confirm_password", e.target.value)}
                required
              />
            </label>

            {resetErrorMsg && <p className="error-text">{resetErrorMsg}</p>}
            {resetDone && (
              <p style={{ fontSize: "0.85rem", color: "#15803d" }}>
                Compte finalisé avec succès.
              </p>
            )}

            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? "Enregistrement..." : "Finaliser mon compte"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isInviteFlow && !session) {
    return (
      <div className="app auth-screen">
        <style>{baseCss}</style>
        <div className="auth-card">
          <h1>Keepintouch</h1>
          <span className="badge">Rester en contact</span>

          <h2>Activation de votre accès…</h2>
          <p style={{ fontSize: "0.9rem", color: "#4b5563", marginTop: 0 }}>
            Merci de patienter quelques secondes pendant la validation de votre invitation.
          </p>
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

          <h2>Connexion</h2>

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
              Se connecter
            </button>
          </form>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 8,
              fontSize: "0.85rem",
            }}
          >
            <button
              className="link-button"
              type="button"
              onClick={handleResetPasswordRequest}
              disabled={resetLoading}
            >
              {resetLoading ? "Envoi..." : "Mot de passe oublié ?"}
            </button>
          </div>

          <p className="footer-text">Accès sur invitation administrateur uniquement.</p>
          <p className="footer-text">© Benjamin Rondreux — Osmoz Dev.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <style>{baseCss}</style>

      <Header
        session={session}
        isAdmin={isAdmin}
        isManager={isManager}
        page={page}
        setPage={setPage}
        setShowAdminPanel={setShowAdminPanel}
        handleLogout={handleLogout}
        currentProfile={currentProfile}
        showProfileMenu={showProfileMenu}
        setShowProfileMenu={setShowProfileMenu}
        setShowProfileModal={setShowProfileModal}
      />

      <main className="main">
        {page === "dashboard" ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <div>
                <h2 className="dash-page-title" style={{ marginBottom: 4 }}>
                  Tableau de bord
                </h2>
                <div style={{ fontSize: "0.92rem", color: "#4b5563" }}>
                  {dashboardCommercialDisplay || "Vue commerciale"}
                </div>
              </div>

              {(isAdmin || isManager) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <label htmlFor="dashboardCommercialFilter" style={{ fontWeight: 600 }}>
                    Commercial :
                  </label>

                  <select
                    id="dashboardCommercialFilter"
                    value={dashboardCommercialFilter}
                    onChange={(e) => setDashboardCommercialFilter(e.target.value)}
                    style={{
                      minWidth: 220,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                    }}
                  >
                    <option value="Tous">Tous</option>

                    {dashboardFilterOptions.map((c) => {
                      const fullName = [c.first_name, c.last_name]
                        .filter(Boolean)
                        .join(" ")
                        .trim();
                      const optionLabel = fullName ? `${fullName} — ${c.email}` : c.email;

                      return (
                        <option key={c.id} value={c.email}>
                          {optionLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

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
                <div className="dash-score-sub">{scoreInfo.reasons.slice(0, 2).join(" ")}</div>
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
                getFollowupInfo={getFollowupInfo}
                onGo={() => {
                  setPage("clients");
                  setCurrentTab("vendeur");
                  setStatusFilter("arelancer");
                  setCommercialFilter(
                    (isAdmin || isManager) ? dashboardCommercialFilter : "Tous"
                  );
                  setViewMode("compact");
                  setSellerStageFilter("premandat");
                }}
              />
              <DashboardCard
                title="Acquéreur — à relancer (top 5)"
                list={top5BuyerDue}
                getFollowupInfo={getFollowupInfo}
                onGo={() => {
                  setPage("clients");
                  setCurrentTab("acquereur");
                  setStatusFilter("arelancer");
                  setCommercialFilter(
                    (isAdmin || isManager) ? dashboardCommercialFilter : "Tous"
                  );
                  setViewMode("compact");
                }}
              />
              <DashboardCard
                title="Après-vente — à relancer (top 5)"
                list={top5AfterDue}
                getFollowupInfo={getFollowupInfo}
                onGo={() => {
                  setPage("clients");
                  setCurrentTab("apresvente");
                  setStatusFilter("arelancer");
                  setCommercialFilter(
                    (isAdmin || isManager) ? dashboardCommercialFilter : "Tous"
                  );
                  setViewMode("compact");
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
                marginTop: 18,
              }}
            >
              <div className="conversion-card">
                <div className="conversion-card-title">Conversion estimation → mandat</div>
                <div className="conversion-card-value">
                  {estimationMandatStats.conversionPct}%
                </div>
                <div className="conversion-card-meta">
                  {estimationMandatStats.mandats} mandat(s) sur{" "}
                  {estimationMandatStats.estimations} estimation(s) matures
                </div>
                <div className="conversion-card-sub">
                  Base : estimations datées des 12 derniers mois, hors 90 derniers jours.
                </div>
              </div>

              <div className="conversion-card">
                <div className="conversion-card-title">Conversion mandat → vente par moi</div>
                <div className="conversion-card-value">{mandatVenteStats.conversionPct}%</div>
                <div className="conversion-card-meta">
                  {mandatVenteStats.ventes} vente(s) sur {mandatVenteStats.mandats} mandat(s)
                </div>
                <div className="conversion-card-sub">
                  Base : tous les dossiers passés sous mandat, y compris ceux déjà basculés en
                  après-vente.
                </div>
              </div>

              <div className="conversion-card">
                <div className="conversion-card-title">
                  CA TTC {commercialRevenueStats.year}
                </div>
                <div className="conversion-card-value">
                  {formatCurrency(commercialRevenueStats.totalTtc)}
                </div>
                <div className="conversion-card-meta">
                  {commercialRevenueStats.count} vente(s) encaissée(s)
                </div>
                <div className="conversion-card-sub">
                  Base : commissions dont la date d’encaissement est en{" "}
                  {commercialRevenueStats.year}.
                </div>
              </div>

              <div className="conversion-card">
                <div className="conversion-card-title">
                  CA HT {commercialRevenueStats.year}
                </div>
                <div className="conversion-card-value">
                  {formatCurrency(commercialRevenueStats.totalHt)}
                </div>
                <div className="conversion-card-meta">
                  Calculé automatiquement depuis le TTC et la TVA
                </div>
                <div className="conversion-card-sub">
                  Base : mêmes ventes encaissées que le CA TTC.
                </div>
              </div>
            </div>

            {(isAdmin || isManager) && (
              <>
                <div
                  style={{
                    marginTop: 26,
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    background: "#fff",
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: "1rem",
                      fontWeight: 700,
                      marginBottom: 14,
                    }}
                  >
                    Comparatif commerciaux
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 920,
                        fontSize: "0.92rem",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                         {[
  { key: "commercial", label: <>Commercial</> },
  { key: "active", label: <>Clients<br />actifs</> },
  { key: "estimations", label: <>Estimations</> },
  { key: "mandats", label: <>Mandats</> },
  { key: "ventes", label: <>Ventes</> },
  { key: "tx_est_mandat", label: <>Tx est.<br />→ mandat</> },
  { key: "tx_mandat_vente", label: <>Tx mandat<br />→ vente</> },
  { key: "ca_ht", label: <>CA HT</> },
  { key: "due", label: <>À<br />relancer</> },
  { key: "late", label: <>Retards<br />&gt; 2j</> },
].map((h) => (
  <th
    key={h.key}
    style={{
      textAlign: "left",
      padding: "8px 10px",
      borderBottom: "1px solid #e5e7eb",
      whiteSpace: "normal",
      lineHeight: 1.15,
      verticalAlign: "bottom",
    }}
  >
    {h.label}
  </th>
))}
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonRows.map((row, idx) => (
                          <tr
  key={row.id}
  style={{
    background: idx % 2 === 0 ? "#fff" : "#fcfcfd",
  }}
>
  <td
    style={{
      padding: "8px 10px",
      borderBottom: "1px solid #f1f5f9",
      fontWeight: 600,
      maxWidth: 180,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}
    title={row.label}
  >
    {row.label}
  </td>
  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
    {row.activeCount}
  </td>
  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
    {row.estimations}
  </td>
  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
    {row.mandats}
  </td>
  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
    {row.ventes}
  </td>
  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
    {formatPercent(row.txEstimationMandat)}
  </td>
  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
    {formatPercent(row.txMandatVente)}
  </td>
  <td
    style={{
      padding: "8px 10px",
      borderBottom: "1px solid #f1f5f9",
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}
  >
    {formatCurrency(row.caHt)}
  </td>
  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
    {row.dueCount}
  </td>
  <td
    style={{
      padding: "8px 10px",
      borderBottom: "1px solid #f1f5f9",
      color: row.late2Count > 0 ? "#b91c1c" : "#111827",
      fontWeight: row.late2Count > 0 ? 700 : 400,
    }}
  >
    {row.late2Count}
  </td>
</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    background: "#fff",
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: "1rem",
                      fontWeight: 700,
                      marginBottom: 14,
                    }}
                  >
                    CA TTC par commercial ({commercialRevenueStats.year})
                  </div>

                  {comparisonRows.length === 0 ? (
                    <div style={{ color: "#6b7280" }}>Aucune donnée disponible.</div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      {comparisonRows.map((row) => {
                        const ratio =
                          comparisonMaxCa > 0 ? Math.max(4, (row.caTtc / comparisonMaxCa) * 100) : 0;

                        return (
                          <div
                            key={row.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "220px 1fr 140px",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "0.92rem",
                                fontWeight: 600,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={row.label}
                            >
                              {row.label}
                            </div>

                            <div
                              style={{
                                width: "100%",
                                height: 18,
                                background: "#eef2f7",
                                borderRadius: 999,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${ratio}%`,
                                  height: "100%",
                                  background: "#111827",
                                  borderRadius: 999,
                                }}
                              />
                            </div>

                            <div
                              style={{
                                textAlign: "right",
                                fontWeight: 600,
                                fontSize: "0.92rem",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {formatCurrency(row.caTtc)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="top-bar">
              <div className="tabs">
                <button
                  className={"tab-button" + (currentTab === "vendeur" ? " tab-button-active" : "")}
                  onClick={() => setCurrentTab("vendeur")}
                >
                  {isMobileView ? "Vendeur" : "Vendeur/Bailleur"}
                </button>
                <button
                  className={
                    "tab-button" + (currentTab === "acquereur" ? " tab-button-active" : "")
                  }
                  onClick={() => setCurrentTab("acquereur")}
                >
                  Acquéreur
                </button>
                <button
                  className={
                    "tab-button" + (currentTab === "apresvente" ? " tab-button-active" : "")
                  }
                  onClick={() => setCurrentTab("apresvente")}
                >
                  {isMobileView ? "Après" : "Après-vente"}
                </button>
                <button
                  className={"tab-button" + (currentTab === "tous" ? " tab-button-active" : "")}
                  onClick={() => setCurrentTab("tous")}
                >
                  {isMobileView ? "Tous" : "Tous les types"}
                </button>
              </div>

              <div className="status-tabs">
                <button
                  className={
                    "status-button" + (statusFilter === "arelancer" ? " status-button-active" : "")
                  }
                  onClick={() => setStatusFilter("arelancer")}
                >
                  À relancer
                </button>
                <button
                  className={
                    "status-button" + (statusFilter === "encours" ? " status-button-active" : "")
                  }
                  onClick={() => setStatusFilter("encours")}
                >
                  En cours
                </button>
                <button
                  className={
                    "status-button" + (statusFilter === "tous" ? " status-button-active" : "")
                  }
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

            {currentTab === "vendeur" && (
              <div className="filters-row" style={{ marginTop: -6 }}>
                <div className="tabs">
                  <button
                    className={
                      "tab-button" + (sellerStageFilter === "premandat" ? " tab-button-active" : "")
                    }
                    onClick={() => setSellerStageFilter("premandat")}
                    type="button"
                  >
                    Pré-mandat
                  </button>
                  <button
                    className={
                      "tab-button" + (sellerStageFilter === "mandat" ? " tab-button-active" : "")
                    }
                    onClick={() => setSellerStageFilter("mandat")}
                    type="button"
                  >
                    Sous mandat
                  </button>
                  <button
                    className={
                      "tab-button" + (sellerStageFilter === "tous" ? " tab-button-active" : "")
                    }
                    onClick={() => setSellerStageFilter("tous")}
                    type="button"
                  >
                    Tout
                  </button>
                </div>
              </div>
            )}

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

              <div className="search-box">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Rechercher : nom, prénom, adresse, email, téléphone"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

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

              <button className="btn-primary" onClick={openAddModal} type="button">
                + Ajouter
              </button>
            </div>

            {lastError && <p className="error-text">Erreur : {lastError}</p>}

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

            <footer className="app-footer">© Benjamin Rondreux — Keepintouch 2.4 — 2026</footer>
          </>
        )}
      </main>

<ReleaseNotesModal
  show={showReleaseNotes}
  onClosePermanently={handleCloseReleaseNotesPermanently}
  onCloseTemporary={handleCloseReleaseNotesTemporary}
/>

      <AdminModal
        isAdmin={isAdmin}
        session={session}
        showAdminPanel={showAdminPanel}
        setShowAdminPanel={setShowAdminPanel}
        adminMsg={adminMsg}
        adminBusy={adminBusy}
        profiles={profiles}
        reassignFrom={reassignFrom}
        setReassignFrom={setReassignFrom}
        reassignTo={reassignTo}
        setReassignTo={setReassignTo}
        toggleUserActive={toggleUserActive}
        reassignClientsToUser={reassignClientsToUser}
        relanceConfig={relanceConfig}
        updateRelanceCfgField={updateRelanceCfgField}
        saveRelanceCfg={saveRelanceCfg}
        inviteEmail={inviteEmail}
        setInviteEmail={setInviteEmail}
        inviteRole={inviteRole}
        setInviteRole={setInviteRole}
        handleInviteUser={handleInviteUser}
        emailNotificationConfig={emailNotificationConfig}
        updateEmailNotificationField={updateEmailNotificationField}
        saveEmailNotificationConfig={saveEmailNotificationConfig}
        saveAdminSettings={saveAdminSettings}
      />

      <ClientModal
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        editingClientId={editingClientId}
        setEditingClientId={setEditingClientId}
        newClient={newClient}
        handleNewClientChange={handleNewClientChange}
        handleSaveClient={handleSaveClient}
      />

      <ClosureModal
        closureClient={closureClient}
        setClosureClient={setClosureClient}
        reasonsForClient={reasonsForClient}
        closureReason={closureReason}
        setClosureReason={setClosureReason}
        handleConfirmClosure={handleConfirmClosure}
        afterSaleForm={afterSaleForm}
        handleAfterSaleFormChange={handleAfterSaleFormChange}
      />

      <ProfileModal
        showProfileModal={showProfileModal}
        setShowProfileModal={setShowProfileModal}
        profileForm={profileForm}
        handleProfileFormChange={handleProfileFormChange}
        handleSaveMyProfile={handleSaveMyProfile}
        passwordForm={passwordForm}
        handlePasswordFormChange={handlePasswordFormChange}
        handleChangeMyPassword={handleChangeMyPassword}
        profileMsg={profileMsg}
        profileBusy={profileBusy}
        currentProfile={currentProfile}
      />
    </div>
  );
}

export default App;