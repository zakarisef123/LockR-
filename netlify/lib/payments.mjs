// Enregistrement des paiements côté serveur (seul habilité à le faire :
// les règles Firestore interdisent aux utilisateurs de modifier ces champs).
import { db, FieldValue } from "./admin.mjs";
import { stripeMode } from "./stripe.mjs";
import { nowIso, round2 } from "./http.mjs";
import {
  isStandardRate, SUB_DAYS, montantEncaisse, proAutoPaid, resteAPayer,
} from "../../src/lib/business.js";

/* Compte Stripe Connect qui reçoit automatiquement la part de l'artisan :
   seulement au taux standard et si l'artisan a terminé son inscription Stripe
   (dans le même mode test / production que la clé du serveur). */
export async function connectDestination(b) {
  if (!b || !isStandardRate(b) || !b.artisanAccountId) return null;
  const snap = await db().doc(`accounts/${b.artisanAccountId}`).get();
  const a = snap.exists ? snap.data() : null;
  if (!a?.stripeOnboarded || !/^acct_[A-Za-z0-9]+$/.test(a.stripeAccountId || "")) return null;
  if (a.stripeMode && a.stripeMode !== stripeMode()) return null;
  return a.stripeAccountId;
}

/* Applique une session Checkout terminée. Idempotent : une session n'est
   comptée qu'une fois, même si le retour du client et le webhook Stripe
   arrivent tous les deux (registre payments/{id de session}).
   Renvoie { type, ref, paid, authorized }. */
export async function applyCheckoutSession(session) {
  const type = session.metadata?.type || "";
  const ref = session.metadata?.ref || "";
  const pi = session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
  const authorized = type === "empreinte" && pi?.status === "requires_capture";
  const paid = session.payment_status === "paid";
  const result = { type, ref, paid, authorized };
  if (!ref || (!paid && !authorized)) return result;

  const amount = (session.amount_total || 0) / 100;
  // Part virée automatiquement à l'artisan par Stripe Connect
  const feeCents = Number(session.metadata?.fee_cents || 0);
  const transferred = session.metadata?.split === "auto" ? ((session.amount_total || 0) - feeCents) / 100 : 0;

  await db().runTransaction(async tx => {
    const pRef = db().doc(`payments/${session.id}`);
    if ((await tx.get(pRef)).exists) return; // déjà appliqué
    const ledger = { id: session.id, type, ref, amount, createdAt: nowIso(), livemode: !!session.livemode };

    if (["empreinte", "prestation", "lien_client"].includes(type)) {
      const bRef = db().doc(`bookings/${ref}`);
      const bSnap = await tx.get(bRef);
      if (!bSnap.exists) { tx.set(pRef, { ...ledger, error: "booking_missing" }); return; }
      const b = bSnap.data();
      if (type === "empreinte") {
        tx.update(bRef, {
          empreinte: {
            statut: "autorisée", montant: (pi.amount_capturable || pi.amount || 0) / 100,
            paymentIntentId: pi.id, autoriseeLe: nowIso(), split: session.metadata?.split === "auto",
          },
          ...(b.statut === "en_attente_paiement" ? { statut: "assignée" } : {}),
          garantie: FieldValue.delete(),
        });
      } else {
        const encaisse = round2(montantEncaisse(b) + amount);
        const solde = resteAPayer({ ...b, montantEncaisse: encaisse }) <= 0.009;
        tx.update(bRef, {
          montantEncaisse: encaisse,
          ...(transferred > 0 ? { proVerseAuto: round2(proAutoPaid(b) + transferred) } : {}),
          ...(solde ? { statutPaiement: "payé", paiementVerifie: true, payeLe: nowIso(), stripeSessionId: session.id } : {}),
        });
      }
    } else if (type === "marketplace") {
      const sRef = db().doc(`sales/${ref}`);
      const sSnap = await tx.get(sRef);
      const sale = sSnap.exists ? sSnap.data() : null;
      const lRef = sale?.listingId ? db().doc(`listings/${sale.listingId}`) : null;
      const lSnap = lRef ? await tx.get(lRef) : null;
      if (sale) tx.update(sRef, { statut: "payée", payeLe: nowIso(), stripeSessionId: session.id });
      if (lSnap?.exists) tx.update(lRef, { sold: true });
    } else if (type === "abonnement") {
      const plan = session.metadata?.plan === "annuel" ? "annuel" : "mensuel";
      const aRef = db().doc(`accounts/${ref}`);
      const aSnap = await tx.get(aRef);
      if (aSnap.exists) {
        const sub = aSnap.data().subscription;
        const base = sub?.until && new Date(sub.until) > new Date() ? new Date(sub.until) : new Date();
        tx.update(aRef, {
          subscription: {
            plan, since: sub?.since || nowIso(), until: new Date(base.getTime() + SUB_DAYS[plan] * 86400000).toISOString(),
            payeLe: nowIso(), stripeSessionId: session.id,
          },
        });
      }
    }
    tx.set(pRef, ledger);
  });
  return result;
}

/* Empreinte expirée ou annulée chez Stripe (webhook / débit impossible) */
export async function markHoldExpired(bookingId, paymentIntentId) {
  const ref = db().doc(`bookings/${bookingId}`);
  const snap = await ref.get();
  const e = snap.exists ? snap.data().empreinte : null;
  if (e?.statut === "autorisée" && (!paymentIntentId || e.paymentIntentId === paymentIntentId)) {
    await ref.update({ empreinte: { ...e, statut: "expirée", expireeLe: nowIso() } });
  }
}
