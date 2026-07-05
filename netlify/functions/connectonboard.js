// Onboarding Stripe Connect Express pour les artisans/partenaires.
// Crée le sous-compte de l'artisan et renvoie le lien d'inscription Stripe
// (identité + IBAN vérifiés par Stripe — KYC/LCB-FT automatique).
//
// Variables d'environnement : STRIPE_SECRET_KEY

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
    const { email, accountId, nom } = JSON.parse(event.body || "{}");
    const origin = event.headers.origin || event.headers.referer || "https://lockr.fr";

    // Réutilise le compte existant ou en crée un nouveau
    let acctId = accountId;
    if (!acctId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "FR",
        email: email || undefined,
        business_type: "individual",
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
        metadata: { platform: "LOCKR", nom: nom || "" },
      });
      acctId = account.id;
    }

    const link = await stripe.accountLinks.create({
      account: acctId,
      refresh_url: `${origin}/?stripe_onboard=retry`,
      return_url: `${origin}/?stripe_onboard=done&acct=${acctId}`,
      type: "account_onboarding",
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: link.url, accountId: acctId }) };
  } catch (err) {
    console.error("Stripe Connect error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "stripe_error", message: err.message }) };
  }
};
