/* ─── SYNCHRONISATION MULTI-UTILISATEURS (Firestore) ───
   useSyncedState(collection, initial) remplace useState() avec la même API
   ([data, setData], y compris setData(prev => ...)) et synchronise en temps
   réel via Firestore : tous les utilisateurs voient les mêmes données.

   Garanties apportées par cette version :
   • ordre stable (tri par date de création) — les listes ne « sautent » plus ;
   • écriture champ par champ : deux personnes qui modifient des champs
     différents du même document ne s'écrasent plus mutuellement ;
   • aucune donnée de démo ré-injectée si une collection est vidée ;
   • valeurs `undefined` / fichiers nettoyés avant envoi (sinon Firestore
     rejette tout le document et la mise à jour était perdue en silence) ;
   • document trop lourd (> 900 Ko, ex. photo non compressée) détecté ;
   • toute erreur est remontée dans un bandeau visible (useSyncStatus).

   Chaque utilisateur ne charge que ce qu'il a le droit de voir : l'option
   `sources` décrit les requêtes à écouter (voir useSyncedState) et les règles
   firestore.rules refusent tout le reste.

   Mode démonstration (VITE_DEMO=1) : état local, enregistré dans le
   navigateur (rien n'est partagé). */
import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { db, firebaseReady } from "../firebase.js";
import { collection, onSnapshot, doc, setDoc, deleteDoc, deleteField, query, where, writeBatch } from "firebase/firestore";

const MAX_DOC_CHARS = 900 * 1024; // limite Firestore : 1 Mo par document

/* ── Statut global de synchronisation (bandeau d'erreur) ── */
const listeners = new Set();
let status = { error: null };
const emit = () => listeners.forEach(l => l());
const subscribe = l => { listeners.add(l); return () => listeners.delete(l); };
export function useSyncStatus() {
  return useSyncExternalStore(subscribe, () => status, () => status);
}
export function clearSyncError() { status = { ...status, error: null }; emit(); }

function reportError(collectionName, err, id) {
  const code = err?.code || "";
  const msg = String(err?.message || "");
  let message;
  if (code === "permission-denied") message = "Accès refusé par la base de données (règles de sécurité Firestore).";
  else if (code === "resource-exhausted") message = "Quota de la base de données dépassé.";
  else if (/too large|exceeds the maximum|trop volumineux/i.test(msg)) message = "Document trop volumineux (photo ou fichier trop lourd) — modification non enregistrée.";
  else if (code === "unavailable") message = "Connexion au serveur perdue — vos modifications seront envoyées au retour du réseau.";
  else message = "Une modification n'a pas pu être enregistrée. Vérifiez votre connexion puis réessayez.";
  console.error(`[sync:${collectionName}${id ? "/" + id : ""}]`, err);
  status = { ...status, error: { message, collection: collectionName, at: Date.now() } };
  emit();
}

/* ── Nettoyage avant envoi : Firestore refuse `undefined`, les fichiers,
   les fonctions et les tableaux imbriqués. ── */
export function cleanForFirestore(value) {
  if (value === undefined || typeof value === "function") return undefined;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof Blob !== "undefined" && value instanceof Blob) return null;
  if (Array.isArray(value)) {
    return value.map(v => {
      const c = cleanForFirestore(v);
      if (c === undefined) return null;
      // tableau dans un tableau : interdit par Firestore → objet indexé
      return Array.isArray(c) ? Object.fromEntries(c.map((x, i) => [i, x])) : c;
    });
  }
  const out = {};
  Object.keys(value).forEach(k => {
    const c = cleanForFirestore(value[k]);
    if (c !== undefined) out[k] = c;
  });
  return out;
}

const tsOf = x => x?.createdAt || x?.bannedAt || x?.date || "";
export function sortByCreation(arr) {
  return arr.slice().sort((a, b) => {
    const ta = String(tsOf(a)), tb = String(tsOf(b));
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a?.id).localeCompare(String(b?.id));
  });
}

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

function writeItem(name, before, after) {
  try {
    const full = cleanForFirestore(after);
    const size = JSON.stringify(full).length;
    if (size > MAX_DOC_CHARS) {
      reportError(name, new Error(`Document trop volumineux (${Math.round(size / 1024)} Ko)`), after.id);
      return;
    }
    const ref = doc(db, name, String(after.id));
    if (!before) {
      setDoc(ref, full).catch(e => reportError(name, e, after.id));
      return;
    }
    // Écriture champ par champ (évite d'écraser les modifications d'un autre utilisateur)
    const prevClean = cleanForFirestore(before) || {};
    const patch = {};
    let changed = false;
    new Set([...Object.keys(prevClean), ...Object.keys(full)]).forEach(k => {
      if (same(prevClean[k], full[k])) return;
      patch[k] = k in full ? full[k] : deleteField();
      changed = true;
    });
    if (!changed) return;
    setDoc(ref, patch, { merge: true }).catch(e => reportError(name, e, after.id));
  } catch (e) {
    reportError(name, e, after?.id);
  }
}

