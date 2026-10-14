// Vérifie auprès de Stripe que l'inscription Connect de l'utilisateur est
// terminée (identité + IBAN validés) et met à jour son compte et son profil.
import { preflight, json } from "../lib/http.mjs";
import { adminReady, db, requestUser } from "../lib/admin.mjs";
import { stripeReady, stripeClient, stripeMode } from "../lib/stripe.mjs";

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  if (!stripeReady() || !adminReady()) return json(503, { error: "payments_not_configured" });

  const user = await requestUser(event);
  const acc = user?.account;
  if (!acc) return json(401, { error: "auth_required" });
  if (!acc.stripeAccountId) return json(200, { onboarded: false });

  const accRef = db().doc(`accounts/${user.uid}`);
  try {
    const a = await stripeClient().accounts.retrieve(acc.stripeAccountId);
    const onboarded = !!a.details_submitted && a.capabilities?.transfers === "active";
    const batch = db().batch();
    batch.update(accRef, { stripeOnboarded: onboarded, stripeMode: stripeMode() });
    if (acc.role === "pro") {
      const profRef = db().doc(`profiles/${user.uid}`);
      if ((await profRef.get()).exists) batch.update(profRef, { stripeReady: onboarded });
    }
    await batch.commit();
    return json(200, { onboarded });
  } catch (err) {
    // Compte inexistant dans ce mode (ex. créé en test, clé passée en production)
    if (err?.code === "resource_missing" || err?.statusCode === 404) {
      await accRef.update({ stripeAccountId: null, stripeOnboarded: false });
      return json(200, { onboarded: false });
    }
    console.error("connect-status:", err.message);
    return json(500, { error: "stripe_error" });
  }
};
