// src/components/CompensationSettingsModal.jsx
// Réglages de rémunération d'un commercial (admin) : type, taux entrée / sortie, TVA, solde d'ouverture,
// et mise en service (« Visible par le commercial », possible seulement si les réglages sont complets).
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { COMPENSATION_TYPES } from "../lib/compensation";
import {
  DEFAULT_OPENING_DATE,
  compensationMissingFields,
  compensationSettingsComplete,
  openingDateMissing,
} from "../lib/modules";
import { parseDecimal } from "../lib/transactionDraft";
import { Alert, Button, Checkbox, Field, Input, Modal, Select } from "./ui";

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
            // Jamais de type ni de taux sans date d'ouverture : proposée par défaut
            opening_balance_date: str(s.opening_balance_date) || DEFAULT_OPENING_DATE,
            reprice: false,
            visible: s.compensation_visible === true,
          }
        : null
    );
    setBusy(false);
    setError("");
  }, [target]);

  if (!target || !form) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const dateMissing = openingDateMissing(form);

  const submit = async (e) => {
    e.preventDefault();
    const rates = [parseDecimal(form.rate_entree), parseDecimal(form.rate_sortie)];
    if (form.compensation_type && rates.some((r) => r === null || r < 0 || r > 100)) {
      setError("Les taux entrée et sortie sont obligatoires (entre 0 et 100 %).");
      return;
    }
    if (dateMissing) {
      setError("La date d'ouverture est obligatoire dès qu'un type ou un taux est renseigné.");
      return;
    }
    setBusy(true);
    setError("");
    const saveSettings = () =>
      supabase.rpc("save_compensation_settings", {
        p_user_id: target.userId,
        p_compensation_type: form.compensation_type || null,
        p_rate_entree: rates[0],
        p_rate_sortie: rates[1],
        p_agent_vat_rate: parseDecimal(form.agent_vat_rate) ?? 20,
        p_opening_balance: parseDecimal(form.opening_balance) ?? 0,
        p_opening_balance_date: form.opening_balance_date || null,
        p_reprice: Boolean(form.reprice),
      });
    const setVisible = (visible) =>
      supabase.rpc("set_compensation_visible", { p_user_id: target.userId, p_visible: visible });

    // Fermeture : la page est masquée avant d'enregistrer les réglages ; ouverture : seulement après
    // leur enregistrement (la base refuse d'ouvrir des réglages incomplets).
    const steps = visible ? [saveSettings, () => setVisible(true)] : [() => setVisible(false), saveSettings];
    for (const step of steps) {
      const { error: err } = await step();
      if (err) {
        setBusy(false);
        setError(err.message);
        return;
      }
    }
    setBusy(false);
    onSaved();
  };

  const isTva = form.compensation_type === "agent_tva";
  const complete = compensationSettingsComplete(form);
  const missing = compensationMissingFields(form);
  // Réglages incomplets : la case est décochée d'office
  const visible = complete && Boolean(form.visible);
  return (
    <Modal
      open
      size="md"
      busy={busy}
      title={`Rémunération · ${target.label}`}
      description="Les taux s'appliquent à la part de base nette HT du commercial (honoraires HT − déductions, × sa part). Changer un taux ne modifie pas les commissions déjà acquises, sauf recalcul demandé ci-dessous."
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" form="compensation-settings-form" loading={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="compensation-settings-form" onSubmit={submit} className="space-y-4">
        <Field label="Type">
          <Select value={form.compensation_type} onChange={set("compensation_type")}>
            <option value="">— Non renseigné (aucune commission calculée) —</option>
            {Object.entries(COMPENSATION_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Taux entrée (%)">
            <Input inputMode="decimal" value={form.rate_entree} onChange={set("rate_entree")} />
          </Field>
          <Field label="Taux sortie (%)">
            <Input inputMode="decimal" value={form.rate_sortie} onChange={set("rate_sortie")} />
          </Field>
          {isTva && (
            <Field label="TVA de l'agent (%)">
              <Input inputMode="decimal" value={form.agent_vat_rate} onChange={set("agent_vat_rate")} />
            </Field>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={`Solde d'ouverture (€${isTva ? " TTC" : ""})`}>
            <Input inputMode="decimal" value={form.opening_balance} onChange={set("opening_balance")} />
          </Field>
          <Field
            label="Date d'ouverture"
            required
            error={dateMissing ? "Obligatoire dès qu'un type ou un taux est renseigné." : ""}
          >
            <Input type="date" required value={form.opening_balance_date} onChange={set("opening_balance_date")} />
          </Field>
        </div>
        <p className="text-sm text-ink-muted">
          Keepintouch calcule les commissions à partir de cette date : les ventes actées avant n'en ouvrent pas, elles sont
          réputées comprises dans le solde d'ouverture (ce que l'agence doit au commercial à cette date). Sans date, toutes
          ses ventes passées seraient comptées comme dues : c'est pourquoi elle est obligatoire. Proposée par défaut : le
          1er janvier 2027.
        </p>
        <div>
          <Checkbox
            label="Recalculer aussi les commissions déjà acquises avec ces taux"
            checked={form.reprice}
            onChange={set("reprice")}
          />
          <p className="ml-8 text-sm text-ink-muted">
            Par défaut, les ventes passées gardent les taux en vigueur au moment de l’acte. Cochez uniquement pour corriger une
            erreur de saisie.
          </p>
        </div>
        <div className="border-t border-line pt-4">
          <Checkbox label="Visible par le commercial" checked={visible} disabled={!complete} onChange={set("visible")} />
          <p className="ml-8 text-sm text-ink-muted">
            {complete
              ? "Coché : le commercial voit sa page Rémunération (solde, relevé, factures). Décoché : vous êtes seul à la voir."
              : `Pour cocher cette case, renseignez d'abord ${missing.join(", ")}.`}
          </p>
        </div>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
