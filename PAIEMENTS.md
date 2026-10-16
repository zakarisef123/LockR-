# 💳 Paiements (Stripe)

La configuration pas à pas est dans [MISE-EN-PRODUCTION.md](MISE-EN-PRODUCTION.md)
(étape 4). Ce document explique le fonctionnement.

## Principes

- **Aucune saisie de carte dans l'application** : le client paie sur la page
  sécurisée de Stripe (PCI-DSS, 3-D Secure / DSP2).
- **Les montants sont calculés par le serveur** à partir de la base (devis,
  facture, prix de l'annonce, tarif d'abonnement) — jamais à partir de ce
  qu'envoie le navigateur.
- **Seul le serveur enregistre un paiement** (statut payé, empreinte, abonnement…) :
  les règles Firestore interdisent aux utilisateurs de modifier ces champs.
  Chaque paiement Stripe n'est compté qu'une fois (registre `payments`), même
  si le retour du client et le webhook arrivent tous les deux.

## Le parcours d'une intervention

1. **Réservation — empreinte bancaire.** Le client appuie sur
   **« Commander »** (prix fixe de la grille LOCKR, +40 € en urgence) ou
   accepte le devis d'un artisan choisi, puis enregistre sa carte : le montant
   est **réservé** sur sa carte (capture différée), **rien n'est débité**.
   Sans artisan choisi, la demande passe au statut `recherche` et est proposée
   aux artisans en ligne (métier, 25 km) ; le premier qui accepte l'obtient.
   Le versement à l'artisan se fait alors à la capture par un transfert
   Stripe Connect (`source_transaction`), moins la commission.
2. **Annulation avant le départ de l'artisan** : la réservation est simplement
   libérée (aucun remboursement à gérer). Idem si l'artisan refuse la mission :
   la demande repart aux autres artisans et la réservation est conservée.
3. **Fin d'intervention.** L'artisan clôture (montant final + photo de la
   facture) : la carte du client est **débitée automatiquement** du montant
   final, dans la limite du montant réservé.
4. **Si la facture dépasse la réservation**, le complément est réglé par lien
   de paiement (SMS, e-mail ou QR code) ou depuis l'application du client.
5. **Réservation expirée** (Stripe garde une empreinte environ 7 jours) :
   l'application le signale et l'artisan envoie un lien de paiement.

### Frais de déplacement (30 € par défaut)

- **Annulation tardive** : le client annule alors que l'artisan est **en route**.
- **Client absent** : l'artisan est sur place depuis **au moins 10 minutes** et
  appuie sur « Client absent ? ».

Dans les deux cas le forfait est **débité de l'empreinte** et partagé comme une
intervention (85 % artisan / 15 % LOCKR, automatiquement avec Stripe Connect).
Sans carte enregistrée (ou réservation expirée), les frais restent **dus** :
l'admin les voit dans « À traiter » (mission non payée) et peut envoyer un lien
de paiement, marquer « Paiement reçu » ou « Renoncer aux frais ».
Le montant est réglable par l'admin : **Finances → Comptabilité → Frais de
déplacement** (0 = désactivé). Il est affiché au client sur le devis, avant la
réservation, et figure dans les CGV (article 3).

Si le paiement en ligne est indisponible, le client peut confirmer la
réservation sans carte : l'artisan voit « carte non enregistrée » et le
règlement se fait à la fin, par lien de paiement.

## Répartition de l'argent (commission LOCKR 15 %)

