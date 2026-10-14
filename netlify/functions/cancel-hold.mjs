// Libération de l'empreinte bancaire et annulation de l'intervention :
//   annulation_client — le client annule avant le départ de l'artisan
//   refus_pro         — l'artisan refuse la mission (elle est republiée)
//   admin             — décision de l'administration
import { preflight, json, parseBody, nowIso } from "../lib/http.mjs";
import { adminReady, db, requestUser, isAdmin } from "../lib/admin.mjs";
import { stripeReady, stripeClient } from "../lib/stripe.mjs";

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  if (!stripeReady() || !adminReady()) return json(503, { error: "payments_not_configured" });

  const user = await requestUser(event);
  if (!user?.account || user.account.banned) return json(401, { error: "auth_required" });

  const { bookingId, reason } = parseBody(event);
  const ref = db().doc(`bookings/${String(bookingId || "")}`);
  const snap = await ref.get();
  if (!snap.exists) return json(404, { error: "not_found" });
  const b = snap.data();

  let patch;
  if (reason === "annulation_client") {
    if (b.clientId !== user.uid && !isAdmin(user)) return json(403, { error: "forbidden" });
    // Annulation gratuite tant que l'artisan n'est pas parti
    if (!["en_attente_paiement", "assignée"].includes(b.statut)) return json(409, { error: "too_late" });
    patch = { statut: "annulée_client", annuleeLe: nowIso() };
  } else if (reason === "refus_pro") {
    if (b.artisanAccountId !== user.uid && b.partenaireId !== user.uid) return json(403, { error: "forbidden" });
    if (!["en_attente_paiement", "assignée"].includes(b.statut)) return json(409, { error: "too_late" });
    patch = { statut: "annulée", annulationRaison: "refusée_pro", annuleeLe: nowIso() };
  } else if (reason === "admin") {
    if (!isAdmin(user)) return json(403, { error: "forbidden" });
    patch = {};
  } else {
    return json(400, { error: "invalid_reason" });
  }

  try {
    const e = b.empreinte;
    if (e?.statut === "autorisée" && e.paymentIntentId) {
      const pi = await stripeClient().paymentIntents.retrieve(e.paymentIntentId);
      if (pi.status === "requires_capture") await stripeClient().paymentIntents.cancel(pi.id);
      patch.empreinte = { ...e, statut: "libérée", libereeLe: nowIso() };
    }
    await ref.update(patch);
    return json(200, { ok: true });
  } catch (err) {
    console.error("cancel-hold:", err.message);
    return json(500, { error: "stripe_error" });
  }
};
