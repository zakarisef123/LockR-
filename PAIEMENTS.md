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

1. **Réservation — empreinte bancaire.** Le client accepte le devis puis
   enregistre sa carte : le montant du devis est **réservé** sur sa carte
   (capture différée), **rien n'est débité**.
2. **Annulation avant le départ de l'artisan** : la réservation est simplement
   libérée (aucun remboursement à gérer). Idem si l'artisan refuse la mission
   (la demande est republiée pour les autres artisans).
3. **Fin d'intervention.** L'artisan clôture (montant final + photo de la
   facture) puis appuie sur **« Débiter la carte du client »** : le serveur
   débite le montant final, dans la limite du montant réservé.
4. **Si la facture dépasse la réservation**, le complément est réglé par lien
   de paiement (SMS, e-mail ou QR code) ou depuis l'application du client.
5. **Réservation expirée** (Stripe garde une empreinte environ 7 jours) :
   l'application le signale et l'artisan envoie un lien de paiement.

Si le paiement en ligne est indisponible, le client peut confirmer la
réservation sans carte : l'artisan voit « carte non enregistrée » et le
règlement se fait à la fin, par lien de paiement.

## Répartition de l'argent (commission LOCKR 15 %)

| Cas | Artisan / entreprise | LOCKR |
|---|---|---|
| Intervention standard | 85 % | 15 % |
| Entreprise partenaire (abonnée) | 95 % | 5 % |
| Bon transmis par un professionnel | part fixée sur le bon (intervenant) + reste à l'apporteur | 15 % |
| Marketplace | 85 % au vendeur | 15 % |
| Missions créées avant le passage à 15 % | 40 % (taux de l'époque) | 60 % |

Les taux sont définis dans `src/lib/business.js` (et `PCT_DEFAULT` dans
`firestore.rules`) : si la commission change, modifier les deux.

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
| `cancel-hold` | libère l'empreinte (annulation, refus, admin) |
| `connect-onboard` / `connect-status` | inscription et vérification Stripe Connect |
| `platform-config` | indique à l'application si le paiement en ligne est actif |
| `auth-migrate` | migration des comptes créés avant Firebase Authentication |

Code commun : `netlify/lib/` (accès Firebase Admin, Stripe, enregistrement des
paiements) et `src/lib/business.js` (calculs partagés avec l'application).

## Tests

- `npm run test:functions` — toutes les fonctions contre les émulateurs
  Firebase et un faux Stripe (empreinte, débit, annulation, Connect, webhook,
  marketplace, abonnement, migration).
- Carte de test Stripe : `4242 4242 4242 4242`, date future, CVC quelconque.
