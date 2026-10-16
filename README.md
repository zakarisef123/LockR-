# LOCKR

Plateforme d'interventions de dépannage (serrurerie, plomberie, électricité…)
mettant en relation **clients**, **artisans** et **entreprises partenaires**,
avec un espace **administration** LOCKR.

- Application web React 19 + Vite, hébergée sur Netlify
- Comptes : Firebase Authentication — données : Firebase Firestore (temps réel)
- Paiements : Stripe Checkout (empreinte bancaire) + Stripe Connect, via des
  fonctions serveur Netlify

👉 **Mise en ligne de cette version : suivre [MISE-EN-PRODUCTION.md](MISE-EN-PRODUCTION.md).**

## Démarrer

```bash
npm install
npm run dev:demo         # version de démonstration (données locales, recommandé pour essayer)
npm run dev              # version réelle (base Firestore de production !)
npm run build            # build de production dans dist/
npm run build:demo       # build du site de démonstration
npm run lint
npm test                 # règles de sécurité + fonctions serveur (émulateurs Firebase, Java requis)
```

### Les trois modes

| Mode | Activation | Données | Comptes | Paiements |
|---|---|---|---|---|
| Production | par défaut | Firestore partagé | Firebase Authentication | Stripe (serveur) |
| Démonstration | `VITE_DEMO=1` | fictives, dans le navigateur | comptes de démo (mot de passe `1234`) | simulés |
| Émulateurs (tests) | `VITE_USE_EMULATORS=1` | émulateurs Firebase locaux | Auth émulée | faux Stripe |

## Les quatre espaces

| Espace | Fonctions principales |
|---|---|
| **Client** | Parcours « comme Uber » : choisir le problème → prix fixe affiché + **Commander** → suivi (recherche, artisan en route, sur place). La demande part automatiquement aux artisans en ligne du métier dans un rayon de 25 km (lien « Choisir mon artisan » pour réserver un artisan précis). Réservation avec **empreinte bancaire** (rien n'est débité avant l'intervention), suivi en direct de l'artisan, messagerie, paiement du complément éventuel, litige, annulation gratuite avant le départ (ensuite : frais de déplacement), profil, RGPD. |
| **Artisan** | 3 onglets (Accueil / Gains / Compte). Bouton **En ligne** ; les demandes arrivent en plein écran (30 s pour accepter, le premier qui accepte l'obtient) ; mission guidée par un seul gros bouton par étape ; la carte du client est débitée automatiquement à la clôture. Inscription en un écran, documents (SIRET, assurance, Kbis, identité) complétés ensuite depuis l'application. Virements automatiques (Stripe Connect, obligatoires quand le paiement en ligne est actif), missions (départ → arrivée → clôture → **débit de la carte du client**, ou « client absent »), bons par métier et bons transmis (apporteur : 50 % max.), chat, marketplace (paiement à la réception), gains et apports, suivi auto-entrepreneur. Validation du dossier après confirmation de l'e-mail. |
| **Entreprise** | Abonnement (mensuel / annuel), demandes clients, techniciens, flotte, RH, facturation, statistiques. |
| **Administration** | « À traiter », validation des dossiers (e-mail confirmé), interventions, litiges, versements (artisans, apporteurs, vendeurs), frais de déplacement, remboursements, facturation numérotée, marketplace (problèmes signalés : verser ou rembourser), bannissement, nettoyage des anciennes données de démo. |

Commission LOCKR : **15 %** (5 % pour les entreprises partenaires abonnées) —
voir [PAIEMENTS.md](PAIEMENTS.md).

## Organisation du code

```
src/
  App.jsx            Interface (tous les espaces)
  firebase.js        Initialisation Firebase (base + comptes)
  lib/config.js      Modes production / démonstration / émulateurs
  lib/backend.js     Connexion, inscription, appels aux fonctions serveur
  lib/sync.js        useSyncedState : collections synchronisées, filtrées par utilisateur
  lib/business.js    Commissions, reste à payer… (partagé avec le serveur)
  lib/payments.js    Appels de paiement (Stripe)
  lib/auth.js        Mots de passe en mode démonstration, session locale
  lib/images.js      Compression des photos
netlify/
  functions/         Paiements, empreinte, frais de déplacement, Stripe Connect, webhook,
                     marketplace (versement après réception), migration des comptes
  lib/               Accès Firebase Admin, Stripe, enregistrement des paiements
firestore.rules      Règles de sécurité (chacun ne voit que ses données)
tests/               Tests des règles et des fonctions serveur
```

### Collections Firestore

| Collection | Contenu | Qui y accède |
|---|---|---|
| `accounts` | comptes (identifiant = identifiant Firebase Auth) | le titulaire, l'admin |
| `profiles` | fiche publique des artisans | tout utilisateur connecté |
| `bookings` | interventions (champ `participants`) | les participants, l'admin |
| `bons` | demandes et missions ouvertes | les professionnels validés ; le client pour ses demandes |
| `messages` | messagerie d'une intervention | les participants |
| `chat` | chat régional des pros | les professionnels validés |
| `listings` / `sales` | marketplace | professionnels / acheteur et vendeur |
| `techs` | techniciens d'une entreprise | l'entreprise |
| `banned`, `settings`, `factures` | administration (`settings/tarifs` : frais de déplacement) | l'admin (lecture de `settings` pour les connectés) |
| `payments`, `authAttempts` | registre des paiements, limite de tentatives | serveur uniquement |

## Documentation

- [MISE-EN-PRODUCTION.md](MISE-EN-PRODUCTION.md) — étapes Firebase, Netlify, Stripe
- [PAIEMENTS.md](PAIEMENTS.md) — empreinte bancaire, commissions, Stripe Connect
- [SECURITE.md](SECURITE.md) — protections en place et pistes
