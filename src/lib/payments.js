/* Paiements Stripe (fonctions serveur Netlify).
   Les montants sont toujours calculés par le serveur à partir des données
   de la base (jamais à partir de ce qu'envoie le navigateur), et c'est le
   serveur qui enregistre les paiements. Si Stripe ou le serveur n'est pas
   configuré, chaque appel renvoie un échec et l'application l'indique
   clairement à l'utilisateur. */
import { callFunction } from "./backend.js";

/* Session de paiement Stripe Checkout. Renvoie l'URL de paiement ou null.
   type : empreinte | prestation | lien_client | marketplace | abonnement */
export async function createCheckout({ type, ref, plan }) {
  const r = await callFunction("create-checkout", { type, ref, plan });
  return r.ok && r.data?.url ? r.data.url : null;
}

/* Redirige vers la page de paiement Stripe. Renvoie false si indisponible. */
export async function startStripeCheckout(params) {
  const url = await createCheckout(params);
  if (!url) return false;
  window.location.href = url;
  return true;
}

/* Retour de Stripe : le serveur vérifie la session et enregistre le paiement.
   Renvoie { paid, authorized, type, ref } ou null. */
export async function verifyCheckout(sessionId) {
  const r = await callFunction("verify-session", { sessionId });
  return r.ok && r.data ? r.data : null;
}

/* Débit de l'empreinte bancaire après l'intervention (montant final) */
export async function captureHold(bookingId) {
  const r = await callFunction("capture-payment", { bookingId });
  return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.data?.error || "unavailable" };
}

/* Libération de l'empreinte (annulation, refus de mission) */
export async function releaseHold(bookingId, reason) {
  const r = await callFunction("cancel-hold", { bookingId, reason });
  return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.data?.error || "unavailable" };
}

/* Marketplace : réception confirmée (versement au vendeur), problème signalé,
   décision de l'admin (liberer | rembourser) */
export async function marketplaceAction(saleId, action, motif) {
  const r = await callFunction("marketplace-release", { saleId, action, motif });
  return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.data?.error || "unavailable" };
}

/* Onboarding Stripe Connect (virements automatiques de l'artisan) */
export async function startConnectOnboarding() {
  const r = await callFunction("connect-onboard", {});
  return r.ok && r.data?.url ? r.data : null;
}
export async function refreshConnectStatus() {
  const r = await callFunction("connect-status", {});
  return r.ok ? r.data : null;
}

/* Configuration de la plateforme (Stripe activé ?), mise en cache */
let configPromise = null;
export function getPlatformConfig() {
  if (!configPromise) {
    configPromise = callFunction("platform-config", {}).then(r => (r.ok && r.data ? r.data : { stripe: false, server: false }));
  }
  return configPromise;
}
