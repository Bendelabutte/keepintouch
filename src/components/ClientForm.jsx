// src/components/ClientForm.jsx
// Formulaire de fiche client, commun à la page de création (par type) et à la modification.
// Champs essentiels visibles, le reste replié sous « Plus d'infos ».
import React, { useState } from "react";
import AddressAutocomplete from "./AddressAutocomplete";
import { contactError, emailError, formatPhoneInput } from "../lib/contact";
import { MANDATE_TYPES } from "../lib/stages";
import { Field, Icon, Input, Select, Textarea, controlClasses, cx } from "./ui";

const PROPERTY_KINDS = ["Appartement", "Maison", "Terrain", "Local commercial", "Immeuble", "Autre"];
const HORIZONS = ["Court terme", "Moyen terme", "Long terme", "Estimation sans projet"];


function Grid({ children }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

const Full = ({ children }) => <div className="sm:col-span-2">{children}</div>;

export default function ClientForm({ values, onChange, mode = "create", submitted = false }) {
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

  const identity = (
    <>
      <Field label="Prénom">
        <Input autoComplete="off" value={v.first_name || ""} onChange={set("first_name")} />
      </Field>
      <Field label="Nom" required>
        <Input autoComplete="off" value={v.last_name || ""} onChange={set("last_name")} />
      </Field>
      <Field label="Téléphone" error={contactMsg} hint="Téléphone ou email : au moins l’un des deux.">
        <Input
          type="tel"
          inputMode="tel"
          placeholder="06 77 66 55 44"
          value={v.phone || ""}
          onChange={(e) => onChange("phone", formatPhoneInput(e.target.value))}
        />
      </Field>
      <Field label="Email" error={emailMsg}>
        <Input type="email" placeholder="nom@domaine.fr" value={v.email || ""} onChange={set("email")} />
      </Field>
    </>
  );

  const address = (field, label, required = false) => (
    <Full>
      <Field label={label} required={required}>
        <AddressAutocomplete
          value={v[field] || ""}
          placeholder="Commencez à taper l’adresse…"
          className={controlClasses(false)}
          onChange={(text) => onChange(field, text)}
          onSelect={(a) => onChange(field, a.label)}
        />
      </Field>
    </Full>
  );

  const origin = (
    <Field label="Origine du contact">
      <Input placeholder="Recommandation, panneau, site…" value={v.contact_origin || ""} onChange={set("contact_origin")} />
    </Field>
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
      {mode === "edit" && (
        <Grid>
          <Field label="Type de fiche">
            <Select value={cat} onChange={set("category")}>
              <option value="seller">Vendeur / Bailleur</option>
              <option value="buyer">Acquéreur</option>
              <option value="after">Après-vente</option>
            </Select>
          </Field>
          {isSeller && (
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
              label="Date de l’estimation"
              hint={
                mode === "create" && v.estimation_date && !v.manual_next_due_date
                  ? "1re relance le lendemain (ou aujourd’hui si déjà passé) : « Envoyer l’estimation »."
                  : null
              }
            >
              <Input type="date" value={v.estimation_date || ""} onChange={set("estimation_date")} />
            </Field>
            {origin}
          </>
        )}
        {isBuyer && (
          <>
            <Field label="Budget maximum (€)">
              <Input inputMode="numeric" value={v.budget_max || ""} onChange={set("budget_max")} />
            </Field>
            <Field label="Secteurs souhaités">
              <Input placeholder="Quartiers, communes…" value={v.area || ""} onChange={set("area")} />
            </Field>
            <Field label="Type de bien">
              <Select value={v.project_type || ""} onChange={set("project_type")}>
                <option value="">—</option>
                {PROPERTY_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre de pièces">
              <Input type="number" min="0" max="50" value={v.rooms ?? ""} onChange={set("rooms")} />
            </Field>
            <Full>
              <Field label="Notes">
                <Textarea rows={2} value={v.context || ""} onChange={set("context")} />
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

      {mode === "create" && (
        <div className="flex items-center gap-3 rounded-card border border-dashed border-line-strong bg-subtle/60 p-4">
          <Icon name="clipboard" className="text-ink-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-soft">Coller une description</p>
            <p className="text-xs text-ink-muted">Remplir la fiche à partir d’un texte collé (annonce, email, notes).</p>
          </div>
          <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-muted ring-1 ring-line">
            Bientôt disponible
          </span>
        </div>
      )}

      <div className="rounded-card border border-line">
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-card px-4 py-3 text-left text-sm font-semibold text-ink-soft hover:bg-subtle/60 focus-visible:outline-2 focus-visible:outline-primary"
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
                          {Object.entries(MANDATE_TYPES).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </>
                  )}
                  <Field label="Horizon du projet">
                    <Select value={v.project_horizon || "Court terme"} onChange={set("project_horizon")}>
                      {HORIZONS.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </Select>
                  </Field>
                  <Full>
                    <Field label="Raison de la vente / mise en location">
                      <Textarea rows={2} value={v.sale_reason || ""} onChange={set("sale_reason")} />
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
                  <Field label="Surface minimum (m²)">
                    <Input inputMode="numeric" value={v.min_surface || ""} onChange={set("min_surface")} />
                  </Field>
                  <Field label="Chambres">
                    <Input inputMode="numeric" value={v.bedrooms || ""} onChange={set("bedrooms")} />
                  </Field>
                  <Field label="Horizon du projet">
                    <Select value={v.project_horizon || "Court terme"} onChange={set("project_horizon")}>
                      {HORIZONS.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </Select>
                  </Field>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
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
                    <Field label="Contexte">
                      <Textarea rows={2} value={v.context || ""} onChange={set("context")} />
                    </Field>
                  </Full>
                </>
              )}
              <Full>
                <Field label="Ressenti du conseiller">
                  <Textarea rows={2} value={v.consultant_feeling || ""} onChange={set("consultant_feeling")} />
                </Field>
              </Full>
              {manualNext}
            </Grid>
          </div>
        )}
      </div>
    </div>
  );
}
