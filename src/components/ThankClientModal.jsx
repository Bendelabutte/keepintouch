// src/components/ThankClientModal.jsx
// Fenêtre « Remercier le client » : message construit depuis la fiche (sans IA), modifiable, puis
// ouvert dans WhatsApp, les SMS ou la messagerie, ou envoyé par l'application (send-client-message).
// Chaque action est journalisée dans client_outreach (modèle utilisé, jamais le texte) et apparaît
// dans l'historique de la fiche.
import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { CIRCUMSTANCES, CIRCUMSTANCE_SHORT_LABELS, NOT_SPECIFIED, clientCircumstance } from "../lib/circumstance";
import {
  SELLER_MESSAGE_LABELS,
  agencyChoice,
  agencyStorageKey,
  buildOutreachMessages,
  clientEmailError,
  defaultTemplateFor,
  mailtoLink,
  mobileNumber,
  outreachKindFor,
  outreachLabel,
  smsLink,
  whatsappLink,
} from "../lib/outreach";
import { Alert, Button, Field, Input, Modal, Select, Tabs, Textarea, buttonClasses } from "./ui";

const TABS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
];

const TEXT_KEYS = ["whatsapp", "sms", "subject", "email"];

const readStored = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // stockage indisponible (navigation privée) : le choix n'est simplement pas mémorisé
  }
};

const isCoarsePointer = () => {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
};

const functionErrorMessage = async (error, fallback) => {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* corps illisible : message générique */
  }
  return fallback;
};

