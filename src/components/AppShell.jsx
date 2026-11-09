// src/components/AppShell.jsx
// Structure commune à toutes les pages (même structure que Bien EDL) : barre de navigation
// supérieure blanche pleine largeur, contenu centré. Les onglets ne dépendent jamais de la page.
import React from "react";
import { NavLink } from "react-router";
import { PAGE_PATHS } from "../lib/routes";
import { Dropdown, Icon, cx, focusRing } from "./ui";

const NAV_ITEMS = [
  { key: "clients", label: "Clients", to: PAGE_PATHS.clients },
  { key: "transactions", label: "Transactions", to: PAGE_PATHS.transactions },
  { key: "remuneration", label: "Rémunération", to: PAGE_PATHS.remuneration },
  { key: "dashboard", label: "Tableau de bord", to: PAGE_PATHS.dashboard },
];

const initialsOf = (profile, email) => {
  const first = (profile?.first_name || "").trim();
  const last = (profile?.last_name || "").trim();
  return `${first[0] || ""}${last[0] || ""}`.toUpperCase() || (email || "U")[0].toUpperCase();
};

// Marque : nom du logiciel et pastille « Rester en contact ».
export function Brand() {
  return (
    <span className="block min-w-0">
      <span className="block font-display text-xl leading-tight font-semibold">Keepintouch</span>
      <span className="mt-0.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
        Rester en contact
      </span>
    </span>
  );
}

export default function AppShell({ children, version, profile, email, isAdmin, onProfile, onSettings, onNews, onLogout }) {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || email;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <NavLink to={PAGE_PATHS.clients} className={cx("min-w-0 rounded-control", focusRing)}>
            <Brand />
          </NavLink>

          {/* Sur tablette et mobile, les onglets passent sur leur propre ligne sous la marque. */}
          <nav aria-label="Navigation principale" className="order-last w-full lg:order-none lg:w-auto lg:flex-1">
            <ul className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 lg:pb-0">
              {NAV_ITEMS.map((item) => (
                <li key={item.key} className="shrink-0">
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cx(
                        "flex min-h-11 items-center rounded-control px-3.5 text-sm font-semibold whitespace-nowrap transition",
                        focusRing,
                        isActive ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-canvas hover:text-ink"
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto">
            <Dropdown
              align="right"
              triggerLabel={`Menu de ${name}`}
              triggerClassName={cx(
                "flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-semibold text-ink-muted transition hover:bg-canvas hover:text-ink",
                focusRing
              )}
              trigger={
                <>
                  <span
                    aria-hidden="true"
                    className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
                  >
                    {initialsOf(profile, email)}
                  </span>
                  <span className="hidden max-w-48 truncate sm:inline">{name}</span>
                  <Icon name="chevronDown" size={16} />
                </>
              }
              items={[
                { key: "profil", label: "Mon profil", onSelect: onProfile },
                ...(isAdmin ? [{ key: "parametres", label: "Paramètres", onSelect: onSettings }] : []),
                { key: "nouveautes", label: "Nouveautés", onSelect: onNews },
                { key: "deconnexion", label: "Déconnexion", onSelect: onLogout },
              ]}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-page px-4 py-8 sm:px-6 sm:py-10 lg:px-8">{children}</main>
      <footer className="mx-auto max-w-page px-4 pb-8 text-center text-xs text-ink-muted sm:px-6 lg:px-8">
        © Benjamin Rondreux — Keepintouch {version} — 2026
      </footer>
    </div>
  );
}

const backClass = cx(
  "mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-control text-sm font-semibold text-ink-muted hover:text-ink",
  focusRing
);

// En-tête de page (Bien EDL) : lien retour éventuel, grand titre en Fraunces, actions à droite.
export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-8">
      {back &&
        (back.to ? (
          <NavLink to={back.to} className={backClass}>
            <span aria-hidden="true">←</span> {back.label}
          </NavLink>
        ) : (
          <button type="button" onClick={back.onClick} className={backClass}>
            <span aria-hidden="true">←</span> {back.label}
          </button>
        ))}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          {subtitle && <div className="mt-2 text-ink-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
