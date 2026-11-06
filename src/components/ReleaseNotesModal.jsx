// src/components/ReleaseNotesModal.jsx
import React from "react";
import { Button, Modal } from "./ui";

// Nouveautés de la version en cours, à destination des commerciaux.
// Version 4.0 : textes provisoires, à réécrire en fin de projet.
const NOTES = [
  {
    title: "Nouvelle interface",
    text: "un menu fixe (Clients, Transactions, Rémunération, Tableau de bord), de vraies adresses pour chaque page et le bouton Retour du navigateur qui fonctionne.",
  },
  {
    title: "Créer une fiche par type",
    text: "« Ajouter » propose Vendeur / estimation, Acquéreur ou Après-vente, avec seulement les champs utiles ; le reste est sous « Plus d’infos ».",
  },
  {
    title: "Fiche vendeur par étapes",
    text: "une frise Estimation → Sous mandat → Sous promesse → Vendu, et une section par étape (prix de mise en vente et honoraires prévus au mandat, repris à la promesse).",
  },
  {
    title: "Dossiers clos",
    text: "une fiche close ne propose plus de relance ni d’action : un encadré résume la clôture (date, motif, vente, dates clés). Vous pouvez toujours y ajouter une note.",
  },
  {
    title: "Filtres « À relancer », « Tous », « Clos »",
    text: "« Tous » (par défaut) regroupe vos fiches actives ; chaque filtre affiche son nombre de fiches.",
  },
  {
    title: "Liste compacte",
    text: "un clic sur une ligne la déplie, un second clic la replie.",
  },
  {
    title: "Date de l’estimation",
    text: "la 1re relance d’une nouvelle fiche vendeur est fixée au lendemain de l’estimation, pour l’envoyer.",
  },
  {
    title: "Téléphone et email",
    text: "le téléphone se met en forme tout seul (06 77 66 55 44) et un email mal saisi est signalé avant l’enregistrement.",
  },
  {
    title: "Nouvelle page Transactions",
    text: "toutes vos ventes et locations au même endroit, avec votre part de chaque honoraire.",
  },
  {
    title: "« Passer sous promesse »",
    text: "sur une fiche vendeur, saisissez la date de promesse, le prix, les honoraires et l’acquéreur. La fiche reste active, avec une relance 30 jours après la promesse.",
  },
  {
    title: "« Acte signé » en un clic",
    text: "le jour de la vente chez le notaire, seule la date de l’acte est demandée : la fiche passe « Vendu » et la vente compte dans votre CA.",
  },
  {
    title: "Fiche après-vente créée automatiquement",
    text: "à la vente, l’acquéreur saisi à la promesse devient une fiche après-vente, avec sa première relance déjà planifiée.",
  },
  {
    title: "Acquéreur déjà dans vos fiches",
    text: "dès 2 lettres tapées dans le bloc acquéreur, les fiches existantes sont proposées. Choisissez-la : elle passe « Sous promesse », puis devient la fiche après-vente à l’acte, sans doublon. Si l’acquéreur est suivi par un collègue, la répartition 50 % entrée / 50 % sortie est proposée.",
  },
  {
    title: "Graphique de vos honoraires",
    text: "sur le tableau de bord, la courbe de vos honoraires cumulés depuis janvier, en promesses signées ou en ventes actées, année par année.",
  },
  {
    title: "Onglet « Rémunération »",
    text: "votre solde dû par l’agence, vos commissions (ou votre salaire brut) à venir, ce que vous avez acquis cette année et le relevé détaillé, calculés automatiquement à chaque vente actée. Agents : déposez vos factures et suivez leur paiement.",
  },
  {
    title: "Saisie d’adresse automatique",
    text: "tapez le début de l’adresse et choisissez dans la liste ; code postal et ville se remplissent seuls.",
  },
  {
    title: "Relances automatiques",
    text: "un changement de phase relance automatiquement le suivi (nouvelle date calculée, retard remis à zéro). Et « +7 » donne bien 7 jours.",
  },
  {
    title: "« Mon CA en attente »",
    text: "le tableau de bord affiche ce que vos ventes sous promesse vous rapporteront une fois signées.",
  },
];

export default function ReleaseNotesModal({ version, show, onClosePermanently, onCloseTemporary }) {
  return (
    <Modal
      open={show}
      size="md"
      title={`Nouveautés de Keepintouch ${version}`}
      description="Moins de saisie, plus de suivi : voici ce qui change pour vous."
      onClose={onCloseTemporary}
      footer={
        <>
          <Button variant="secondary" onClick={onCloseTemporary}>
            Lire plus tard
          </Button>
          <Button onClick={onClosePermanently}>J’ai lu</Button>
        </>
      }
    >
      <ul className="space-y-3">
        {NOTES.map((n) => (
          <li key={n.title} className="flex gap-3 text-sm leading-relaxed">
            <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-ink">{n.title}</strong> <span className="text-ink-soft">: {n.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
