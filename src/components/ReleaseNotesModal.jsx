// src/components/ReleaseNotesModal.jsx
import React from "react";
import { Button, Modal } from "./ui";

// Nouveautés de la version en cours, à destination des commerciaux : d'abord ce qui sert tout de
// suite, puis ce qui change sur les fiches, enfin ce qui arrive après la réunion de présentation
// (Transactions et Rémunération sont ouverts par l'administrateur, voir DEPLOY.md).
const NOTES = [
  {
    title: "Saisie rapide",
    text: "« Ajouter » → « Saisie rapide » : décrivez le client en quelques phrases (nom, téléphone, budget, secteurs, adresse du bien…) puis « Remplir la fiche ». La fiche se remplit toute seule ; les champs à vérifier sont en orange. Rien n’est enregistré tant que vous n’avez pas cliqué sur « Créer la fiche ».",
  },
  {
    title: "Dictée en rendez-vous",
    text: "sur votre téléphone, touchez le micro du clavier dans la zone de description et parlez : pas besoin de taper. Si vous corrigez un champ puis relancez « Remplir la fiche », votre correction est conservée.",
  },
  {
    title: "Remercier le client",
    text: "le bouton « Remercier » de la fiche (proposé aussi juste après la création) prépare un message adapté : visite, passage à l’agence ou appel. Relisez, modifiez si besoin, puis envoyez par WhatsApp, SMS ou email. Par email, le client vous répond directement et vous recevez une copie. Chaque message est noté dans l’historique de la fiche.",
  },
  {
    title: "Vendeurs : confirmer le rendez-vous, puis remercier",
    text: "avant l’estimation, le message confirme le rendez-vous ; après, un bandeau sur la fiche vous propose de remercier le vendeur.",
  },
  {
    title: "Keepintouch sur téléphone",
    text: "les écrans sont adaptés à l’iPhone et à Android, avec les boutons principaux en bas, sous le pouce. Pour l’avoir comme une application : Safari → Partager → « Sur l’écran d’accueil » ; Chrome → menu ⋮ → « Ajouter à l’écran d’accueil ».",
  },
  {
    title: "Créer une fiche par type",
    text: "« Ajouter » propose Vendeur / estimation, Acquéreur ou Après-vente, avec seulement les champs utiles ; le reste est sous « Plus d’infos ». L’adresse se complète toute seule, le téléphone se met en forme et un email mal saisi est signalé.",
  },
  {
    title: "Fiche vendeur par étapes",
    text: "une frise Estimation → Sous mandat → Sous promesse → Vendu, avec les informations de chaque étape (prix de mise en vente, honoraires prévus, promesse).",
  },
  {
    title: "Sous promesse, puis acte signé",
    text: "« Passer sous promesse » : saisissez la date, le prix, les honoraires et l’acquéreur ; la fiche reste active. Le jour de l’acte, « Acte signé » : confirmez la date et les montants, la fiche passe « Vendu » et la fiche après-vente de l’acquéreur est créée toute seule. Si l’acquéreur est déjà dans vos fiches, choisissez-le dans la liste proposée pour éviter un doublon.",
  },
  {
    title: "Relances : rien ne change, en mieux",
    text: "vos relances et vos emails de rappel continuent comme avant. En plus, un changement d’étape recalcule la prochaine relance, et la 1re relance d’un nouveau vendeur est fixée au lendemain de l’estimation.",
  },
  {
    title: "Liste des clients",
    text: "filtres « À relancer », « Tous » et « Clos » avec le nombre de fiches ; un clic sur une ligne la déplie, un second la replie. Une fiche close n’a plus de relance, mais vous pouvez toujours y ajouter une note.",
  },
  {
    title: "Nouvelle présentation",
    text: "menu en haut de page, une adresse par page (vous pouvez garder un lien vers une fiche) et le bouton Retour du navigateur fonctionne.",
  },
  {
    title: "Bientôt : Transactions et Rémunération",
    text: "le suivi de vos ventes, de votre chiffre d’affaires et de votre rémunération vous sera présenté en réunion, puis ouvert dans l’application. D’ici là, ces pages n’apparaissent pas dans votre menu : c’est normal.",
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
