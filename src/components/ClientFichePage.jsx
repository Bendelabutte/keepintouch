// src/components/ClientFichePage.jsx
// Page /clients/:id : en-tête de la fiche puis son contenu (frise, sections, relance, historique).
import React from "react";
import { PageHeader } from "./AppShell";
import { closedBadgeLabel } from "../lib/clientStatus";
import { formatPhone } from "../lib/contact";
import { PAGE_PATHS } from "../lib/routes";
import { Badge, ButtonLink, EmptyState, Icon, Skeleton, cx, focusRing } from "./ui";

export default function ClientFichePage({ client, loading, humanCategory, ownerLabel, renderDetail }) {
  const back = { to: PAGE_PATHS.clients, label: "Clients" };

  if (!client) {
    if (loading) {
      return (
        <div role="status" aria-label="Chargement de la fiche" className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-48 w-full rounded-card" />
        </div>
      );
    }
    return (
      <>
        <PageHeader title="Fiche introuvable" back={back} />
        <EmptyState
          icon="clients"
          title="Cette fiche n’existe pas ou ne vous est pas accessible."
          action={
            <ButtonLink to={PAGE_PATHS.clients} variant="secondary">
              Retour aux clients
            </ButtonLink>
          }
        />
      </>
    );
  }

  const name = [client.first_name, client.last_name].filter(Boolean).join(" ").trim() || "(Sans nom)";
  const closed = closedBadgeLabel(client);

  return (
    <>
      <PageHeader
        back={back}
        title={name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Badge tone="accent">{humanCategory(client.category)}</Badge>
            {closed && <Badge tone={closed === "Vendu" ? "success" : "muted"}>{closed}</Badge>}
            {client.phone && (
              <a href={`tel:${client.phone}`} className={cx("inline-flex items-center gap-1.5 rounded hover:text-accent", focusRing)}>
                <Icon name="phone" size={15} />
                {formatPhone(client.phone)}
              </a>
            )}
            {client.email && (
              <a href={`mailto:${client.email}`} className={cx("inline-flex items-center gap-1.5 rounded hover:text-accent", focusRing)}>
                <Icon name="mail" size={15} />
                {client.email}
              </a>
            )}
            {ownerLabel && <span className="text-xs">Commercial : {ownerLabel}</span>}
          </span>
        }
      />
      {renderDetail(client)}
    </>
  );
}
