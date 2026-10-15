// Accès serveur à Firebase (SDK Admin) : lecture/écriture de la base sans
// passer par les règles de sécurité, vérification des jetons de connexion,
// création des comptes de connexion lors de la migration.
//
// Variable d'environnement Netlify requise :
//   FIREBASE_SERVICE_ACCOUNT = contenu du fichier JSON de la clé du compte de
//   service (console Firebase → Paramètres du projet → Comptes de service →
//   « Générer une nouvelle clé privée »), collé tel quel ou encodé en base64.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export { FieldValue };

function serviceAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const usingEmulator = () => !!process.env.FIRESTORE_EMULATOR_HOST;

// true si le serveur peut accéder à la base
export const adminReady = () => !!serviceAccount() || usingEmulator();

let app = null;
function adminApp() {
  if (app) return app;
  if (getApps().length) { app = getApps()[0]; return app; }
  const sa = serviceAccount();
  app = sa
    ? initializeApp({ credential: cert(sa), projectId: sa.project_id })
    : initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "demo-lockr" });
  return app;
}

export const db = () => getFirestore(adminApp());
export const adminAuth = () => getAuth(adminApp());

/* Utilisateur à l'origine de la requête (jeton Firebase « Authorization: Bearer … »).
   Renvoie { uid, email, account } ou null. */
export async function requestUser(event) {
  const h = event.headers?.authorization || event.headers?.Authorization || "";
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (!m) return null;
  try {
    const token = await adminAuth().verifyIdToken(m[1]);
    const snap = await db().doc(`accounts/${token.uid}`).get();
    return { uid: token.uid, email: token.email || "", account: snap.exists ? snap.data() : null };
  } catch {
    return null;
  }
}

export const isAdmin = user => user?.account?.role === "admin";
