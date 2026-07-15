// Connexion à Firebase (base de données partagée entre TOUS les utilisateurs).
//
// SANS CETTE CONFIGURATION, l'application reste en mode démo local : chaque
// utilisateur a ses propres données isolées (rien n'est partagé entre eux).
//
// ── Pour activer la synchronisation réelle (5 minutes, gratuit) ──
// 1. Va sur https://console.firebase.google.com → « Ajouter un projet »
// 2. Une fois le projet créé, clique sur l'icône Web </> pour ajouter une app
// 3. Copie les valeurs affichées (apiKey, projectId, etc.) et colle-les
//    ci-dessous à la place des "..."
// 4. Dans le menu de gauche → Firestore Database → Créer une base de données
//    → démarre en mode production (les règles ci-dessous sécurisent l'accès)
// 5. Dans Firestore → onglet Règles, colle :
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /{document=**} { allow read, write: if true; }
//      }
//    }
//
//    (Ces règles sont ouvertes pour démarrer vite — à restreindre avant un
//    vrai lancement public, ex. limiter l'écriture aux comptes authentifiés.)

import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD3yHJW5KV_dLehgUFHAA3WiA9w2YBUodE",
  authDomain: "lockr-app-5d9ce.firebaseapp.com",
  projectId: "lockr-app-5d9ce",
  storageBucket: "lockr-app-5d9ce.firebasestorage.app",
  messagingSenderId: "769396447216",
  appId: "1:769396447216:web:f395e989ce28bfc3416f35",
  measurementId: "G-TJKB6WNX7E",
};

const isConfigured = firebaseConfig.apiKey !== "REMPLACE_MOI";

export const db = isConfigured
  ? getFirestore(getApps().length ? getApps()[0] : initializeApp(firebaseConfig))
  : null;

export const firebaseReady = isConfigured;
