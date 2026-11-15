// src/components/QuickDescription.jsx
// Bloc « Coller une description » des pages de création : texte collé ou dicté avec le micro du
// clavier, analysé par l'IA (fonction parse-client-description) pour pré-remplir la fiche.
import React, { useId } from "react";
import { MAX_DESCRIPTION_LENGTH } from "../lib/aiParse";
import { Alert, Button, Icon, Textarea } from "./ui";

export default function QuickDescription({ value, onChange, onFill, busy, error, info }) {
  const id = useId();
  const length = value.length;
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-accent/20 bg-accent-soft/50 p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-3">
        <Icon name="sparkle" className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-semibold text-ink">
            Coller une description
          </h2>
          <p id={`${id}-hint`} className="text-sm text-ink-muted">
            Collez un texte ou dictez avec le micro de votre clavier.
          </p>
        </div>
      </div>
      <label htmlFor={`${id}-text`} className="sr-only">
        Description du client
      </label>
      <Textarea
        id={`${id}-text`}
        rows={5}
        maxLength={MAX_DESCRIPTION_LENGTH}
        autoCapitalize="sentences"
        enterKeyHint="done"
        aria-describedby={`${id}-hint ${id}-count`}
        placeholder="Ex. : M. Bertrand Lama cherche un 2 pièces, budget max 300 000 €, tout le 18e sauf Goutte d’Or, pas de rez-de-chaussée, tél. 06 77 66 55 44."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span id={`${id}-count`} className="tabular text-sm text-ink-muted">
          {length.toLocaleString("fr-FR")} / {MAX_DESCRIPTION_LENGTH.toLocaleString("fr-FR")} caractères
        </span>
        <Button icon="sparkle" onClick={onFill} loading={busy} disabled={!value.trim()} className="w-full sm:w-auto">
          {busy ? "Analyse en cours…" : "Remplir la fiche"}
        </Button>
      </div>
      {error && <Alert className="mt-3">{error}</Alert>}
      {info && !error && (
        <p role="status" className="mt-3 text-sm font-medium text-ink-soft">
          {info}
        </p>
      )}
    </section>
  );
}
