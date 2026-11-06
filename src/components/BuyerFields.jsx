// src/components/BuyerFields.jsx
// Bloc acquéreur unique : « Passer sous promesse » et « Nouvelle vente ».
// Prénom et Nom obligatoires ; Anniversaire, Origine et Contexte repliés sous « Plus d'infos ».
// Dès 2 caractères saisis, les fiches visibles correspondantes sont proposées (évite les doublons) ;
// une fiche choisie remplace la saisie libre.
import React, { useMemo, useState } from "react";
import { matchingClients } from "../lib/transactionDraft";
import { emailError, formatPhone, formatPhoneInput } from "../lib/contact";

const CATEGORY_LABELS = { seller: "Vendeur", buyer: "Acquéreur", after: "Après-vente" };
const clientLabel = (c) => [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || c?.email || "(sans nom)";
const clientMeta = (c, profileLabel) =>
  [
    CATEGORY_LABELS[c.category] || c.category,
    c.deal_stage === "sous_promesse" ? "sous promesse" : null,
    c.status === "closed" ? "clôturée" : null,
    formatPhone(c.phone),
    profileLabel ? profileLabel(c.owner_id) : null,
  ]
    .filter(Boolean)
    .join(" · ");

const cardStyle = {
  marginTop: 6,
  border: "1px solid #c7d2fe",
  background: "#eef2ff",
  borderRadius: 10,
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

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
const row = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 };

export default function BuyerFields({
  value,
  onChange,
  required = true,
  clients, // fiches visibles ; absent → pas de suggestion
  selectedClient, // fiche choisie, ou null
  onSelectClient, // (fiche | null) => void
  profileLabel,
  excludeIds = [],
}) {
  const [showMore, setShowMore] = useState(
    Boolean(value?.client_birthday || value?.contact_origin || value?.context)
  );
  const set = (k) => (e) => onChange({ ...value, [k]: k === "phone" ? formatPhoneInput(e.target.value) : e.target.value });
  const emailMsg = emailError(value.email);

  const suggestions = useMemo(
    () => (clients && onSelectClient && !selectedClient ? matchingClients(clients, value, { excludeIds }) : []),
    [clients, onSelectClient, selectedClient, value, excludeIds]
  );

  if (selectedClient) {
    return (
      <div style={{ fontWeight: 400 }}>
        <div style={cardStyle}>
          <span>
            <strong>{clientLabel(selectedClient)}</strong>
            <span style={{ fontSize: "0.8rem", color: "#4b5563" }}> · {clientMeta(selectedClient, profileLabel)}</span>
          </span>
          {onSelectClient && (
            <button type="button" className="btn-outline-small" onClick={() => onSelectClient(null)}>
              Changer
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontWeight: 400 }}>
      <div style={row}>
        <input
          type="text"
          aria-label="Prénom de l'acquéreur"
          placeholder={required ? "Prénom *" : "Prénom"}
          style={fieldStyle}
          value={value.first_name}
          onChange={set("first_name")}
        />
        <input
          type="text"
          aria-label="Nom de l'acquéreur"
          placeholder={required ? "Nom *" : "Nom"}
          style={fieldStyle}
          value={value.last_name}
          onChange={set("last_name")}
        />
      </div>
      <div style={row}>
        <input type="tel" inputMode="tel" placeholder="Téléphone" style={fieldStyle} value={value.phone} onChange={set("phone")} />
        <input
          type="email"
          placeholder="Email"
          style={fieldStyle}
          value={value.email}
          onChange={set("email")}
          aria-invalid={!!emailMsg}
        />
      </div>
      {emailMsg && <div className="field-error" style={{ textAlign: "right" }}>{emailMsg}</div>}

      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="Fiches existantes correspondantes"
          style={{ marginTop: 6, border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", overflow: "hidden" }}
        >
          <div style={{ fontSize: "0.78rem", color: "#6b7280", padding: "6px 10px", background: "#f9fafb" }}>
            Fiche déjà existante ? Choisissez-la pour éviter un doublon.
          </div>
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onSelectClient(c)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 10px",
                border: "none",
                borderTop: "1px solid #f1f5f9",
                background: "#fff",
                cursor: "pointer",
                fontSize: "0.86rem",
              }}
            >
              <strong>{clientLabel(c)}</strong>
              <span style={{ color: "#6b7280" }}> · {clientMeta(c, profileLabel)}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn-outline-small"
        style={{ marginTop: 8 }}
        onClick={() => setShowMore((v) => !v)}
      >
        {showMore ? "▾" : "▸"} Plus d'infos
      </button>

      {showMore && (
        <div style={{ marginTop: 6 }}>
          <div style={row}>
            <label style={{ fontSize: "0.82rem" }}>
              Anniversaire
              <input type="date" style={fieldStyle} value={value.client_birthday} onChange={set("client_birthday")} />
            </label>
            <label style={{ fontSize: "0.82rem" }}>
              Origine du contact
              <input
                type="text"
                placeholder="vitrine, recommandation, portail…"
                style={fieldStyle}
                value={value.contact_origin}
                onChange={set("contact_origin")}
              />
            </label>
          </div>
          <label style={{ fontSize: "0.82rem", display: "block", marginTop: 6 }}>
            Contexte
            <textarea
              rows={2}
              placeholder="travaux, emménagement, financement…"
              style={{ ...fieldStyle, resize: "vertical" }}
              value={value.context}
              onChange={set("context")}
            />
          </label>
        </div>
      )}
    </div>
  );
}
