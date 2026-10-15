// Création d'une session de paiement Stripe Checkout.
// Le montant est TOUJOURS calculé ici, à partir de la base (jamais à partir de
// ce qu'envoie le navigateur). Conforme DSP2 (3-D Secure géré par Stripe) et
// PCI-DSS (aucune donnée de carte ne transite par l'application).
//
// Types :
//   empreinte    — le client enregistre sa carte : le montant du devis est
//                  réservé (capture différée), débité après l'intervention
//   prestation   — règlement du reste à payer d'une intervention terminée
//                  (ou des frais de déplacement non débités)
//   lien_client  — idem, lien envoyé par l'artisan au client
//   marketplace  — achat d'un article
//   abonnement   — abonnement Entreprise (mensuel / annuel)
import { preflight, json, parseBody, siteOrigin } from "../lib/http.mjs";
import { adminReady, db, requestUser, isAdmin } from "../lib/admin.mjs";
import { stripeReady, stripeClient } from "../lib/stripe.mjs";
import { connectDestination } from "../lib/payments.mjs";
import { bookingTotal, resteAPayer, commissionCents, SUB_PRICES, empreinteActive, isBillable } from "../../src/lib/business.js";

const TYPES = ["empreinte", "prestation", "lien_client", "marketplace", "abonnement"];
const isWorker = (b, uid) => b.artisanAccountId === uid || b.partenaireId === uid;

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  if (!stripeReady() || !adminReady()) return json(503, { error: "payments_not_configured" });

  const user = await requestUser(event);
  if (!user?.account) return json(401, { error: "auth_required" });
  if (user.account.banned) return json(403, { error: "forbidden" });

  const { type, ref, plan } = parseBody(event);
  if (!TYPES.includes(type)) return json(400, { error: "invalid_type" });

  try {
    let amount = 0;
    let label = "Prestation LOCKR";
    let refId = String(ref || "");
    let destination = null;
    let capture = "automatic";

    if (["empreinte", "prestation", "lien_client"].includes(type)) {
      const snap = await db().doc(`bookings/${refId}`).get();
      if (!snap.exists) return json(404, { error: "not_found" });
      const b = snap.data();
      if (type === "empreinte") {
        if (b.clientId !== user.uid && !isAdmin(user)) return json(403, { error: "forbidden" });
        if (!["en_attente_paiement", "assignée"].includes(b.statut) || empreinteActive(b)) return json(409, { error: "invalid_state" });
        amount = bookingTotal(b);
        capture = "manual";
        label = "Réservation LOCKR — montant réservé, débité après l'intervention";
      } else {
        const allowed = b.clientId === user.uid || isWorker(b, user.uid) || isAdmin(user);
        if (!allowed) return json(403, { error: "forbidden" });
        // Intervention terminée, ou frais de déplacement restés dus
        if (!isBillable(b)) return json(409, { error: "not_finished" });
        amount = resteAPayer(b);
        label = "Intervention LOCKR";
      }
      destination = await connectDestination(b);
    } else if (type === "marketplace") {
      const snap = await db().doc(`sales/${refId}`).get();
      if (!snap.exists) return json(404, { error: "not_found" });
      const sale = snap.data();
      if (sale.acheteurId !== user.uid) return json(403, { error: "forbidden" });
      if (sale.statut !== "en_attente_paiement") return json(409, { error: "invalid_state" });
      amount = Number(sale.prix) || 0;
      label = `Marketplace LOCKR — ${String(sale.titre || "Article").slice(0, 120)}`;
    } else if (type === "abonnement") {
      if (user.account.role !== "partenaire") return json(403, { error: "forbidden" });
      if (!SUB_PRICES[plan]) return json(400, { error: "invalid_plan" });
      amount = SUB_PRICES[plan];
      refId = user.uid;
      label = plan === "annuel" ? "Abonnement Entreprise LOCKR — 1 an" : "Abonnement Entreprise LOCKR — 1 mois";
    }

    const cents = Math.round(amount * 100);
    if (!Number.isFinite(cents) || cents < 50) return json(409, { error: "nothing_to_pay" });
    if (cents > 5000000) return json(400, { error: "invalid_amount" });

    const fee = destination ? commissionCents(cents) : 0;
    const metadata = {
      type, ref: refId, uid: user.uid, ...(type === "abonnement" ? { plan } : {}),
      split: destination ? "auto" : "manuel", fee_cents: String(fee),
    };
    const paymentIntentData = {
      description: label,
      statement_descriptor_suffix: "LOCKR",
      metadata: { type, ref: refId },
      ...(capture === "manual" ? { capture_method: "manual" } : {}),
      // Marketplace : l'argent attend la réception de l'article, puis est viré au vendeur
      ...(type === "marketplace" ? { transfer_group: `sale_${refId}` } : {}),
      ...(destination ? { application_fee_amount: fee, transfer_data: { destination } } : {}),
    };
    const origin = siteOrigin(event);
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email || undefined,
      line_items: [{ price_data: { currency: "eur", unit_amount: cents, product_data: { name: label } }, quantity: 1 }],
      metadata,
      payment_intent_data: paymentIntentData,
      success_url: `${origin}/?paiement=succes&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?paiement=annule`,
    });
    return json(200, { url: session.url, id: session.id });
  } catch (err) {
    console.error("create-checkout:", err.message);
    return json(500, { error: "stripe_error" });
  }
};
