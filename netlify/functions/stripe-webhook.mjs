// Notifications envoyées par Stripe (recommandé en production) : le paiement
// est enregistré même si le client ferme son navigateur avant le retour.
//
// Configuration : Dashboard Stripe → Développeurs → Webhooks → Ajouter
//   URL      : https://<votre-site>/.netlify/functions/stripe-webhook
//   Événements : checkout.session.completed, payment_intent.canceled
// puis copier le « secret de signature » dans la variable STRIPE_WEBHOOK_SECRET.
import { json } from "../lib/http.mjs";
import { adminReady } from "../lib/admin.mjs";
import { stripeReady, stripeClient } from "../lib/stripe.mjs";
import { applyCheckoutSession, markHoldExpired } from "../lib/payments.mjs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !stripeReady() || !adminReady()) return json(503, { error: "webhook_not_configured" });

  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
  const signature = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"] || "";
  let evt;
  try {
    evt = stripeClient().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error("stripe-webhook signature:", err.message);
    return json(400, { error: "invalid_signature" });
  }

  try {
    if (evt.type === "checkout.session.completed") {
      const session = await stripeClient().checkout.sessions.retrieve(evt.data.object.id, { expand: ["payment_intent"] });
      await applyCheckoutSession(session);
    } else if (evt.type === "payment_intent.canceled") {
      const pi = evt.data.object;
      if (pi.metadata?.type === "empreinte" && pi.metadata?.ref) await markHoldExpired(pi.metadata.ref, pi.id);
    }
    return json(200, { received: true });
  } catch (err) {
    console.error("stripe-webhook:", err.message);
    return json(500, { error: "processing_error" }); // Stripe réessaiera
  }
};
