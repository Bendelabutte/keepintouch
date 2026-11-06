// src/components/ReleaseNotesModal.jsx
import React from "react";

// Nouveautés de la version en cours, à destination des commerciaux.
// Version 4.0 : textes provisoires, à réécrire en fin de projet.
const NOTES = [
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
  if (!show) return null;

  return (
    <div className="admin-modal-backdrop" onClick={onCloseTemporary}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <h2 style={{ marginBottom: 6 }}>Nouveautés de Keepintouch {version}</h2>
            <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.5 }}>
              Moins de saisie, plus de suivi : voici ce qui change pour vous.
            </p>
          </div>

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 14,
              background: "#f9fafb",
            }}
          >
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, lineHeight: 1.45 }}>
              {NOTES.map((n) => (
                <li key={n.title}>
                  <strong>{n.title}</strong> : {n.text}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <button type="button" className="btn-outline" onClick={onCloseTemporary}>
              Lire plus tard
            </button>
            <button type="button" className="btn-primary" onClick={onClosePermanently}>
              J’ai lu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
