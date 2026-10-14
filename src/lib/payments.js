/* Paiements Stripe (fonctions serverless Netlify).
   Si Stripe n'est pas configuré (clé absente, développement local), chaque
   appel renvoie un résultat « non configuré » et l'application bascule en
   mode démonstration — clairement signalé à l'utilisateur. */

async function post(path, body) {
  const res = await fetch(`/.netlify/functions/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* réponse non JSON (fonction absente) */ }
  return { ok: res.ok, status: res.status, data };
}

/* Crée une session Stripe Checkout. Renvoie l'URL de paiement ou null. */
export async function createCheckout({ amount, label, type, ref, email, artisanStripeId }) {
  try {
    const { ok, data } = await post("create-checkout", { amount, label, type, bookingId: ref, email, artisanStripeId });
    return ok && data?.url ? data.url : null;
  } catch { return null; }
}

/* Redirige vers la page de paiement Stripe. Renvoie false si Stripe est indisponible. */
export async function startStripeCheckout(params) {
  const url = await createCheckout(params);
  if (!url) return false;
  window.location.href = url;
  return true;
}

/* Vérifie côté serveur qu'une session Stripe est réellement payée.
   Renvoie { paid, amount, type, ref } ou null si la vérification est impossible. */
export async function verifyCheckout(sessionId) {
  try {
    const { ok, data } = await post("verify-session", { sessionId });
    return ok && data ? data : null;
  } catch { return null; }
}

/* Onboarding Stripe Connect (virements automatiques de l'artisan) */
export async function startConnectOnboarding({ email, nom, accountId }) {
  try {
    const { ok, data } = await post("connect-onboard", { email, nom, accountId });
    if (ok && data?.url) return { url: data.url, accountId: data.accountId };
    return null;
  } catch { return null; }
}
