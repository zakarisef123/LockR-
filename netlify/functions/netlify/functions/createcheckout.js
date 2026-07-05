// Fonction serverless Netlify — création d'une session de paiement Stripe Checkout
// Conforme DSP2 (authentification forte 3-D Secure gérée par Stripe) et PCI-DSS
// (aucune donnée carte ne transite par nos serveurs).
//
// Variables d'environnement requises (Netlify > Site settings > Environment variables) :
//   STRIPE_SECRET_KEY  = sk_live_...  (clé secrète Stripe)
//   COMMISSION_PCT     = 20           (optionnel — % commission plateforme, défaut 20)

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };
  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "payments_not_configured" }) };
  }

  try {
    const { amount, label, type, bookingId, email, artisanStripeId } = JSON.parse(event.body || "{}");
    const cents = Math.round(Number(amount) * 100);
    if (!cents || cents < 50 || cents > 5000000) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "invalid_amount" }) };
    }

    const commissionPct = Number(process.env.COMMISSION_PCT || "20");
    const origin = event.headers.origin || event.headers.referer || "https://lockr.fr";

    // Split automatique Stripe Connect : si l'artisan a un compte connecté,
    // sa part lui est versée directement et la commission LOCKR est retenue
    // automatiquement (application_fee). Aucun reversement manuel.
    const paymentIntentData = {
      description: label || "Prestation LOCKR",
      statement_descriptor_suffix: "LOCKR",
    };
    if (artisanStripeId) {
      paymentIntentData.application_fee_amount = Math.round(cents * commissionPct / 100);
      paymentIntentData.transfer_data = { destination: artisanStripeId };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      currency: "eur",
      customer_email: email || undefined,
      line_items: [{
        price_data: {
          currency: "eur",
          unit_amount: cents,
          product_data: { name: label || "Prestation LOCKR" },
        },
        quantity: 1,
      }],
      metadata: {
        bookingId: bookingId || "",
        type: type || "prestation", // prestation | acompte | marketplace | abonnement
        commission_pct: String(commissionPct),
        artisan_account: artisanStripeId || "",
        split: artisanStripeId ? "auto" : "manuel",
      },
      success_url: `${origin}/?paiement=succes&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?paiement=annule`,
      // Facturation : Stripe émet le reçu ; la facture conforme est générée côté plateforme
      payment_intent_data: paymentIntentData,
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url, id: session.id }) };
  } catch (err) {
    console.error("Stripe error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "stripe_error", message: err.message }) };
  }
};
