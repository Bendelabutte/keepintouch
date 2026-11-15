// src/components/ClientForm.jsx
// Formulaire de fiche client, commun à la page de création (par type) et à la modification.
// Champs essentiels visibles, le reste replié sous « Plus d'infos ».
// marks : champs pré-remplis par la saisie rapide (« sur » : pastille discrète, « a_verifier » : orange).
import React, { useEffect, useState } from "react";
import AddressAutocomplete from "./AddressAutocomplete";
import { contactError, emailError, formatPhoneInput } from "../lib/contact";
import { HORIZONS, PROPERTY_KINDS } from "../lib/aiParse";
import { MANDATE_TYPES } from "../lib/stages";
import { Field, Icon, Input, Select, Textarea, cx } from "./ui";

// Champs rangés sous « Plus d'infos », par type de fiche (ouverts si l'IA les a remplis)
const MORE_FIELDS = {
  seller: ["estimation_value", "seller_kind", "project_horizon", "sale_reason", "consultant_feeling"],
  buyer: ["contact_origin", "acquisition_date", "min_surface", "bedrooms", "project_horizon", "consultant_feeling"],
  after: ["contact_origin", "context", "consultant_feeling"],
};

function Grid({ children }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

const Full = ({ children }) => <div className="sm:col-span-2">{children}</div>;

const NO_MARKS = {};

function AiBadge({ mark }) {
  if (!mark) return null;
  const check = mark === "a_verifier";
  return (
    <span
      className={cx(
        "ml-2 inline-flex items-center rounded-full px-2 py-0.5 align-middle text-xs font-semibold",
        check ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent"
      )}
    >
      {check ? "IA · à vérifier" : "IA"}
    </span>
  );
}

export default function ClientForm({ values, onChange, mode = "create", submitted = false, marks = NO_MARKS, showCategory = false, addressProposals }) {
  const [moreOpen, setMoreOpen] = useState(mode === "edit");
  const v = values || {};
  const set = (field) => (e) => onChange(field, e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e);
  const cat = v.category || "seller";
  const isSeller = cat === "seller";
  const isBuyer = cat === "buyer";
  const isAfter = cat === "after";
  const emailMsg = emailError(v.email);
  const contactMsg = submitted ? contactError(v) : "";
  const stage = v.deal_stage || "pre_mandat";

  // Libellé avec pastille IA ; contour orange pour un champ à vérifier
  const label = (field, text) => (
    <>
      {text}
      <AiBadge mark={marks[field]} />
    </>
  );
  const ring = (field) => (marks[field] === "a_verifier" ? "ring-2 ring-warning/60" : "");

  useEffect(() => {
    if ((MORE_FIELDS[cat] || []).some((f) => f in marks)) setMoreOpen(true);
  }, [marks, cat]);

  const identity = (
    <>
      <Field label={label("first_name", "Prénom")}>
        <Input
          name="first_name"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          className={ring("first_name")}
          value={v.first_name || ""}
          onChange={set("first_name")}
        />
      </Field>
      <Field label={label("last_name", "Nom")} required>
        <Input
          name="last_name"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          className={ring("last_name")}
          value={v.last_name || ""}
          onChange={set("last_name")}
        />
      </Field>
      <Field label={label("phone", "Téléphone")} error={contactMsg} hint="Téléphone ou email : au moins l’un des deux.">
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          enterKeyHint="next"
          placeholder="06 77 66 55 44"
          className={ring("phone")}
          value={v.phone || ""}
          onChange={(e) => onChange("phone", formatPhoneInput(e.target.value))}
        />
      </Field>
      <Field label={label("email", "Email")} error={emailMsg}>
        <Input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          placeholder="nom@domaine.fr"
          className={ring("email")}
          value={v.email || ""}
          onChange={set("email")}
        />
      </Field>
    </>
  );

  // addressProposals[field] : adresse reçue de la saisie rapide, à confirmer dans la liste IGN
  const address = (field, text, required = false) => (
    <Full>
      <Field label={label(field, text)} required={required}>
        <AddressAutocomplete
          name={field}
          className={ring(field)}
          value={v[field] || ""}
          placeholder="Commencez à taper l’adresse…"
          proposal={addressProposals?.[field]}
          onChange={(t) => onChange(field, t)}
          onSelect={(a) => onChange(field, a.label)}
        />
      </Field>
    </Full>
  );

  // Vendeur (bien estimé) et acquéreur (projet)
  const rooms = (
    <Field label={label("rooms", "Nombre de pièces")}>
      <Input
        name="rooms"
        type="number"
        inputMode="numeric"
        min="0"
        max="50"
        className={ring("rooms")}
        value={v.rooms ?? ""}
        onChange={set("rooms")}
      />
    </Field>
  );

  const origin = (
    <Field label={label("contact_origin", "Origine du contact")}>
      <Input
        name="contact_origin"
        className={ring("contact_origin")}
        placeholder="Recommandation, panneau, site…"
        value={v.contact_origin || ""}
        onChange={set("contact_origin")}
      />
    </Field>
  );

  const horizon = (
    <Field label={label("project_horizon", "Horizon du projet")}>
      <Select name="project_horizon" className={ring("project_horizon")} value={v.project_horizon || "Court terme"} onChange={set("project_horizon")}>
        {HORIZONS.map((h) => (
          <option key={h}>{h}</option>
        ))}
      </Select>
    </Field>
  );

  const feeling = (
    <Full>
      <Field label={label("consultant_feeling", "Ressenti du conseiller")}>
        <Textarea
          name="consultant_feeling"
          rows={isSeller && marks.consultant_feeling ? 4 : 2}
          className={ring("consultant_feeling")}
          value={v.consultant_feeling || ""}
          onChange={set("consultant_feeling")}
        />
      </Field>
    </Full>
  );

  const manualNext = (
    <Field
      label={mode === "edit" ? "Prochaine relance" : "Première relance (facultatif)"}
      hint={mode === "edit" ? null : "Vide : calculée automatiquement."}
    >
      <Input type="date" value={v.manual_next_due_date || ""} onChange={set("manual_next_due_date")} />
    </Field>
  );

  return (
    <div className="space-y-6">
      {(mode === "edit" || showCategory) && (
        <Grid>
          <Field label="Type de fiche" hint={showCategory ? "Déterminé par la saisie rapide ; modifiable." : null}>
            <Select name="category" value={cat} onChange={set("category")}>
              <option value="seller">Vendeur / Bailleur</option>
              <option value="buyer">Acquéreur</option>
              <option value="after">Après-vente</option>
            </Select>
          </Field>
          {mode === "edit" && isSeller && (
            <Field label="Phase" hint="« Sous promesse » et « Vendu » passent par les boutons de la fiche.">
              <Select
                value={stage}
                disabled={["sous_promesse", "vendu"].includes(stage)}
                onChange={set("deal_stage")}
              >
                <option value="pre_mandat">Pré-mandat</option>
                <option value="mandat">Sous mandat</option>
                {stage === "sous_promesse" && <option value="sous_promesse">Sous promesse</option>}
                {stage === "vendu" && <option value="vendu">Vendu</option>}
              </Select>
            </Field>
          )}
        </Grid>
      )}

      <Grid>
        {identity}
        {isSeller && (
          <>
            {address("property_address", "Adresse du bien", true)}
            <Field
              label={label("estimation_date", "Date de l’estimation")}
              hint={
                mode === "create" && v.estimation_date && !v.manual_next_due_date
                  ? "1re relance le lendemain (ou aujourd’hui si déjà passé) : « Envoyer l’estimation »."
                  : null
              }
            >
              <Input
                name="estimation_date"
                type="date"
                className={ring("estimation_date")}
                value={v.estimation_date || ""}
                onChange={set("estimation_date")}
              />
            </Field>
            {rooms}
            {origin}
          </>
        )}
        {isBuyer && (
          <>
            <Field label={label("budget_max", "Budget maximum (€)")}>
              <Input
                name="budget_max"
                inputMode="numeric"
                pattern="[0-9 ]*"
                autoComplete="off"
                className={ring("budget_max")}
                value={v.budget_max || ""}
                onChange={set("budget_max")}
              />
            </Field>
            <Field label={label("area", "Secteurs souhaités")}>
              <Input name="area" className={ring("area")} placeholder="Quartiers, communes…" value={v.area || ""} onChange={set("area")} />
            </Field>
            <Field label={label("project_type", "Type de bien")}>
              <Select name="project_type" className={ring("project_type")} value={v.project_type || ""} onChange={set("project_type")}>
                <option value="">—</option>
                {PROPERTY_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
            </Field>
            {rooms}
            <Full>
              <Field label={label("context", "Notes")}>
                <Textarea
                  name="context"
                  rows={marks.context ? 3 : 2}
                  className={ring("context")}
                  value={v.context || ""}
                  onChange={set("context")}
                />
              </Field>
            </Full>
          </>
        )}
        {isAfter && (
          <>
            {address("after_address", "Adresse")}
            <Field label="Date d’achat">
              <Input type="date" value={v.created_at || ""} onChange={set("created_at")} />
            </Field>
            <Field label="Anniversaire du client">
              <Input type="date" value={v.client_birthday || ""} onChange={set("client_birthday")} />
            </Field>
          </>
        )}
      </Grid>

      <div className="rounded-card border border-line">
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-card px-4 py-3 text-left text-sm font-semibold text-ink-soft hover:bg-subtle/60 focus-visible:outline-2 focus-visible:outline-primary"
        >
          Plus d’infos
          <Icon name="chevronDown" size={16} className={cx("transition-transform", moreOpen && "rotate-180")} />
        </button>
        {moreOpen && (
          <div className="border-t border-line p-4">
            <Grid>
              {isSeller && (
                <>
                  <Field label="Valeur estimée (€)">
                    <Input inputMode="numeric" value={v.estimation_value ?? ""} onChange={set("estimation_value")} />
                  </Field>
                  <Field label="Vendeur ou bailleur">
                    <Select value={v.seller_kind || "Vendeur"} onChange={set("seller_kind")}>
                      <option>Vendeur</option>
                      <option>Bailleur</option>
                    </Select>
                  </Field>
                  {mode === "edit" && stage !== "pre_mandat" && (
                    <>
                      <Field label="Prix de mise en vente (€)">
                        <Input inputMode="numeric" value={v.listing_price ?? ""} onChange={set("listing_price")} />
                      </Field>
                      <Field label="Honoraires prévus TTC (€)">
                        <Input inputMode="numeric" value={v.planned_fees_ttc ?? ""} onChange={set("planned_fees_ttc")} />
                      </Field>
                      <Field label="Type de mandat">
                        <Select value={v.mandate_type || ""} onChange={set("mandate_type")}>
                          <option value="">—</option>
                          {Object.entries(MANDATE_TYPES).map(([k, text]) => (
                            <option key={k} value={k}>
                              {text}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </>
                  )}
                  {horizon}
                  <Full>
                    <Field label={label("sale_reason", "Raison de la vente / mise en location")}>
                      <Textarea
                        name="sale_reason"
                        rows={2}
                        className={ring("sale_reason")}
                        value={v.sale_reason || ""}
                        onChange={set("sale_reason")}
                      />
                    </Field>
                  </Full>
                </>
              )}
              {isBuyer && (
                <>
                  {origin}
                  <Field label="Date d’enregistrement">
                    <Input type="date" value={v.acquisition_date || ""} onChange={set("acquisition_date")} />
                  </Field>
                  <Field label={label("min_surface", "Surface minimum (m²)")}>
                    <Input
                      name="min_surface"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className={ring("min_surface")}
                      value={v.min_surface || ""}
                      onChange={set("min_surface")}
                    />
                  </Field>
                  <Field label="Chambres">
                    <Input inputMode="numeric" pattern="[0-9]*" value={v.bedrooms || ""} onChange={set("bedrooms")} />
                  </Field>
                  {horizon}
                  <label className="flex min-h-11 items-center gap-3 self-end text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={!!v.also_owner}
                      onChange={set("also_owner")}
                    />
                    Aussi propriétaire (vendeur potentiel)
                  </label>
                </>
              )}
              {isAfter && (
                <>
                  {origin}
                  <Full>
                    <Field label={label("context", "Contexte")}>
                      <Textarea
                        name="context"
                        rows={marks.context ? 3 : 2}
                        className={ring("context")}
                        value={v.context || ""}
                        onChange={set("context")}
                      />
                    </Field>
                  </Full>
                </>
              )}
              {feeling}
              {manualNext}
            </Grid>
          </div>
        )}
      </div>
    </div>
  );
}
