// src/components/ClientCreatePage.jsx
// Pages /clients/nouveau/vendeur | acquereur | apres-vente : un formulaire réduit par type.
import React, { useState } from "react";
import { useNavigate } from "react-router";
import ClientForm from "./ClientForm";
import { PageHeader } from "./AppShell";
import { contactError, emailError } from "../lib/contact";
import { PAGE_PATHS } from "../lib/routes";
import { Alert, Button, Card, Modal } from "./ui";

const TITLES = {
  seller: { title: "Nouveau vendeur / estimation", subtitle: "Bien à estimer ou à mettre en vente ou en location." },
  buyer: { title: "Nouvel acquéreur", subtitle: "Projet d’achat : budget, type de bien, secteurs." },
  after: { title: "Nouvelle fiche après-vente", subtitle: "Client accompagné après son achat." },
};

const canSubmit = (values) =>
  String(values?.last_name || "").trim() !== "" && !contactError(values) && !emailError(values?.email);

export default function ClientCreatePage({ values, onChange, onSubmit, busy, error }) {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const meta = TITLES[values?.category] || TITLES.seller;

  const submit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!canSubmit(values)) return;
    onSubmit(e);
  };

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader title={meta.title} subtitle={meta.subtitle} back={{ to: PAGE_PATHS.clients, label: "Clients" }} />
      <Card>
        <ClientForm values={values} onChange={onChange} mode="create" submitted={submitted} />
        {error && <Alert className="mt-5">{error}</Alert>}
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={() => navigate(PAGE_PATHS.clients)} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" loading={busy} icon="check">
            Créer la fiche
          </Button>
        </div>
      </Card>
    </form>
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
          <Button type="submit" form="client-edit-form" loading={busy} icon="check">
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
