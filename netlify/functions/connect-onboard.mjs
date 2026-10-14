// Onboarding Stripe Connect Express pour les artisans / partenaires.
// Crée le sous-compte de l'artisan et renvoie le lien d'inscription Stripe
// (identité + IBAN vérifiés par Stripe — KYC/LCB-FT automatique).
import { guard, json, stripeClient, siteOrigin, parseBody } from "../lib/stripe.mjs";

export const handler = async (event) => {
  const stop = guard(event);
  if (stop) return stop;

  try {
    const { email, accountId, nom } = parseBody(event);
    const origin = siteOrigin(event);
    const stripe = stripeClient();

    // Réutilise le compte existant ou en crée un nouveau
    let acctId = accountId && /^acct_[A-Za-z0-9]+$/.test(accountId) ? accountId : null;
    if (!acctId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "FR",
        email: email || undefined,
        business_type: "individual",
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
        metadata: { platform: "LOCKR", nom: String(nom || "").slice(0, 200) },
      });
      acctId = account.id;
    }

    const link = await stripe.accountLinks.create({
      account: acctId,
      refresh_url: `${origin}/?stripe_onboard=retry`,
      return_url: `${origin}/?stripe_onboard=done&acct=${acctId}`,
      type: "account_onboarding",
    });

    return json(200, { url: link.url, accountId: acctId });
  } catch (err) {
    console.error("Stripe Connect error:", err.message);
    return json(500, { error: "stripe_error", message: err.message });
  }
};
