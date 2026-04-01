// src/components/ReleaseNotesModal.jsx
import React from "react";

export default function ReleaseNotesModal({
  show,
  onClosePermanently,
  onCloseTemporary,
}) {
  if (!show) return null;

  return (
    <div className="admin-modal-backdrop" onClick={onCloseTemporary}>
      <div
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <h2 style={{ marginBottom: 6 }}>Bienvenue sur Keepintouch V3</h2>
            <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.5 }}>
              La V3 apporte plusieurs améliorations importantes pour le suivi
              commercial, la sécurité et la lisibilité de l’outil.
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
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                display: "grid",
                gap: 8,
                lineHeight: 1.45,
              }}
            >
              <li>Recherche client plus rapide</li>
              <li>Vue compacte activée par défaut</li>
              <li>Tableau de bord enrichi et plus lisible</li>
              <li>Statistiques et lecture par commercial</li>
              <li>Comparatif commerciaux dans le dashboard</li>
              <li>Création des comptes par invitation administrateur</li>
              <li>Sécurisation renforcée des accès</li>
              <li>Espace profil utilisateur</li>
              <li>Changement de mot de passe depuis le profil</li>
              <li>Passage estimation → mandat</li>
              <li>Passage mandat → vente</li>
              <li>Création automatique du client après-vente lors d’une vente</li>
              <li>Enregistrement de la commission et calcul du CA commercial</li>
              <li>Emails automatiques de relance paramétrables</li>
              <li>Améliorations mobile et interface générale</li>
            </ul>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 4,
            }}
          >
            <button
              type="button"
              className="btn-outline"
              onClick={onCloseTemporary}
            >
              Lire plus tard
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={onClosePermanently}
            >
              J’ai lu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}