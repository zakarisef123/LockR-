// Ce que la plateforme sait faire (lu par l'application au démarrage) :
//   stripe : paiement en ligne actif (clé Stripe + accès serveur à la base)
//   server : accès serveur à la base (migration des anciens comptes)
import { preflight, json } from "../lib/http.mjs";
import { adminReady } from "../lib/admin.mjs";
import { stripeReady, stripeMode } from "../lib/stripe.mjs";

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  const server = adminReady();
  return json(200, { stripe: stripeReady() && server, mode: stripeReady() ? stripeMode() : null, server });
};