function persistDiff(name, prev, next) {
  const nextIds = new Set(next.map(x => String(x?.id)));
  prev.forEach(x => {
    if (x && x.id != null && !nextIds.has(String(x.id))) {
      deleteDoc(doc(db, name, String(x.id))).catch(e => reportError(name, e, x.id));
    }
  });
  const prevById = new Map(prev.map(p => [String(p?.id), p]));
  next.forEach(x => {
    if (!x || x.id == null) return;
    const before = prevById.get(String(x.id));
    if (before === x) return; // même référence : inchangé
    if (before && same(before, x)) return;
    writeItem(name, before, x);
  });
}

/* ── Mode démonstration : données enregistrées dans le navigateur ── */
const DEMO_PREFIX = "lk_demo_v2_";
function loadDemo(name, initial) {
  try {
    const raw = localStorage.getItem(DEMO_PREFIX + name);
    if (raw) return sortByCreation(JSON.parse(raw));
  } catch { /* stockage indisponible ou corrompu : données initiales */ }
  return sortByCreation(initial || []);
}
function saveDemo(name, data) {
  try { localStorage.setItem(DEMO_PREFIX + name, JSON.stringify(data)); } catch { /* quota dépassé : tant pis */ }
}
/* Remet la démonstration à zéro (données fictives d'origine) */
export function resetDemoData() {
  try { Object.keys(localStorage).filter(k => k.startsWith(DEMO_PREFIX)).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
}

/* Opération atomique (tout ou rien) — ex. prendre un bon : création de
   l'intervention + suppression du bon. Lève une erreur si refusée. */
export async function runBatch(ops) {
  const batch = writeBatch(db);
  ops.forEach(op => {
    const ref = doc(db, op.collection, String(op.id));
    if (op.type === "delete") batch.delete(ref);
    else batch.set(ref, cleanForFirestore(op.data), op.merge ? { merge: true } : undefined);
  });
  await batch.commit();
}

/* useSyncedState(collection, initial, { sources })
   sources (mode réel uniquement) :
     undefined           → collection entière (administration)
     []                  → rien n'est chargé
     [{ doc: id }]       → un document
     [{ where: [champ, opérateur, valeur] }, …] → requêtes, résultats fusionnés
   En démonstration, `sources` est ignoré : toutes les données sont locales. */
export function useSyncedState(collectionName, initial, { sources, demo = true } = {}) {
  const live = firebaseReady && !!db;
  const srcKey = live ? JSON.stringify(sources === undefined ? [{ all: true }] : sources) : "";
  // demo: false → liste toujours vide en démonstration (écoute réservée au mode réel)
  const [data, setData] = useState(() => (live || !demo ? [] : loadDemo(collectionName, initial)));
  const [ready, setReady] = useState(!live);

  useEffect(() => {
    if (!live) return undefined;
    const srcs = JSON.parse(srcKey);
    setData([]);
    if (!srcs.length) { setReady(true); return undefined; }
    setReady(false);
    let cancelled = false;
    const parts = srcs.map(() => null);
    const publish = () => {
      if (cancelled || parts.some(p => p === null)) return;
      const merged = new Map();
      parts.forEach(m => m.forEach((v, k) => merged.set(k, v)));
      setData(sortByCreation([...merged.values()]));
      setReady(true);
    };
    const toItem = d => { const v = d.data(); return v.id == null ? { ...v, id: d.id } : v; };
    const unsubs = srcs.map((s, i) => {
      let gotServer = false;
      const onErr = err => {
        reportError(collectionName, err);
        if (!cancelled && parts[i] === null) { parts[i] = new Map(); publish(); }
      };
      if (s.doc) {
        return onSnapshot(doc(db, collectionName, String(s.doc)), snap => {
          // Un document « absent » venant du cache local n'est pas fiable : on attend le serveur
          if (!snap.exists() && snap.metadata.fromCache && !gotServer) return;
          if (!snap.metadata.fromCache) gotServer = true;
          parts[i] = snap.exists() ? new Map([[snap.id, toItem(snap)]]) : new Map();
          publish();
        }, onErr);
      }
      const ref = s.where ? query(collection(db, collectionName), where(...s.where)) : collection(db, collectionName);
      return onSnapshot(ref, snap => {
        if (snap.empty && snap.metadata.fromCache && !gotServer) return;
        if (!snap.metadata.fromCache) gotServer = true;
        parts[i] = new Map(snap.docs.map(d => [d.id, toItem(d)]));
        publish();
      }, onErr);
    });
    return () => { cancelled = true; unsubs.forEach(u => u()); };
  }, [collectionName, live, srcKey]);

  const update = useCallback(updater => {
    setData(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (!Array.isArray(next) || next === prev) return prev;
      if (live) persistDiff(collectionName, prev, next);
      const sorted = sortByCreation(next);
      if (!live && demo) saveDemo(collectionName, sorted);
      return sorted;
    });
  }, [collectionName, live, demo]);

  return [data, update, ready];
}
