# Mise en production de Keepintouch 4.0

Document de travail pour Benjamin. Trois parties :

1. [État de préparation](#1-état-de-préparation) : l'audit (migrations, rémunération, tests à faire à la main, risques).
2. [Procédure](#2-procédure) : répétition sur une copie, jour J, retour en arrière, après la réunion.
3. [Annexe](#3-annexe--requêtes-de-contrôle) : les requêtes de contrôle à copier-coller.

Rien de ce document n'a été exécuté : il a été rédigé à partir de la lecture du code et des migrations
(18 novembre 2026). Toutes les requêtes fournies sont des lectures (`select`), sans effet sur les données.

---

## 1. État de préparation

### 1.1 Ce qui bloque aujourd'hui

| # | Point bloquant | Ce qu'il faut faire |
|---|---|---|
| B1 | **Les interrupteurs et les corrections de sécurité n'ont jamais tourné.** Les migrations `20261118100000_mise_en_service.sql` et `20261118110000_securite_avant_prod.sql`, et le code associé, ont été écrits sans être exécutés (ni DEV ni PROD). La seconde remplace des fonctions centrales (annulation, fiche acquéreur, déclencheur des transactions). | Commiter sur `v4`, appliquer les deux migrations en DEV dans l'ordre, tester avec un compte admin et deux comptes commerciaux (liste au § 1.5). |
| B2 | **Le schéma de base n'est pas dans le dépôt.** Les tables `clients`, `profiles`, `app_settings`, `client_comments`, leurs colonnes et leurs règles d'accès ont été créées à la main avant la première migration versionnée. Les migrations supposent des colonnes (`closed_at`, `closure_reason`, `sale_result`, `next_due_source`, `commission_ttc`…) qu'on ne peut pas vérifier par lecture. | La **répétition sur une copie de la production** (§ 2.1) est la seule vraie vérification. Elle n'est pas facultative. |
| B3 | **Version en production de `send-followup-emails` inconnue**, et son déclencheur quotidien n'est pas dans le dépôt. | Contrôle de 2 minutes dans le tableau de bord Supabase (§ 2.2, étape 4). |
| B4 | **`deno check` n'a pas été lancé** sur les fonctions Edge (Deno n'est pas installé sur le poste). `send-client-message` devait aussi être redéployée en DEV après l'erreur « Modèle invalide ». | Redéployer `send-client-message` en DEV et renvoyer un email « Confirmation du rendez-vous ». Le déploiement par Supabase vérifie le code à ce moment-là. |
| B5 | **Aucun test automatisé d'écran.** Seuls les calculs (`src/lib`) sont testés (301 tests). Aucun parcours complet n'est vérifié automatiquement. | Passer la liste de tests manuels du § 1.5 en DEV avant le jour J. |

### 1.2 Migrations à appliquer, dans l'ordre

La production s'arrête à `20261018100000`. Il y a **17 fichiers** à appliquer, dans cet ordre exact.

Lecture du tableau :

- **Rejouable** : chaque fichier peut être relancé s'il a échoué ou en cas de doute, **à condition de relancer
  ensuite tous les fichiers suivants dans l'ordre**. Rejouer un fichier ancien tout seul remet d'anciennes versions
  de fonctions et de règles d'accès (par exemple, les parts des collègues redeviendraient visibles).
- Chaque fichier est encadré par `begin` / `commit` : s'il échoue, **rien** de ce fichier n'est appliqué.
- Les requêtes de contrôle (V1, V2…) sont en annexe (§ 3).

| # | Fichier | Rôle | Touche aux données existantes ? | Contrôle après |
|---|---|---|---|---|
| 1 | `20261029100000_transactions.sql` | Crée les transactions (biens, transactions, participants, déductions), leurs règles d'accès, et **reprend l'historique** : une transaction par fiche ayant une commission saisie. | **Oui, crée des lignes** : pour chaque fiche avec `commission_ttc` renseigné, 1 bien, 1 transaction (validée d'office, marquée « reprise-historique ») et 2 parts (50 % entrée, 50 % sortie au propriétaire de la fiche). Ne modifie aucune fiche. Protégé contre la double reprise. | V1 (pré-contrôle **avant**), V2 |
| 2 | `20261030100000_transactions_buyer_fiche.sql` | Fonctions : fiche après-vente de l'acquéreur créée avec la vente. | Non | V3 |
| 3 | `20261031100000_transactions_promesse.sql` | Phase « Sous promesse », fonctions promesse / acte / annulation ; un commercial ne voit plus que sa propre part. Ajoute `release_notes_seen` aux profils. | Non (deux colonnes vides ajoutées ; la règle des phases est remplacée) | V4 (pré-contrôle **avant**), V3 |
| 4 | `20261101100000_promesse_finitions.sql` | Délai de relance « sous promesse » paramétrable. | Non (colonne vide ; 30 jours par défaut) | V3 |
| 5 | `20261102100000_phase_vendu_relances.sql` | Phase « Vendu » ; **un changement de phase recalcule la relance** et écrit un commentaire (déclencheurs sur les fiches). | **Oui, sur des fiches closes uniquement** : les fiches vendeur closes « vendu avec nous » passent en phase « Vendu » et leur date de relance est vidée. Aucune fiche active n'est modifiée. | V5 (instantané des relances, **avant et après**), V6 |
| 6 | `20261103100000_acquereur_existant.sql` | Fonctions : relier une fiche acquéreur existante à une vente. | Non | V3, V5 |
| 7 | `20261104100000_remuneration.sql` | Rémunération : réglages par commercial, commissions, salaires, paiements, factures (dossier privé), soldes. | Non. Colonnes ajoutées aux profils avec des valeurs neutres. **Aucune commission n'est générée** (voir § 1.3). Les colonnes de rémunération deviennent illisibles en direct. | V7 |
| 8 | `20261105100000_dossiers_clos.sql` | Clôture et réouverture en base ; une fiche close ne peut plus être rouverte que par l'admin. | Non | V3, V5 |
| 9 | `20261106100000_fiche_etapes.sql` | 5 champs de la fiche par étapes (valeur d'estimation, prix de mise en vente, honoraires prévus, type de mandat, pièces). | Non (colonnes vides) | V8 |
| 10 | `20261107100000_reouverture_apres_vente.sql` | Réouverture d'un dossier vendu : remet aussi en état la fiche de l'acquéreur. | Non | V3 |
| 11 | `20261108100000_verrouillage_validation.sql` | C'est la validation par l'admin qui verrouille une transaction (plus l'acte). « Acte signé » confirme prix et honoraires. | Non | V3, V9 |
| 12 | `20261110100000_saisie_rapide_ia.sql` | Journal des appels de la saisie rapide (limite d'usage). | Non (table neuve, vide) | V10 |
| 13 | `20261115100000_agences_remerciements.sql` | Agences, rattachement des commerciaux, journal des remerciements. | Non (tables neuves, vides) | V11 |
| 14 | `20261115110000_circonstance_echange.sql` | Champ « premier échange » de la fiche ; modèle « confirmation du rendez-vous ». **Doit passer après le n° 13.** | Non (colonne vide) | V11 |
| 15 | `20261118100000_mise_en_service.sql` | **Interrupteurs** : module Transactions (fermé) et « Visible par le commercial » pour la rémunération (fermé pour tous). | Non (deux colonnes ajoutées, valeur « fermé ») | V12 |
| 16 | `20261118110000_securite_avant_prod.sql` | **Corrections de sécurité** (§ 1.7) : fiche acquéreur protégée, annulation d'une vente actée réservée à l'admin, date d'ouverture obligatoire, droits d'exécution. **Doit passer après le n° 15.** | Non (fonctions, déclencheur et règle de suppression remplacés) | V14 |
| 17 | `20261120100000_arrondis_parts.sql` | **Arrondi des parts** (§ 1.8) : les parts d'une transaction totalisent exactement la base (l'écart de centimes va à une seule ligne). Remplace la fonction de calcul des commissions. **Doit passer après le n° 16.** Jamais exécuté (ni DEV ni PROD). | En production : non (aucune commission n'existe encore). En DEV : les commissions déjà calculées sont recalculées, taux conservés ; un montant peut bouger d'un centime. | V15 |

À enchaîner sans pause : les fichiers 8, 9 et 10 (la réouverture d'un dossier n'est complète qu'après le n° 10).

### 1.3 Rémunération : que se passe-t-il pour un commercial sans réglages ?

**Question :** les migrations génèrent-elles des commissions pour les transactions déjà encaissées ou signées,
quand un commercial n'a ni réglages ni date d'ouverture ?

**Réponse : non, aucune.**

- **À l'application des migrations, la table des commissions (`commission_entries`) reste vide.** La migration
  rémunération ne contient aucun calcul rétroactif. Les commissions ne sont calculées que par des déclencheurs,
  quand une transaction est écrite ; or les 7 transactions reprises sont créées par le fichier n° 1, avant que ces
  déclencheurs n'existent (fichier n° 7), et aucun fichier suivant ne réécrit de transaction.
- **Ensuite, tant que le type de rémunération d'un commercial est vide, aucune commission n'est calculée pour lui**,
  même si une de ses transactions est modifiée : le calcul s'arrête dès que le type ou le taux manque
  (`refresh_commissions`). Il n'y a donc pas de « taux par défaut ».
- **Solde vu par ce commercial : 0,00 €.** Sa page afficherait « Type de rémunération non renseigné », un solde à
  0 €, un relevé réduit à la ligne « Solde d'ouverture 0 € », et « Projection incomplète ». Avec l'interrupteur
  « Visible par le commercial » (fermé par défaut), il ne voit pas la page du tout.

**Le vrai piège était ailleurs : renseigner le type et les taux sans date d'ouverture.** Il est désormais fermé
(fichier n° 16) : la base refuse d'enregistrer un type ou un taux sans date d'ouverture, et le formulaire propose
le 1er janvier 2027 par défaut. Le mécanisme reste utile à comprendre pour choisir la date.

Quand vous enregistrez les réglages d'un commercial, la base recalcule aussitôt toutes ses transactions actées ou
signées. La seule chose qui écarte le passé est la date d'ouverture :

| Réglages enregistrés | Ce que la base génère |
|---|---|
| Type vide | Rien. Solde 0 €. |
| Type et taux, **sans date d'ouverture** | **Refusé** depuis le fichier n° 16 (« La date d'ouverture est obligatoire… »). Auparavant : une commission pour chaque vente passée du commercial, y compris les 7 reprises d'historique. |
| Type, taux et date d'ouverture | Une commission seulement pour les ventes dont la date d'acte est égale ou postérieure à la date d'ouverture. Les ventes antérieures sont réputées comprises dans le solde d'ouverture. |

Trois précisions :

1. **Les reprises « signées » sans date.** Une reprise dont la fiche n'avait ni date de vente ni date
   d'encaissement n'a pas de date d'acte. La base utilise alors sa date de création, c'est-à-dire **le jour de la
   migration**. Si la date d'ouverture d'un commercial est le jour J ou avant, ces reprises généreraient une
   commission datée du jour J. Contrôle V2 (colonne `sans_date_acte`) ; s'il y en a, soit choisir une date
   d'ouverture postérieure au jour J, soit leur donner leur vraie date d'acte avant de paramétrer.
2. **Reprises réparties 50 % entrée / 50 % sortie au propriétaire de la fiche**, quelle que soit la réalité. Sans
   importance si la date d'ouverture les écarte ; à corriger à la main sinon.
3. **La case « Visible par le commercial » protège de l'erreur** : elle ne peut être cochée que si le type, les
   deux taux et la date d'ouverture sont renseignés, et la base la décoche d'elle-même si l'un d'eux est effacé.
4. **Une date d'ouverture trop ancienne reste possible** : la base exige une date, pas une date récente. Une date
   au 1er janvier 2026, par exemple, compterait toutes les ventes de 2026 comme dues. Le contrôle du solde avant
   ouverture (§ 2.4, étape 2) reste nécessaire.
5. La règle est posée dans la fonction d'enregistrement et dans le formulaire. Une modification directe de la
   table des profils dans l'éditeur SQL ne passe pas par elle : ne pas saisir de réglages de cette façon.

### 1.4 Interrupteurs de mise en service (ce qui a été ajouté)

| Module | Interrupteur | Où | Appliqué en base ? |
|---|---|---|---|
| **Transactions** | Un seul pour toute l'équipe, fermé par défaut. | Paramètres → « Mise en service des modules », puis « Enregistrer les paramètres ». | **Seulement dans l'interface.** La base garantit uniquement que seul un admin peut changer l'interrupteur. |
| **Rémunération** | Un par commercial, fermé par défaut. | Bouton « Rémunération » du commercial → case « Visible par le commercial ». | **Oui.** Fermé, la base ne renvoie au commercial (ni à son manager) aucun réglage, commission, paiement, facture, solde ni fichier. |

Fermé, le module Transactions est masqué aux commerciaux **et aux managers** : onglet absent, adresse
`/transactions` renvoyée vers les clients, lien « Voir la transaction » retiré des fiches, et sur le tableau de bord :
CA TTC, CA HT, CA en attente, graphique des honoraires, colonne et graphique « CA HT » du comparatif.
L'admin voit toujours tout.

**Décision à confirmer.** Je n'ai pas fermé les transactions en base, parce que les fiches vendeur en ont besoin :
« Passer sous promesse » et « Acte signé » créent et relisent une transaction, et la fiche affiche la date, le prix
et les honoraires de la promesse. Les fermer en base bloquerait ces boutons pour les commerciaux dès le lendemain
de la bascule. Conséquences du choix actuel :

- avant la réunion, un commercial peut passer une fiche sous promesse et signer un acte : la transaction est créée,
  il en voit le résumé sur sa fiche, mais pas la page Transactions ;
- un commercial techniquement averti pourrait lire ses propres transactions sans passer par l'interface (jamais
  celles des autres, ni les parts des collègues : cela, la base l'interdit déjà).

L'autre option serait de réserver aussi « Sous promesse » et « Acte signé » à l'admin tant que le module est fermé.
C'est faisable, mais les commerciaux ne pourraient plus faire avancer leurs fiches vendeur au-delà du mandat.

### 1.5 À tester à la main avant la production

Aucun de ces parcours n'a de test automatisé complet. À faire en DEV, avec un compte admin et un compte commercial.

**Interrupteurs (nouveau, jamais exécuté)**

- [ ] Commercial, tout fermé : pas d'onglet Transactions ni Rémunération ; `/transactions` et `/remuneration`
      tapés à la main renvoient vers les clients ; tableau de bord sans CA ni graphique.
- [ ] Commercial, tout fermé : « Passer sous promesse » puis « Acte signé » fonctionnent sur une fiche vendeur.
- [ ] Admin : voit tout, quels que soient les interrupteurs.
- [ ] Réglages d'un commercial incomplets : la case « Visible par le commercial » est grisée, avec le rappel de ce
      qui manque. Complets : cochable ; le commercial voit sa page après rechargement.
- [ ] Effacer la date d'ouverture d'un commercial « visible » : sa page se referme.
- [ ] Manager : ne voit que les rémunérations ouvertes de son équipe.

**Corrections de sécurité (fichier n° 16, jamais exécuté)**

- [ ] Commercial, vente actée non validée dont il est le créateur : pas de bouton « Annuler la transaction » ni
      « Supprimer » ; il peut encore corriger les montants et la répartition.
- [ ] Admin, vente actée dont la fiche vendeur est close « Vendu » : « Annuler la transaction » renvoie vers
      « Rouvrir le dossier » ; la réouverture annule la vente, rouvre le vendeur, traite l'acquéreur, et la
      commission disparaît du relevé du commercial.
- [ ] Admin, vente actée sans fiche vendeur reliée : « Annuler la transaction » fonctionne, la fiche de
      l'acquéreur est remise en état, la commission disparaît ; « Supprimer » devient possible ensuite.
- [ ] Commercial : annuler une **promesse** et annuler une **location** restent possibles.
- [ ] Modifier une vente actée : ni choix Promesse / Vente, ni choix du type.
- [ ] Commercial A, promesse avec la fiche acquéreur du commercial B : refus avec le message « Cette fiche est
      suivie par… ». Même essai par B, par le manager de B, par l'admin : accepté.
- [ ] Promesse créée par l'admin avec le vendeur de A et l'acquéreur de B : A ne peut ni signer l'acte ni annuler
      la promesse (message explicite) ; B ou l'admin le peuvent.
- [ ] Réglages de rémunération : date d'ouverture préremplie au 01/01/2027 ; date effacée avec un type renseigné :
      refus dans le formulaire.

**Transactions et rémunération**

- [ ] **Location de bout en bout** : « Nouvelle location », bailleur, locataire, honoraires, validation admin,
      commission générée, présence dans le CA.
- [ ] **Agent assujetti à la TVA** : commission HT, TVA, montant dû TTC ; dépôt d'une facture ; paiement partiel
      puis total ; statut de la facture ; solde.
- [ ] **Salarié, imputation de salaire** : salaire avec part fixe et prime ; seule la part variable diminue le solde.
- [ ] **Agent sans TVA** : commission, facture, paiement.
- [ ] **Date d'ouverture** : une vente antérieure ne génère pas de commission ; une vente postérieure oui.
- [ ] **Taux exceptionnel** sur un participant, puis « Recalculer les commissions aux taux actuels ».
- [ ] Vente partagée entre deux commerciaux : chacun ne voit que sa part et sa commission.
- [ ] Déduction avant commission ; refus si les déductions dépassent les honoraires.
- [ ] Validation par l'admin : la transaction devient non modifiable par le commercial.
- [ ] Annulation d'une promesse : la fiche vendeur repasse « Sous mandat », l'acquéreur redevient acquéreur actif.
- [ ] Réouverture par l'admin d'un dossier vendu : vente annulée, fiche de l'acquéreur remise en état.
- [ ] Détail d'une transaction → Modifier → Annuler, puis vérifier que la page défile encore (correction récente).

**Fiches et relances**

- [ ] **Relance après chaque changement de phase** : pré-mandat → mandat → sous promesse → vendu, et retour en
      mandat après annulation. Vérifier la date calculée et le commentaire ajouté.
- [ ] **Envoi quotidien des relances** : en DEV, déclencher la fonction avec des fiches sous promesse, vendues,
      closes et après-vente. Attendu : rien pour les fiches closes ou vendues, relance normale pour les autres.
- [ ] Clôture d'une fiche (chaque motif), note sur une fiche close.
- [ ] Création d'une fiche de chaque type sur ordinateur et sur téléphone ; la page défile, la barre « Créer la
      fiche » ne masque pas le dernier champ.
- [ ] Saisie rapide : texte collé, dictée, correction conservée après un second « Remplir la fiche ».

**Remerciements**

- [ ] WhatsApp, SMS, « Ouvrir dans ma messagerie », envoi par l'application ; ligne ajoutée à l'historique.
- [ ] Vendeur : « Confirmation du rendez-vous » avant l'estimation, remerciement après.
- [ ] Commercial sans agence, commercial dans deux agences, agence sans lien d'avis Google.
- [ ] Fiche sans email, sans téléphone ; limite de 40 emails par jour.

### 1.6 Risques et incohérences relevés

**Sécurité des fonctions de la base**

| # | Constat | État |
|---|---|---|
| R1 | `buyer_fiche_transition` (fichier n° 6) s'exécutait avec tous les droits et pouvait modifier la fiche acquéreur d'un collègue, ou rouvrir une fiche close en laissant sa date et son motif de clôture. | **Corrigé par le fichier n° 16** (§ 1.7). |
| R2 | `create_after_sale_client` et `close_seller_as_sold` (fichier n° 3), prévues comme internes, sont appelables directement. | **Inchangé, accepté** : elles s'exécutent avec les droits de l'appelant, qui ne peut donc agir que sur les fiches que les règles d'accès lui laissent déjà modifier directement. À revoir si ces règles (hors dépôt) sont plus larges que prévu. |
| R3 | Depuis le fichier n° 11, le créateur ou un participant pouvait annuler ou supprimer une **vente actée non validée**, ou la repasser en promesse, sans que les fiches soient remises en état. | **Corrigé par le fichier n° 16** : réservé à l'admin (§ 1.7). |
| R4 | La réouverture d'un dossier vendu annule toutes les transactions actées de la fiche vendeur, **locations comprises**. | **Non corrigé** (hors de la demande). Une location liée à la même fiche serait annulée avec la vente. |

**Données et migrations**

| # | Constat | Conséquence |
|---|---|---|
| R5 | Le fichier n° 1 échoue en bloc si une seule fiche a une commission négative, une TVA hors 0-100 ou un propriétaire sans profil. | Rien n'est appliqué. Pré-contrôle V1 avant de commencer. |
| R6 | Les fichiers n° 3 et n° 5 suppriment toute règle de la table des fiches qui mentionne la phase, et échouent s'il existe une phase inattendue. | Pré-contrôle V4. |
| R7 | **Entre le fichier n° 5 et la mise en ligne de la nouvelle interface**, l'ancienne interface est encore en service : un changement de phase y recalculerait la relance et écrirait deux commentaires. | Faire la bascule un soir, sans utilisateur, et enchaîner sans pause. |
| R8 | La reprise rattache toujours la fiche comme **acquéreur** de la transaction, même s'il s'agit d'une fiche vendeur ; une fiche sans propriétaire donne une transaction sans participant, visible de l'admin seul. | Contrôle V2 ; correction à la main si besoin. |
| R9 | Les comptes dont le statut « actif » est vide sont traités comme inactifs par les agences et les remerciements. | Ils ne verraient pas les agences. Contrôle V11. |
| R10 | Après le fichier n° 8, la date et le motif de clôture d'une fiche close ne peuvent plus être modifiés, **même depuis l'éditeur SQL**. | Une correction manuelle demandera de rouvrir la fiche. |

**Exploitation**

| # | Constat | Conséquence |
|---|---|---|
| R11 | Les commerciaux qui gardent Keepintouch ouvert dans un onglet continuent d'utiliser l'ancienne interface jusqu'au rechargement. | L'email du soir leur demande de recharger la page. Une vente « avec nous » saisie dans l'ancienne interface après la bascule ne créerait pas de transaction. |
| R12 | Avec le module Transactions fermé, les commerciaux **perdent l'affichage de leur CA** sur le tableau de bord jusqu'à l'ouverture. | Voulu, mais à annoncer (c'est dit dans l'email et le guide). |
| R13 | Les 3 agences n'existent pas après la migration. Sans agence, les messages de remerciement n'ont ni signature d'agence ni lien d'avis Google. | Les créer le soir même (§ 2.2, étape 9). |
| R14 | `MESSAGE_REDIRECT_TO` est un réglage de DEV qui envoie tous les emails clients vers une seule adresse. | S'il était défini en production, aucun client ne recevrait son email. |
| R15 | Les liens des emails et des invitations pointent vers `https://www.osmozdev.com/` (écrit en dur dans les fonctions). | À confirmer comme adresse de production. |
| R16 | Le commit du lot « agences, remerciement, circonstances » est marqué « en test ». | À considérer comme la partie la moins éprouvée. |

### 1.7 Corrections de sécurité (fichier n° 16)

**Vente actée : annulation réservée à l'admin.** Entre les deux solutions possibles (laisser le commercial annuler
en remettant les fiches en état, ou réserver l'annulation à l'admin), c'est la seconde qui est retenue :

- défaire une vente rouvre la fiche du vendeur et modifie celle de l'acquéreur, qui peut appartenir à un
  collègue : c'est exactement le type d'action que le point R1 interdit à un commercial ;
- le parcours qui remet tout en état existe déjà et il est réservé à l'admin (« Rouvrir le dossier ») ; il n'y a
  ainsi qu'un seul chemin, déjà écrit, au lieu de deux à maintenir en accord ;
- une vente actée annulée par erreur coûte cher (commission retirée, relances relancées) : un regard de l'admin
  est justifié.

Concrètement, pour une **vente** actée (une location n'est pas concernée, elle n'engage aucune fiche) :

| Action | Commercial | Admin |
|---|---|---|
| Corriger montants, déductions, répartition (non validée) | Oui | Oui |
| Annuler | **Non** | Oui. Si la vente a clos la fiche du vendeur : par « Rouvrir le dossier » uniquement. Sinon : annulation directe, la fiche de l'acquéreur est remise en état. |
| Supprimer | **Non** | Seulement après l'avoir annulée |
| La repasser en promesse, changer son type | **Non** | **Non** (il faut l'annuler) |

**Aucune commission orpheline.** Les commissions suivent le statut de la transaction : elles sont supprimées dès
qu'elle n'est plus actée (annulation, quel que soit le chemin) et en cascade si la transaction est supprimée.
Contrôle V14.

**Fiche acquéreur d'un collègue.** Une fiche acquéreur n'est plus modifiée que si l'appelant en est le
propriétaire, son manager, ou un admin, et seulement si l'action correspond à l'état réel de la transaction.
**Conséquence à connaître** : quand l'acquéreur d'une vente est la fiche d'un collègue, le commercial du vendeur
ne peut plus, seul, ni enregistrer la promesse avec cette fiche, ni signer l'acte, ni annuler la promesse, ni
clôturer sa fiche vendeur sous promesse. Le propriétaire de la fiche acquéreur, son manager ou l'admin le font.
Le formulaire l'annonce dès le choix de la fiche. Si les commerciaux ne voient que leurs propres fiches en
production, le cas ne se présente pas.

**Tableau fonction → contrôle appliqué** (fonctions `SECURITY DEFINER` de la v4, plus les fonctions citées dans
la demande ; « droits de l'appelant » = la fonction n'a aucun privilège propre, les règles d'accès des tables
s'appliquent). L'exécution est retirée à `public` et `anon` pour toutes.

| Fonction | Mode | Contrôle appliqué | Modifiée par le n° 16 |
|---|---|---|---|
| `buyer_fiche_transition` | definer | Pouvoir modifier la transaction ; action cohérente avec son statut ; **propriétaire de la fiche, son manager ou admin** | Oui |
| `can_manage_client_fiche` | definer | Renvoie vrai pour le propriétaire, son manager, l'admin (fonction d'aide, nouvelle) | Nouvelle |
| `undo_cancelled_sale_buyer` | definer | **Admin uniquement** ; transaction de vente annulée ; reprises d'historique ignorées | Nouvelle |
| `cancel_transaction` | droits de l'appelant | Règles d'accès des transactions ; transaction validée → admin ; **vente actée → admin** | Oui |
| `save_compensation_settings` | definer | **Admin uniquement** ; **date d'ouverture obligatoire** avec un type ou un taux | Oui |
| `compensation_type_of` | definer | **Soi-même, ou rémunération lisible** (admin ; manager si ouverte) | Oui |
| `transaction_shares_total` | definer | **Transaction lisible par l'appelant** | Oui |
| `validate_transaction` | definer | Admin uniquement | Non |
| `set_participant_rate` | definer | Admin uniquement | Non |
| `recalculate_transaction_commissions` | definer | Admin uniquement | Non |
| `set_compensation_visible` | definer | Admin uniquement ; réglages complets | Non |
| `reopen_client` | definer | Admin uniquement ; motif obligatoire | Non |
| `undo_sale_buyer_fiche` | definer | Interne : exécution retirée aussi aux utilisateurs connectés | Non |
| `refresh_commissions` | definer | Interne : exécution retirée aussi aux utilisateurs connectés | Non |
| `compensation_settings`, `can_read_compensation`, `can_read_invoice_folder` | definer | Admin ; soi-même ou son équipe seulement si la rémunération est ouverte | Non (n° 15) |
| `record_promise`, `sign_promise_sale`, `close_seller_with_promise`, `close_client`, `save_transaction`, `save_transaction_with_buyer`, `record_own_sale` | droits de l'appelant | Règles d'accès des fiches et des transactions ; déclencheurs (validation, vente actée, dossier clos) ; fiche acquéreur visible | Non |
| `can_read_transaction`, `can_edit_transaction`, `can_edit_property`, `transaction_has_participant`, `transaction_locked`, `is_manager_of`, `is_active_user`, `seller_phase_next_due` | definer | Fonctions d'aide des règles d'accès : elles ne renvoient qu'un oui/non (ou un délai) et n'écrivent rien. **Pas de contrôle de l'appelant** : un utilisateur connecté qui connaîtrait un identifiant pourrait savoir si une transaction est validée ou qui est manager de qui. Laissé tel quel pour ne pas fragiliser les règles d'accès qui s'appuient dessus. | Non |
| `on_seller_phase_change`, `on_seller_phase_comment`, `on_transaction_commissions`, `check_payment` | definer | Fonctions de déclencheur : non appelables directement. Exécution retirée à `public` et `anon`. | Droits |

### 1.8 Arrondi des parts (fichier n° 17)

**Le défaut.** Chaque part était arrondie séparément. Une base de 12 966,67 € répartie 50/50 donnait deux parts
de 6 483,34 €, soit 12 966,68 € : un centime de plus que la base.

**La règle, identique dans l'interface et dans la base.** Chaque part est arrondie au centime, puis l'écart avec
la base est attribué à **une seule ligne** : la plus grande part ; à égalité, la sortie avant l'entrée, puis le
plus grand identifiant de commercial. Exemple : 6 483,34 € (entrée) + 6 483,33 € (sortie) = 12 966,67 €.
La commission de chaque ligne est calculée sur sa part ainsi répartie (part × taux, arrondie au centime).

Deux précisions :

1. **Les commissions n'ont pas de total à respecter** quand les taux diffèrent d'un participant à l'autre : la
   règle garantit le total des parts, et chaque commission découle de sa part.
2. **Vente partagée, vue par un commercial.** Un commercial ne lit que sa propre ligne : l'interface ne peut pas
   savoir si c'est lui qui porte l'écart. Sur la page Transactions, sa part d'une vente partagée peut donc
   différer **d'un centime** de la part retenue par la base (celle du détail des commissions et du relevé, qui
   fait foi). L'admin et le manager, qui voient toutes les lignes, ont toujours le montant exact.

À tester en DEV après application :

- [ ] Vente à 12 966,67 € de base, un seul commercial en entrée et en sortie (50/50) : « Ma part encaissée »
      affiche 12 966,67 € ; le détail montre 6 483,34 € et 6 483,33 €.
- [ ] Vente à trois participants (33,33 / 33,33 / 33,34 %) : les trois parts du détail totalisent la base.
- [ ] Commercial dont les salaires dépassent le variable acquis : carte « Avance sur salaire variable » en
      orange, montant positif ; relevé « Avance … » ; liste de l'admin « Avance … ».

---

## 2. Procédure

Vocabulaire :

- **Tableau de bord Supabase** : `supabase.com/dashboard`, puis le projet.
- **Éditeur SQL** : menu de gauche « SQL Editor ». On y colle le contenu d'un fichier, puis « Run ».
- **Appliquer une migration** : ouvrir le fichier du dossier `supabase/migrations` avec le Bloc-notes, tout
  sélectionner, copier, coller dans une nouvelle requête de l'éditeur SQL, « Run ». Résultat attendu :
  « Success. No rows returned ». **En cas de message d'erreur : s'arrêter, ne pas passer au fichier suivant**,
  copier le message. Le fichier en erreur n'a rien modifié.

### 2.0 Avant tout (dans la semaine)

- [ ] Commiter et pousser sur `v4` le travail en cours (corrections, interrupteurs, notes de version, documents).
- [ ] Appliquer en DEV, dans l'ordre, `20261118100000_mise_en_service.sql`,
      `20261118110000_securite_avant_prod.sql` puis `20261120100000_arrondis_parts.sql`, lancer V12, V14 et V15,
      et passer les tests des § 1.5 et 1.8.
      En DEV, si un commercial a déjà un type ou des taux sans date d'ouverture, lui en donner une : ses réglages
      ne pourront plus être enregistrés sans.
- [ ] Redéployer `send-client-message` en DEV et vérifier l'email « Confirmation du rendez-vous ».
- [ ] Créer la clé Anthropic `keepintouch-prod` (console Anthropic) et la garder dans un gestionnaire de mots de passe.
- [ ] Préparer la liste des 3 agences : nom, adresse, téléphone, lien d'avis Google (en `https://`), membres.
- [ ] Choisir le soir de la bascule et prévenir l'équipe.

### 2.1 Répétition sur une copie de la production

But : vérifier que les 17 migrations passent sur les vraies données, sans toucher à la production.

**Étape 1. Créer la copie**

1. Tableau de bord Supabase → projet de **production** → « Database » → « Backups ».
2. Choisir la dernière sauvegarde → « Restore to a new project ». Nommer le projet `keepintouch-repetition`,
   même région que la production.
3. Attendre la fin de la création (quelques minutes).

Si le bouton « Restore to a new project » n'apparaît pas, l'offre du projet ne le permet pas. L'autre méthode
passe par la ligne de commande : dans ce cas, s'arrêter et me le demander plutôt que d'improviser.

**Étape 2. Empêcher la copie d'envoyer des emails**

La copie contient les données, pas les fonctions Edge ni leurs secrets : elle ne peut pas envoyer d'email par
elle-même. Mais si l'envoi quotidien est planifié dans la base, la planification a été copiée et appellerait la
fonction **de production** une seconde fois par jour. Dans l'éditeur SQL de la copie :

```sql
select jobid, jobname, schedule, command from cron.job;
```

- Erreur « relation cron.job does not exist » : rien à faire.
- Des lignes s'affichent : pour chacune, lancer `select cron.unschedule(<jobid>);` (dans la copie uniquement).

**Étape 3. Pré-contrôles** : lancer V1, V4 et V5 (§ 3) et **noter les résultats**.

**Étape 4. Appliquer les 17 migrations** dans l'ordre du § 1.2, avec le contrôle indiqué après chacune.

**Étape 5. Vérifications finales** (toutes dans l'éditeur SQL de la copie)

| Vérification | Requête | Attendu |
|---|---|---|
| Reprise de l'historique | V2 | **7** transactions « reprise-historique », aucun doublon |
| CA HT 2026, vue « Tous » | V13 | **113 246,65** |
| Aucune commission non voulue | V7 | `commission_entries` : **0** ligne |
| Relances intactes | V5, comparé à l'étape 3 | Résultat **identique** pour les fiches actives |
| Interrupteurs fermés | V12 | `false` partout |
| Corrections de sécurité en place | V14 | Aucune fonction v4 exécutable sans connexion ; contrôles présents ; 0 commission orpheline |
| Arrondi des parts en place | V15 | `true`, `false` ; 0 transaction en écart |

Si le CA diffère de 113 246,65 €, ne pas aller plus loin : comparer le détail (V13 bis) avec le tableau de bord
actuel pour trouver la ou les ventes en écart.

Pour voir aussi l'interface sur la copie (facultatif), il faudrait un déploiement de prévisualisation Vercel de la
branche `v4` pointant vers la copie : me demander, cela se prépare.

**Étape 6. Supprimer la copie**

Tableau de bord Supabase → projet `keepintouch-repetition` → « Project Settings » → « General » → tout en bas,
« Delete project ». **Vérifier deux fois le nom du projet affiché en haut de l'écran avant de confirmer.**
La copie contient les données réelles des clients : ne pas la laisser traîner.

### 2.2 Jour J (un soir, hors heures de travail)

Compter 1 h 30. Garder ce document, le dossier `supabase/migrations` et les résultats de la répétition sous la main.

**Étape 1. Sauvegarde de la production**

- [ ] Tableau de bord Supabase → production → « Database » → « Backups » : noter la date et l'heure de la
      dernière sauvegarde. Si elle a plus de quelques heures et que le bouton existe, lancer une sauvegarde
      manuelle ; sinon, attendre la sauvegarde automatique de la nuit précédente et faire la bascule en début de soirée.
- [ ] Noter l'heure exacte de début de la bascule (utile pour un retour en arrière).
- [ ] Vercel → projet → « Deployments » : repérer le déploiement de production actuel (pastille « Current ») et
      noter son identifiant. C'est celui vers lequel on reviendrait.

**Étape 2. Pré-contrôles** : V1, V4, V5. Noter les résultats. V1 doit donner 7 fiches et aucune ligne fautive.

**Étape 3. Migrations**

- [ ] Appliquer les 17 fichiers dans l'ordre du § 1.2, sans pause, avec le contrôle de chacun.
- [ ] Vérifications finales : les mêmes qu'à l'étape 5 de la répétition (7 reprises, 113 246,65 €, 0 commission,
      relances identiques, interrupteurs fermés, arrondi en place).

**Étape 4. Fonctions Edge**

- [ ] `send-followup-emails` : **son code n'a pas changé entre `main` et `v4`**. Il n'est à redéployer que si la
      production fait tourner une version plus ancienne. Pour le savoir : « Edge Functions » →
      `send-followup-emails` → onglet du code, chercher le texte `x-cron-secret`.
      - Présent : la production est à jour, **ne rien faire**.
      - Absent : la production fait tourner l'ancienne version. **Ne pas la redéployer ce soir-là** : la nouvelle
        exige le secret `CRON_SECRET` et un en-tête envoyé par la planification ; sans eux, les relances
        s'arrêteraient. À traiter à part, à tête reposée.
- [ ] `parse-client-description` (nouvelle) : « Edge Functions » → « Deploy a new function » → « Via Editor ».
      Nom exact `parse-client-description`. Coller le contenu de
      `supabase/functions/parse-client-description/index.ts`. Laisser « Verify JWT » activé. Déployer.
- [ ] `send-client-message` (nouvelle) : même méthode, nom exact `send-client-message`, contenu de
      `supabase/functions/send-client-message/index.ts`.
- [ ] `invite-user` : inchangée, ne pas y toucher.

**Étape 5. Secrets de production** (« Edge Functions » → « Secrets »)

| Secret | Action |
|---|---|
| `ANTHROPIC_API_KEY` | **À créer** : la clé `keepintouch-prod`. Ne pas réutiliser la clé de DEV. |
| `RESEND_API_KEY` | Vérifier qu'il existe. Ne pas le modifier. |
| `CRON_SECRET` | Vérifier qu'il existe (si la fonction de relance contient `x-cron-secret`). Ne pas le modifier. |
| `MESSAGE_REDIRECT_TO` | **Ne doit pas exister.** S'il est dans la liste, le supprimer. |
| `RESEND_FROM_DOMAIN`, `ANTHROPIC_MODEL` | Facultatifs. Ne pas les créer. |

**Étape 6. Mise en ligne de l'interface**

- [ ] Vercel → « Settings » → « Environment Variables » : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` de
      l'environnement « Production » pointent bien vers le projet Supabase de production. Ne rien modifier.
- [ ] GitHub → dépôt → « Pull requests » → « New pull request » : base `main`, compare `v4`. Créer, puis
      « Merge pull request ».
- [ ] Vercel → « Deployments » : attendre que le nouveau déploiement de production passe à « Ready ».

**Étape 7. Contrôles après déploiement**

Avec votre compte admin :

- [ ] La fenêtre « Nouveautés de Keepintouch 4.0 » s'affiche.
- [ ] Liste des clients : même nombre de fiches actives qu'avant ; une fiche connue affiche la même date de relance.
- [ ] Tableau de bord, vue « Tous » : CA HT 2026 = 113 246,65 €.
- [ ] Transactions : les 7 reprises sont là, validées.
- [ ] Rémunération : tous les commerciaux « À renseigner · masqué au commercial », soldes à 0 €.
- [ ] Saisie rapide : coller une description fictive, « Remplir la fiche », **ne pas créer la fiche**.

Avec un compte commercial (ou en demandant à un commercial de confiance) :

- [ ] Pas d'onglet Transactions ni Rémunération ; tableau de bord sans CA.
- [ ] Ouvrir une fiche, valider une relance.
- [ ] « Remercier » sur une fiche à votre propre adresse email : l'email arrive, avec copie au commercial.

Le lendemain matin :

- [ ] Les emails de relance quotidiens sont bien partis (« Edge Functions » → `send-followup-emails` → « Logs »,
      ou simplement demander à un commercial).

**Étape 8. Interrupteurs**

- [ ] Paramètres → « Mise en service des modules » : la case Transactions est **décochée**. Ne pas la cocher.
- [ ] Ne cocher aucune case « Visible par le commercial ».

**Étape 9. Agences**

- [ ] Paramètres → encadré « Agences » : créer les 3 agences (nom, adresse, téléphone, lien d'avis Google en
      `https://`), « Créer l'agence » pour chacune.
- [ ] Rattacher chaque commercial à son agence (ou à ses agences).
- [ ] Vérifier sur une fiche : « Remercier » propose la bonne agence et le lien d'avis.

**Étape 10. Communication**

- [ ] Envoyer l'email de `EMAIL-EQUIPE.md`, avec `GUIDE-EQUIPE.md` en pièce jointe.

### 2.3 Plan de retour en arrière

**Cas 1. Une migration échoue pendant l'étape 3.**
Rien de ce fichier n'est appliqué. Ne pas continuer. L'ancienne interface reste en ligne et fonctionne avec les
fichiers déjà passés, avec une réserve : à partir du fichier n° 5, un changement de phase recalcule la relance.
Corriger la cause, puis reprendre au fichier en erreur. Si la correction ne peut pas se faire le soir même, ne
pas mettre la nouvelle interface en ligne et me transmettre le message d'erreur.

**Cas 2. La nouvelle interface pose problème après la mise en ligne.**

1. Vercel → « Deployments » → le déploiement noté à l'étape 1 → menu « ⋯ » → « Instant Rollback » (ou « Promote
   to Production »). L'ancienne interface revient en moins d'une minute.
2. **Ne rien défaire côté base.** Les migrations n'ont fait qu'ajouter des tables, des colonnes et des fonctions ;
   l'ancienne interface n'utilise que ce qu'elle utilisait déjà et continue de fonctionner. Trois différences à
   connaître tant qu'on reste dans cet état :
   - un changement de phase recalcule la date de relance et ajoute deux commentaires ;
   - une fiche close ne peut plus être modifiée dans sa date ou son motif de clôture ;
   - une vente « avec nous » saisie dans l'ancienne interface n'apparaîtra pas dans les transactions de la v4.
     Elle pourra être reprise plus tard (le bloc de reprise du fichier n° 1 est prévu pour être relancé).
3. Les deux nouvelles fonctions Edge et les secrets peuvent rester : l'ancienne interface ne les appelle pas.
4. Prévenir l'équipe en une ligne : « retour à la version précédente, rechargez la page ».

**Cas 3. Les données sont abîmées** (relances modifiées en masse, fiches closes à tort). Peu probable, la
répétition sert à l'exclure.

- Restaurer la sauvegarde de l'étape 1 : « Database » → « Backups » → « Restore ». **Tout ce qui a été saisi
  depuis la sauvegarde est perdu.** Cette décision se prend le soir même, avant que l'équipe ne retravaille.
- Puis revenir à l'ancienne interface (cas 2, point 1).
- Passé le lendemain matin, ne plus restaurer : corriger les données à la main, avec mon aide.

### 2.4 Après la réunion : ouvrir les modules

**Étape 1. Paramétrer chaque commercial** (Paramètres → liste des utilisateurs → « Rémunération »)

Pour chacun, **dans la même saisie** :

- [ ] Type : salarié, agent commercial (micro, sans TVA) ou agent commercial (assujetti TVA).
- [ ] Taux entrée et taux sortie.
- [ ] TVA de l'agent (agents assujettis seulement).
- [ ] **Date d'ouverture** : la date à partir de laquelle Keepintouch calcule. Elle est obligatoire et proposée au
      1er janvier 2027 ; la base refuse des taux sans
      date d'ouverture (§ 1.3). Si des reprises n'ont pas de date d'acte (V2), choisir une date postérieure au jour J.
- [ ] Solde d'ouverture : ce que l'agence doit au commercial à cette date (TTC pour un agent assujetti).
- [ ] Laisser « Recalculer aussi les commissions déjà acquises » **décoché**.
- [ ] Laisser « Visible par le commercial » **décoché** pour l'instant. Enregistrer.

**Étape 2. Contrôler avant d'ouvrir**

- [ ] Page Rémunération : pour chaque commercial, le solde est celui attendu (solde d'ouverture, plus les
      commissions des ventes actées depuis la date d'ouverture). Ouvrir le relevé de chacun.
- [ ] Un solde anormalement élevé signale une date d'ouverture oubliée ou trop ancienne : corriger la date et
      enregistrer, les commissions antérieures sont retirées.

**Étape 3. Ouvrir**

- [ ] Transactions : Paramètres → « Mise en service des modules » → cocher → « Enregistrer les paramètres ».
- [ ] Rémunération : pour chaque commercial contrôlé, rouvrir ses réglages, cocher « Visible par le commercial »,
      enregistrer. On peut ouvrir un commercial à la fois.
- [ ] Demander à l'équipe de recharger la page.

Pour refermer : décocher et enregistrer. L'effet est immédiat en base pour la rémunération, au prochain
chargement de page pour les transactions.

---

## 3. Annexe : requêtes de contrôle

À coller dans l'éditeur SQL. Ce sont toutes des lectures.

**V1. Avant le fichier n° 1 : ce que la reprise va créer, et ce qui la ferait échouer**

```sql
-- Fiches reprises : attendu 7 au total
select category, status, count(*) as fiches, sum(commission_ttc) as total_ttc,
       count(*) filter (where commission_received_at is not null) as encaissees,
       count(*) filter (where owner_id is null) as sans_proprietaire
from public.clients where commission_ttc is not null group by 1, 2;

-- Lignes qui feraient échouer la migration : attendu 0 ligne pour chacune
select id, commission_ttc, commission_vat_rate from public.clients
where commission_ttc < 0 or commission_vat_rate < 0 or commission_vat_rate > 100;

select c.id, c.owner_id from public.clients c
where c.commission_ttc is not null and c.owner_id is not null
  and not exists (select 1 from public.profiles p where p.id = c.owner_id);
```

**V2. Après le fichier n° 1 : reprise de l'historique**

```sql
-- Attendu : 7 transactions ; non_validees = 0
select status, count(*) as transactions, sum(fees_ttc) as ttc, sum(fees_ht) as ht,
       count(*) filter (where deed_date is null) as sans_date_acte,
       count(*) filter (where validated_at is null) as non_validees
from public.transactions where notes like '%[reprise-historique client:%' group by 1;

-- Doublons : attendu 0 ligne
select substring(notes from 'client:([0-9a-f-]{36})') as fiche, count(*)
from public.transactions where notes like '%[reprise-historique client:%'
group by 1 having count(*) > 1;

-- Parts différentes de 100 % : attendu 0 ligne (sauf fiche sans propriétaire)
select t.id, coalesce(sum(tp.share_pct), 0) as parts
from public.transactions t
left join public.transaction_participants tp on tp.transaction_id = t.id
where t.notes like '%[reprise-historique client:%'
group by t.id having coalesce(sum(tp.share_pct), 0) <> 100;
```

**V3. Après chaque fichier de fonctions : une seule version de chaque fonction**

```sql
-- Attendu : 0 ligne (une ligne signale une fonction en double, donc un fichier rejoué hors de l'ordre)
select proname, count(*) from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('record_promise', 'sign_promise_sale', 'cancel_transaction', 'reopen_client',
                  'save_transaction', 'save_transaction_with_buyer', 'close_client')
group by 1 having count(*) > 1;
```

**V4. Avant le fichier n° 3 : phases et règles existantes**

```sql
-- Toute valeur autre que vide, pre_mandat, mandat (ou sous_promesse, vendu) ferait échouer la migration
select deal_stage, count(*) from public.clients group by 1;

-- Règles qui seront remplacées : vérifier qu'aucune ne porte sur autre chose que la phase
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.clients'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%deal_stage%';
```

**V5. Instantané des relances (avant de commencer, puis après les fichiers n° 5, 6, 8 et à la fin)**

```sql
-- Le résultat doit rester strictement identique d'un passage à l'autre
select count(*) as fiches_actives, count(next_due_date) as avec_relance,
       min(next_due_date) as premiere, max(next_due_date) as derniere,
       md5(string_agg(id::text || coalesce(next_due_date::text, ''), ',' order by id)) as empreinte
from public.clients where status <> 'closed';
```

**V6. Après le fichier n° 5**

```sql
-- Attendu : 0
select count(*) from public.clients
where category = 'seller' and status = 'closed' and sale_result = 'vendu_avec_nous'
  and deal_stage is distinct from 'vendu';

-- Attendu : 0 (fiche vendue encore active avec une relance : elle recevrait des rappels)
select count(*) from public.clients
where deal_stage = 'vendu' and status <> 'closed' and next_due_date is not null;
```

**V7. Après le fichier n° 7 : rémunération**

```sql
-- Attendu : 0, 0, 0
select (select count(*) from public.commission_entries) as commissions,
       (select count(*) from public.payments) as paiements,
       (select count(*) from public.invoices) as factures;

-- Attendu : aucun commercial paramétré (0 ligne)
select email, compensation_type, rate_entree, rate_sortie, opening_balance, opening_balance_date
from public.profiles
where compensation_type is not null or opening_balance <> 0 or opening_balance_date is not null;
```

**V8. Après le fichier n° 9**

```sql
-- Attendu : 5
select count(*) from information_schema.columns
where table_schema = 'public' and table_name = 'clients'
  and column_name in ('estimation_value', 'listing_price', 'planned_fees_ttc', 'mandate_type', 'rooms');
```

**V9. Après le fichier n° 11**

```sql
-- Attendu : 1 ligne, 5 arguments
select pg_get_function_identity_arguments(oid) from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'sign_promise_sale';

-- Attendu : 0 (aucune promesse validée)
select count(*) from public.transactions where validated_at is not null and status not in ('cashed', 'signed');
```

**V10. Après le fichier n° 12**

```sql
-- Attendu : true, 0
select (select relrowsecurity from pg_class where oid = 'public.ai_parse_logs'::regclass) as protegee,
       (select count(*) from public.ai_parse_logs) as lignes;
```

**V11. Après les fichiers n° 13 et 14**

```sql
-- Attendu : 3 lignes, true
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('agencies', 'agency_members', 'client_outreach');

-- Attendu : la définition contient 'vendeur_rdv'
select pg_get_constraintdef(oid) from pg_constraint where conname = 'client_outreach_template_check';

-- Attendu : 0 (sinon ces comptes ne verront pas les agences : mettre leur statut à « actif »)
select count(*) from public.profiles where is_active is null;
```

**V12. Après le fichier n° 15 : interrupteurs**

```sql
-- Attendu : false
select modules_transactions_visible from public.app_settings;

-- Attendu : 0
select count(*) from public.profiles where compensation_visible;

-- Attendu : 1 ligne, dont les arguments de sortie se terminent par compensation_visible
select pg_get_function_result(oid) from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'compensation_settings';
```

**V14. Après le fichier n° 16 : corrections de sécurité**

```sql
-- Attendu : 0 ligne (aucune fonction à privilèges de la v4 exécutable sans être connecté).
-- Une fonction antérieure à la v4 peut apparaître (par exemple is_admin) : ce n'est pas une anomalie.
select p.oid::regprocedure as fonction
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and has_function_privilege('anon', p.oid, 'execute')
order by 1;

-- Attendu : false, false (fonctions internes)
select has_function_privilege('authenticated', 'public.undo_sale_buyer_fiche(uuid,uuid)', 'execute') as undo_interne,
       has_function_privilege('authenticated', 'public.refresh_commissions(uuid,boolean,uuid,uuid)', 'execute') as calcul_interne;

-- Attendu : true, true, true (les textes des contrôles sont en place)
select
  (select prosrc like '%can_manage_client_fiche%' from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'buyer_fiche_transition') as fiche_acquereur,
  (select prosrc like '%ouverture est obligatoire%' from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'save_compensation_settings') as date_ouverture,
  (select prosrc like '%annulation est réservée%' from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'protect_acted_transaction') as vente_actee;

-- Attendu : la règle contient « cashed » (suppression d'une vente actée exclue pour un commercial)
select qual from pg_policies
where schemaname = 'public' and tablename = 'transactions' and policyname = 'transactions delete';

-- Commissions orphelines : attendu 0 ligne, à tout moment (aussi après les tests d'annulation)
select e.id, e.transaction_id, t.status
from public.commission_entries e
left join public.transactions t on t.id = e.transaction_id
where t.id is null or t.status not in ('cashed', 'signed');
```

**V15. Après le fichier n° 17 : arrondi des parts**

```sql
-- Attendu : true, false (la nouvelle fonction est en place et reste interne)
select
  (select prosrc like '%ecart%' from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'refresh_commissions') as arrondi_en_place,
  has_function_privilege('authenticated', 'public.refresh_commissions(uuid,boolean,uuid,uuid)', 'execute') as appelable;

-- Attendu : 0 ligne. Transactions dont TOUS les participants ont une commission et dont les parts ne
-- totalisent pas la base nette (une transaction dont un participant n'a pas de commission n'est pas listée).
select t.id, round(coalesce(t.fees_ht, 0) - coalesce(d.total, 0), 2) as base_nette, e.parts
from public.transactions t
join lateral (
  select sum(base_ht) as parts, count(*) as lignes from public.commission_entries where transaction_id = t.id
) e on e.lignes > 0
left join lateral (
  select sum(amount_ht) as total from public.transaction_deductions where transaction_id = t.id
) d on true
where e.lignes = (select count(*) from public.transaction_participants tp where tp.transaction_id = t.id)
  and (select sum(tp.share_pct) from public.transaction_participants tp where tp.transaction_id = t.id) = 100
  and e.parts <> round(coalesce(t.fees_ht, 0) - coalesce(d.total, 0), 2);
```

**V13. À la fin : CA HT 2026, vue « Tous »**

```sql
-- Attendu : 113246.65 (même calcul que le tableau de bord : honoraires HT encaissés dans l'année, annulées exclues)
select round(sum(fees_ht), 2) as ca_ht_2026, count(*) as transactions
from public.transactions
where status <> 'cancelled' and fees_received_at >= '2026-01-01' and fees_received_at < '2027-01-01';

-- V13 bis, en cas d'écart : le détail
select t.id, t.status, t.fees_received_at, t.deed_date, t.fees_ttc, t.vat_rate, t.fees_ht, t.notes
from public.transactions t order by t.fees_received_at nulls last;
```
