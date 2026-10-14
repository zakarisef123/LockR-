// Débit de l'empreinte bancaire après l'intervention.
// Montant débité = reste à payer de la facture, dans la limite du montant
// réservé. Si la facture dépasse la réservation, le complément est réglé
// par lien de paiement.
import { preflight, json, parseBody, nowIso, round2 } from "../lib/http.mjs";
import { adminReady, db, requestUser, isAdmin } from "../lib/admin.mjs";
import { stripeReady, stripeClient } from "../lib/stripe.mjs";
import { markHoldExpired } from "../lib/payments.mjs";
import { resteAPayer, montantEncaisse, proAutoPaid, commissionCents, empreinteActive } from "../../src/lib/business.js";

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  if (!stripeReady() || !adminReady()) return json(503, { error: "payments_not_configured" });

  const user = await requestUser(event);
  if (!user?.account || user.account.banned) return json(401, { error: "auth_required" });

  const { bookingId } = parseBody(event);
  const ref = db().doc(`bookings/${String(bookingId || "")}`);
  const snap = await ref.get();
  if (!snap.exists) return json(404, { error: "not_found" });
  const b = snap.data();
  const worker = b.artisanAccountId === user.uid || b.partenaireId === user.uid;
  if (!worker && !isAdmin(user)) return json(403, { error: "forbidden" });
  if (b.statut !== "terminée") return json(409, { error: "not_finished" });
  if (!empreinteActive(b) || !b.empreinte.paymentIntentId) return json(409, { error: "no_hold" });

  const stripe = stripeClient();
  try {
    const pi = await stripe.paymentIntents.retrieve(b.empreinte.paymentIntentId);
    if (pi.status !== "requires_capture") {
      await markHoldExpired(snap.id, pi.id);
      return json(409, { error: "expired" });
    }
    const resteCents = Math.round(resteAPayer(b) * 100);
    const toCapture = Math.min(resteCents, pi.amount_capturable);
    if (toCapture < 50) {
      // Rien (ou presque) à débiter : la réservation est libérée
      await stripe.paymentIntents.cancel(pi.id);
      await ref.update({ empreinte: { ...b.empreinte, statut: "libérée", libereeLe: nowIso() } });
      return json(200, { captured: 0, reste: round2(resteAPayer(b)) });
    }
    const split = !!pi.transfer_data?.destination;
    const fee = split ? commissionCents(toCapture) : 0;
    const captured = await stripe.paymentIntents.capture(pi.id, {
      amount_to_capture: toCapture,
      ...(split ? { application_fee_amount: fee } : {}),
    });
    const amount = (captured.amount_received || toCapture) / 100;
    const transferred = split ? (toCapture - fee) / 100 : 0;
    const encaisse = round2(montantEncaisse(b) + amount);
    const reste = round2(resteAPayer({ ...b, montantEncaisse: encaisse }));
    await db().runTransaction(async tx => {
      const pRef = db().doc(`payments/capture_${pi.id}`);
      if ((await tx.get(pRef)).exists) return;
      tx.update(ref, {
        empreinte: { ...b.empreinte, statut: "débitée", debite: amount, debiteeLe: nowIso() },
        montantEncaisse: encaisse,
        ...(transferred > 0 ? { proVerseAuto: round2(proAutoPaid(b) + transferred) } : {}),
        ...(reste <= 0.009 ? { statutPaiement: "payé", paiementVerifie: true, payeLe: nowIso() } : {}),
      });
      tx.set(pRef, { id: `capture_${pi.id}`, type: "capture", ref: snap.id, amount, createdAt: nowIso(), by: user.uid });
    });
    return json(200, { captured: amount, reste });
  } catch (err) {
    console.error("capture-payment:", err.message);
    return json(500, { error: "stripe_error" });
  }
};
