// Connexion à Firebase (base de données partagée entre TOUS les utilisateurs).
//
// SANS CETTE CONFIGURATION, l'application reste en mode démo local : chaque
// utilisateur a ses propres données isolées (rien n'est partagé entre eux).
//
// ⚠️ SÉCURITÉ — À FAIRE AVANT UN LANCEMENT PUBLIC
// Les règles Firestore ne doivent PAS rester ouvertes (`allow read, write: if true`) :
// n'importe qui pourrait lire les comptes et modifier les données.
// Voir firestore.rules (à la racine du projet) et SECURITE.md.

import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD3yHJW5KV_dLehgUFHAA3WiA9w2YBUodE",
  authDomain: "lockr-app-5d9ce.firebaseapp.com",
  projectId: "lockr-app-5d9ce",
  storageBucket: "lockr-app-5d9ce.firebasestorage.app",
  messagingSenderId: "769396447216",
  appId: "1:769396447216:web:f395e989ce28bfc3416f35",
  measurementId: "G-TJKB6WNX7E",
};

// VITE_DISABLE_FIREBASE=1 (ex. `VITE_DISABLE_FIREBASE=1 npm run dev`) : mode démo
// local, sans toucher à la base de production — pratique pour tester.
const isConfigured = firebaseConfig.apiKey !== "REMPLACE_MOI" && import.meta.env.VITE_DISABLE_FIREBASE !== "1";

function createDb() {
  if (!isConfigured) return null;
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  try {
    // ignoreUndefinedProperties : un champ `undefined` dans un objet ne fait plus
    // échouer l'écriture (sinon Firestore rejette TOUT le document).
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    // Déjà initialisé (rechargement à chaud en développement)
    return getFirestore(app);
  }
}

export const db = createDb();

export const firebaseReady = isConfigured;
