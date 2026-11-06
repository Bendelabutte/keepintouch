// src/components/MandateModal.jsx
// « Passer sous mandat » : prix de mise en vente, honoraires prévus TTC et type de mandat,
// pré-remplis si déjà connus, tous facultatifs.
import React, { useEffect, useState } from "react";
import { MANDATE_TYPES, mandateFormFromClient, mandatePayload } from "../lib/stages";
import { Alert, Button, Field, Input, Modal, Select } from "./ui";

export default function MandateModal({ client, onCancel, onConfirm }) {
  const [form, setForm] = useState(() => mandateFormFromClient(client));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(mandateFormFromClient(client));
    setError("");
    setBusy(false);
  }, [client]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const name = [client?.first_name, client?.last_name].filter(Boolean).join(" ");

  const submit = async (e) => {
    e.preventDefault();
    const { payload, error: err } = mandatePayload(form);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onConfirm(client, payload);
    } catch (ex) {
      setError(ex?.message || "Erreur lors du passage sous mandat.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!client}
      size="sm"
      busy={busy}
      title="Passer sous mandat"
      description={`${name ? name + " · " : ""}La prochaine relance est recalculée automatiquement.`}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" form="mandate-form" loading={busy}>
            Confirmer le mandat
          </Button>
        </>
      }
    >
      <form id="mandate-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Prix de mise en vente (€)" hint="Facultatif.">
          <Input inputMode="decimal" value={form.listing_price} onChange={set("listing_price")} />
        </Field>
        <Field label="Honoraires prévus TTC (€)" hint="Facultatif. Repris dans le formulaire de promesse.">
          <Input inputMode="decimal" value={form.planned_fees_ttc} onChange={set("planned_fees_ttc")} />
        </Field>
        <Field label="Type de mandat">
          <Select value={form.mandate_type} onChange={set("mandate_type")}>
            <option value="">Non précisé</option>
            {Object.entries(MANDATE_TYPES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
