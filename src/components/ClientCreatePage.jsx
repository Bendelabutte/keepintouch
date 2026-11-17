// src/components/ClientCreatePage.jsx
// Pages /clients/nouveau/vendeur | acquereur | apres-vente : un formulaire réduit par type.
// /clients/nouveau/rapide : saisie rapide, le type de fiche est déterminé par l'IA.
// Sur toutes ces pages, « Coller une description » pré-remplit la fiche ; rien n'est enregistré
// avant « Créer la fiche ».
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import ClientForm from "./ClientForm";
import QuickDescription from "./QuickDescription";
import { PageHeader } from "./AppShell";
import { supabase } from "../supabaseClient";
import { API_TYPES, aiToForm, mergeAiValues, missingMessage, missingRequired } from "../lib/aiParse";
import { contactError, emailError } from "../lib/contact";
import { PAGE_PATHS } from "../lib/routes";
import { Alert, Button, Card, FormSaveBar, Modal } from "./ui";

const TITLES = {
  seller: { title: "Nouveau vendeur / estimation", subtitle: "Bien à estimer ou à mettre en vente ou en location." },
  buyer: { title: "Nouvel acquéreur", subtitle: "Projet d’achat : budget, type de bien, secteurs." },
  after: { title: "Nouvelle fiche après-vente", subtitle: "Client accompagné après son achat." },
  quick: { title: "Saisie rapide", subtitle: "Collez ou dictez une description : la fiche se remplit, vous relisez puis la créez." },
};

const FILL_ERROR = "L’analyse a échoué. Réessayez ou remplissez la fiche à la main.";

// Message d'erreur renvoyé par la fonction (statut non 2xx), sans détail technique
const functionErrorMessage = async (error) => {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* corps illisible : message générique */
  }
  return FILL_ERROR;
};

const omit = (obj, key) => {
  const next = { ...obj };
  delete next[key];
  return next;
};

const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

// Champs saisis par l'utilisateur (les valeurs par défaut ne comptent pas comme une modification)
const TYPED_FIELDS = [
  "first_name", "last_name", "phone", "email", "property_address", "after_address", "estimation_date",
  "contact_origin", "area", "budget_max", "project_type", "rooms", "context", "created_at", "client_birthday",
  "consultant_feeling", "sale_reason", "min_surface", "bedrooms", "contact_circumstance",
];
const isDirty = (values) => TYPED_FIELDS.some((k) => String(values?.[k] ?? "").trim() !== "");

const canSubmit = (values) =>
  String(values?.last_name || "").trim() !== "" && !contactError(values) && !emailError(values?.email);

