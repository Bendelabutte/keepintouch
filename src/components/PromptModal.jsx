// src/components/PromptModal.jsx
// Petite fenêtre à un seul champ : date (« Acte signé ») ou motif (« Promesse annulée »).
import React, { useEffect, useState } from "react";

export default function PromptModal({ prompt, onCancel }) {
  // prompt = { title, text?, label, type: "date" | "textarea", initialValue?, confirmLabel, onConfirm(value) }
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(prompt?.initialValue || "");
    setBusy(false);
    setError("");
  }, [prompt]);

  if (!prompt) return null;

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

  const fieldStyle = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid #d1d5db",
    borderRadius: 10,
    fontSize: "0.95rem",
    boxSizing: "border-box",
    marginTop: 6,
  };

  return (
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2>{prompt.title}</h2>
        {prompt.text && <p className="admin-modal-sub">{prompt.text}</p>}
        <form onSubmit={submit}>
          <label style={{ display: "block", marginTop: 12, fontSize: "0.88rem", fontWeight: 600 }}>
            {prompt.label} *
            {prompt.type === "textarea" ? (
              <textarea rows={3} style={{ ...fieldStyle, resize: "vertical" }} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            ) : (
              <input type="date" style={fieldStyle} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            )}
          </label>
          {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "…" : prompt.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
