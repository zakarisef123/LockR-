// Tests des fonctions serveur (Netlify) contre les émulateurs Firebase et un
// faux Stripe en mémoire. Lancement : npm run test:functions
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createFakeStripe } from "./fakeStripe.mjs";

process.env.STRIPE_SECRET_KEY ||= "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_test";
process.env.URL ||= "http://localhost:5173";
const PROJECT = process.env.GCLOUD_PROJECT || "demo-lockr";
process.env.GCLOUD_PROJECT = PROJECT;
const FS = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;

let stripe;
let db, adminAuth;

const call = async (name, body = {}, token = null, extra = {}) => {
  const { handler } = await import(`../netlify/functions/${name}.mjs`);
  const res = await handler({ httpMethod: "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(extra.headers || {}) }, body: extra.raw ?? JSON.stringify(body) });
  return { status: res.statusCode, data: res.body ? JSON.parse(res.body) : {} };
};
const signIn = async (email, password) => {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const d = await r.json();
  return d.idToken || null;
};
// Crée un utilisateur (connexion + fiche) et renvoie son jeton
const user = async (uid, data) => {
  const email = `${uid}@test.fr`;
  await adminAuth().createUser({ uid, email, password: "motdepasse1" });
  await db().doc(`accounts/${uid}`).set({ id: uid, email, nom: uid, ...data });
  return signIn(email, "motdepasse1");
};
const get = async path => (await db().doc(path).get()).data();

before(async () => {
  assert.ok(FS && AUTH, "Lancer avec les émulateurs (npm run test:functions)");
  ({ db, adminAuth } = await import("../netlify/lib/admin.mjs"));
});

let tClient, tPro, tPro2, tPartner, tAdmin;
beforeEach(async () => {
  await fetch(`http://${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  stripe = createFakeStripe();
  globalThis.__lkStripe = stripe;
  tClient = await user("client1", { role: "client", tel: "0600000001" });
  tPro = await user("pro1", { role: "pro", artisanId: "pro1", dossierStatus: "approved" });
  tPro2 = await user("pro2", { role: "pro", artisanId: "pro2", dossierStatus: "approved" });
  tPartner = await user("part1", { role: "partenaire", dossierStatus: "approved" });
  tAdmin = await user("admin1", { role: "admin" });
  await db().doc("bookings/b1").set({
    id: "b1", clientId: "client1", artisanId: "pro1", artisanAccountId: "pro1", participants: ["client1", "pro1"],
    techPct: 85, montant: 120, statut: "en_attente_paiement", createdAt: new Date().toISOString(),
  });
});

const lastSessionId = () => [...stripe.sessions.keys()].pop();

// ── Empreinte bancaire ──────────────────────────────────────────────────────
test("empreinte : création, autorisation (idempotente), débit du montant final", async () => {
  // Montant calculé par le serveur, capture différée
  const r = await call("create-checkout", { type: "empreinte", ref: "b1" }, tClient);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const created = stripe.calls.find(c => c[0] === "checkout.sessions.create")[1];
  assert.equal(created.line_items[0].price_data.unit_amount, 12000);
  assert.equal(created.payment_intent_data.capture_method, "manual");
  assert.equal(created.payment_intent_data.transfer_data, undefined, "pas de Connect : pas de split");

  // Seul le client de la mission peut enregistrer sa carte
  assert.equal((await call("create-checkout", { type: "empreinte", ref: "b1" }, tPro2)).status, 403);
  assert.equal((await call("create-checkout", { type: "empreinte", ref: "b1" })).status, 401);

  // Le client a validé sur Stripe → retour sur l'application
  const sid = lastSessionId();
  stripe.completeSession(sid);
  const v = await call("verify-session", { sessionId: sid });
  assert.deepEqual([v.status, v.data.authorized, v.data.paid], [200, true, false]);
  let b = await get("bookings/b1");
  assert.equal(b.statut, "assignée");
  assert.equal(b.empreinte.statut, "autorisée");
  assert.equal(b.empreinte.montant, 120);
  // Deuxième vérification (rechargement, webhook) : rien ne change
  await call("verify-session", { sessionId: sid });
  assert.equal((await db().collection("payments").get()).size, 1);

  // Débit impossible avant la fin de l'intervention, et réservé à l'artisan
  assert.equal((await call("capture-payment", { bookingId: "b1" }, tPro)).status, 409);
  await db().doc("bookings/b1").update({ statut: "terminée", montantFinal: 100 });
  assert.equal((await call("capture-payment", { bookingId: "b1" }, tClient)).status, 403);
  const c = await call("capture-payment", { bookingId: "b1" }, tPro);
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.deepEqual([c.data.captured, c.data.reste], [100, 0]);
  b = await get("bookings/b1");
  assert.equal(b.statutPaiement, "payé");
  assert.equal(b.empreinte.statut, "débitée");
  assert.equal(b.montantEncaisse, 100);
  // Une seule capture possible
  assert.equal((await call("capture-payment", { bookingId: "b1" }, tPro)).status, 409);
});

test("empreinte : facture supérieure à la réservation → complément par lien de paiement", async () => {
  await call("create-checkout", { type: "empreinte", ref: "b1" }, tClient);
  const sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
  await db().doc("bookings/b1").update({ statut: "terminée", montantFinal: 150 });
  const c = await call("capture-payment", { bookingId: "b1" }, tPro);
  assert.deepEqual([c.data.captured, c.data.reste], [120, 30]);
  assert.notEqual((await get("bookings/b1")).statutPaiement, "payé");
  // Lien envoyé par l'artisan : le serveur calcule le reste (30 €)
  const l = await call("create-checkout", { type: "lien_client", ref: "b1" }, tPro);
  assert.equal(l.status, 200);
  assert.equal(stripe.calls.filter(x => x[0] === "checkout.sessions.create").pop()[1].line_items[0].price_data.unit_amount, 3000);
  const sid2 = lastSessionId();
  stripe.completeSession(sid2);
  const v = await call("verify-session", { sessionId: sid2 });
  assert.equal(v.data.paid, true);
  const b = await get("bookings/b1");
  assert.equal(b.statutPaiement, "payé");
  assert.equal(b.montantEncaisse, 150);
});

test("empreinte : annulation par le client avant le départ → réservation libérée", async () => {
  await call("create-checkout", { type: "empreinte", ref: "b1" }, tClient);
  const sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
  assert.equal((await call("cancel-hold", { bookingId: "b1", reason: "annulation_client" }, tPro)).status, 403);
  const r = await call("cancel-hold", { bookingId: "b1", reason: "annulation_client" }, tClient);
  assert.equal(r.status, 200);
  const b = await get("bookings/b1");
  assert.equal(b.statut, "annulée_client");
  assert.equal(b.empreinte.statut, "libérée");
  assert.equal([...stripe.intents.values()][0].status, "canceled");
  // Trop tard une fois l'artisan parti
  await db().doc("bookings/b1").update({ statut: "en_route" });
  assert.equal((await call("cancel-hold", { bookingId: "b1", reason: "annulation_client" }, tClient)).status, 409);
});

test("empreinte expirée : débit refusé, l'artisan passe par un lien", async () => {
  await call("create-checkout", { type: "empreinte", ref: "b1" }, tClient);
  const sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
  stripe.expireIntent(stripe.sessions.get(sid).payment_intent);
  await db().doc("bookings/b1").update({ statut: "terminée", montantFinal: 100 });
  const c = await call("capture-payment", { bookingId: "b1" }, tPro);
  assert.deepEqual([c.status, c.data.error], [409, "expired"]);
  assert.equal((await get("bookings/b1")).empreinte.statut, "expirée");
});

test("refus de mission par l'artisan : réservation libérée, mission annulée", async () => {
  await call("create-checkout", { type: "empreinte", ref: "b1" }, tClient);
  const sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
  const r = await call("cancel-hold", { bookingId: "b1", reason: "refus_pro" }, tPro);
  assert.equal(r.status, 200);
  const b = await get("bookings/b1");
  assert.deepEqual([b.statut, b.annulationRaison, b.empreinte.statut], ["annulée", "refusée_pro", "libérée"]);
});

// ── Stripe Connect : part de l'artisan versée automatiquement ───────────────
test("Stripe Connect : inscription, vérification, puis partage automatique 85 / 15", async () => {
  const o = await call("connect-onboard", {}, tPro);
  assert.equal(o.status, 200);
  let acc = await get("accounts/pro1");
  assert.match(acc.stripeAccountId, /^acct_/);
  assert.equal(acc.stripeOnboarded, false);
  assert.equal((await call("connect-status", {}, tPro)).data.onboarded, false);
  stripe.finishOnboarding(acc.stripeAccountId);
  await db().doc("profiles/pro1").set({ id: "pro1", artisanId: "pro1", stripeReady: false });
  assert.equal((await call("connect-status", {}, tPro)).data.onboarded, true);
  acc = await get("accounts/pro1");
  assert.equal(acc.stripeOnboarded, true);
  assert.equal((await get("profiles/pro1")).stripeReady, true);
  // Un client ne peut pas s'inscrire comme bénéficiaire
  assert.equal((await call("connect-onboard", {}, tClient)).status, 403);

  // Empreinte avec destination = compte de l'artisan
  await call("create-checkout", { type: "empreinte", ref: "b1" }, tClient);
  const params = stripe.calls.filter(x => x[0] === "checkout.sessions.create").pop()[1];
  assert.equal(params.payment_intent_data.transfer_data.destination, acc.stripeAccountId);
  const sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
  await db().doc("bookings/b1").update({ statut: "terminée", montantFinal: 100 });
  await call("capture-payment", { bookingId: "b1" }, tPro);
  const cap = stripe.calls.find(c => c[0] === "paymentIntents.capture")[2];
  assert.deepEqual(cap, { amount_to_capture: 10000, application_fee_amount: 1500 });
  assert.equal((await get("bookings/b1")).proVerseAuto, 85);
});

// ── Autres paiements ────────────────────────────────────────────────────────
test("facture réglée par le client (sans empreinte)", async () => {
  await db().doc("bookings/b1").update({ statut: "terminée", montantFinal: 90 });
  const r = await call("create-checkout", { type: "prestation", ref: "b1" }, tClient);
  assert.equal(r.status, 200);
  const sid = lastSessionId();
  // Retour avant paiement (session ouverte) : rien n'est enregistré
  assert.equal((await call("verify-session", { sessionId: sid })).data.paid, false);
  assert.notEqual((await get("bookings/b1")).statutPaiement, "payé");
  stripe.completeSession(sid);
  assert.equal((await call("verify-session", { sessionId: sid })).data.paid, true);
  assert.equal((await get("bookings/b1")).statutPaiement, "payé");
  // Plus rien à payer ensuite
  assert.equal((await call("create-checkout", { type: "prestation", ref: "b1" }, tClient)).status, 409);
  // Un inconnu ne peut pas créer de paiement sur cette mission
  assert.equal((await call("create-checkout", { type: "prestation", ref: "b1" }, tPro2)).status, 403);
});

test("webhook Stripe : paiement enregistré même sans retour du client", async () => {
  await db().doc("bookings/b1").update({ statut: "terminée", montantFinal: 90 });
  await call("create-checkout", { type: "prestation", ref: "b1" }, tClient);
  const sid = lastSessionId();
  stripe.completeSession(sid);
  const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: sid } } });
  const bad = await call("stripe-webhook", null, null, { raw: body, headers: { "stripe-signature": "faux" } });
  assert.equal(bad.status, 400);
  const ok = await call("stripe-webhook", null, null, { raw: body, headers: { "stripe-signature": "ok:whsec_test" } });
  assert.equal(ok.status, 200);
  assert.equal((await get("bookings/b1")).statutPaiement, "payé");
});

test("marketplace et abonnement entreprise", async () => {
  await db().doc("listings/l1").set({ id: "l1", proId: "pro2", prix: 95.5, titre: "Outil" });
  await db().doc("sales/s1").set({ id: "s1", listingId: "l1", acheteurId: "pro1", vendeurId: "pro2", participants: ["pro1", "pro2"], prix: 95.5, statut: "en_attente_paiement" });
  assert.equal((await call("create-checkout", { type: "marketplace", ref: "s1" }, tPro2)).status, 403);
  assert.equal((await call("create-checkout", { type: "marketplace", ref: "s1" }, tPro)).status, 200);
  let sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
  assert.equal((await get("sales/s1")).statut, "payée");
  assert.equal((await get("listings/l1")).sold, true);

  assert.equal((await call("create-checkout", { type: "abonnement", plan: "annuel" }, tClient)).status, 403);
  assert.equal((await call("create-checkout", { type: "abonnement", plan: "annuel" }, tPartner)).status, 200);
  assert.equal(stripe.calls.filter(x => x[0] === "checkout.sessions.create").pop()[1].line_items[0].price_data.unit_amount, 49900);
  sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
  const sub = (await get("accounts/part1")).subscription;
  assert.equal(sub.plan, "annuel");
  assert.ok(new Date(sub.until) > new Date(Date.now() + 360 * 86400000));
});

// ── Frais de déplacement ────────────────────────────────────────────────────
const onboard = async (token, uid) => {
  await call("connect-onboard", {}, token);
  stripe.finishOnboarding((await get(`accounts/${uid}`)).stripeAccountId);
  await call("connect-status", {}, token);
  return (await get(`accounts/${uid}`)).stripeAccountId;
};
const holdCard = async () => {
  await call("create-checkout", { type: "empreinte", ref: "b1" }, tClient);
  const sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
};

test("frais de déplacement : annulation alors que l'artisan est en route → 30 € débités, partagés 85 / 15", async () => {
  await onboard(tPro, "pro1");
  await holdCard();
  // Avant le départ : l'annulation est gratuite, pas de frais possibles
  assert.equal((await call("cancel-hold", { bookingId: "b1", reason: "annulation_tardive" }, tClient)).data.error, "invalid_state");
  await db().doc("bookings/b1").update({ statut: "en_route", departAt: new Date().toISOString() });
  // Plus d'annulation gratuite ; seul le client (ou l'admin) annule
  assert.equal((await call("cancel-hold", { bookingId: "b1", reason: "annulation_client" }, tClient)).status, 409);
  assert.equal((await call("cancel-hold", { bookingId: "b1", reason: "annulation_tardive" }, tPro)).status, 403);
  const r = await call("cancel-hold", { bookingId: "b1", reason: "annulation_tardive" }, tClient);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([r.data.frais, r.data.captured, r.data.du], [30, 30, 0]);
  const cap = stripe.calls.find(c => c[0] === "paymentIntents.capture")[2];
  assert.deepEqual(cap, { amount_to_capture: 3000, application_fee_amount: 450 });
  const b = await get("bookings/b1");
  assert.equal(b.statut, "annulée_client");
  assert.equal(b.annulationRaison, "annulation_tardive");
  assert.deepEqual([b.fraisDeplacement, b.montantFinal, b.montantEncaisse, b.proVerseAuto], [30, 30, 30, 25.5]);
  assert.equal(b.statutPaiement, "payé");
  assert.equal(b.empreinte.statut, "débitée");
});

test("frais de déplacement : client absent sans carte → frais dus, réglés par lien ; montant fixé par l'admin", async () => {
  await db().doc("settings/tarifs").set({ id: "tarifs", fraisDeplacement: 25 });
  const ago = min => new Date(Date.now() - min * 60000).toISOString();
  await db().doc("bookings/b1").update({ statut: "en_cours", arriveAt: ago(3) });
  // Attente minimale de 10 minutes sur place
  const early = await call("cancel-hold", { bookingId: "b1", reason: "client_absent" }, tPro);
  assert.deepEqual([early.status, early.data.error], [409, "wait"]);
  await db().doc("bookings/b1").update({ arriveAt: ago(12) });
  assert.equal((await call("cancel-hold", { bookingId: "b1", reason: "client_absent" }, tClient)).status, 403);
  assert.equal((await call("cancel-hold", { bookingId: "b1", reason: "client_absent" }, tPro2)).status, 403);
  const r = await call("cancel-hold", { bookingId: "b1", reason: "client_absent" }, tPro);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([r.data.frais, r.data.captured, r.data.du], [25, 0, 25]);
  let b = await get("bookings/b1");
  assert.deepEqual([b.statut, b.annulationRaison, b.fraisDeplacement, b.montantFinal], ["annulée", "client_absent", 25, 25]);
  assert.notEqual(b.statutPaiement, "payé");
  // Les frais restent réglables : lien envoyé par l'artisan (montant calculé par le serveur)
  assert.equal((await call("create-checkout", { type: "lien_client", ref: "b1" }, tPro)).status, 200);
  assert.equal(stripe.calls.filter(x => x[0] === "checkout.sessions.create").pop()[1].line_items[0].price_data.unit_amount, 2500);
  const sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
  b = await get("bookings/b1");
  assert.equal(b.statutPaiement, "payé");
});

// ── Marketplace : argent conservé jusqu'à la réception ──────────────────────
const buy = async (saleId, prix = 95.5) => {
  await db().doc(`listings/l_${saleId}`).set({ id: `l_${saleId}`, proId: "pro2", prix, titre: "Outil" });
  await db().doc(`sales/${saleId}`).set({ id: saleId, listingId: `l_${saleId}`, acheteurId: "pro1", vendeurId: "pro2", participants: ["pro1", "pro2"], prix, statut: "en_attente_paiement" });
  assert.equal((await call("create-checkout", { type: "marketplace", ref: saleId }, tPro)).status, 200);
  const sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
  return get(`sales/${saleId}`);
};

test("marketplace : paiement conservé, versé au vendeur (85 %) quand l'acheteur confirme la réception", async () => {
  const dest = await onboard(tPro2, "pro2");
  const sale = await buy("s1");
  const params = stripe.calls.filter(x => x[0] === "checkout.sessions.create").pop()[1];
  assert.equal(params.payment_intent_data.transfer_group, "sale_s1");
  assert.equal(params.payment_intent_data.transfer_data, undefined, "rien n'est versé au paiement");
  assert.equal(sale.statut, "payée");
  assert.match(sale.paymentIntentId, /^pi_/);
  assert.match(sale.chargeId, /^ch_/);
  const days = (new Date(sale.liberationAuto) - Date.now()) / 86400000;
  assert.ok(days > 13.9 && days < 14.1, `versement automatique à 14 jours (${days})`);
  // Seul l'acheteur confirme la réception
  assert.equal((await call("marketplace-release", { saleId: "s1", action: "recu" }, tPro2)).status, 403);
  assert.equal((await call("marketplace-release", { saleId: "s1", action: "recu" }, tPartner)).status, 403);
  assert.equal((await call("marketplace-release", { saleId: "s1", action: "liberer" }, tPro)).status, 403);
  const r = await call("marketplace-release", { saleId: "s1", action: "recu" }, tPro);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.transferred, 81.17);
  const t = stripe.calls.find(c => c[0] === "transfers.create");
  assert.deepEqual([t[1].amount, t[1].destination, t[1].source_transaction, t[1].transfer_group], [8117, dest, sale.chargeId, "sale_s1"]);
  const after = await get("sales/s1");
  assert.deepEqual([after.statut, after.vendeurPaye, after.vendeurVerse, after.liberation], ["terminée", true, 81.17, "recu"]);
  // Une seule fois
  assert.equal((await call("marketplace-release", { saleId: "s1", action: "recu" }, tPro)).status, 409);
  assert.equal(stripe.calls.filter(c => c[0] === "transfers.create").length, 1);
});

test("marketplace : problème signalé → décision de l'admin ; vendeur sans Stripe ; versement automatique à 14 jours", async () => {
  await buy("s1");
  // Problème signalé par l'acheteur : motif obligatoire, versement bloqué
  assert.equal((await call("marketplace-release", { saleId: "s1", action: "probleme", motif: "?" }, tPro)).status, 400);
  assert.equal((await call("marketplace-release", { saleId: "s1", action: "probleme", motif: "Article non reçu" }, tPro2)).status, 403);
  assert.equal((await call("marketplace-release", { saleId: "s1", action: "probleme", motif: "Article non reçu" }, tPro)).status, 200);
  assert.equal((await get("sales/s1")).statut, "litige");
  // L'admin rembourse l'acheteur
  assert.equal((await call("marketplace-release", { saleId: "s1", action: "rembourser" }, tPro)).status, 403);
  const rf = await call("marketplace-release", { saleId: "s1", action: "rembourser" }, tAdmin);
  assert.equal(rf.status, 200, JSON.stringify(rf.data));
  assert.equal(stripe.calls.find(c => c[0] === "refunds.create")[1].payment_intent, (await get("sales/s1")).paymentIntentId);
  assert.equal((await get("sales/s1")).statut, "remboursée");
  assert.equal((await call("marketplace-release", { saleId: "s1", action: "liberer" }, tAdmin)).status, 409);

  // Ventes payées : l'une depuis plus de 14 jours, l'autre récente, la troisième en litige
  const old = new Date(Date.now() - 86400000).toISOString();
  await db().doc("sales/s2").set({ id: "s2", acheteurId: "pro1", vendeurId: "pro2", participants: ["pro1", "pro2"], prix: 40, commission: 6, statut: "payée", liberationAuto: old });
  await db().doc("sales/s3").set({ id: "s3", acheteurId: "pro1", vendeurId: "pro2", participants: ["pro1", "pro2"], prix: 40, commission: 6, statut: "payée", liberationAuto: new Date(Date.now() + 86400000).toISOString() });
  await db().doc("sales/s4").set({ id: "s4", acheteurId: "pro1", vendeurId: "pro2", participants: ["pro1", "pro2"], prix: 40, commission: 6, statut: "litige", liberationAuto: old });
  const { handler } = await import("../netlify/functions/marketplace-auto-release.mjs");
  const auto = await handler({});
  assert.equal(JSON.parse(auto.body).released, 1);
  const s2 = await get("sales/s2");
  // Vendeur sans virements Stripe : vente close, versement manuel par l'admin
  assert.deepEqual([s2.statut, s2.liberation, s2.vendeurPaye], ["terminée", "auto", undefined]);
  assert.equal((await get("sales/s3")).statut, "payée");
  assert.equal((await get("sales/s4")).statut, "litige");

  // Le vendeur active ses virements : l'admin relance le versement
  const dest = await onboard(tPro2, "pro2");
  const again = await call("marketplace-release", { saleId: "s2", action: "liberer" }, tAdmin);
  assert.deepEqual([again.status, again.data.transferred], [200, 34]);
  const t = stripe.calls.filter(c => c[0] === "transfers.create").pop();
  assert.deepEqual([t[1].amount, t[1].destination, t[1].source_transaction], [3400, dest, undefined]);
  assert.equal((await get("sales/s2")).vendeurPaye, true);
});

// ── Demandes « à la Uber » ──────────────────────────────────────────────────
test("demande sans artisan : carte enregistrée → recherche ; refus → relancée ; débit → part virée à l'artisan", async () => {
  const dest = await onboard(tPro, "pro1");
  await db().doc("bookings/d1").set({
    id: "d1", clientId: "client1", participants: ["client1"], techPct: 85, montant: 130, demande: true,
    probleme: "ouverture", statut: "en_attente_paiement", createdAt: new Date().toISOString(),
  });
  assert.equal((await call("create-checkout", { type: "empreinte", ref: "d1" }, tClient)).status, 200);
  const params = stripe.calls.filter(x => x[0] === "checkout.sessions.create").pop()[1];
  assert.equal(params.payment_intent_data.transfer_data, undefined, "pas encore d'artisan : pas de partage au paiement");
  const sid = lastSessionId();
  stripe.completeSession(sid);
  await call("verify-session", { sessionId: sid });
  let d = await get("bookings/d1");
  assert.deepEqual([d.statut, d.empreinte.statut], ["recherche", "autorisée"]);
  // L'artisan accepte (écriture autorisée par les règles côté application), puis refuse : la demande repart
  await db().doc("bookings/d1").update({ statut: "assignée", artisanAccountId: "pro1", artisanId: "pro1", participants: ["client1", "pro1"] });
  const r = await call("cancel-hold", { bookingId: "d1", reason: "refus_pro" }, tPro);
  assert.equal(r.data.relancee, true);
  d = await get("bookings/d1");
  assert.deepEqual([d.statut, d.artisanAccountId, d.participants, d.empreinte.statut], ["recherche", undefined, ["client1"], "autorisée"]);
  assert.deepEqual(d.refusePar, ["pro1"]);
  // Un autre artisan accepte puis termine : débit + virement de sa part (85 %)
  await db().doc("bookings/d1").update({ statut: "terminée", artisanAccountId: "pro1", artisanId: "pro1", participants: ["client1", "pro1"], montantFinal: 100 });
  const c = await call("capture-payment", { bookingId: "d1" }, tPro);
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const t = stripe.calls.find(x => x[0] === "transfers.create");
  assert.deepEqual([t[1].amount, t[1].destination, !!t[1].source_transaction], [8500, dest, true]);
  d = await get("bookings/d1");
  assert.deepEqual([d.statutPaiement, d.proVerseAuto], ["payé", 85]);
  // Annulation gratuite tant que la demande est en recherche
  await db().doc("bookings/d2").set({ id: "d2", clientId: "client1", participants: ["client1"], techPct: 85, montant: 90, demande: true, statut: "recherche" });
  assert.equal((await call("cancel-hold", { bookingId: "d2", reason: "annulation_client" }, tClient)).status, 200);
  assert.equal((await get("bookings/d2")).statut, "annulée_client");
});

test("configuration de la plateforme", async () => {
  const r = await call("platform-config", {});
  assert.deepEqual(r.data, { stripe: true, mode: "test", server: true });
});

// ── Migration des anciens comptes ───────────────────────────────────────────
test("migration : ancien compte (mot de passe en clair) → même identifiant, données conservées", async () => {
  await db().doc("accounts/old1").set({ id: "old1", role: "client", nom: "Ancien", email: "Ancien@Test.fr ", pass: "monpass123" });
  await db().doc("bookings/ob1").set({ id: "ob1", clientId: "old1", artisanId: "a-legacy", statut: "terminée", montant: 80 });
  await db().doc("messages/om1").set({ id: "om1", bookingId: "ob1", texte: "Bonjour" });
  // Mauvais mot de passe
  assert.equal((await call("auth-migrate", { email: "ancien@test.fr", password: "faux" })).status, 401);
  const r = await call("auth-migrate", { email: "ancien@test.fr", password: "monpass123" });
  assert.deepEqual([r.status, r.data.migrated], [200, true]);
  // Connexion avec le même mot de passe et le même identifiant
  const token = await signIn("ancien@test.fr", "monpass123");
  assert.ok(token);
  const u = await adminAuth().getUserByEmail("ancien@test.fr");
  assert.equal(u.uid, "old1");
  const acc = await get("accounts/old1");
  assert.equal(acc.pass, undefined);
  assert.equal(acc.email, "ancien@test.fr");
  assert.ok(acc.migratedAt);
  // Ses anciennes données lui sont rattachées
  assert.deepEqual((await get("bookings/ob1")).participants, ["old1"]);
  assert.deepEqual((await get("messages/om1")).participants, ["old1"]);
  // Deuxième tentative : déjà migré
  assert.equal((await call("auth-migrate", { email: "ancien@test.fr", password: "monpass123" })).status, 404);
});

test("migration : artisan haché PBKDF2, mot de passe trop court, mot de passe par défaut", async () => {
  const salt = "abc123";
  const passHash = crypto.pbkdf2Sync("1234x", salt, 100000, 32, "sha256").toString("hex");
  await db().doc("accounts/oldpro").set({ id: "oldpro", role: "pro", nom: "Vieux Pro", email: "vieux@test.fr", salt, passHash, dossierStatus: "approved" });
  await db().doc("bookings/ob2").set({ id: "ob2", clientId: "client1", artisanId: "oldpro", statut: "terminée", montant: 80 });
  // Mot de passe de moins de 6 caractères : nouveau mot de passe exigé
  assert.equal((await call("auth-migrate", { email: "vieux@test.fr", password: "1234x" })).data.error, "new_password_required");
  const r = await call("auth-migrate", { email: "vieux@test.fr", password: "1234x", newPassword: "nouveau-mdp" });
  assert.equal(r.data.migrated, true);
  assert.ok(await signIn("vieux@test.fr", "nouveau-mdp"));
  const acc = await get("accounts/oldpro");
  assert.equal(acc.artisanId, "oldpro");
  const b = await get("bookings/ob2");
  assert.equal(b.artisanAccountId, "oldpro");
  assert.deepEqual(b.participants.sort(), ["client1", "oldpro"]);

  // Ancien administrateur avec le mot de passe par défaut : refusé
  await db().doc("accounts/adminOld").set({ id: "adminOld", role: "admin", nom: "Admin", email: "adm@test.fr", pass: "admin2024" });
  assert.equal((await call("auth-migrate", { email: "adm@test.fr", password: "admin2024" })).data.error, "default_password");
  // … mais « mot de passe oublié » crée le compte de connexion (e-mail envoyé ensuite)
  const reset = await call("auth-migrate", { email: "adm@test.fr", mode: "reset" });
  assert.equal(reset.status, 200);
  assert.equal((await adminAuth().getUser("adminOld")).email, "adm@test.fr");
  // Comptes de démonstration : jamais migrés
  await db().doc("accounts/p1").set({ id: "p1", role: "pro", email: "karim@demo.fr", pass: "1234x99" });
  assert.equal((await call("auth-migrate", { email: "karim@demo.fr", password: "1234x99" })).status, 404);
});

test("migration : trop de tentatives → blocage temporaire", async () => {
  await db().doc("accounts/old2").set({ id: "old2", role: "client", email: "brute@test.fr", pass: "secret-ok" });
  for (let i = 0; i < 8; i++) await call("auth-migrate", { email: "brute@test.fr", password: "x" + i });
  const r = await call("auth-migrate", { email: "brute@test.fr", password: "secret-ok" });
  assert.deepEqual([r.status, r.data.error], [429, "too_many"]);
});
