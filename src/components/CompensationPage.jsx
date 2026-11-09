// src/components/CompensationPage.jsx
// Onglet « Rémunération ». Commercial : son solde, sa projection, son relevé, ses factures.
// Admin : synthèse de tous les commerciaux → relevé détaillé avec la saisie (salaire, paiement, facture,
// réglages). Manager : synthèse et relevés de son équipe, en lecture seule. Calculs : src/lib/compensation.js.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { fetchAllRows } from "../lib/fetchAll";
import { todayStr } from "../lib/dates";
import { parseDecimal } from "../lib/transactionDraft";
import { isValidated, round2, validationLabel } from "../lib/transactions";
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
import { PageHeader } from "./AppShell";
import { Alert, Badge, Button, EmptyState, Field, Input, ListRows, Modal, Select, SkeletonList, StatCard, Table, Td, Th, Tr, cx } from "./ui";

const INVOICE_TONES = { unpaid: "danger", partial: "warning", paid: "success" };
const InvoiceBadge = ({ status }) => <Badge tone={INVOICE_TONES[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>;

// Commission : validation de sa transaction, à titre d'information (elle ne change aucun montant)
const TxValidationBadge = ({ tx }) => {
  const label = tx ? validationLabel(tx) : null;
  return label ? <Badge tone={isValidated(tx) ? "success" : "warning"}>{label}</Badge> : null;
};

const safeFileName = (name) =>
  String(name || "facture")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"];

const signedAmount = (amount, formatCurrency) =>
  amount === null ? "" : `${amount > 0 ? "+" : "−"} ${formatCurrency(Math.abs(amount))}`;
const amountColor = (amount) => (amount > 0 ? "text-success" : amount < 0 ? "text-danger" : "");

// Fenêtre de saisie générique (salaire, paiement, facture)
function EntryModal({ id, title, children, error, busy, onCancel, onSubmit, submitLabel }) {
  return (
    <Modal
      open
      size="md"
      busy={busy}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" form={id} loading={busy}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={id} onSubmit={onSubmit} className="space-y-4" noValidate>
        {children}
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
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
    <EntryModal id="salary-form" title="Ajouter un salaire" error={error} busy={busy} onCancel={onCancel} onSubmit={submit} submitLabel="Enregistrer">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Mois">
          <Input type="month" value={form.month} onChange={set("month")} />
        </Field>
        <Field label="Salaire brut total (€)">
          <Input inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </Field>
        <Field label="dont fixe (€)">
          <Input inputMode="decimal" placeholder="0" value={form.fixed} onChange={set("fixed")} />
        </Field>
        <Field label="dont prime (€)">
          <Input inputMode="decimal" placeholder="0" value={form.bonus} onChange={set("bonus")} />
        </Field>
      </div>
      <p className="text-sm text-ink-soft">
        Part imputée sur le solde : <strong className="tabular text-ink">{formatCurrency(Math.max(0, imputed))}</strong>
        <span className="text-ink-muted"> (le fixe et les primes ne diminuent pas le solde)</span>
      </p>
      <Field label="Note">
        <Input value={form.note} onChange={set("note")} />
      </Field>
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
    <EntryModal id="payment-form" title="Enregistrer un paiement" error={error} busy={busy} onCancel={onCancel} onSubmit={submit} submitLabel="Enregistrer">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date">
          <Input type="date" value={form.paid_at} onChange={set("paid_at")} />
        </Field>
        <Field label="Montant viré (€)">
          <Input inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </Field>
      </div>
      <Field label="Facture concernée (facultatif)">
        <Select value={form.invoice_id} onChange={pickInvoice}>
          <option value="">— Aucune —</option>
          {invoices.map((i) => (
            <option key={i.id} value={i.id}>
              N° {i.number} du {formatDate(i.issued_at)} · {formatCurrency(i.amount_ttc)} · {INVOICE_STATUS_LABELS[invoiceStatus(i, payments)]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note">
        <Input value={form.note} onChange={set("note")} />
      </Field>
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
    <EntryModal id="invoice-form" title="Déposer une facture" error={error} busy={busy} onCancel={onCancel} onSubmit={submit} submitLabel="Déposer">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="N° de facture">
          <Input value={form.number} onChange={set("number")} />
        </Field>
        <Field label="Date">
          <Input type="date" value={form.issued_at} onChange={set("issued_at")} />
        </Field>
        <Field label="Montant HT (€)">
          <Input inputMode="decimal" value={form.amount_ht} onChange={set("amount_ht")} />
        </Field>
        <Field label="TVA (%)">
          <Input inputMode="decimal" value={form.vat_rate} onChange={set("vat_rate")} />
        </Field>
      </div>
      <p className="text-sm text-ink-soft">
        Montant TTC : <strong className="tabular text-ink">{formatCurrency(round2((ht || 0) * (1 + vat / 100)))}</strong>
      </p>
      <Field label="Fichier" hint="PDF ou image, 10 Mo maximum.">
        <Input
          type="file"
          accept="application/pdf,image/*"
          className="file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </Field>
      <Field label="Note">
        <Input value={form.note} onChange={set("note")} />
      </Field>
    </EntryModal>
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
  const txOf = (id) => (id ? (transactions || []).find((x) => x.id === id) || null : null);
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
      <PageHeader
        back={onBack ? { onClick: onBack, label: "Tous les commerciaux" } : null}
        title={`Rémunération${label ? ` · ${label}` : ""}`}
        subtitle={
          <>
            {type ? COMPENSATION_TYPES[type] : "Type de rémunération non renseigné"}
            {type && ` · entrée ${settings.rate_entree ?? "—"} % · sortie ${settings.rate_sortie ?? "—"} %`}
          </>
        }
        actions={
          <>
            {canWrite && type === "salarie" && <Button onClick={() => setForm("salary")}>Ajouter un salaire</Button>}
            {canWrite && agent && <Button onClick={() => setForm("payment")}>Enregistrer un paiement</Button>}
            {canUploadInvoice && agent && (
              <Button variant={canWrite ? "secondary" : "primary"} onClick={() => setForm("invoice")}>
                Déposer une facture
              </Button>
            )}
            {canWrite && (
              <Button variant="secondary" onClick={onEditSettings}>
                Réglages et solde d'ouverture
              </Button>
            )}
          </>
        }
      />

      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Solde dû par l'agence"
          value={formatCurrency(balance)}
          sub={
            settings?.opening_balance_date
              ? `Depuis le ${formatDate(settings.opening_balance_date)} (solde d'ouverture ${formatCurrency(settings.opening_balance || 0)}).`
              : "Commissions dues − salaires et paiements imputés."
          }
        />
        <StatCard
          label={projectionLabel(type)}
          value={formatCurrency(projection.amount_due)}
          sub={
            projection.incomplete
              ? "Projection incomplète : réglages de rémunération à renseigner."
              : `Projection sur ${projection.count} promesse(s) en cours, aux taux actuels${type === "agent_tva" ? ", TVA comprise" : ""}.`
          }
        />
        <StatCard
          label={`Acquis en ${year}`}
          value={formatCurrency(earnedInYear(entries, year))}
          sub={type === "salarie" ? "Salaire variable brut sur les ventes actées." : `Commissions dues sur les ventes actées${type === "agent_tva" ? " (TTC)" : ""}.`}
        />
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold text-ink">Relevé</h2>
      <Table className="hidden lg:block">
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Libellé</Th>
            <Th>Transaction / facture</Th>
            <Th align="right">+ / −</Th>
            <Th align="right">Solde</Th>
            {canWrite && <Th />}
          </tr>
        </thead>
        <tbody>
          {statement.map((r) => (
            <Tr key={r.key}>
              <Td className="whitespace-nowrap">{r.date ? formatDate(r.date) : "—"}</Td>
              <Td>{r.label}</Td>
              <Td>
                <span className="inline-flex flex-wrap items-center gap-2">
                  {r.link || "—"}
                  <TxValidationBadge tx={txOf(r.transactionId)} />
                </span>
              </Td>
              <Td align="right" className={cx("whitespace-nowrap", amountColor(r.amount))}>
                {signedAmount(r.amount, formatCurrency)}
              </Td>
              <Td align="right" className="font-semibold whitespace-nowrap">
                {formatCurrency(r.balance)}
              </Td>
              {canWrite && (
                <Td align="right">
                  {r.payment && (
                    <Button variant="quiet" size="xs" onClick={() => deletePayment(r.payment)}>
                      Supprimer
                    </Button>
                  )}
                </Td>
              )}
            </Tr>
          ))}
        </tbody>
      </Table>
      <ListRows className="lg:hidden">
        {statement.map((r) => (
          <li key={r.key} className="space-y-1 px-4 py-3 text-sm">
            <div className="flex justify-between gap-3">
              <strong className="text-ink">{r.label}</strong>
              <span className={cx("tabular whitespace-nowrap", amountColor(r.amount))}>{signedAmount(r.amount, formatCurrency)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-ink-muted">
              <span>
                {r.date ? formatDate(r.date) : "—"}
                {r.link ? ` · ${r.link}` : ""} · solde {formatCurrency(r.balance)}
              </span>
              <TxValidationBadge tx={txOf(r.transactionId)} />
            </div>
            {canWrite && r.payment && (
              <Button variant="quiet" size="xs" onClick={() => deletePayment(r.payment)}>
                Supprimer
              </Button>
            )}
          </li>
        ))}
      </ListRows>

      {agent && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-ink">Factures</h2>
          {invoices.length === 0 ? (
            <p className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-5 text-ink-muted">Aucune facture déposée.</p>
          ) : (
            <ListRows>
              {invoices.map((i) => {
                const status = invoiceStatus(i, payments);
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <div className="tabular min-w-0 text-sm">
                      <strong className="text-ink">N° {i.number}</strong> du {formatDate(i.issued_at)} · {formatCurrency(i.amount_ttc)} TTC
                      {status === "partial" && <span className="text-ink-muted"> · payé {formatCurrency(invoicePaidAmount(i, payments))}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <InvoiceBadge status={status} />
                      {i.file_path && (
                        <Button variant="secondary" size="xs" onClick={() => download(i)}>
                          Télécharger
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ListRows>
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

  if (loading && data.settings.length === 0) {
    return (
      <>
        <PageHeader title="Rémunération" />
        <SkeletonList rows={4} label="Chargement de la rémunération" />
      </>
    );
  }

  if (detailId) {
    return (
      <>
        {loadError && <Alert className="mb-4">{loadError}</Alert>}
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
          onEditSettings={() => setSettingsTarget({ userId: detailId, label: labelOf(detailId), settings: settingsOf(detailId) })}
          onChanged={load}
        />
        {settingsModal}
      </>
    );
  }

  const typeLabel = (r) => (r.settings.compensation_type ? COMPENSATION_TYPES[r.settings.compensation_type] : "À renseigner");

  return (
    <>
      <PageHeader
        title="Rémunération"
        subtitle={isAdmin ? "Soldes, projections et relevés de chaque commercial." : "Lecture seule : votre équipe."}
        actions={
          <Button variant="secondary" onClick={load} disabled={loading}>
            Actualiser
          </Button>
        }
      />
      {loadError && <Alert className="mb-4">{loadError}</Alert>}

      {rows.length === 0 ? (
        <EmptyState title="Aucun commercial" text="Les réglages de rémunération se font dans Paramètres → Utilisateurs." />
      ) : (
        <>
          <Table className="hidden lg:block">
            <thead>
              <tr>
                <Th>Commercial</Th>
                <Th>Type</Th>
                <Th align="right">Solde dû</Th>
                <Th align="right">À venir (projection)</Th>
                <Th align="right">Acquis {year}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id} onClick={() => setSelectedId(r.id)}>
                  <Td className="font-semibold">{r.label}</Td>
                  <Td>{typeLabel(r)}</Td>
                  <Td align="right" className="font-semibold">
                    {formatCurrency(r.balance)}
                  </Td>
                  <Td align="right">
                    {formatCurrency(r.projection.amount_due)}
                    {r.projection.incomplete ? " *" : ""}
                  </Td>
                  <Td align="right">{formatCurrency(r.earned)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <ListRows className="lg:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className="block w-full space-y-1 px-4 py-4 text-left text-sm transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="flex justify-between gap-3">
                    <strong className="text-ink">{r.label}</strong>
                    <strong className="tabular text-ink">{formatCurrency(r.balance)}</strong>
                  </span>
                  <span className="block text-ink-muted">
                    {typeLabel(r)} · à venir {formatCurrency(r.projection.amount_due)} · acquis {year} {formatCurrency(r.earned)}
                  </span>
                </button>
              </li>
            ))}
          </ListRows>
          {rows.some((r) => r.projection.incomplete) && (
            <p className="mt-2 text-sm text-ink-muted">* Projection incomplète : type ou taux non renseigné.</p>
          )}
        </>
      )}
      {settingsModal}
    </>
  );
}
