// Débit de l'empreinte bancaire après l'intervention.
// Montant débité = reste à payer de la facture, dans la limite du montant
// réservé. Si la facture dépasse la réservation, le complément est réglé
// par lien de paiement.
import { preflight, json, parseBody, round2 } from "../lib/http.mjs";
import { adminReady, db, requestUser, isAdmin } from "../lib/admin.mjs";
import { stripeReady } from "../lib/stripe.mjs";
import { captureFromHold } from "../lib/payments.mjs";
import { resteAPayer, empreinteActive } from "../../src/lib/business.js";

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  if (!stripeReady() || !adminReady()) return json(503, { error: "payments_not_configured" });

  const user = await requestUser(event);
  if (!user?.account || user.account.banned) return json(401, { error: "auth_required" });

  const { bookingId } = parseBody(event);
  const id = String(bookingId || "");
  const snap = await db().doc(`bookings/${id}`).get();
  if (!snap.exists) return json(404, { error: "not_found" });
  const b = snap.data();
  const worker = b.artisanAccountId === user.uid || b.partenaireId === user.uid;
  if (!worker && !isAdmin(user)) return json(403, { error: "forbidden" });
  if (b.statut !== "terminée") return json(409, { error: "not_finished" });
  if (!empreinteActive(b) || !b.empreinte.paymentIntentId) return json(409, { error: "no_hold" });

  try {
    const r = await captureFromHold(id, b, resteAPayer(b) * 100, {}, user.uid);
    if (r.expired) return json(409, { error: "expired" });
    const after = (await db().doc(`bookings/${id}`).get()).data();
    return json(200, { captured: r.captured, reste: round2(resteAPayer(after)) });
  } catch (err) {
    console.error("capture-payment:", err.message);
    return json(500, { error: "stripe_error" });
  }
};
