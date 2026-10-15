// Marketplace : l'argent de l'acheteur reste chez LOCKR jusqu'à la réception
// de l'article, puis 85 % sont virés au vendeur (Stripe Connect). Sans
// réponse de l'acheteur, le versement est automatique après 14 jours ; en cas
// de problème signalé, l'admin décide (versement ou remboursement).
import { db } from "./admin.mjs";
import { stripeReady, stripeClient, stripeMode } from "./stripe.mjs";
import { nowIso } from "./http.mjs";
import { marketSellerNet, MARKETPLACE_RELEASE_DAYS } from "../../src/lib/business.js";

const OPEN = ["payée", "litige"];

/* Compte Stripe Connect du vendeur (virements activés, même mode test / live) */
async function sellerDestination(vendeurId) {
  if (!vendeurId) return null;
  const snap = await db().doc(`accounts/${vendeurId}`).get();
  const a = snap.exists ? snap.data() : null;
  if (!a?.stripeOnboarded || !/^acct_[A-Za-z0-9]+$/.test(a.stripeAccountId || "")) return null;
  if (a.stripeMode && a.stripeMode !== stripeMode()) return null;
  return a.stripeAccountId;
}

/* Clôture la vente et verse sa part au vendeur.
   how : « recu » (l'acheteur confirme), « auto » (délai écoulé), « admin ».
   Sans compte Stripe du vendeur, la vente reste « à verser » par l'admin.
   Idempotent : un seul virement par vente (clé d'idempotence Stripe). */
export async function releaseSale(saleId, how, by) {
  const ref = db().doc(`sales/${saleId}`);
  const sale = await db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const s = snap.data();
    if (OPEN.includes(s.statut)) {
      tx.update(ref, {
        statut: "terminée", termineeLe: nowIso(), liberation: how, liberePar: by,
        ...(how === "recu" ? { recuLe: nowIso() } : {}),
      });
      return s;
    }
    // Nouvelle tentative de virement (admin) sur une vente déjà clôturée
    if (how === "admin" && s.statut === "terminée" && !s.vendeurPaye) return s;
    return { ...s, invalid: true };
  });
  if (!sale) return { error: "not_found" };
  if (sale.invalid) return { error: "invalid_state" };
  if (sale.vendeurPaye) return { ok: true, transferred: 0 };

  const dest = stripeReady() ? await sellerDestination(sale.vendeurId) : null;
  const net = marketSellerNet(sale);
  const cents = Math.round(net * 100);
  if (!dest || cents < 1) return { ok: true, transferred: 0, manual: true };
  try {
    const t = await stripeClient().transfers.create({
      amount: cents, currency: "eur", destination: dest,
      transfer_group: `sale_${saleId}`,
      ...(sale.chargeId ? { source_transaction: sale.chargeId } : {}),
      metadata: { type: "marketplace", ref: saleId },
    }, { idempotencyKey: `sale_release_${saleId}` });
    await ref.update({ vendeurPaye: true, vendeurPayeLe: nowIso(), vendeurVerse: net, transferId: t.id, versementErreur: null });
    await db().doc(`payments/transfer_${t.id}`).set({ id: `transfer_${t.id}`, type: "marketplace_versement", ref: saleId, amount: net, createdAt: nowIso(), by });
    return { ok: true, transferred: net };
  } catch (err) {
    // Le versement sera fait par l'admin (ou retenté depuis l'administration)
    console.error("marketplace transfer:", err.message);
    await ref.update({ versementErreur: String(err.message || "erreur").slice(0, 200) });
    return { ok: true, transferred: 0, manual: true };
  }
}

/* Remboursement intégral de l'acheteur (décision de l'admin) */
export async function refundSale(saleId, by) {
  const ref = db().doc(`sales/${saleId}`);
  const prev = await db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || !OPEN.includes(snap.data().statut)) return null;
    tx.update(ref, { statut: "remboursement" });
    return snap.data();
  });
  if (!prev) return { error: "invalid_state" };
  try {
    const stripe = stripeClient();
    let pi = prev.paymentIntentId || null;
    if (!pi && prev.stripeSessionId) {
      const session = await stripe.checkout.sessions.retrieve(prev.stripeSessionId);
      pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
    }
    if (!pi) throw new Error("no_payment");
    const r = await stripe.refunds.create({ payment_intent: pi, metadata: { type: "marketplace", ref: saleId } },
      { idempotencyKey: `sale_refund_${saleId}` });
    await ref.update({ statut: "remboursée", rembourseLe: nowIso(), refundId: r.id, remboursePar: by });
    await db().doc(`payments/refund_${r.id}`).set({ id: `refund_${r.id}`, type: "marketplace_remboursement", ref: saleId, amount: (r.amount || 0) / 100, createdAt: nowIso(), by });
    return { ok: true };
  } catch (err) {
    console.error("marketplace refund:", err.message);
    await ref.update({ statut: prev.statut });
    return { error: err.message === "no_payment" ? "no_payment" : "stripe_error" };
  }
}

/* Ventes dont le délai est écoulé sans problème signalé */
export async function releaseDueSales(now = Date.now()) {
  const snap = await db().collection("sales").where("statut", "==", "payée").get();
  let released = 0;
  for (const d of snap.docs) {
    const s = d.data();
    const due = new Date(s.liberationAuto || (s.payeLe ? new Date(s.payeLe).getTime() + MARKETPLACE_RELEASE_DAYS * 86400000 : 0)).getTime();
    if (due && due <= now) {
      const r = await releaseSale(d.id, "auto", "auto");
      if (r.ok) released++;
    }
  }
  return released;
}
