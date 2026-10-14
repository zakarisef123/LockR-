/* ─── CONNEXION ET APPELS SERVEUR ───
   Production : Firebase Authentication (comptes sécurisés) + fonctions
   Netlify (paiements, migration des anciens comptes).
   Démonstration (VITE_DEMO=1) : non utilisé, tout reste local. */
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendPasswordResetEmail, sendEmailVerification, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, deleteUser,
} from "firebase/auth";
import { doc, setDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db, firebaseReady } from "../firebase.js";
import { cleanForFirestore } from "./sync.js";
import { normEmail } from "./auth.js";

export const live = firebaseReady;

export function onAuthChange(cb) {
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, cb);
}
export const currentUser = () => auth?.currentUser || null;

/* Appel d'une fonction serveur, avec le jeton de connexion de l'utilisateur */
export async function callFunction(name, body = {}) {
  const headers = { "Content-Type": "application/json" };
  try {
    const u = auth?.currentUser;
    if (u) headers.Authorization = `Bearer ${await u.getIdToken()}`;
  } catch { /* pas de jeton : appel anonyme */ }
  let res;
  try {
    res = await fetch(`/.netlify/functions/${name}`, { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, data: null };
  }
  let data = null;
  try { data = await res.json(); } catch { /* réponse non JSON (fonction absente) */ }
  return { ok: res.ok, status: res.status, data };
}

const AUTH_ERRORS = {
  "auth/invalid-credential": "bad_credentials", "auth/invalid-login-credentials": "bad_credentials",
  "auth/wrong-password": "bad_credentials", "auth/user-not-found": "bad_credentials",
  "auth/invalid-email": "invalid_email", "auth/email-already-in-use": "email_used",
  "auth/weak-password": "weak_password", "auth/too-many-requests": "too_many",
  "auth/network-request-failed": "network", "auth/requires-recent-login": "recent_login",
  "auth/user-disabled": "disabled",
};
const errCode = e => AUTH_ERRORS[e?.code] || "unknown";

/* Connexion. Un compte créé avant le passage à Firebase Authentication est
   migré automatiquement au premier passage (fonction auth-migrate), avec le
   même mot de passe — sauf mot de passe par défaut ou trop court. */
export async function signIn(email, password, newPassword) {
  const em = normEmail(email);
  if (!newPassword) {
    try {
      await signInWithEmailAndPassword(auth, em, password);
      return { ok: true };
    } catch (e) {
      const code = errCode(e);
      if (code !== "bad_credentials") return { error: code };
    }
  }
  const r = await callFunction("auth-migrate", { email: em, password, ...(newPassword ? { newPassword } : {}) });
  if (r.ok && r.data?.migrated) {
    try {
      await signInWithEmailAndPassword(auth, em, newPassword || password);
      return { ok: true, migrated: true };
    } catch (e) {
      return { error: errCode(e) };
    }
  }
  const known = ["new_password_required", "default_password", "too_many"];
  if (known.includes(r.data?.error)) return { error: r.data.error };
  return { error: "bad_credentials" };
}

/* Création du compte de connexion. Renvoie { uid } ou { error }. */
export async function signUp(email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, normEmail(email), password);
    return { uid: cred.user.uid };
  } catch (e) {
    return { error: errCode(e) };
  }
}

/* Inscription annulée (adresse bannie, erreur d'enregistrement…) */
export async function cancelSignUp() {
  try { if (auth?.currentUser) await deleteUser(auth.currentUser); } catch { /* ignore */ }
  try { if (auth) await signOut(auth); } catch { /* ignore */ }
}

export async function createAccountDoc(acc) {
  await setDoc(doc(db, "accounts", acc.id), cleanForFirestore(acc));
}

export async function isEmailBanned(email) {
  try {
    const snap = await getDocs(query(collection(db, "banned"), where("email", "==", normEmail(email))));
    return !snap.empty;
  } catch {
    return false;
  }
}

export async function signOutUser() {
  try { if (auth) await signOut(auth); } catch (e) { console.error("[déconnexion]", e); }
}

/* Mot de passe oublié : e-mail de réinitialisation envoyé par Firebase.
   Pour un ancien compte, le compte de connexion est d'abord créé. */
export async function resetPassword(email) {
  const em = normEmail(email);
  await callFunction("auth-migrate", { email: em, mode: "reset" });
  try {
    await sendPasswordResetEmail(auth, em);
    return { ok: true };
  } catch (e) {
    return { error: errCode(e) };
  }
}

export async function sendVerification() {
  try {
    const u = auth?.currentUser;
    if (u && !u.emailVerified) await sendEmailVerification(u);
    return true;
  } catch {
    return false;
  }
}

export async function reloadUser() {
  try { await auth?.currentUser?.reload(); } catch { /* ignore */ }
  return auth?.currentUser || null;
}

async function reauth(password) {
  const u = auth?.currentUser;
  if (!u) return { error: "unknown" };
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
    return { user: u };
  } catch (e) {
    const code = errCode(e);
    return { error: code === "bad_credentials" ? "bad_current" : code };
  }
}

export async function changePassword(current, next) {
  const r = await reauth(current);
  if (r.error) return r;
  try {
    await updatePassword(r.user, next);
    return { ok: true };
  } catch (e) {
    return { error: errCode(e) };
  }
}

/* Vérifie le mot de passe avant une action sensible (suppression du compte) */
export async function confirmPassword(password) {
  const r = await reauth(password);
  return r.error ? r : { ok: true };
}

export async function deleteAuthUser() {
  try {
    if (auth?.currentUser) await deleteUser(auth.currentUser);
    return { ok: true };
  } catch (e) {
    return { error: errCode(e) };
  }
}

/* Suppression de son propre compte (RGPD) : fiche publique, fiche du compte
   puis compte de connexion. Les interventions et factures sont conservées
   (obligation légale de 10 ans). Le mot de passe doit avoir été confirmé. */
export async function deleteOwnAccount() {
  const u = auth?.currentUser;
  if (!u) return { error: "unknown" };
  globalThis.__lkLeaving = true;
  try { await deleteDoc(doc(db, "profiles", u.uid)); } catch { /* pas de fiche publique */ }
  try {
    await deleteDoc(doc(db, "accounts", u.uid));
  } catch (e) {
    globalThis.__lkLeaving = false;
    console.error("[suppression du compte]", e);
    return { error: "unknown" };
  }
  const r = await deleteAuthUser();
  await signOutUser();
  return r.error ? r : { ok: true };
}
