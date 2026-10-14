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

   Sans Firebase configuré (src/firebase.js), mode démo local : état React
   classique, rien n'est partagé. */
import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { db, firebaseReady } from "../firebase.js";
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, deleteField } from "firebase/firestore";

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

export function useSyncedState(collectionName, initial) {
  const live = firebaseReady && !!db;
  const [data, setData] = useState(() => (live ? [] : sortByCreation(initial)));
  const [ready, setReady] = useState(!live);
  const initialRef = useRef(initial);
  const seedChecked = useRef(false);

  useEffect(() => {
    if (!live) return undefined;
    let cancelled = false;
    let gotServer = false;
    const unsub = onSnapshot(collection(db, collectionName), async snap => {
      // Un instantané vide venant du cache local n'est pas fiable : on attend le serveur
      if (snap.empty && snap.metadata.fromCache && !gotServer) return;
      gotServer = true;
      if (snap.empty) {
        if (!seedChecked.current) {
          seedChecked.current = true;
          try {
            // Données de démo injectées UNE SEULE FOIS (marqueur meta/<collection>) :
            // une collection vidée volontairement n'est plus jamais re-remplie.
            const marker = await getDoc(doc(db, "meta", collectionName));
            if (!marker.exists()) {
              await setDoc(doc(db, "meta", collectionName), { seededAt: new Date().toISOString() });
              const seed = initialRef.current || [];
              if (seed.length) {
                await Promise.all(seed.map(item => setDoc(doc(db, collectionName, String(item.id)), cleanForFirestore(item))));
                return; // l'instantané suivant contiendra les données
              }
            }
          } catch (e) {
            reportError(collectionName, e);
          }
        }
        if (!cancelled) { setData([]); setReady(true); }
        return;
      }
      if (!seedChecked.current) {
        seedChecked.current = true;
        // Collection déjà remplie : on pose le marqueur (une fois par navigateur)
        try {
          const k = `lk_meta_${collectionName}`;
          if (!localStorage.getItem(k)) {
            setDoc(doc(db, "meta", collectionName), { seededAt: new Date().toISOString() }, { merge: true }).catch(() => {});
            localStorage.setItem(k, "1");
          }
        } catch { /* stockage local indisponible */ }
      }
      const docs = snap.docs.map(d => {
        const v = d.data();
        return v.id == null ? { ...v, id: d.id } : v;
      });
      if (!cancelled) { setData(sortByCreation(docs)); setReady(true); }
    }, err => {
      reportError(collectionName, err);
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; unsub(); };
  }, [collectionName, live]);

  const update = useCallback(updater => {
    setData(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (!Array.isArray(next) || next === prev) return prev;
      if (live) persistDiff(collectionName, prev, next);
      return sortByCreation(next);
    });
  }, [collectionName, live]);

  return [data, update, ready];
}
