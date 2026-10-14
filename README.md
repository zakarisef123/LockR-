# LOCKR

Plateforme d'interventions de dépannage (serrurerie, plomberie, électricité…)
mettant en relation **clients**, **artisans** et **entreprises partenaires**,
avec un espace **administration** LOCKR.

- Application web React 19 + Vite, hébergée sur Netlify
- Données partagées en temps réel : Firebase Firestore
- Paiements : Stripe Checkout + Stripe Connect (fonctions Netlify)

## Démarrer

```bash
npm install
npm run dev                          # base Firestore de PRODUCTION
VITE_DISABLE_FIREBASE=1 npm run dev  # mode démo local (recommandé pour tester)
npm run build                        # build de production dans dist/
npm run lint
```

En mode démo local, les comptes de démonstration sont listés sous le
formulaire de connexion (mot de passe `1234`).

## Les quatre espaces

| Espace | Fonctions principales |
|---|---|
| **Client** | Demande d'intervention (adresse, devis, acompte), suivi en direct de l'artisan, paiement de la facture, litige, annulation, demandes publiées, profil, RGPD (export / suppression). |
| **Artisan** | Disponibilité, missions (départ → arrivée → clôture avec photos et encaissement), bons d'intervention par métier, chat régional et chat mission, partage GPS pendant le trajet, historique et gains, profil (métiers, IBAN, Stripe Connect), suivi auto-entrepreneur. |
| **Entreprise** | Abonnement (mensuel / annuel), missions et étapes, prise de demandes clients, techniciens, flotte, RH (planning, congés, primes), facturation, statistiques, documents. |
| **Administration** | Tableau de bord « À traiter », interventions (missions, bons, litiges, priorités), utilisateurs (validation des dossiers, bannissement), finances (comptabilité, versements, remboursements, facturation numérotée, marketplace), conformité. |

Les nouveaux artisans et entreprises sont **en attente de validation** jusqu'à
l'accord d'un administrateur (Admin → Utilisateurs → Validations).

## Organisation du code

```
src/
  App.jsx            Interface (tous les espaces)
  firebase.js        Connexion Firestore (désactivable avec VITE_DISABLE_FIREBASE=1)
  lib/sync.js        useSyncedState : collections Firestore synchronisées en temps réel
  lib/auth.js        Hachage des mots de passe (PBKDF2), session
  lib/payments.js    Appels aux fonctions Stripe
  lib/images.js      Compression des photos avant envoi
netlify/
  functions/         create-checkout, verify-session, connect-onboard
  lib/stripe.mjs     Code commun des fonctions Stripe
firestore.rules      Règles de sécurité Firestore
```

### Collections Firestore

`accounts`, `bookings` (missions), `bons`, `chat` (chat régional), `messages`
(chat de mission), `listings` / `sales` (marketplace), `techs` (techniciens
des entreprises), `banned`, `settings`, `factures`, `meta` (marqueurs
d'initialisation des données de démo).

Chaque élément est un document ; les modifications sont écrites **champ par
champ**, ce qui évite qu'un utilisateur écrase les changements d'un autre.

## Documentation

- [PAIEMENTS.md](PAIEMENTS.md) — activer Stripe (paiements réels, virements automatiques)
- [SECURITE.md](SECURITE.md) — état de la sécurité et actions avant lancement public
