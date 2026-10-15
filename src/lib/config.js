/* ─── CONFIGURATION DE L'APPLICATION ───
   Trois façons de lancer l'application :

   • Production (par défaut) : base Firestore partagée + connexion sécurisée
     Firebase Authentication. Aucune donnée ni compte de démonstration.

   • Démonstration (VITE_DEMO=1) : aucune base distante, données fictives
     enregistrées dans le navigateur, comptes de démo, paiements simulés.
     Idéal pour un site de démo commerciale (ex. demo.lockr.fr) et les tests.

   • Émulateurs (VITE_USE_EMULATORS=1) : comme la production mais sur les
     émulateurs Firebase locaux (tests automatisés, aucune donnée réelle). */
const env = import.meta.env || {};

export const IS_DEMO = env.VITE_DEMO === "1" || env.VITE_DISABLE_FIREBASE === "1";
export const USE_EMULATORS = !IS_DEMO && env.VITE_USE_EMULATORS === "1";

// Configuration Firebase (publique par nature : la sécurité repose sur
// Firebase Authentication + les règles firestore.rules, pas sur ces valeurs).
export const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyD3yHJW5KV_dLehgUFHAA3WiA9w2YBUodE",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "lockr-app-5d9ce.firebaseapp.com",
  projectId: USE_EMULATORS ? (env.VITE_FIREBASE_PROJECT_ID || "demo-lockr") : (env.VITE_FIREBASE_PROJECT_ID || "lockr-app-5d9ce"),
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "lockr-app-5d9ce.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "769396447216",
  appId: env.VITE_FIREBASE_APP_ID || "1:769396447216:web:f395e989ce28bfc3416f35",
};
