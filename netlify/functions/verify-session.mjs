// Retour du client après le paiement : vérifie la session auprès de Stripe et
// enregistre le paiement dans la base (une seule fois, voir applyCheckoutSession).
// L'adresse de retour seule ne prouve rien : seule la réponse de Stripe compte.
// Pas besoin d'être connecté (lien de paiement ouvert par un client non inscrit) :
// l'identifiant de session Stripe est impossible à deviner.
import { preflight, json, parseBody } from "../lib/http.mjs";
import { adminReady } from "../lib/admin.mjs";
import { stripeReady, stripeClient } from "../lib/stripe.mjs";
import { applyCheckoutSession } from "../lib/payments.mjs";

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  if (!stripeReady() || !adminReady()) return json(503, { error: "payments_not_configured" });

  const { sessionId } = parseBody(event);
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json(400, { error: "invalid_session" });
  try {
    const session = await stripeClient().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
    const r = await applyCheckoutSession(session);
    return json(200, { paid: r.paid, authorized: r.authorized, type: r.type, ref: r.ref });
  } catch (err) {
    console.error("verify-session:", err.message);
    return json(500, { error: "stripe_error" });
  }
};