export default function ClientCreatePage({ values, onChange, setValues, defaultsFor, onSubmit, busy, error, quick = false }) {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const meta = quick ? TITLES.quick : TITLES[values?.category] || TITLES.seller;

  // Saisie rapide par l'IA
  const [description, setDescription] = useState("");
  const [fillBusy, setFillBusy] = useState(false);
  const [fillError, setFillError] = useState("");
  const [fillInfo, setFillInfo] = useState("");
  const [marks, setMarks] = useState({}); // champ → "sur" | "a_verifier"
  const [missingMsg, setMissingMsg] = useState("");
  const [focusField, setFocusField] = useState(null);
  const [addressProposals, setAddressProposals] = useState({}); // champ adresse → { text, n }
  const aiPrevious = useRef({}); // valeurs mises par l'IA, pour ne pas écraser une correction
  const categoryChosen = useRef(false); // saisie rapide : type choisi à la main ou déjà déterminé
  const valuesRef = useRef(values);
  valuesRef.current = values;

  useEffect(() => {
    if (!focusField) return;
    document.querySelector(`#client-create-form [name="${focusField}"]`)?.focus();
    setFocusField(null);
  }, [focusField]);

  const showMissing = (v) => {
    const missing = missingRequired(v);
    setMissingMsg(missingMessage(missing));
    if (missing.length) setFocusField(missing[0].field);
    return missing.length === 0;
  };

  // Une modification à la main retire le marquage IA du champ
  const change = (field, value) => {
    onChange(field, value);
    if (field === "category") categoryChosen.current = true;
    setMarks((m) => (field in m ? omit(m, field) : m));
    if (missingMsg) setMissingMsg("");
  };

  const fill = async () => {
    const text = description.trim();
    if (!text || fillBusy) return;
    setFillBusy(true);
    setFillError("");
    setFillInfo("");
    const type = quick && !categoryChosen.current ? "auto" : API_TYPES[valuesRef.current.category] || "vendeur";
    try {
      const { data, error: fnError } = await supabase.functions.invoke("parse-client-description", { body: { type, text } });
      if (fnError) throw new Error(await functionErrorMessage(fnError));
      if (!data?.fields) throw new Error(FILL_ERROR);

      const current = valuesRef.current;
      const parsed = aiToForm(data, type === "auto" ? undefined : current.category);
      const base = parsed.category === current.category ? current : { ...current, category: parsed.category };
      const { values: merged, applied, kept } = mergeAiValues(base, parsed.values, {
        previous: aiPrevious.current,
        defaults: defaultsFor(parsed.category),
      });
      if (type === "auto") categoryChosen.current = true;
      setValues(merged);
      for (const f of applied) aiPrevious.current[f] = parsed.values[f];
      setMarks((m) => ({ ...m, ...Object.fromEntries(applied.map((f) => [f, parsed.marks[f]])) }));
      // Adresse reçue : la liste IGN propose sa première suggestion, à confirmer par l'utilisateur
      const addressFields = applied.filter((f) => f === "property_address" || f === "after_address");
      if (addressFields.length) {
        const n = Date.now();
        setAddressProposals((p) => ({ ...p, ...Object.fromEntries(addressFields.map((f) => [f, { text: merged[f], n }])) }));
      }

      const toCheck = applied.filter((f) => parsed.marks[f] === "a_verifier").length;
      setFillInfo(
        applied.length === 0 && kept.length === 0
          ? "Aucune information de fiche trouvée dans ce texte."
          : [
              applied.length ? `${plural(applied.length, "champ")} rempli${applied.length > 1 ? "s" : ""}` : "",
              toCheck ? `${toCheck} à vérifier (en orange)` : "",
              kept.length ? `${plural(kept.length, "correction")} manuelle${kept.length > 1 ? "s" : ""} conservée${kept.length > 1 ? "s" : ""}` : "",
            ]
              .filter(Boolean)
              .join(" · ") + ". Relisez puis créez la fiche."
      );
      showMissing(merged);
    } catch (err) {
      setFillError(err?.message || FILL_ERROR);
    } finally {
      setFillBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!showMissing(values) || !canSubmit(values)) return;
    onSubmit(e);
  };

  return (
    <>
      <PageHeader title={meta.title} subtitle={meta.subtitle} back={{ to: PAGE_PATHS.clients, label: "Clients" }} />
      <form id="client-create-form" onSubmit={submit} noValidate className="max-w-4xl">
        <Card padding="none" className="p-4 sm:p-6">
          <QuickDescription
            value={description}
            onChange={setDescription}
            onFill={fill}
            busy={fillBusy}
            error={fillError}
            info={fillInfo}
          />
          {missingMsg && (
            <Alert tone="warning" className="mt-4">
              {missingMsg}
            </Alert>
          )}
          <div className="mt-6">
            <ClientForm
              values={values}
              onChange={change}
              mode="create"
              submitted={submitted}
              marks={marks}
              showCategory={quick}
              addressProposals={addressProposals}
            />
          </div>
          {error && <Alert className="mt-6">{error}</Alert>}
        </Card>
      </form>
      <FormSaveBar
        formId="client-create-form"
        label="Créer la fiche"
        dirty={isDirty(values)}
        loading={busy}
        disabled={!isDirty(values)}
        secondary={
          <Button variant="secondary" onClick={() => navigate(PAGE_PATHS.clients)} disabled={busy}>
            Annuler
          </Button>
        }
      />
    </>
  );
}

// Modification d'une fiche existante : même formulaire, dans une fenêtre.
export function ClientEditModal({ open, values, onChange, onSubmit, onClose, busy, error }) {
  const [submitted, setSubmitted] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!canSubmit(values)) return;
    onSubmit(e);
  };
  return (
    <Modal
      open={open}
      size="lg"
      busy={busy}
      title="Modifier la fiche"
      description={[values?.first_name, values?.last_name].filter(Boolean).join(" ")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" form="client-edit-form" loading={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="client-edit-form" onSubmit={submit} noValidate>
        <ClientForm values={values} onChange={onChange} mode="edit" submitted={submitted} />
        {error && <Alert className="mt-5">{error}</Alert>}
      </form>
    </Modal>
  );
}
