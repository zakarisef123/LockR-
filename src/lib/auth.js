/* Mots de passe : plus jamais stockés en clair.
   Dérivation PBKDF2-SHA256 (100 000 itérations) avec un sel aléatoire par compte.
   Les anciens comptes (champ `pass` en clair) sont convertis automatiquement
   à leur prochaine connexion réussie.

   ⚠️ Ceci protège les mots de passe en cas de lecture de la base, mais la
   vraie sécurité passe par Firebase Authentication + règles Firestore
   (voir SECURITE.md). */
const ITERATIONS = 100000;

const toHex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");

export function randomId(len = 12) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(String(salt)), iterations: ITERATIONS }, key, 256);
  return toHex(bits);
}

/* Champs à enregistrer sur le compte pour un nouveau mot de passe */
export async function passwordFields(password) {
  const salt = randomId(16);
  return { salt, passHash: await hashPassword(password, salt), pass: undefined };
}

/* Vérifie un mot de passe (format haché, ou ancien format en clair) */
export async function checkPassword(account, input) {
  if (!account) return false;
  if (account.passHash && account.salt) {
    try { return (await hashPassword(input, account.salt)) === account.passHash; }
    catch { return false; }
  }
  return typeof account.pass === "string" && account.pass === input;
}

export const normEmail = e => String(e || "").trim().toLowerCase();

/* Ce qui est conservé dans le navigateur pour rester connecté : l'identifiant
   seul (jamais le mot de passe ni le compte complet). */
export function readSessionId() {
  try {
    const raw = JSON.parse(localStorage.getItem("lk_session") || "null");
    if (!raw) return null;
    return typeof raw === "string" ? raw : raw.id || null;
  } catch { return null; }
}
export function writeSessionId(id) {
  try {
    if (id) localStorage.setItem("lk_session", JSON.stringify(id));
    else localStorage.removeItem("lk_session");
  } catch { /* stockage local indisponible */ }
}