export default function ThankClientModal({ client, initialTemplate, userId, sender, myAgencies, allAgencies, onClose, onLogged }) {
  const isSeller = outreachKindFor(client) === "vendeur";
  const storageKey = agencyStorageKey(userId);
  const [choice] = useState(() => agencyChoice({ myAgencies, allAgencies, storedId: readStored(storageKey) }));
  // Réglages qui déterminent le texte : agence, circonstance, message (vendeur)
  const [settings, setSettings] = useState(() => ({
    agencyId: choice.selectedId,
    circumstance: clientCircumstance(client).value,
    template: (isSeller && initialTemplate) || defaultTemplateFor(client),
  }));
  const [coarse] = useState(isCoarsePointer);
  const [tab, setTab] = useState("whatsapp");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(null); // réglages en attente de confirmation (texte modifié à la main)

  const agencyById = (id) => choice.options.find((a) => a.id === id) || null;
  const build = (s) => {
    const m = buildOutreachMessages({
      template: s.template,
      client,
      sender,
      agency: agencyById(s.agencyId),
      circumstance: s.circumstance,
    });
    return { whatsapp: m.short, sms: m.short, subject: m.emailSubject, email: m.emailBody };
  };
  const [generated, setGenerated] = useState(() => build(settings));
  const [texts, setTexts] = useState(generated);

  const { agencyId, template } = settings;
  const agency = agencyById(agencyId);
  const phone = mobileNumber(client.phone);
  const emailError = clientEmailError(client.email);
  const edited = TEXT_KEYS.some((k) => texts[k] !== generated[k]);
  const setText = (key) => (e) => setTexts((t) => ({ ...t, [key]: e.target.value }));

  // Nouveau réglage : textes reconstruits ; si le texte a été modifié à la main, confirmation d'abord
  const applySettings = (next) => {
    if (next.agencyId !== settings.agencyId) writeStored(storageKey, next.agencyId);
    const rebuilt = build(next);
    setSettings(next);
    setGenerated(rebuilt);
    setTexts(rebuilt);
    setPending(null);
  };
  const change = (key, value) => {
    const next = { ...settings, [key]: value };
    if (edited) setPending(next);
    else applySettings(next);
  };
  // Valeurs affichées dans les sélecteurs : celles en attente de confirmation le cas échéant
  const shown = pending || settings;

  const log = async (channel) => {
    const row = { client_id: client.id, user_id: userId, agency_id: agencyId || null, channel, template, status: "prepare" };
    const { error } = await supabase.from("client_outreach").insert(row);
    if (error) {
      console.warn("client_outreach :", error.message);
      setMsg({ tone: "warning", text: "Message préparé, mais l’historique n’a pas pu être mis à jour." });
      return;
    }
    setMsg({ tone: "success", text: `${outreachLabel(row)} : ajouté à l’historique de la fiche.` });
    onLogged?.();
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ tone: "success", text: "Message copié." });
    } catch {
      setMsg({ tone: "danger", text: "Copie impossible : sélectionnez le texte et copiez-le à la main." });
    }
  };

  const sendEmail = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-client-message", {
        body: { client_id: client.id, template, agency_id: agencyId || null, subject: texts.subject, body: texts.email },
      });
      if (error) throw new Error(await functionErrorMessage(error, "L’email n’a pas pu être envoyé."));
      setMsg({
        tone: "success",
        text: data?.redirected
          ? "Email envoyé (DEV : redirigé vers l’adresse de test). Ajouté à l’historique de la fiche."
          : `Email envoyé à ${client.email}, avec une copie pour vous. Ajouté à l’historique de la fiche.`,
      });
    } catch (err) {
      setMsg({ tone: "danger", text: err.message });
    } finally {
      setBusy(false);
      onLogged?.();
    }
  };

  const linkClasses = (variant = "primary") => buttonClasses({ variant, size: "sm", className: "max-sm:w-full" });
  const name = [client.first_name, client.last_name].filter(Boolean).join(" ").trim() || "Client";
  const locked = busy || Boolean(pending);

  return (
    <Modal
      open
      size="md"
      busy={busy}
      title={template === "vendeur_rdv" ? "Confirmer le rendez-vous" : "Remercier le client"}
      description={name}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Fermer
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Circonstance">
            <Select value={shown.circumstance} onChange={(e) => change("circumstance", e.target.value)} disabled={locked}>
              {CIRCUMSTANCES.map((k) => (
                <option key={k} value={k}>
                  {CIRCUMSTANCE_SHORT_LABELS[k]}
                </option>
              ))}
              <option value="">{NOT_SPECIFIED}</option>
            </Select>
          </Field>
          {isSeller && (
            <Field label="Message">
              <Select value={shown.template} onChange={(e) => change("template", e.target.value)} disabled={locked}>
                {Object.entries(SELLER_MESSAGE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {choice.showPicker ? (
            <Field
              label="Agence"
              className="sm:col-span-2"
              hint={
                agency && !agency.google_review_url && template !== "vendeur_rdv"
                  ? "Cette agence n’a pas de lien d’avis : la phrase d’avis est retirée."
                  : undefined
              }
            >
              <Select value={shown.agencyId} onChange={(e) => change("agencyId", e.target.value)} disabled={locked}>
                <option value="">Aucune agence (sans lien d’avis)</option>
                {choice.options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-ink-soft sm:col-span-2">
              Agence : <strong className="text-ink">{agency?.name}</strong>
              {agency && !agency.google_review_url && <span className="text-ink-muted"> · sans lien d’avis</span>}
            </p>
          )}
        </div>

        {pending && (
          <Alert tone="warning" title="Vous avez modifié le texte">
            <p>Le nouveau réglage remplace le texte par un nouveau modèle : vos modifications seront perdues.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="xs" onClick={() => applySettings(pending)}>
                Remplacer le texte
              </Button>
              <Button size="xs" variant="secondary" onClick={() => setPending(null)}>
                Garder mon texte
              </Button>
            </div>
          </Alert>
        )}

        <Tabs
          label="Canal"
          items={TABS}
          value={tab}
          onChange={(key) => {
            setTab(key);
            setMsg(null);
          }}
        />

        {tab === "whatsapp" && (
          <div className="space-y-3">
            <Field label="Message WhatsApp">
              <Textarea rows={8} value={texts.whatsapp} onChange={setText("whatsapp")} />
            </Field>
            {phone.number ? (
              <a
                href={whatsappLink(phone.number, texts.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClasses()}
                onClick={() => log("whatsapp")}
              >
                Ouvrir WhatsApp
              </a>
            ) : (
              <div className="space-y-2">
                <Button size="sm" disabled>
                  Ouvrir WhatsApp
                </Button>
                <p className="text-sm text-ink-muted">{phone.error}</p>
              </div>
            )}
          </div>
        )}

        {tab === "sms" && (
          <div className="space-y-3">
            <Field label="SMS">
              <Textarea rows={8} value={texts.sms} onChange={setText("sms")} />
            </Field>
            {!coarse ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="secondary" onClick={() => copy(texts.sms)}>
                  Copier le message
                </Button>
                <span className="text-sm text-ink-muted">Envoi par SMS disponible sur téléphone.</span>
              </div>
            ) : phone.number ? (
              <a href={smsLink(phone.number, texts.sms)} className={linkClasses()} onClick={() => log("sms")}>
                Ouvrir les SMS
              </a>
            ) : (
              <div className="space-y-2">
                <Button size="sm" disabled>
                  Ouvrir les SMS
                </Button>
                <p className="text-sm text-ink-muted">{phone.error}</p>
              </div>
            )}
          </div>
        )}

        {tab === "email" && (
          <div className="space-y-3">
            <Field label="Objet">
              <Input value={texts.subject} onChange={setText("subject")} disabled={busy} />
            </Field>
            <Field label="Message">
              <Textarea rows={12} value={texts.email} onChange={setText("email")} disabled={busy} />
            </Field>
            {emailError ? (
              <div className="space-y-2">
                <Button size="sm" disabled>
                  Envoyer
                </Button>
                <p className="text-sm text-ink-muted">{emailError}</p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  icon="mail"
                  loading={busy}
                  className="max-sm:w-full"
                  disabled={!texts.subject.trim() || !texts.email.trim()}
                  onClick={sendEmail}
                >
                  Envoyer
                </Button>
                <a
                  href={mailtoLink(client.email, texts.subject, texts.email)}
                  className={linkClasses("ghost")}
                  onClick={() => log("email")}
                >
                  Ouvrir dans ma messagerie
                </a>
                <p className="w-full text-xs text-ink-muted">
                  « Envoyer » part de Keepintouch : le client vous répond directement et vous recevez une copie.
                </p>
              </div>
            )}
          </div>
        )}

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </div>
    </Modal>
  );
}
