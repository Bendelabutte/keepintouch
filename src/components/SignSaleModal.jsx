// src/components/SignSaleModal.jsx
// « Acte signé » / « Marquer comme vendue » : date de l'acte, prix et honoraires TTC de la promesse
// pré-remplis. Le commercial confirme en un clic ou corrige ; tout part dans le même appel.
import React, { useEffect, useState } from "react";
import { signSaleForm, signSaleParams } from "../lib/transactionDraft";
import { Alert, Button, Field, Input, Modal } from "./ui";

export default function SignSaleModal({ tx, today, onCancel, onConfirm }) {
  const [form, setForm] = useState(() => signSaleForm(tx, today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(signSaleForm(tx, today));
    setBusy(false);
    setError("");
  }, [tx, today]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const { params, error: err } = signSaleParams(form);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onConfirm(tx, params);
    } catch (ex) {
      setError(ex?.message || "Enregistrement de l'acte impossible.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!tx}
      size="sm"
      busy={busy}
      title="Acte signé"
      description={
        tx?.buyer_client_id
          ? "Vente définitive chez le notaire. La fiche vendeur passe « Vendu » et la fiche de l'acquéreur devient sa fiche après-vente."
          : "Vente définitive chez le notaire. La fiche vendeur passe « Vendu » et la fiche après-vente de l'acquéreur est créée automatiquement."
      }
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" form="sign-sale-form" loading={busy}>
            Confirmer l'acte
          </Button>
        </>
      }
    >
      <form id="sign-sale-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Date de l'acte" required>
          <Input type="date" value={form.date} onChange={set("date")} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Prix de vente (€)" hint="Celui de la promesse ; corrigez s'il a changé.">
            <Input inputMode="decimal" value={form.price} onChange={set("price")} />
          </Field>
          <Field label="Honoraires TTC (€)" required hint="Ceux de la promesse ; corrigez s'ils ont changé.">
            <Input inputMode="decimal" value={form.fees_ttc} onChange={set("fees_ttc")} />
          </Field>
        </div>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
