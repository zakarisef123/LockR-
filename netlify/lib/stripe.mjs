// Client Stripe des fonctions Netlify.
//
// Variables d'environnement :
//   STRIPE_SECRET_KEY     = sk_test_… (tests) puis sk_live_… (production)
//   STRIPE_WEBHOOK_SECRET = whsec_… (fonction stripe-webhook, recommandé)
import Stripe from "stripe";

export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY;

// « live » ou « test » selon la clé : un compte Connect créé en test n'existe pas en production
export const stripeMode = () => ((process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live") ? "live" : "test");

let client = null;
export function stripeClient() {
  // Tests automatisés : un faux client Stripe peut être injecté
  if (globalThis.__lkStripe) return globalThis.__lkStripe;
  if (client) return client;
  const opts = {};
  // Tests : serveur stripe-mock local (STRIPE_API_HOST=localhost:12111)
  if (process.env.STRIPE_API_HOST) {
    const [host, port] = process.env.STRIPE_API_HOST.split(":");
    Object.assign(opts, { host, port: Number(port) || 80, protocol: "http" });
  }
  client = new Stripe(process.env.STRIPE_SECRET_KEY, opts);
  return client;
}
