# 💳 Activation des paiements réels (Stripe)

L'application est **prête pour les paiements réels**. Le code bascule automatiquement :
- **Stripe configuré** → vrai paiement sécurisé (page Stripe, 3-D Secure, conforme DSP2/PCI-DSS)
- **Stripe non configuré** → mode démo (simulation, aucun argent ne circule)

## Étape 1 — Créer ton compte Stripe (15 min, gratuit)

1. Va sur https://dashboard.stripe.com/register
2. Crée le compte au nom de **LOCKR SAS** (il te faudra : SIRET, IBAN de l'entreprise, pièce d'identité du dirigeant)
3. **C'est ici que tu renseignes le compte bancaire où arrive l'argent** :
   Dashboard → Paramètres → **Comptes bancaires et virements** → ajoute l'IBAN de LOCKR SAS
   → Stripe vire automatiquement les fonds encaissés (quotidien, hebdo ou mensuel, au choix)

## Étape 2 — Récupérer ta clé secrète

1. Dashboard Stripe → **Développeurs → Clés API**
2. Copie la **clé secrète** :
   - `sk_test_...` pour tester sans argent réel
   - `sk_live_...` pour la production (après validation du compte par Stripe)

⚠️ **Ne mets JAMAIS cette clé dans le code ni sur GitHub.**

## Étape 3 — Configurer Netlify

1. Netlify → ton site → **Site configuration → Environment variables**
2. Ajoute :

| Variable | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` (ta clé) |
| `COMMISSION_PCT` | `60` (part LOCKR quand l'artisan a activé les virements automatiques — l'artisan reçoit 40 %, comme affiché dans l'application) |

3. Redéploie le site (Deploys → Trigger deploy)

## Étape 4 — Tester

- Avec `sk_test_...` : carte de test `4242 4242 4242 4242`, date future, CVC quelconque
- Le paiement apparaît dans Dashboard Stripe → **Paiements**

## Comment ta commission arrive sur ton compte

**Modèle actuel (simple, recommandé pour démarrer)** :
1. Le client paie 100 € → l'argent arrive sur le compte Stripe de LOCKR
2. Stripe vire automatiquement sur **l'IBAN configuré à l'étape 1** (moins les frais Stripe ≈ 1,5 % + 0,25 €)
3. Tu reverses à l'artisan sa part (40 € au taux standard, 95 € pour une entreprise partenaire)
   depuis **Admin → Finances → Comptabilité → Versements à effectuer** (bouton « Marquer versé »)
4. Le champ `commission_pct` est enregistré dans les métadonnées de chaque paiement pour ta comptabilité

> ⚠️ `COMMISSION_PCT` doit rester égal à 100 − la part artisan standard de l'application
> (`PRO_SHARE_DEFAULT` = 40 % dans `src/App.jsx`). Si tu changes l'un, change l'autre.

**Modèle automatique (Stripe Connect — DÉJÀ CODÉ ✓)** :

Le split automatique est intégré. Fonctionnement :

1. L'artisan clique sur **« Activer les virements automatiques »** dans son profil
   → il est redirigé vers Stripe qui vérifie son identité et son IBAN (KYC automatique)
2. Une fois activé, chaque paiement client est **splitté automatiquement** :
   - Part artisan (40 %) → versée **directement sur son compte bancaire**
   - Ta commission (`COMMISSION_PCT`, 60 %) → versée **directement sur ton compte**
3. **Tu n'as plus aucun virement à faire** pour ces missions : la part déjà virée par Stripe
   est déduite automatiquement de la liste « Versements à effectuer » (aucun double paiement).
4. Les missions à un autre taux (entreprises partenaires, bons à % négocié) ne sont pas
   splittées : elles restent dans « Versements à effectuer ».

Pour l'activer : Dashboard Stripe → **Connect → Commencer** → choisis « Comptes Express ».
Aucun changement de code nécessaire — dès que Connect est activé sur ton compte Stripe,
le bouton du profil artisan fonctionne.

Avantage réglementaire important : avec Connect, c'est Stripe (agréé ACPR) qui détient
les fonds — tu n'encaisses jamais pour le compte de tiers, donc pas de statut d'agent
de services de paiement à demander.

## ⚖️ Conformité incluse

- **DSP2 / authentification forte** : 3-D Secure géré par Stripe automatiquement
- **PCI-DSS** : aucune donnée carte ne touche nos serveurs (page hébergée Stripe)
- **KYC/LCB-FT** : vérification d'identité gérée par Stripe (agréé ACPR en Europe)
- Reçus de paiement envoyés automatiquement par email au client

## Ce que fait l'application au retour de Stripe

1. Le client revient sur `/?paiement=succes&session_id=cs_...`
2. L'application appelle `verify-session`, qui **interroge Stripe** pour confirmer le paiement
   (l'URL seule ne suffit pas : elle pourrait être fabriquée)
3. Seulement si Stripe confirme, la mission / l'acompte / l'achat / l'abonnement est marqué payé.
   L'opération est idempotente : recharger la page ne compte pas deux fois le paiement.

Sans Stripe configuré : les **comptes de démonstration** peuvent simuler un paiement
(clairement indiqué) ; un **vrai compte** voit « paiement momentanément indisponible »
et peut continuer sans payer (la mission reste « à régler »).

Amélioration recommandée : un webhook Stripe (`checkout.session.completed`) qui écrit
le statut payé côté serveur — voir `SECURITE.md`.

## Fichiers concernés

- `netlify/functions/create-checkout.mjs` — création de la session de paiement (et du split Connect)
- `netlify/functions/verify-session.mjs` — vérification serveur d'un paiement
- `netlify/functions/connect-onboard.mjs` — inscription Stripe Connect de l'artisan
- `netlify/lib/stripe.mjs` — code commun (CORS, clé, origine du site)
- `src/lib/payments.js` — appels depuis l'application
- `src/App.jsx` — `PayModal` (fenêtre de paiement) et `applyPayment` (enregistrement)
- `netlify.toml` — configuration Netlify (dossier des fonctions, en-têtes de sécurité)
- `package.json` — dépendance `stripe`
