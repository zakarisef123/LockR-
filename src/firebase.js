// Connexion à Firebase : base de données (Firestore) + comptes (Authentication).
//
// En mode démonstration (VITE_DEMO=1), rien n'est initialisé : l'application
// fonctionne avec des données locales (voir src/lib/config.js).
//
// La sécurité des données repose sur Firebase Authentication et sur les règles
// firestore.rules (à publier dans la console Firebase) — voir SECURITE.md.

import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { IS_DEMO, USE_EMULATORS, FIREBASE_CONFIG } from "./lib/config.js";

function init() {
  if (IS_DEMO) return { db: null, auth: null };
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  let db;
  try {
    // ignoreUndefinedProperties : un champ `undefined` ne fait plus échouer l'écriture
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    db = getFirestore(app); // déjà initialisé (rechargement à chaud)
  }
  const auth = getAuth(app);
  if (USE_EMULATORS && !globalThis.__lkEmulators) {
    globalThis.__lkEmulators = true;
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return { db, auth };
}

export const { db, auth } = init();

// true = base partagée réelle (ou émulateurs) ; false = démonstration locale
export const firebaseReady = !!db;
