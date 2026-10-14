// Vérifie auprès de Stripe qu'une session de paiement a bien été payée.
// L'application ne marque plus une mission « payée » sur la seule base de
// l'URL de retour (falsifiable) : elle interroge Stripe via cette fonction.
import { guard, json, stripeClient, parseBody } from "../lib/stripe.mjs";

export const handler = async (event) => {
  const stop = guard(event);
  if (stop) return stop;

  try {
    const { sessionId } = parseBody(event);
    if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json(400, { error: "invalid_session" });
    const stripe = stripeClient();
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    // Part virée automatiquement à l'artisan (Stripe Connect), pour que
    // l'administration ne la verse pas une seconde fois.
    const cents = s.amount_total || 0;
    const pct = Number(s.metadata?.commission_pct);
    const transferred = s.metadata?.split === "auto" && Number.isFinite(pct)
      ? (cents - Math.round(cents * pct / 100)) / 100
      : 0;
    return json(200, {
      paid: s.payment_status === "paid",
      amount: cents / 100,
      transferred,
      type: s.metadata?.type || "",
      ref: s.metadata?.bookingId || "",
      email: s.customer_details?.email || s.customer_email || "",
    });
  } catch (err) {
    console.error("Stripe verify error:", err.message);
    return json(500, { error: "stripe_error" });
  }
};
