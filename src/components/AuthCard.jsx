// src/components/AuthCard.jsx
// Écrans hors connexion (connexion, mot de passe, invitation) : carte centrée sur le fond de page.
import React from "react";
import { Brand } from "./AppShell";

export default function AuthCard({ title, description, children, footer }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Brand />
        </div>
        <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
          {title && <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>}
          {description && <p className="mt-2 text-ink-muted">{description}</p>}
          <div className={title || description ? "mt-6" : ""}>{children}</div>
        </div>
        {footer && <div className="mt-6 space-y-1 text-center text-sm text-ink-muted">{footer}</div>}
      </div>
    </div>
  );
}
