// src/components/CompensationPage.jsx
// Onglet « Rémunération ». Commercial : son solde, sa projection, son relevé, ses factures.
// Admin : synthèse de tous les commerciaux → relevé détaillé avec la saisie (salaire, paiement, facture,
// réglages). Manager : synthèse et relevés de son équipe, en lecture seule. Calculs : src/lib/compensation.js.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { fetchAllRows } from "../lib/fetchAll";
import { todayStr } from "../lib/dates";
import { parseDecimal } from "../lib/transactionDraft";
import { round2 } from "../lib/transactions";
import {
  COMPENSATION_TYPES,
  INVOICE_STATUS_LABELS,
  compensationStatement,
  earnedInYear,
  endOfMonth,
  imputedAmount,
  invoicePaidAmount,
  invoiceStatus,
  isAgent,
  projectedCompensation,
  projectionLabel,
  vatRateFor,
} from "../lib/compensation";
import CompensationSettingsModal from "./CompensationSettingsModal";

const fieldStyle = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  fontSize: "0.92rem",
  background: "#fff",
  boxSizing: "border-box",
  marginTop: 4,
};
const labelStyle = { display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#111827" };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 };
const cell = { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontSize: "0.86rem", verticalAlign: "top" };
const head = { ...cell, fontWeight: 700, background: "#f9fafb", textAlign: "left", whiteSpace: "nowrap" };
const num = { textAlign: "right", whiteSpace: "nowrap" };

const STATUS_COLORS = { unpaid: ["#fef2f2", "#b91c1c"], partial: ["#fef3c7", "#92400e"], paid: ["#ecfdf5", "#047857"] };
const InvoiceBadge = ({ status }) => (
  <span
    style={{
      background: STATUS_COLORS[status][0],
      color: STATUS_COLORS[status][1],
      borderRadius: 999,
      padding: "2px 8px",
      fontSize: "0.78rem",
      whiteSpace: "nowrap",
    }}
  >
    {INVOICE_STATUS_LABELS[status]}
  </span>
);

const safeFileName = (name) =>
  String(name || "facture")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"];

// Fenêtre de saisie générique (salaire, paiement, facture)
function EntryModal({ title, children, error, busy, onCancel, onSubmit, submitLabel }) {
  return (
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2>{title}</h2>
        <form onSubmit={onSubmit}>
          {children}
          {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Enregistrement…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SalaryForm({ userId, formatCurrency, onCancel, onDone }) {
  const [form, setForm] = useState({ month: todayStr().slice(0, 7), amount: "", fixed: "", bonus: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const amount = parseDecimal(form.amount);
  const fixed = parseDecimal(form.fixed) ?? 0;
  const bonus = parseDecimal(form.bonus) ?? 0;
  const imputed = imputedAmount({ amount, fixed_part: fixed, bonus_part: bonus });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.month) return setError("Le mois est obligatoire.");
    if (amount === null || amount <= 0) return setError("Le salaire brut total est obligatoire.");
    if (fixed < 0 || bonus < 0 || fixed + bonus > amount) return setError("Fixe + prime ne peuvent pas dépasser le brut total.");
    setBusy(true);
    const { error: err } = await supabase.from("payments").insert({
      user_id: userId,
      kind: "salary",
      period_month: `${form.month}-01`,
      paid_at: endOfMonth(form.month),
      amount,
      fixed_part: fixed,
      bonus_part: bonus,
      note: form.note.trim() || null,
    });
    setBusy(false);
    if (err) return setError(err.message);
    onDone();
  };

  return (
    <EntryModal title="Ajouter un salaire" error={error} busy={busy} onCancel={onCancel} onSubmit={submit} submitLabel="Enregistrer">
      <div style={grid}>
        <label style={labelStyle}>
          Mois
          <input type="month" style={fieldStyle} value={form.month} onChange={set("month")} />
        </label>
        <label style={labelStyle}>
          Salaire brut total (€)
          <input style={fieldStyle} inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </label>
        <label style={labelStyle}>
          dont fixe (€)
          <input style={fieldStyle} inputMode="decimal" placeholder="0" value={form.fixed} onChange={set("fixed")} />
        </label>
        <label style={labelStyle}>
          dont prime (€)
          <input style={fieldStyle} inputMode="decimal" placeholder="0" value={form.bonus} onChange={set("bonus")} />
        </label>
      </div>
      <p style={{ margin: "12px 0 0", fontSize: "0.9rem" }}>
        Part imputée sur le solde : <strong>{formatCurrency(Math.max(0, imputed))}</strong>
        <span style={{ color: "#6b7280", fontSize: "0.8rem" }}> (le fixe et les primes ne diminuent pas le solde)</span>
      </p>
      <label style={{ ...labelStyle, marginTop: 10 }}>
        Note
        <input style={fieldStyle} value={form.note} onChange={set("note")} />
      </label>
    </EntryModal>
  );
}

function PaymentForm({ userId, invoices, payments, formatCurrency, formatDate, onCancel, onDone }) {
  const open = invoices.filter((i) => invoiceStatus(i, payments) !== "paid");
  const remaining = (inv) => round2(Number(inv.amount_ttc) - invoicePaidAmount(inv, payments));
  const first = open[0];
  const [form, setForm] = useState({
    paid_at: todayStr(),
    invoice_id: first?.id || "",
    amount: first ? String(remaining(first)) : "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pickInvoice = (e) => {
    const inv = invoices.find((i) => i.id === e.target.value);
    setForm((f) => ({ ...f, invoice_id: e.target.value, amount: inv ? String(remaining(inv)) : f.amount }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const amount = parseDecimal(form.amount);
    if (!form.paid_at) return setError("La date est obligatoire.");
    if (amount === null || amount <= 0) return setError("Le montant est obligatoire.");
    setBusy(true);
    const { error: err } = await supabase.from("payments").insert({
      user_id: userId,
      kind: "invoice_payment",
      paid_at: form.paid_at,
      amount,
      invoice_id: form.invoice_id || null,
      note: form.note.trim() || null,
    });
    setBusy(false);
    if (err) return setError(err.message);
    onDone();
  };

  return (
    <EntryModal title="Enregistrer un paiement" error={error} busy={busy} onCancel={onCancel} onSubmit={submit} submitLabel="Enregistrer">
      <div style={grid}>
        <label style={labelStyle}>
          Date
          <input type="date" style={fieldStyle} value={form.paid_at} onChange={set("paid_at")} />
        </label>
        <label style={labelStyle}>
          Montant viré (€)
          <input style={fieldStyle} inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </label>
      </div>
      <label style={{ ...labelStyle, marginTop: 10 }}>
        Facture concernée (optionnel)
        <select style={fieldStyle} value={form.invoice_id} onChange={pickInvoice}>
          <option value="">— Aucune —</option>
          {invoices.map((i) => (
            <option key={i.id} value={i.id}>
              N° {i.number} du {formatDate(i.issued_at)} · {formatCurrency(i.amount_ttc)} ·{" "}
              {INVOICE_STATUS_LABELS[invoiceStatus(i, payments)]}
            </option>
          ))}
        </select>
      </label>
      <label style={{ ...labelStyle, marginTop: 10 }}>
        Note
        <input style={fieldStyle} value={form.note} onChange={set("note")} />
      </label>
    </EntryModal>
  );
}

function InvoiceForm({ userId, settings, formatCurrency, onCancel, onDone }) {
  const [form, setForm] = useState({
    number: "",
    issued_at: todayStr(),
    amount_ht: "",
    vat_rate: String(vatRateFor(settings)),
    note: "",
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ht = parseDecimal(form.amount_ht);
  const vat = parseDecimal(form.vat_rate) ?? 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.number.trim()) return setError("Le numéro de facture est obligatoire.");
    if (ht === null || ht < 0) return setError("Le montant HT est obligatoire.");
    if (!file) return setError("Le fichier de la facture (PDF ou image) est obligatoire.");
    if (file.size > MAX_FILE_BYTES) return setError("Fichier trop lourd : 10 Mo maximum.");
    if (file.type && !ACCEPTED_TYPES.includes(file.type)) return setError("Format accepté : PDF ou image.");
    setBusy(true);
    setError("");
    const path = `${userId}/${Date.now()}-${safeFileName(file.name)}`;
    const { error: upErr } = await supabase.storage.from("invoices").upload(path, file, { contentType: file.type || undefined });
    if (upErr) {
      setBusy(false);
      return setError("Envoi du fichier impossible : " + upErr.message);
    }
    const { error: err } = await supabase.from("invoices").insert({
      user_id: userId,
      number: form.number.trim(),
      issued_at: form.issued_at,
      amount_ht: ht,
      vat_rate: vat,
      file_path: path,
      note: form.note.trim() || null,
    });
    if (err) {
      await supabase.storage.from("invoices").remove([path]);
      setBusy(false);
      return setError(err.message);
    }
    setBusy(false);
    onDone();
  };

  return (
    <EntryModal title="Déposer une facture" error={error} busy={busy} onCancel={onCancel} onSubmit={submit} submitLabel="Déposer">
      <div style={grid}>
        <label style={labelStyle}>
          N° de facture
          <input style={fieldStyle} value={form.number} onChange={set("number")} />
        </label>
        <label style={labelStyle}>
          Date
          <input type="date" style={fieldStyle} value={form.issued_at} onChange={set("issued_at")} />
        </label>
        <label style={labelStyle}>
          Montant HT (€)
          <input style={fieldStyle} inputMode="decimal" value={form.amount_ht} onChange={set("amount_ht")} />
        </label>
        <label style={labelStyle}>
          TVA (%)
          <input style={fieldStyle} inputMode="decimal" value={form.vat_rate} onChange={set("vat_rate")} />
        </label>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: "0.9rem" }}>
        Montant TTC : <strong>{formatCurrency(round2((ht || 0) * (1 + vat / 100)))}</strong>
      </p>
      <label style={{ ...labelStyle, marginTop: 10 }}>
        Fichier (PDF ou image, 10 Mo max.)
        <input
          type="file"
          accept="application/pdf,image/*"
          style={{ ...fieldStyle, padding: 6 }}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      <label style={{ ...labelStyle, marginTop: 10 }}>
        Note
        <input style={fieldStyle} value={form.note} onChange={set("note")} />
      </label>
    </EntryModal>
  );
}

function StatCard({ title, value, sub }) {
  return (
    <div className="conversion-card" style={{ marginTop: 0 }}>
      <div className="conversion-card-title">{title}</div>
      <div className="conversion-card-value">{value}</div>
      {sub && <div className="conversion-card-sub">{sub}</div>}
    </div>
  );
}

function UserDetail({
  userId,
  label,
  settings,
  balanceRow,
  entries,
  payments,
  invoices,
  transactions,
  canWrite, // admin
  canUploadInvoice,
  formatCurrency,
  formatDate,
  onBack,
  onEditSettings,
  onChanged,
}) {
  const [form, setForm] = useState(null); // "salary" | "payment" | "invoice"
  const [error, setError] = useState("");
  const type = settings?.compensation_type || null;
  const agent = isAgent(type);
  const year = new Date().getFullYear();

  const txLabel = (id) => {
    const t = (transactions || []).find((x) => x.id === id);
    if (!t) return "Transaction";
    return [t.property?.address, t.property?.city].filter(Boolean).join(", ") || "Transaction";
  };
  const invoiceLabel = (id) => {
    const i = invoices.find((x) => x.id === id);
    return i ? `Facture n° ${i.number}` : "Facture";
  };

  const statement = useMemo(
    () => compensationStatement({ settings, entries, payments, txLabel, invoiceLabel }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, entries, payments, transactions, invoices]
  );
  const projection = projectedCompensation(transactions, userId, settings);
  const balance = balanceRow ? Number(balanceRow.balance) : statement[statement.length - 1].balance;

  const download = async (inv) => {
    setError("");
    const { data, error: err } = await supabase.storage.from("invoices").createSignedUrl(inv.file_path, 120);
    if (err) return setError("Téléchargement impossible : " + err.message);
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const deletePayment = async (p) => {
    if (!window.confirm("Supprimer ce mouvement ?")) return;
    const { error: err } = await supabase.from("payments").delete().eq("id", p.id);
    if (err) return setError(err.message);
    onChanged();
  };

  const done = () => {
    setForm(null);
    onChanged();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          {onBack && (
            <button type="button" className="link-button" onClick={onBack}>
              ← Tous les commerciaux
            </button>
          )}
          <h2 className="dash-page-title" style={{ margin: "4px 0 0" }}>
            Rémunération{label ? ` · ${label}` : ""}
          </h2>
          <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
            {type ? COMPENSATION_TYPES[type] : "Type de rémunération non renseigné"}
            {type && ` · entrée ${settings.rate_entree ?? "—"} % · sortie ${settings.rate_sortie ?? "—"} %`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canWrite && type === "salarie" && (
            <button type="button" className="btn-primary" onClick={() => setForm("salary")}>
              Ajouter un salaire
            </button>
          )}
          {canWrite && agent && (
            <button type="button" className="btn-primary" onClick={() => setForm("payment")}>
              Enregistrer un paiement
            </button>
          )}
          {canUploadInvoice && agent && (
            <button type="button" className={canWrite ? "btn-outline" : "btn-primary"} onClick={() => setForm("invoice")}>
              Déposer une facture
            </button>
          )}
          {canWrite && (
            <button type="button" className="btn-outline" onClick={onEditSettings}>
              Réglages et solde d'ouverture
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard
          title="Solde dû par l'agence"
          value={formatCurrency(balance)}
          sub={
            settings?.opening_balance_date
              ? `Depuis le ${formatDate(settings.opening_balance_date)} (solde d'ouverture ${formatCurrency(settings.opening_balance || 0)}).`
              : "Commissions dues − salaires et paiements imputés."
          }
        />
        <StatCard
          title={projectionLabel(type)}
          value={formatCurrency(projection.amount_due)}
          sub={
            projection.incomplete
              ? "Projection incomplète : réglages de rémunération à renseigner."
              : `Projection sur ${projection.count} promesse(s) en cours, aux taux actuels${type === "agent_tva" ? ", TVA comprise" : ""}.`
          }
        />
        <StatCard
          title={`Acquis en ${year}`}
          value={formatCurrency(earnedInYear(entries, year))}
          sub={type === "salarie" ? "Salaire variable brut sur les ventes actées." : `Commissions dues sur les ventes actées${type === "agent_tva" ? " (TTC)" : ""}.`}
        />
      </div>

      <h3 style={{ margin: "22px 0 8px" }}>Relevé</h3>
      <div className="comp-table-wrap" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={head}>Date</th>
              <th style={head}>Libellé</th>
              <th style={head}>Transaction / facture</th>
              <th style={{ ...head, ...num }}>+ / −</th>
              <th style={{ ...head, ...num }}>Solde</th>
              {canWrite && <th style={head} />}
            </tr>
          </thead>
          <tbody>
            {statement.map((r) => (
              <tr key={r.key}>
                <td style={cell}>{r.date ? formatDate(r.date) : "—"}</td>
                <td style={cell}>{r.label}</td>
                <td style={cell}>{r.link || "—"}</td>
                <td style={{ ...cell, ...num, color: r.amount > 0 ? "#047857" : r.amount < 0 ? "#b91c1c" : undefined }}>
                  {r.amount === null ? "" : `${r.amount > 0 ? "+" : "−"} ${formatCurrency(Math.abs(r.amount))}`}
                </td>
                <td style={{ ...cell, ...num, fontWeight: 600 }}>{formatCurrency(r.balance)}</td>
                {canWrite && (
                  <td style={cell}>
                    {r.payment && (
                      <button type="button" className="btn-outline-small" onClick={() => deletePayment(r.payment)}>
                        Supprimer
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="comp-cards">
        {statement.map((r) => (
          <div key={r.key} className="comp-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{r.label}</strong>
              <span style={{ whiteSpace: "nowrap", color: r.amount > 0 ? "#047857" : r.amount < 0 ? "#b91c1c" : undefined }}>
                {r.amount === null ? "" : `${r.amount > 0 ? "+" : "−"} ${formatCurrency(Math.abs(r.amount))}`}
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
              {r.date ? formatDate(r.date) : "—"}
              {r.link ? ` · ${r.link}` : ""} · solde {formatCurrency(r.balance)}
            </div>
            {canWrite && r.payment && (
              <button type="button" className="btn-outline-small" style={{ marginTop: 6 }} onClick={() => deletePayment(r.payment)}>
                Supprimer
              </button>
            )}
          </div>
        ))}
      </div>

      {agent && (
        <>
          <h3 style={{ margin: "22px 0 8px" }}>Factures</h3>
          {invoices.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>Aucune facture déposée.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {invoices.map((i) => {
                const status = invoiceStatus(i, payments);
                return (
                  <div key={i.id} className="comp-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <strong>N° {i.number}</strong> du {formatDate(i.issued_at)} · {formatCurrency(i.amount_ttc)} TTC
                      {status === "partial" && (
                        <span style={{ fontSize: "0.8rem", color: "#6b7280" }}> · payé {formatCurrency(invoicePaidAmount(i, payments))}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <InvoiceBadge status={status} />
                      {i.file_path && (
                        <button type="button" className="btn-outline-small" onClick={() => download(i)}>
                          Télécharger
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {form === "salary" && <SalaryForm userId={userId} formatCurrency={formatCurrency} onCancel={() => setForm(null)} onDone={done} />}
      {form === "payment" && (
        <PaymentForm
          userId={userId}
          invoices={invoices}
          payments={payments}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          onCancel={() => setForm(null)}
          onDone={done}
        />
      )}
      {form === "invoice" && (
        <InvoiceForm userId={userId} settings={settings} formatCurrency={formatCurrency} onCancel={() => setForm(null)} onDone={done} />
      )}
    </>
  );
}

export default function CompensationPage({
  userId,
  isAdmin,
  isManager,
  profiles,
  profileLabel,
  transactions,
  formatCurrency,
  formatDate,
}) {
  const [data, setData] = useState({ settings: [], balances: [], entries: [], payments: [], invoices: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [settingsTarget, setSettingsTarget] = useState(null);
  const seesOthers = isAdmin || isManager;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [settings, balances, entries, payments, invoices] = await Promise.all([
      supabase.rpc("compensation_settings"),
      supabase.from("compensation_balances").select("*"),
      fetchAllRows(() => supabase.from("commission_entries").select("*").order("earned_at").order("id")),
      fetchAllRows(() => supabase.from("payments").select("*").order("paid_at").order("id")),
      fetchAllRows(() => supabase.from("invoices").select("*").order("issued_at", { ascending: false }).order("id")),
    ]);
    const err = [settings, balances, entries, payments, invoices].find((r) => r.error)?.error;
    if (err) setLoadError("Chargement de la rémunération impossible : " + err.message);
    setData({
      settings: settings.data || [],
      balances: balances.data || [],
      entries: entries.data || [],
      payments: payments.data || [],
      invoices: invoices.data || [],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byUser = (list, id) => list.filter((x) => x.user_id === id);
  const settingsOf = (id) => data.settings.find((s) => s.user_id === id) || null;
  const balanceOf = (id) => data.balances.find((b) => b.user_id === id) || null;
  // En PROD, un manager ne lit pas les profils de son équipe : nom et statut viennent des réglages
  const labelOf = (id) => {
    const fromProfiles = profileLabel(id);
    if (fromProfiles) return fromProfiles;
    const s = settingsOf(id);
    return [s?.first_name, s?.last_name].filter(Boolean).join(" ").trim() || s?.email || "";
  };
  const year = new Date().getFullYear();

  const rows = useMemo(() => {
    const profileOf = new Map((profiles || []).map((p) => [p.id, p]));
    const isActive = (s) => (profileOf.get(s.user_id)?.is_active ?? s.is_active) !== false;
    return data.settings
      .filter((s) => isActive(s) || data.entries.some((e) => e.user_id === s.user_id))
      .map((s) => ({
        id: s.user_id,
        label: labelOf(s.user_id) || "—",
        settings: s,
        balance: Number(balanceOf(s.user_id)?.balance ?? 0),
        projection: projectedCompensation(transactions, s.user_id, s),
        earned: earnedInYear(byUser(data.entries, s.user_id), year),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, profiles, transactions]);

  const detailId = seesOthers ? selectedId : userId;
  const settingsModal = (
    <CompensationSettingsModal
      target={settingsTarget}
      onCancel={() => setSettingsTarget(null)}
      onSaved={() => {
        setSettingsTarget(null);
        load();
      }}
    />
  );

  const styles = (
    <style>{`
      .comp-cards { display: none; }
      .comp-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 12px; font-size: 0.88rem; }
      @media (max-width: 1023px) {
        .comp-table-wrap { display: none; }
        .comp-cards { display: flex; flex-direction: column; gap: 8px; }
      }
    `}</style>
  );

  if (loading && data.settings.length === 0) return <p>Chargement…</p>;

  if (detailId) {
    return (
      <>
        {styles}
        {loadError && <p className="error-text">{loadError}</p>}
        <UserDetail
          userId={detailId}
          label={seesOthers ? labelOf(detailId) : ""}
          settings={settingsOf(detailId)}
          balanceRow={balanceOf(detailId)}
          entries={byUser(data.entries, detailId)}
          payments={byUser(data.payments, detailId)}
          invoices={byUser(data.invoices, detailId)}
          transactions={transactions}
          canWrite={isAdmin}
          canUploadInvoice={isAdmin || detailId === userId}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          onBack={seesOthers ? () => setSelectedId(null) : null}
          onEditSettings={() =>
            setSettingsTarget({ userId: detailId, label: labelOf(detailId), settings: settingsOf(detailId) })
          }
          onChanged={load}
        />
        {settingsModal}
      </>
    );
  }

  return (
    <>
      {styles}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 className="dash-page-title" style={{ margin: 0 }}>Rémunération</h2>
        <button type="button" className="btn-outline" onClick={load} disabled={loading}>
          Actualiser
        </button>
      </div>
      {loadError && <p className="error-text">{loadError}</p>}
      {!isAdmin && <p style={{ color: "#6b7280", fontSize: "0.88rem" }}>Lecture seule : votre équipe.</p>}

      <div className="comp-table-wrap" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={head}>Commercial</th>
              <th style={head}>Type</th>
              <th style={{ ...head, ...num }}>Solde dû</th>
              <th style={{ ...head, ...num }}>À venir (projection)</th>
              <th style={{ ...head, ...num }}>Acquis {year}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setSelectedId(r.id)} style={{ cursor: "pointer" }}>
                <td style={cell}>
                  <button type="button" className="link-button" onClick={() => setSelectedId(r.id)}>
                    {r.label}
                  </button>
                </td>
                <td style={cell}>{r.settings.compensation_type ? COMPENSATION_TYPES[r.settings.compensation_type] : "À renseigner"}</td>
                <td style={{ ...cell, ...num, fontWeight: 600 }}>{formatCurrency(r.balance)}</td>
                <td style={{ ...cell, ...num }}>
                  {formatCurrency(r.projection.amount_due)}
                  {r.projection.incomplete ? " *" : ""}
                </td>
                <td style={{ ...cell, ...num }}>{formatCurrency(r.earned)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="comp-cards">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            className="comp-card"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => setSelectedId(r.id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{r.label}</strong>
              <strong>{formatCurrency(r.balance)}</strong>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
              {r.settings.compensation_type ? COMPENSATION_TYPES[r.settings.compensation_type] : "Type à renseigner"} · à venir{" "}
              {formatCurrency(r.projection.amount_due)} · acquis {year} {formatCurrency(r.earned)}
            </div>
          </button>
        ))}
      </div>
      {rows.some((r) => r.projection.incomplete) && (
        <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>* Projection incomplète : type ou taux non renseigné.</p>
      )}
      {settingsModal}
    </>
  );
}
