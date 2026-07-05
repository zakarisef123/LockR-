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
| `COMMISSION_PCT` | `20` (ton % de commission) |

3. Redéploie le site (Deploys → Trigger deploy)

## Étape 4 — Tester

- Avec `sk_test_...` : carte de test `4242 4242 4242 4242`, date future, CVC quelconque
- Le paiement apparaît dans Dashboard Stripe → **Paiements**

## Comment ta commission arrive sur ton compte

**Modèle actuel (simple, recommandé pour démarrer)** :
1. Le client paie 100 € → l'argent arrive sur le compte Stripe de LOCKR
2. Stripe vire automatiquement sur **l'IBAN configuré à l'étape 1** (moins les frais Stripe ≈ 1,5 % + 0,25 €)
3. Tu reverses à l'artisan sa part (80 €) par virement — ta commission (20 €) reste chez toi
4. Le champ `commission_pct` est enregistré dans les métadonnées de chaque paiement pour ta comptabilité

**Modèle automatique (Stripe Connect — DÉJÀ CODÉ ✓)** :

Le split automatique est intégré. Fonctionnement :

1. L'artisan clique sur **« Activer les virements automatiques »** dans son profil
   → il est redirigé vers Stripe qui vérifie son identité et son IBAN (KYC automatique)
2. Une fois activé, chaque paiement client est **splitté automatiquement** :
   - Part artisan (ex. 80 %) → versée **directement sur son compte bancaire**
   - Ta commission (`COMMISSION_PCT`, ex. 20 %) → versée **directement sur ton compte**
3. **Tu n'as plus aucun virement à faire.** Stripe gère tout, y compris les reçus.

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

## Fichiers concernés

- `netlify/functions/create-checkout.js` — fonction serverless de création du paiement
- `netlify.toml` — configuration Netlify (dossier des fonctions)
- `src/App.jsx` — `startStripeCheckout()` + bascule auto réel/démo dans `PayModal`
- `package.json` — dépendance `stripe`