| Cas | Artisan / entreprise | LOCKR |
|---|---|---|
| Intervention standard | 85 % | 15 % |
| Entreprise partenaire (abonnée) | 95 % | 5 % |
| Bon transmis par un professionnel | part fixée sur le bon (intervenant, **35 % minimum**) + reste à l'apporteur (**50 % maximum**) | 15 % |
| Frais de déplacement | 85 % à celui qui s'est déplacé (95 % pour une entreprise partenaire), rien pour l'apporteur | 15 % (5 %) |
| Marketplace | 85 % au vendeur, **après réception de l'article** | 15 % |
| Missions créées avant le passage à 15 % | 40 % (taux de l'époque) | 60 % |

Les taux sont définis dans `src/lib/business.js` (et `PCT_DEFAULT` /
`TECH_PCT_MIN` dans `firestore.rules`) : si la commission ou le plafond de
l'apporteur change, modifier les deux.

## Marketplace : l'argent attend la réception de l'article

1. L'acheteur paie sur Stripe : l'argent est **conservé par LOCKR** (rien n'est
   versé au vendeur).
2. Le vendeur expédie. Dans **Marketplace → Mes achats et ventes**, l'acheteur
   appuie sur **« J'ai reçu l'article »** : 85 % sont aussitôt virés au vendeur
   (Stripe Connect, virement lié au paiement), LOCKR garde 15 %.
3. Sans réponse de l'acheteur, le versement est **automatique 14 jours** après
   le paiement (fonction planifiée `marketplace-auto-release`, une fois par jour).
4. **« Signaler un problème »** bloque le versement : l'admin décide dans
   **Finances → Marketplace** (« Verser au vendeur » ou « Rembourser l'acheteur »,
   remboursement Stripe automatique).
5. Vendeur sans virements Stripe : la vente est close et l'admin le paie par
   virement (« Vendeur payé »), ou relance le virement Stripe une fois que le
   vendeur a activé ses virements.

## Stripe Connect : versement automatique à l'artisan

- L'artisan active ses **virements automatiques** (Stripe vérifie son identité
  et son IBAN). Quand le paiement en ligne est actif, **c'est obligatoire pour
  être proposé aux clients et prendre des bons**.
- Pour une intervention au taux standard, Stripe partage automatiquement le
  paiement : 85 % directement sur le compte de l'artisan, 15 % pour LOCKR. La
  part déjà virée est déduite de la liste « Versements à effectuer » de l'admin.
- Les autres cas (entreprises partenaires, bons à part négociée, apporteurs,
  marketplace, anciennes missions) restent versés par l'admin depuis
  **Finances → Comptabilité → Versements à effectuer**.

Avec Connect, c'est Stripe (établissement agréé) qui détient les fonds des
paiements partagés automatiquement. Pour les versements manuels, LOCKR encaisse
puis reverse : à valider avec ton expert-comptable / conseil juridique
(encaissement pour compte de tiers).

## Fonctions serveur (`netlify/functions/`)

| Fonction | Rôle |
|---|---|
| `create-checkout` | crée la session Stripe (montant calculé par le serveur) |
| `verify-session` | retour du client : vérifie auprès de Stripe et enregistre |
| `stripe-webhook` | notification Stripe : enregistre même sans retour du client |
| `capture-payment` | débite l'empreinte du montant final |
| `cancel-hold` | annulation : libère l'empreinte, ou débite les frais de déplacement (annulation tardive, client absent) |
| `marketplace-release` | marketplace : réception confirmée, problème signalé, décision de l'admin |
| `marketplace-auto-release` | planifiée (quotidienne) : versement aux vendeurs après 14 jours |
| `connect-onboard` / `connect-status` | inscription et vérification Stripe Connect |
| `platform-config` | indique à l'application si le paiement en ligne est actif |
| `auth-migrate` | migration des comptes créés avant Firebase Authentication |

Code commun : `netlify/lib/` (accès Firebase Admin, Stripe, enregistrement des
paiements) et `src/lib/business.js` (calculs partagés avec l'application).

## Tests

- `npm run test:functions` — toutes les fonctions contre les émulateurs
  Firebase et un faux Stripe (empreinte, débit, annulation, frais de
  déplacement, Connect, webhook, marketplace et versement après réception,
  remboursement, abonnement, migration).
- Carte de test Stripe : `4242 4242 4242 4242`, date future, CVC quelconque.
