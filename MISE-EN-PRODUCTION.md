# 🚀 Mise en production — étapes à suivre (dans cet ordre)

Cette version apporte les comptes sécurisés (Firebase Authentication), des
règles de sécurité où chacun ne voit que ses données, l'empreinte bancaire et
des paiements entièrement gérés par le serveur. Quelques réglages sont à faire
**une seule fois** dans Firebase, Netlify et Stripe.

Compte environ 45 minutes. Les étapes 1 à 4 se font **avant** de mettre en
ligne la nouvelle version.

---

## 1. Firebase — activer la connexion par e-mail (2 min)

1. [console.firebase.google.com](https://console.firebase.google.com) → projet **lockr-app-5d9ce**
2. **Authentication** → **Commencer** → onglet **Sign-in method**
3. **Adresse e-mail/Mot de passe** → **Activer** → Enregistrer
4. Onglet **Templates** → en bas, **Langue du modèle : Français** (e-mails de
   confirmation et de mot de passe oublié en français)
5. Onglet **Settings** → **Domaines autorisés** → ajoute ton domaine Netlify
   (ex. `lockr.netlify.app` et ton nom de domaine s'il y en a un)

## 2. Firebase — clé du serveur (5 min)

Les fonctions Netlify (paiements, migration des anciens comptes) ont besoin
d'un accès serveur à la base.

1. Console Firebase → ⚙️ **Paramètres du projet** → onglet **Comptes de service**
2. **Générer une nouvelle clé privée** → un fichier `.json` est téléchargé
3. Netlify → ton site → **Site configuration** → **Environment variables** →
   **Add a variable** :
   - Clé : `FIREBASE_SERVICE_ACCOUNT`
   - Valeur : **tout le contenu** du fichier JSON (copier-coller)
4. ⚠️ Ne mets jamais ce fichier sur GitHub et supprime-le de ton ordinateur
   après l'avoir collé.

## 3. Comptes administrateur (5 min) — important

Les anciens comptes admin ont été créés avec des mots de passe par défaut
visibles dans l'historique du code. **Ces mots de passe sont désormais
refusés** : chaque admin choisit le sien via « Mot de passe oublié », ce qui
exige d'avoir accès à la boîte mail du compte.

1. Console Firebase → **Firestore Database** → collection `accounts`
2. Pour **ton** compte admin (role = `admin`) : remplace le champ `email` par
   une adresse **réelle** à laquelle tu as accès (en minuscules).
3. **Supprime** les comptes admin que personne n'utilise (ex. `admin@lockr.fr`,
   si cette boîte n'existe pas — sinon quelqu'un qui la créerait pourrait
   récupérer l'accès).
4. Après la mise en ligne (étape 5) : page de connexion → **Mot de passe
   oublié** → ton e-mail → lien reçu → nouveau mot de passe → connecté.

## 4. Stripe — paiements (20 min)

Commence en **mode test** (aucun argent réel) :

1. [dashboard.stripe.com](https://dashboard.stripe.com) → **Développeurs → Clés API** →
   copie la clé secrète `sk_test_…`
2. Netlify → Environment variables → `STRIPE_SECRET_KEY` = `sk_test_…`
3. Stripe → **Connect** → **Commencer** → type de compte **Express** (c'est ce
   qui permet de verser automatiquement 85 % à l'artisan)
4. Stripe → **Développeurs → Webhooks** → **Ajouter un endpoint** :
   - URL : `https://<ton-site>/.netlify/functions/stripe-webhook`
   - Événements : `checkout.session.completed` et `payment_intent.canceled`
   - Copie le **secret de signature** `whsec_…` → Netlify →
     `STRIPE_WEBHOOK_SECRET`
5. Teste (étape 7) avec la carte `4242 4242 4242 4242`, date future, CVC au choix.
6. Quand tout fonctionne : remplace par la clé `sk_live_…` et crée un
   **nouveau** webhook en mode live (son secret est différent).
   Les artisans devront refaire leur inscription Stripe une fois en mode live
   (l'application le leur redemande automatiquement).

Dès que Stripe est configuré, **un artisan doit avoir activé ses virements
(Stripe Connect) pour être proposé aux clients** : un encart le lui demande sur
son accueil. ⚠️ Préviens tes artisans avant d'activer Stripe : tant qu'aucun
n'a terminé cette inscription (5 minutes, pièce d'identité + IBAN), aucun
artisan n'apparaît aux clients.

## 5. Mettre en ligne la nouvelle version

Fusionne la branche `claude/compassionate-tesla-ifnnuy` dans la branche
principale (ou ouvre une demande de fusion sur GitHub) : Netlify redéploie
automatiquement. Vérifie dans **Deploys** que le déploiement est vert.

## 6. Publier les règles de sécurité (2 min) — juste après la mise en ligne

1. Console Firebase → **Firestore Database** → onglet **Règles**
2. Remplace tout par le contenu du fichier [`firestore.rules`](firestore.rules)
3. **Publier**

Tant que cette étape n'est pas faite, la base reste ouverte à tous. Ne la fais
pas avant l'étape 5 : l'ancienne version de l'application ne fonctionnerait
plus.

## 7. Vérifications (10 min)

1. Connecte-toi en admin (étape 3.4). Au premier passage, l'application
   rattache automatiquement les anciennes interventions à leurs participants
   et crée les fiches publiques des artisans (la liste proposée aux clients).
2. Tableau de bord admin : si un encart « éléments de démonstration dans la
   base » apparaît, clique sur **Supprimer** (anciennes données d'exemple).
3. Les anciens utilisateurs se connectent **comme d'habitude** : leur compte est
   converti automatiquement (même mot de passe ; s'il était trop court ou par
   défaut, l'application leur en demande un nouveau ou les envoie vers « Mot de
   passe oublié »).
4. Test complet en mode Stripe test : inscris un client et un artisan, valide
   l'artisan (admin), active ses virements, réserve avec la carte 4242…,
   termine la mission, débite la carte.

## 8. Site de démonstration (optionnel, 5 min)

Pour montrer l'application sans toucher aux vraies données :

1. Netlify → **Add new site → Import an existing project** → même dépôt GitHub
2. Environment variables : `VITE_DEMO` = `1`
3. Déploie : le site fonctionne avec des données fictives enregistrées dans le
   navigateur, des comptes de démonstration (mot de passe `1234`) et des
   paiements simulés. Une pastille « DÉMO ↺ » permet de tout remettre à zéro.

## 9. À compléter avant les premières factures réelles

Dans `src/App.jsx`, constante `COMPANY` : raison sociale, adresse du siège,
SIRET, n° de TVA (actuellement « à compléter »), et les mentions légales.

---

### Variables d'environnement Netlify (récapitulatif)

| Variable | Valeur | Obligatoire |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | contenu du JSON du compte de service | oui |
| `STRIPE_SECRET_KEY` | `sk_test_…` puis `sk_live_…` | pour les paiements |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | recommandé |
| `VITE_DEMO` | `1` | **uniquement** sur le site de démonstration |

L'ancienne variable `COMMISSION_PCT` n'est plus utilisée : la commission (15 %)
est définie dans `src/lib/business.js` et dans `firestore.rules` (`PCT_DEFAULT`).
