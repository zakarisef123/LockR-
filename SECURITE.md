# 🔐 Sécurité LOCKR

## Ce qui est en place

| Sujet | Protection |
|---|---|
| Comptes | **Firebase Authentication** (e-mail + mot de passe) : mots de passe gérés par Google, limitation des tentatives, e-mail de confirmation, « mot de passe oublié » par e-mail. |
| Accès aux données | **Règles Firestore** ([`firestore.rules`](firestore.rules)) : il faut être connecté ; chacun ne lit que ses données (ses interventions, ses messages, ses ventes) ; l'admin voit tout. Testées automatiquement (`npm run test:rules`, 16 scénarios). |
| Champs sensibles | Rôle, validation du dossier, abonnement, bannissement, Stripe et **tous les statuts de paiement** ne sont modifiables que par l'admin ou par le serveur. Un client ne peut pas se déclarer payé, ni s'attribuer un rôle. |
| Profils publics | Les clients ne voient des artisans qu'une fiche publique (nom, ville, métiers, tarif, téléphone pro) — jamais l'IBAN, les documents ou les données personnelles. |
| Prise de bons | Opération atomique : deux artisans ne peuvent pas prendre le même bon. |
| Paiements | Montants calculés et paiements enregistrés **par le serveur** après vérification auprès de Stripe (voir [PAIEMENTS.md](PAIEMENTS.md)). Aucune saisie de carte dans l'application. |
| Migration | Les anciens comptes sont convertis à leur première connexion (même identifiant, données conservées). Les mots de passe par défaut des premières versions sont refusés. Anciens mots de passe effacés de la base après migration. |
| Bannissement | Enregistré sur le compte : l'utilisateur banni est déconnecté et la base lui refuse toute écriture. |
| Démonstration | Version séparée (`VITE_DEMO=1`), sans aucun accès à la base réelle. Plus de comptes de démo en production. |
| En-têtes HTTP | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (`netlify.toml`). |
| Vie privée | Plus d'enregistrement caché (son / position) ; position de l'artisan partagée uniquement pendant le trajet vers le client. Export et suppression du compte (RGPD) depuis le profil. |

## À faire de ton côté

Voir [MISE-EN-PRODUCTION.md](MISE-EN-PRODUCTION.md) : activer Firebase
Authentication, clé serveur, **e-mail réel sur les comptes admin**, Stripe,
puis **publier `firestore.rules`** juste après la mise en ligne.

## Pistes d'amélioration

1. **Documents justificatifs → Firebase Storage** : pièces d'identité, Kbis,
   photos sont encore stockés (compressés) dans les documents Firestore.
   Storage avec règles d'accès (propriétaire + admin) serait plus sûr et plus léger.
2. **Double authentification** pour les comptes admin.
3. **Numéro masqué** entre client et artisan.
4. **Journal d'audit** des actions admin (validation, bannissement, versements).
5. **Conservation des données** : purge automatique des comptes inactifs.

## Tester sans toucher à la production

```bash
npm run dev:demo        # version de démonstration (données locales)
npm run test:rules      # règles de sécurité (émulateur Firebase)
npm run test:functions  # fonctions serveur (émulateurs + faux Stripe)
```
