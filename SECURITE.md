# 🔐 Sécurité LOCKR — état actuel et actions avant lancement public

Ce document liste honnêtement ce qui est protégé aujourd'hui, ce qui ne l'est
pas encore, et l'ordre dans lequel corriger. **Les points 1 à 4 sont à traiter
avant d'ouvrir l'application au public.**

## Ce qui est déjà en place

| Sujet | Protection |
|---|---|
| Mots de passe | Plus jamais stockés en clair : PBKDF2-SHA256 (100 000 itérations) + sel unique par compte. Les anciens comptes en clair sont convertis automatiquement à la connexion suivante. |
| Session | Le navigateur ne garde que l'identifiant du compte ; le compte est relu en direct depuis la base (un compte banni ou supprimé est déconnecté immédiatement). |
| Cartes bancaires | Aucune saisie de carte dans l'application : page sécurisée Stripe (PCI-DSS, 3-D Secure / DSP2). |
| Paiements | Au retour de Stripe, le paiement est **vérifié côté serveur** (`verify-session`) avant d'être marqué payé — l'URL de retour seule ne suffit plus. |
| Paiement simulé | Réservé aux comptes de démonstration ; un vrai compte ne peut pas « simuler » un paiement. |
| En-têtes HTTP | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (voir `netlify.toml`). |
| Enregistrements cachés | Supprimés : l'ancienne « surveillance » enregistrait le son et la position des artisans à leur insu (illégal — art. 226-1 du Code pénal, RGPD). |
| Base de données | `firestore.rules` (phase 1) ferme tout ce qui n'est pas une collection de l'application. |

## Ce qui reste à faire (par priorité)

### 1. Firebase Authentication + règles Firestore phase 2 — **priorité absolue**
Aujourd'hui l'application se connecte à Firestore sans authentification : la
clé Firebase est publique (c'est normal), donc **toute personne technique peut
lire la collection `accounts`** (e-mails, téléphones, IBAN, documents) et
modifier n'importe quel document, y compris se donner le rôle `admin` ou
marquer une mission « payée ».

Les mots de passe hachés limitent les dégâts, mais pas la fuite de données
personnelles (RGPD). La correction :
1. Activer Firebase Authentication (e-mail + mot de passe) dans la console.
2. Créer les comptes Auth au moment de l'inscription / de la première connexion
   (migration transparente des comptes existants).
3. Publier les règles « PHASE 2 » de `firestore.rules`.
4. Donner le rôle admin via un *custom claim* posé par une fonction serveur.

Bonus : Firebase Auth apporte la **vraie vérification d'e-mail** et la
**réinitialisation du mot de passe par e-mail** (aujourd'hui : demande au support).

### 2. Webhook Stripe
Le statut « payé » est encore écrit par le navigateur après vérification.
Une fonction `stripe-webhook` (événement `checkout.session.completed`) qui
écrit dans Firestore avec le SDK Admin rendrait le paiement infalsifiable et
fonctionnerait même si le client ferme son navigateur avant le retour.

### 3. Documents justificatifs → Firebase Storage
Pièces d'identité, Kbis, attestations d'assurance et photos sont stockés en
base64 dans les documents Firestore (compressés, limite 900 Ko par document).
Les déplacer dans Firebase Storage avec des règles d'accès (propriétaire +
admin) — c'est plus sûr et beaucoup plus léger.

### 4. Comptes de démonstration et mots de passe d'administration
- Les comptes de démo (`client@demo.fr`, `karim@demo.fr`, `contact@batipro.fr`…,
  mot de passe `1234`) sont créés si la base est vide. **À supprimer en
  production** depuis Admin → Utilisateurs (ou ne pas les injecter).
- Les mots de passe initiaux des comptes administrateurs figurent dans le code
  source : **changez-les immédiatement** (Profil → Mot de passe) sur chaque
  compte admin, puis retirez-les du code.

### 5. Autres pistes
- Limiter le nombre de tentatives de connexion (Firebase Auth le fait nativement).
- Masquer les numéros de téléphone entre client et artisan (numéro relais).
- Journal d'audit des actions admin (validation, bannissement, remboursement).
- Politique de conservation des données (RGPD) : purge des comptes inactifs,
  export des données à la demande (déjà possible depuis le profil).

## Tester sans toucher à la production

```bash
VITE_DISABLE_FIREBASE=1 npm run dev
```
L'application tourne alors avec des données locales (mode démo), sans aucune
écriture dans la base Firestore de production.
