// src/components/PromptModal.jsx
// Petite fenêtre à un seul champ : date (« Acte signé ») ou motif (« Promesse annulée », réouverture).
import React, { useEffect, useState } from "react";
import { Alert, Button, Field, Input, Modal, Textarea } from "./ui";

export default function PromptModal({ prompt, onCancel }) {
  // prompt = { title, text?, warning?, label, type: "date" | "textarea", initialValue?, confirmLabel,
  //            danger?, onConfirm(value) }
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(prompt?.initialValue || "");
    setBusy(false);
    setError("");
  }, [prompt]);

  const submit = async (e) => {
    e.preventDefault();
    if (!String(value).trim()) {
      setError(`${prompt.label} : obligatoire.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await prompt.onConfirm(String(value).trim());
    } catch (err) {
      setError(err?.message || "Erreur (voir console).");
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!prompt}
      size="sm"
      busy={busy}
      title={prompt?.title}
      description={prompt?.text}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" form="prompt-form" variant={prompt?.danger ? "danger" : "primary"} loading={busy}>
            {prompt?.confirmLabel}
          </Button>
        </>
      }
    >
      {prompt && (
        <form id="prompt-form" onSubmit={submit} className="space-y-4" noValidate>
          {prompt.warning && (
            <Alert tone="warning" title="Attention">
              {prompt.warning}
            </Alert>
          )}
          <Field label={prompt.label} required error={error}>
            {prompt.type === "textarea" ? (
              <Textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
            ) : (
              <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
            )}
          </Field>
        </form>
      )}
    </Modal>
  );
}
