// src/components/CompensationSettingsModal.jsx
// Réglages de rémunération d'un commercial (admin) : type, taux entrée / sortie, TVA, solde d'ouverture.
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { COMPENSATION_TYPES } from "../lib/compensation";
import { parseDecimal } from "../lib/transactionDraft";

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
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 12 };
const str = (v) => (v === null || v === undefined ? "" : String(v));

export default function CompensationSettingsModal({ target, onCancel, onSaved }) {
  // target = { userId, label, settings } ou null
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = target?.settings || {};
    setForm(
      target
        ? {
            compensation_type: str(s.compensation_type),
            rate_entree: str(s.rate_entree),
            rate_sortie: str(s.rate_sortie),
            agent_vat_rate: str(s.agent_vat_rate ?? 20),
            opening_balance: str(s.opening_balance ?? 0),
            opening_balance_date: str(s.opening_balance_date),
            reprice: false,
          }
        : null
    );
    setBusy(false);
    setError("");
  }, [target]);

  if (!target || !form) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const rates = [parseDecimal(form.rate_entree), parseDecimal(form.rate_sortie)];
    if (form.compensation_type && rates.some((r) => r === null || r < 0 || r > 100)) {
      setError("Les taux entrée et sortie sont obligatoires (entre 0 et 100 %).");
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await supabase.rpc("save_compensation_settings", {
      p_user_id: target.userId,
      p_compensation_type: form.compensation_type || null,
      p_rate_entree: rates[0],
      p_rate_sortie: rates[1],
      p_agent_vat_rate: parseDecimal(form.agent_vat_rate) ?? 20,
      p_opening_balance: parseDecimal(form.opening_balance) ?? 0,
      p_opening_balance_date: form.opening_balance_date || null,
      p_reprice: Boolean(form.reprice),
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2>Rémunération · {target.label}</h2>
        <p className="admin-modal-sub">
          Les taux s'appliquent à la part de base nette HT du commercial (honoraires HT − déductions, × sa part).
          Changer un taux ne modifie pas les commissions déjà acquises, sauf recalcul demandé ci-dessous.
        </p>
        <form onSubmit={submit}>
          <label style={labelStyle}>
            Type
            <select style={fieldStyle} value={form.compensation_type} onChange={set("compensation_type")}>
              <option value="">— Non renseigné (aucune commission calculée) —</option>
              {Object.entries(COMPENSATION_TYPES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div style={grid}>
            <label style={labelStyle}>
              Taux entrée (%)
              <input style={fieldStyle} inputMode="decimal" value={form.rate_entree} onChange={set("rate_entree")} />
            </label>
            <label style={labelStyle}>
              Taux sortie (%)
              <input style={fieldStyle} inputMode="decimal" value={form.rate_sortie} onChange={set("rate_sortie")} />
            </label>
            {form.compensation_type === "agent_tva" && (
              <label style={labelStyle}>
                TVA de l'agent (%)
                <input style={fieldStyle} inputMode="decimal" value={form.agent_vat_rate} onChange={set("agent_vat_rate")} />
              </label>
            )}
          </div>
          <div style={grid}>
            <label style={labelStyle}>
              Solde d'ouverture (€{form.compensation_type === "agent_tva" ? " TTC" : ""})
              <input style={fieldStyle} inputMode="decimal" value={form.opening_balance} onChange={set("opening_balance")} />
            </label>
            <label style={labelStyle}>
              Date d'ouverture
              <input type="date" style={fieldStyle} value={form.opening_balance_date} onChange={set("opening_balance_date")} />
            </label>
          </div>
          <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "6px 0 0" }}>
            Solde dû par l'agence à cette date. Les ventes actées avant la date d'ouverture n'ouvrent pas de commission
            (elles sont comprises dans ce solde).
          </p>
          <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 12, fontSize: "0.88rem" }}>
            <input type="checkbox" checked={form.reprice} onChange={set("reprice")} />
            Recalculer aussi les commissions déjà acquises avec ces taux
          </label>
          <p className="admin-modal-sub" style={{ margin: "4px 0 0 22px" }}>
            Par défaut, les ventes passées gardent les taux en vigueur au moment de l’acte. Cochez uniquement pour
            corriger une erreur de saisie.
          </p>
          {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
