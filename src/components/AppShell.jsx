// src/components/AppShell.jsx
// Structure commune à toutes les pages : barre latérale fixe (≥ 1024 px), barre supérieure et
// barre basse à 4 onglets (mobile, tablette). Les entrées ne dépendent jamais de la page affichée.
import React from "react";
import { NavLink } from "react-router";
import { PAGE_PATHS } from "../lib/routes";
import { Dropdown, Icon, cx, focusRing } from "./ui";

const NAV_ITEMS = [
  { key: "clients", label: "Clients", short: "Clients", icon: "clients", to: PAGE_PATHS.clients },
  { key: "transactions", label: "Transactions", short: "Ventes", icon: "transactions", to: PAGE_PATHS.transactions },
  { key: "remuneration", label: "Rémunération", short: "Rému.", icon: "wallet", to: PAGE_PATHS.remuneration },
  { key: "dashboard", label: "Tableau de bord", short: "Bord", icon: "chart", to: PAGE_PATHS.dashboard },
];

const initialsOf = (profile, email) => {
  const first = (profile?.first_name || "").trim();
  const last = (profile?.last_name || "").trim();
  return `${first[0] || ""}${last[0] || ""}`.toUpperCase() || (email || "U")[0].toUpperCase();
};

function Brand({ inverted = false }) {
  return (
    <NavLink to={PAGE_PATHS.clients} className={cx("flex items-center gap-2.5 rounded-control", focusRing)}>
      <span
        aria-hidden="true"
        className={cx(
          "flex size-9 items-center justify-center rounded-[10px] font-display text-base font-extrabold",
          inverted ? "bg-accent text-white" : "bg-primary text-white"
        )}
      >
        K
      </span>
      <span className="leading-tight">
        <span className={cx("block font-display text-[1.05rem] font-extrabold", inverted ? "text-white" : "text-ink")}>
          Keepintouch
        </span>
        <span className={cx("block text-xs", inverted ? "text-nav-ink" : "text-ink-muted")}>Rester en contact</span>
      </span>
    </NavLink>
  );
}

function ProfileMenu({ profile, email, isAdmin, onProfile, onSettings, onNews, onLogout, variant }) {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || email;
  const items = [
    { key: "profil", label: "Mon profil", icon: "user", onSelect: onProfile },
    ...(isAdmin ? [{ key: "parametres", label: "Paramètres", icon: "settings", onSelect: onSettings }] : []),
    { key: "nouveautes", label: "Nouveautés", icon: "sparkle", onSelect: onNews },
    { key: "deconnexion", label: "Déconnexion", icon: "logout", onSelect: onLogout },
  ];
  const avatar = (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white"
    >
      {initialsOf(profile, email)}
    </span>
  );

  if (variant === "sidebar") {
    return (
      <Dropdown
        placement="top"
        triggerLabel={`Menu de ${name}`}
        className="w-full"
        triggerClassName={cx(
          "flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm text-white transition-colors hover:bg-nav-hover",
          focusRing
        )}
        trigger={
          <>
            {avatar}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{name}</span>
              <span className="block truncate text-xs text-nav-ink">{email}</span>
            </span>
            <Icon name="chevronDown" size={16} className="rotate-180 text-nav-ink" />
          </>
        }
        items={items}
      />
    );
  }

  return (
    <Dropdown
      align="right"
      triggerLabel={`Menu de ${name}`}
      triggerClassName={cx("flex items-center rounded-full p-0.5 transition hover:ring-2 hover:ring-primary-line", focusRing)}
      trigger={avatar}
      items={items}
    />
  );
}

export default function AppShell({ children, version, ...menu }) {
  return (
    <div className="min-h-dvh bg-canvas">
      {/* Barre latérale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col bg-nav px-3 py-5 lg:flex">
        <div className="px-2">
          <Brand inverted />
        </div>
        <nav aria-label="Navigation principale" className="mt-8 flex-1">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cx(
                      "flex min-h-10 items-center gap-3 rounded-control px-3 text-sm font-semibold transition-colors duration-150",
                      focusRing,
                      isActive ? "bg-nav-active text-white shadow-card" : "text-nav-ink hover:bg-nav-hover hover:text-white"
                    )
                  }
                >
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-white/10 pt-3">
          <ProfileMenu variant="sidebar" {...menu} />
          <p className="mt-3 px-2.5 text-[11px] text-nav-ink/70">Keepintouch {version} · © Benjamin Rondreux</p>
        </div>
      </aside>

      {/* Barre supérieure (mobile, tablette) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Brand />
        <ProfileMenu {...menu} />
      </header>

      <main className="pb-[calc(var(--spacing-bottom-nav)+1.5rem)] lg:pb-10 lg:pl-sidebar">
        <div className="mx-auto w-full max-w-page px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* Barre basse (mobile, tablette) : les 4 entrées restent toujours visibles */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid h-bottom-nav max-w-xl grid-cols-4">
          {NAV_ITEMS.map((item) => (
            <li key={item.key}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cx(
                    "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors",
                    focusRing,
                    isActive ? "text-primary" : "text-ink-muted hover:text-ink"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx("flex h-7 w-12 items-center justify-center rounded-full", isActive && "bg-primary-soft")}>
                      <Icon name={item.icon} size={20} />
                    </span>
                    <span className="sm:hidden">{item.short}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

// En-tête de page : titre, sous-titre, actions, lien retour éventuel.
export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <NavLink
            to={back.to}
            className={cx("mb-2 inline-flex items-center gap-1.5 rounded-control text-sm font-semibold text-ink-muted hover:text-primary", focusRing)}
          >
            <Icon name="arrowLeft" size={16} />
            {back.label}
          </NavLink>
        )}
        <h1 className="text-2xl font-extrabold text-ink sm:text-[1.65rem]">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
