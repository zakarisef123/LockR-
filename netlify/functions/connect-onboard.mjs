// Inscription Stripe Connect Express d'un artisan / d'une entreprise :
// Stripe vérifie l'identité et l'IBAN (KYC / LCB-FT), puis la part de chaque
// intervention est versée automatiquement. Le compte Stripe est enregistré
// par le serveur (l'utilisateur ne peut pas le modifier lui-même).
import { preflight, json, siteOrigin } from "../lib/http.mjs";
import { adminReady, db, requestUser } from "../lib/admin.mjs";
import { stripeReady, stripeClient, stripeMode } from "../lib/stripe.mjs";

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  if (!stripeReady() || !adminReady()) return json(503, { error: "payments_not_configured" });

  const user = await requestUser(event);
  const acc = user?.account;
  if (!acc || acc.banned) return json(401, { error: "auth_required" });
  if (!["pro", "partenaire"].includes(acc.role)) return json(403, { error: "forbidden" });

  try {
    const stripe = stripeClient();
    const origin = siteOrigin(event);
    // Réutilise le compte Stripe existant (s'il a été créé dans le même mode test / production)
    let acctId = /^acct_[A-Za-z0-9]+$/.test(acc.stripeAccountId || "") && (!acc.stripeMode || acc.stripeMode === stripeMode())
      ? acc.stripeAccountId : null;
    if (!acctId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "FR",
        email: user.email || undefined,
        business_type: acc.role === "partenaire" ? "company" : "individual",
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
        metadata: { platform: "LOCKR", accountId: user.uid },
      });
      acctId = account.id;
      await db().doc(`accounts/${user.uid}`).update({ stripeAccountId: acctId, stripeMode: stripeMode(), stripeOnboarded: false });
    }
    const link = await stripe.accountLinks.create({
      account: acctId,
      refresh_url: `${origin}/?stripe_onboard=retry`,
      return_url: `${origin}/?stripe_onboard=done`,
      type: "account_onboarding",
    });
    return json(200, { url: link.url });
  } catch (err) {
    console.error("connect-onboard:", err.message);
    return json(500, { error: "stripe_error" });
  }
};
