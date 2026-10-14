// Création d'une session de paiement Stripe Checkout.
// Conforme DSP2 (authentification forte 3-D Secure gérée par Stripe) et PCI-DSS
// (aucune donnée de carte ne transite par nos serveurs ni par l'application).
//
// Variables d'environnement (Netlify > Site configuration > Environment variables) :
//   STRIPE_SECRET_KEY = sk_live_... (ou sk_test_... pour tester)
//   COMMISSION_PCT    = part LOCKR retenue sur une intervention quand l'artisan a
//                       activé les virements automatiques (défaut 15, soit 85 % artisan)
import { guard, json, stripeClient, siteOrigin, parseBody } from "../lib/stripe.mjs";

const TYPES = ["prestation", "acompte", "marketplace", "abonnement", "lien_client"];

export const handler = async (event) => {
  const stop = guard(event);
  if (stop) return stop;

  try {
    const { amount, label, type, bookingId, email, artisanStripeId } = parseBody(event);
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 50 || cents > 5000000) return json(400, { error: "invalid_amount" });
    const kind = TYPES.includes(type) ? type : "prestation";
    const ref = String(bookingId || "").slice(0, 120);

    const commissionPct = Math.min(95, Math.max(0, Number(process.env.COMMISSION_PCT || "15")));
    const origin = siteOrigin(event);
    const name = String(label || "Prestation LOCKR").slice(0, 200);

    // Split automatique Stripe Connect : uniquement pour les interventions
    // (jamais pour les abonnements ni la marketplace).
    const paymentIntentData = {
      description: name,
      statement_descriptor_suffix: "LOCKR",
      metadata: { bookingId: ref, type: kind },
    };
    const split = artisanStripeId && /^acct_[A-Za-z0-9]+$/.test(artisanStripeId) && ["prestation", "acompte", "lien_client"].includes(kind);
    if (split) {
      paymentIntentData.application_fee_amount = Math.round(cents * commissionPct / 100);
      paymentIntentData.transfer_data = { destination: artisanStripeId };
    }

    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      currency: "eur",
      customer_email: email || undefined,
      line_items: [{
        price_data: { currency: "eur", unit_amount: cents, product_data: { name } },
        quantity: 1,
      }],
      metadata: {
        bookingId: ref,
        type: kind,
        commission_pct: String(commissionPct),
        artisan_account: split ? artisanStripeId : "",
        split: split ? "auto" : "manuel",
      },
      success_url: `${origin}/?paiement=succes&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?paiement=annule&type=${encodeURIComponent(kind)}&ref=${encodeURIComponent(ref)}`,
      payment_intent_data: paymentIntentData,
    });

    return json(200, { url: session.url, id: session.id });
  } catch (err) {
    console.error("Stripe error:", err.message);
    return json(500, { error: "stripe_error", message: err.message });
  }
};
