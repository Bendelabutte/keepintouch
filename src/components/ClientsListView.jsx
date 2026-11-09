// src/components/ClientsListView.jsx
// Page /clients : bouton « Ajouter » (sous-menu par type), filtres, recherche, liste compacte.
import React from "react";
import { PageHeader } from "./AppShell";
import { STATUS_FILTERS } from "../lib/clientStatus";
import { createPathFor } from "../lib/routes";
import { Alert, Dropdown, EmptyState, Icon, Input, Select, SkeletonList, Tabs, buttonClasses } from "./ui";

const CATEGORY_TABS = [
  { key: "vendeur", label: "Vendeurs" },
  { key: "acquereur", label: "Acquéreurs" },
  { key: "apresvente", label: "Après-vente" },
  { key: "tous", label: "Tous les types" },
];

const STAGE_TABS = [
  { key: "premandat", label: "Pré-mandat" },
  { key: "mandat", label: "Sous mandat" },
  { key: "souspromesse", label: "Sous promesse" },
  { key: "vendu", label: "Vendu" },
  { key: "tous", label: "Toutes phases" },
];

const ADD_MENU = [
  { key: "seller", label: "Vendeur / estimation", description: "Bien à estimer, vendre ou louer", icon: "home", to: createPathFor("seller") },
  { key: "buyer", label: "Acquéreur", description: "Projet d’achat", icon: "search", to: createPathFor("buyer") },
  { key: "after", label: "Après-vente", description: "Suivi après l’achat", icon: "user", to: createPathFor("after") },
];

export function AddClientButton({ align = "right" }) {
  return (
    <Dropdown
      align={align}
      triggerClassName={buttonClasses({ variant: "primary" })}
      trigger={
        <>
          <Icon name="plus" />
          Ajouter
          <Icon name="chevronDown" size={16} />
        </>
      }
      items={ADD_MENU}
    />
  );
}

export default function ClientsListView({
  currentTab,
  setCurrentTab,
  sellerStageFilter,
  onSellerStageChange,
  statusFilter,
  setStatusFilter,
  statusCounts,
  showCommercialFilter,
  commercialFilter,
  setCommercialFilter,
  commercialOptions,
  searchTerm,
  setSearchTerm,
  sections, // [{ key, title, list, emptyText }]
  renderRow,
  loading,
  error,
}) {
  const total = sections.reduce((n, s) => n + s.list.length, 0);

  return (
    <>
      <PageHeader title="Clients" subtitle="Vos fiches à relancer et leur avancement." actions={<AddClientButton />} />

      <div className="mb-6 space-y-3">
        <Tabs label="Type de fiche" items={CATEGORY_TABS} value={currentTab} onChange={setCurrentTab} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Tabs
            label="Statut"
            items={STATUS_FILTERS.map((s) => ({ ...s, count: statusCounts[s.key] ?? 0 }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          {currentTab === "vendeur" && (
            <Tabs label="Phase vendeur" items={STAGE_TABS} value={sellerStageFilter} onChange={onSellerStageChange} />
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
            <Input
              type="search"
              aria-label="Rechercher un client"
              placeholder="Rechercher : nom, adresse, email, téléphone"
              className="pl-11"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {showCommercialFilter && (
            <div className="sm:w-72">
              <Select aria-label="Filtrer par commercial" value={commercialFilter} onChange={(e) => setCommercialFilter(e.target.value)}>
                <option value="Tous">Tous les commerciaux</option>
                {commercialOptions.map((c) => (
                  <option key={c.id} value={c.email}>
                    {c.email}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <SkeletonList rows={6} label="Chargement des clients" />
      ) : total === 0 && sections.length === 1 ? (
        <EmptyState
          title={sections[0].emptyText}
          text={searchTerm ? "Aucune fiche ne correspond à la recherche." : "Changez de filtre ou ajoutez une fiche."}
          action={<AddClientButton align="left" />}
        />
      ) : (
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.key}>
              <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold text-ink">
                {s.title}
                <span className="tabular text-sm font-medium text-ink-muted">{s.list.length}</span>
              </h2>
              {s.list.length === 0 ? (
                <p className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-5 text-ink-muted">{s.emptyText}</p>
              ) : (
                <ul className="space-y-2">{s.list.map((c) => renderRow(c))}</ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
