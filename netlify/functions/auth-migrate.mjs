// Migration des comptes créés avant Firebase Authentication.
//
// Au premier passage d'un ancien compte (connexion ou « mot de passe oublié »),
// son compte de connexion Firebase est créé avec LE MÊME identifiant que sa
// fiche (accounts/{id}) : toutes ses interventions restent rattachées.
//   mode « login » : le mot de passe est vérifié ici (ancien format en clair ou
//                    haché PBKDF2), puis réutilisé (ou remplacé s'il est trop court) ;
//   mode « reset » : le compte est créé avec un mot de passe aléatoire, puis
//                    l'application envoie l'e-mail de réinitialisation.
// Les mots de passe par défaut des anciennes versions sont refusés : il faut
// passer par « mot de passe oublié » (preuve de possession de la boîte mail).
import crypto from "node:crypto";
import { preflight, json, parseBody, nowIso, sleep } from "../lib/http.mjs";
import { adminReady, db, adminAuth, FieldValue } from "../lib/admin.mjs";
import { bookingParticipants } from "../../src/lib/business.js";

const norm = e => String(e || "").trim().toLowerCase();
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");

// Comptes et mots de passe d'exemple des premières versions (empreintes SHA-256 tronquées)
const DEMO_IDS = new Set(["c1", "c2", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "part1", "part2"]);
const DEFAULT_PASSWORDS = new Set(["03ac674216f3e15c761ee1a5", "b8b8eb83374c0bf3b1c32241", "b417cbac8a7ce2b67c48199b",
  "9f138218c5bd9760cd7ce52c", "3bc649bd1a5252f38f7feaf1", "b1ace51cb5d7758a673aa0b0"]);
const isDefaultPassword = p => DEFAULT_PASSWORDS.has(sha(p).slice(0, 24));

const MAX_FAILS = 8;
const WINDOW_MS = 15 * 60 * 1000;

async function findLegacyAccount(email) {
  const col = db().collection("accounts");
  const direct = await col.where("email", "==", email).limit(2).get();
  if (!direct.empty) return direct.docs[0];
  // Anciennes fiches : adresse enregistrée avec des majuscules ou des espaces
  const all = await col.select("email").get();
  const hit = all.docs.find(d => norm(d.get("email")) === email);
  return hit ? await col.doc(hit.id).get() : null;
}

function checkLegacyPassword(acc, password) {
  if (acc.passHash && acc.salt) {
    const h = crypto.pbkdf2Sync(String(password), String(acc.salt), 100000, 32, "sha256").toString("hex");
    return h.length === acc.passHash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(acc.passHash));
  }
  return typeof acc.pass === "string" && acc.pass.length > 0 && acc.pass === String(password);
}

/* Ses anciennes interventions, messages et ventes : ajout de l'utilisateur
   à la liste des participants (sans elle, les règles lui en refusent l'accès). */
async function backfillParticipants(id, acc) {
  const bookingsCol = db().collection("bookings");
  const artisanId = acc.role === "pro" ? (acc.artisanId || id) : null;
  const queries = [
    bookingsCol.where("clientId", "==", id),
    bookingsCol.where("partenaireId", "==", id),
    bookingsCol.where("postedBy", "==", id),
    ...(artisanId ? [bookingsCol.where("artisanId", "==", artisanId)] : []),
  ];
  const docs = new Map();
  for (const q of queries) (await q.get()).docs.forEach(d => docs.set(d.id, d));
  const finalParticipants = new Map();
  let batch = db().batch();
  let n = 0;
  const flush = async () => { if (n) { await batch.commit(); batch = db().batch(); n = 0; } };
  for (const d of docs.values()) {
    const b = d.data();
    const mineAsArtisan = artisanId && b.artisanId === artisanId;
    const nb = { ...b, ...(mineAsArtisan ? { artisanAccountId: id } : {}) };
    const parts = [...new Set([...(Array.isArray(b.participants) ? b.participants : []), ...bookingParticipants(nb)])];
    finalParticipants.set(d.id, parts);
    batch.update(d.ref, { participants: parts, ...(mineAsArtisan && !b.artisanAccountId ? { artisanAccountId: id } : {}) });
    if (++n >= 400) await flush();
  }
  // Messages de ces interventions
  const ids = [...finalParticipants.keys()];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db().collection("messages").where("bookingId", "in", ids.slice(i, i + 30)).get();
    for (const m of snap.docs) {
      batch.update(m.ref, { participants: finalParticipants.get(m.get("bookingId")) });
      if (++n >= 400) await flush();
    }
  }
  // Ventes marketplace
  for (const field of ["acheteurId", "vendeurId"]) {
    const snap = await db().collection("sales").where(field, "==", id).get();
    for (const s of snap.docs) {
      batch.update(s.ref, { participants: FieldValue.arrayUnion(...[s.get("acheteurId"), s.get("vendeurId")].filter(Boolean)) });
      if (++n >= 400) await flush();
    }
  }
  await flush();
}

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  if (!adminReady()) return json(503, { error: "server_not_configured" });

  const { email, password, newPassword, mode } = parseBody(event);
  const em = norm(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return json(400, { error: "invalid_email" });

  // Limite de tentatives par adresse
  const attemptsRef = db().doc(`authAttempts/${sha(em)}`);
  const att = (await attemptsRef.get()).data();
  const recent = att && Date.now() - new Date(att.since).getTime() < WINDOW_MS;
  if (recent && att.fails >= MAX_FAILS) return json(429, { error: "too_many" });
  const fail = async (status, error) => {
    await attemptsRef.set({ fails: (recent ? att.fails : 0) + 1, since: recent ? att.since : nowIso() });
    await sleep(400);
    return json(status, { error });
  };

  try {
    const snap = await findLegacyAccount(em);
    const acc = snap?.exists ? snap.data() : null;
    if (!acc || DEMO_IDS.has(snap.id) || acc.migratedAt) {
      return mode === "reset" ? json(200, { ok: true }) : fail(404, "not_found");
    }
    // Compte de connexion déjà existant pour cette fiche : rien à migrer
    try { await adminAuth().getUser(snap.id); return mode === "reset" ? json(200, { ok: true }) : fail(404, "not_found"); } catch { /* inexistant : on continue */ }

    let finalPassword;
    if (mode === "reset") {
      finalPassword = crypto.randomBytes(24).toString("base64url");
    } else {
      if (!checkLegacyPassword(acc, password)) return fail(401, "bad_password");
      if (isDefaultPassword(password)) return json(403, { error: "default_password" });
      finalPassword = newPassword || password;
      if (String(finalPassword).length < (newPassword ? 8 : 6)) return json(400, { error: "new_password_required" });
    }

    try {
      await adminAuth().createUser({ uid: snap.id, email: em, password: String(finalPassword), emailVerified: false });
    } catch (err) {
      if (err?.code === "auth/email-already-exists") return json(409, { error: "email_conflict" });
      if (err?.code === "auth/uid-already-exists") return mode === "reset" ? json(200, { ok: true }) : fail(404, "not_found");
      throw err;
    }
    await snap.ref.update({
      email: em, migratedAt: nowIso(),
      pass: FieldValue.delete(), passHash: FieldValue.delete(), salt: FieldValue.delete(),
      ...(acc.role === "pro" && !acc.artisanId ? { artisanId: snap.id } : {}),
    });
    await backfillParticipants(snap.id, acc);
    await attemptsRef.delete().catch(() => {});
    return json(200, mode === "reset" ? { ok: true } : { migrated: true });
  } catch (err) {
    console.error("auth-migrate:", err.message);
    return json(500, { error: "server_error" });
  }
};
