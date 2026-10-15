// Tests des règles de sécurité Firestore (firestore.rules) avec l'émulateur.
// Lancement : npm run test:rules
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, writeBatch,
} from "firebase/firestore";

let env;
const ids = { client: "client1", client2: "client2", pro: "pro1", pro2: "pro2", pending: "pro3", partner: "part1", admin: "admin1" };
const email = id => `${id}@test.fr`;
const as = id => env.authenticatedContext(id, { email: email(id) }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-lockr-rules",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host, port: Number(port) },
  });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    const acc = (id, data) => setDoc(doc(db, "accounts", id), { id, email: email(id), nom: id, ...data });
    await acc(ids.client, { role: "client" });
    await acc(ids.client2, { role: "client" });
    await acc(ids.pro, { role: "pro", artisanId: ids.pro, dossierStatus: "approved" });
    await acc(ids.pro2, { role: "pro", artisanId: "a-legacy", dossierStatus: "approved" });
    await acc(ids.pending, { role: "pro", artisanId: ids.pending, dossierStatus: "pending" });
    await acc(ids.partner, { role: "partenaire", dossierStatus: "approved" });
    await acc(ids.admin, { role: "admin" });
    await setDoc(doc(db, "profiles", ids.pro), { id: ids.pro, artisanId: ids.pro, nom: "Pro", dossierStatus: "approved" });
    await setDoc(doc(db, "bookings", "b1"), { id: "b1", clientId: ids.client, artisanId: ids.pro, artisanAccountId: ids.pro, participants: [ids.client, ids.pro], techPct: 85, montant: 100, statut: "assignée" });
    await setDoc(doc(db, "bons", "bon1"), { id: "bon1", postedBy: "platform", clientId: ids.client2, techPct: 85, montantEstime: 120 });
    await setDoc(doc(db, "bons", "bon2"), { id: "bon2", postedBy: ids.pro2, techPct: 70, montantEstime: 200 });
    await setDoc(doc(db, "listings", "l1"), { id: "l1", proId: ids.pro2, prix: 95.5, titre: "Outil" });
    await setDoc(doc(db, "banned", "ban1"), { id: "ban1", email: "banni@test.fr" });
  });
});

const newClientBooking = over => ({
  id: "b2", clientId: ids.client, artisanId: ids.pro, artisanAccountId: ids.pro,
  participants: [ids.client, ids.pro], techPct: 85, montant: 120, statut: "en_attente_paiement", ...over,
});

// ── Comptes ────────────────────────────────────────────────────────────────
test("non connecté : aucun accès", async () => {
  await assertFails(getDoc(doc(anon(), "accounts", ids.client)));
  await assertFails(getDoc(doc(anon(), "bookings", "b1")));
  await assertFails(getDocs(collection(anon(), "profiles")));
});

test("inscription : client ou pro en attente seulement", async () => {
  const db = as("new1");
  await assertSucceeds(setDoc(doc(db, "accounts", "new1"), { id: "new1", email: email("new1"), role: "client", nom: "A" }));
  const db2 = as("new2");
  await assertFails(setDoc(doc(db2, "accounts", "new2"), { id: "new2", email: email("new2"), role: "admin" }));
  await assertFails(setDoc(doc(db2, "accounts", "new2"), { id: "new2", email: email("new2"), role: "pro", artisanId: "new2", dossierStatus: "approved" }));
  await assertFails(setDoc(doc(db2, "accounts", "new2"), { id: "new2", email: "autre@test.fr", role: "client" }));
  await assertFails(setDoc(doc(db2, "accounts", "new2"), { id: "new2", email: email("new2"), role: "client", subscription: { plan: "annuel" } }));
  await assertSucceeds(setDoc(doc(db2, "accounts", "new2"), { id: "new2", email: email("new2"), role: "pro", artisanId: "new2", dossierStatus: "pending" }));
  await assertFails(setDoc(doc(as("new3"), "accounts", "autre"), { id: "autre", email: email("new3"), role: "client" }));
});

test("compte : lecture du sien uniquement, champs sensibles protégés", async () => {
  const db = as(ids.client);
  await assertSucceeds(getDoc(doc(db, "accounts", ids.client)));
  await assertFails(getDoc(doc(db, "accounts", ids.pro)));
  await assertFails(getDocs(collection(db, "accounts")));
  await assertSucceeds(updateDoc(doc(db, "accounts", ids.client), { nom: "Nouveau nom", tel: "0600000000" }));
  await assertFails(updateDoc(doc(db, "accounts", ids.client), { role: "admin" }));
  await assertFails(updateDoc(doc(db, "accounts", ids.client), { subscription: { plan: "annuel" } }));
  await assertFails(updateDoc(doc(as(ids.pending), "accounts", ids.pending), { dossierStatus: "approved" }));
  await assertSucceeds(updateDoc(doc(as(ids.pending), "accounts", ids.pending), { dossierStatus: "pending", nom: "Pro en attente" }));
});

test("compte : « e-mail confirmé » seulement si Firebase Auth le confirme", async () => {
  await assertFails(updateDoc(doc(as(ids.pending), "accounts", ids.pending), { emailVerified: true }));
  const verified = env.authenticatedContext(ids.pending, { email: email(ids.pending), email_verified: true }).firestore();
  await assertFails(updateDoc(doc(verified, "accounts", ids.pending), { emailVerified: "oui" }));
  await assertSucceeds(updateDoc(doc(verified, "accounts", ids.pending), { emailVerified: true }));
  await assertFails(setDoc(doc(as("new4"), "accounts", "new4"), { id: "new4", email: email("new4"), role: "client", emailVerified: true }));
});

test("admin : lit et modifie tout", async () => {
  const db = as(ids.admin);
  await assertSucceeds(getDocs(collection(db, "accounts")));
  await assertSucceeds(updateDoc(doc(db, "accounts", ids.pending), { dossierStatus: "approved" }));
  await assertSucceeds(getDocs(collection(db, "bookings")));
});

// ── Profils publics ────────────────────────────────────────────────────────
test("profils : lisibles par les connectés, cohérents avec le compte", async () => {
  await assertSucceeds(getDocs(collection(as(ids.client), "profiles")));
  const pending = as(ids.pending);
  await assertFails(setDoc(doc(pending, "profiles", ids.pending), { id: ids.pending, artisanId: ids.pending, nom: "X", dossierStatus: "approved" }));
  await assertSucceeds(setDoc(doc(pending, "profiles", ids.pending), { id: ids.pending, artisanId: ids.pending, nom: "X", dossierStatus: "pending" }));
  await assertFails(setDoc(doc(pending, "profiles", ids.pending), { id: ids.pending, artisanId: ids.pending, nom: "X", dossierStatus: "pending", iban: "FR76..." }));
  await assertFails(setDoc(doc(as(ids.client), "profiles", ids.client), { id: ids.client, artisanId: ids.client, nom: "X" }));
  // Mise à jour par l'artisan : ses informations oui, sa validation / Stripe non
  await assertSucceeds(updateDoc(doc(pending, "profiles", ids.pending), { nom: "Nouveau nom", dispo: false }));
  await assertFails(updateDoc(doc(pending, "profiles", ids.pending), { dossierStatus: "approved" }));
  await assertFails(updateDoc(doc(as(ids.pro), "profiles", ids.pro), { stripeReady: true }));
  await assertSucceeds(updateDoc(doc(as(ids.admin), "profiles", ids.pending), { dossierStatus: "approved" }));
});

// ── Interventions ──────────────────────────────────────────────────────────
test("client : réserve un artisan validé au taux standard", async () => {
  const db = as(ids.client);
  await assertSucceeds(setDoc(doc(db, "bookings", "b2"), newClientBooking()));
  await assertFails(setDoc(doc(db, "bookings", "b3"), newClientBooking({ id: "b3", techPct: 95 })));
  await assertFails(setDoc(doc(db, "bookings", "b3"), newClientBooking({ id: "b3", statutPaiement: "payé" })));
  await assertFails(setDoc(doc(db, "bookings", "b3"), newClientBooking({ id: "b3", artisanAccountId: ids.pending, artisanId: ids.pending, participants: [ids.client, ids.pending] })));
  await assertFails(setDoc(doc(db, "bookings", "b3"), newClientBooking({ id: "b3", clientId: ids.client2 })));
});

test("interventions : chacun ne voit que les siennes", async () => {
  await assertSucceeds(getDocs(query(collection(as(ids.client), "bookings"), where("participants", "array-contains", ids.client))));
  await assertSucceeds(getDocs(query(collection(as(ids.pro), "bookings"), where("participants", "array-contains", ids.pro))));
  await assertFails(getDocs(collection(as(ids.client), "bookings")));
  await assertFails(getDoc(doc(as(ids.client2), "bookings", "b1")));
  await assertFails(getDocs(query(collection(as(ids.client2), "bookings"), where("participants", "array-contains", ids.client))));
});

test("interventions : paiements et montant protégés", async () => {
  const client = as(ids.client), pro = as(ids.pro);
  await assertFails(updateDoc(doc(client, "bookings", "b1"), { statutPaiement: "payé" }));
  await assertFails(updateDoc(doc(client, "bookings", "b1"), { montantFinal: 1 }));
  await assertFails(updateDoc(doc(client, "bookings", "b1"), { techPct: 99 }));
  await assertSucceeds(updateDoc(doc(client, "bookings", "b1"), { litige: { motif: "Retard", statut: "ouvert" } }));
  await assertSucceeds(updateDoc(doc(pro, "bookings", "b1"), { montantFinal: 140, statut: "terminée" }));
  await assertFails(updateDoc(doc(pro, "bookings", "b1"), { proPaid: true }));
  await assertFails(updateDoc(doc(pro, "bookings", "b1"), { participants: [ids.client, ids.pro, ids.pro2] }));
  await assertSucceeds(updateDoc(doc(as(ids.admin), "bookings", "b1"), { statutPaiement: "payé" }));
});

test("interventions : le client annule seulement avant le départ ; frais et encaissements protégés", async () => {
  const client = as(ids.client), pro = as(ids.pro);
  await assertFails(updateDoc(doc(client, "bookings", "b1"), { montantEncaisse: 100 }));
  await assertFails(updateDoc(doc(client, "bookings", "b1"), { fraisDeplacement: 0 }));
  await assertFails(updateDoc(doc(pro, "bookings", "b1"), { fraisDeplacement: 80 }));
  // Le client ne fait pas avancer la mission à la place de l'artisan
  await assertFails(updateDoc(doc(client, "bookings", "b1"), { statut: "terminée" }));
  await assertSucceeds(updateDoc(doc(pro, "bookings", "b1"), { statut: "en_route" }));
  // Artisan en route : annulation uniquement par le serveur (frais de déplacement)
  await assertFails(updateDoc(doc(client, "bookings", "b1"), { statut: "annulée_client" }));
  await assertSucceeds(updateDoc(doc(pro, "bookings", "b1"), { statut: "assignée" }));
  await assertSucceeds(updateDoc(doc(client, "bookings", "b1"), { statut: "annulée_client", annuleeLe: "2026-01-01" }));
});

// ── Bons ───────────────────────────────────────────────────────────────────
test("bons : un seul artisan peut prendre un bon (opération atomique)", async () => {
  const take = async (who, artisanId) => {
    const db = as(who);
    const batch = writeBatch(db);
    batch.set(doc(db, "bookings", "bon_bon1"), {
      id: "bon_bon1", bonId: "bon1", clientId: ids.client2, artisanId, artisanAccountId: who,
      participants: [who, ids.client2], techPct: 85, postedBy: "platform", montant: 120, statut: "assignée",
    });
    batch.delete(doc(db, "bons", "bon1"));
    return batch.commit();
  };
  await assertSucceeds(take(ids.pro, ids.pro));
  await assertFails(take(ids.pro2, "a-legacy"));
});

test("bons : la part de l'apporteur est imposée", async () => {
  const db = as(ids.pro);
  const mk = posterPct => {
    const batch = writeBatch(db);
    batch.set(doc(db, "bookings", "bon_bon2"), {
      id: "bon_bon2", bonId: "bon2", clientId: "ext", artisanId: ids.pro, artisanAccountId: ids.pro,
      participants: [ids.pro, ids.pro2], techPct: 70, posterPct, postedBy: ids.pro2, montant: 200, statut: "assignée",
    });
    batch.delete(doc(db, "bons", "bon2"));
    return batch.commit();
  };
  await assertFails(mk(0));
  await assertSucceeds(mk(15));
});

test("bons : visibilité et création", async () => {
  await assertSucceeds(getDocs(collection(as(ids.pro), "bons")));
  await assertFails(getDocs(collection(as(ids.pending), "bons")));
  await assertFails(getDocs(collection(as(ids.client), "bons")));
  await assertSucceeds(getDocs(query(collection(as(ids.client2), "bons"), where("clientId", "==", ids.client2))));
  const c = as(ids.client);
  await assertSucceeds(setDoc(doc(c, "bons", "bon3"), { id: "bon3", clientId: ids.client, postedBy: "platform", techPct: 85 }));
  await assertFails(setDoc(doc(c, "bons", "bon4"), { id: "bon4", clientId: ids.client, postedBy: "platform", techPct: 95 }));
  await assertFails(setDoc(doc(as(ids.pro), "bons", "bon5"), { id: "bon5", postedBy: ids.pro, techPct: 90 }));
  // Part de l'apporteur plafonnée à 50 % : l'intervenant garde au moins 35 %
  await assertFails(setDoc(doc(as(ids.pro), "bons", "bon5"), { id: "bon5", postedBy: ids.pro, techPct: 30 }));
  await assertSucceeds(setDoc(doc(as(ids.pro), "bons", "bon8"), { id: "bon8", postedBy: ids.pro, techPct: 35 }));
  await assertSucceeds(setDoc(doc(as(ids.pro), "bons", "bon5"), { id: "bon5", postedBy: ids.pro, techPct: 70 }));
  // Republication après refus : seulement par l'artisan de la mission
  await assertSucceeds(setDoc(doc(as(ids.pro), "bons", "bon6"), { id: "bon6", postedBy: "platform", clientId: ids.client, techPct: 85, fromBookingId: "b1" }));
  await assertFails(setDoc(doc(as(ids.pro2), "bons", "bon7"), { id: "bon7", postedBy: "platform", clientId: ids.client, techPct: 85, fromBookingId: "b1" }));
  await assertFails(deleteDoc(doc(as(ids.pro2), "bons", "bon1")));
});

// ── Messages ───────────────────────────────────────────────────────────────
test("messages : réservés aux participants de l'intervention", async () => {
  const m = { id: "m1", bookingId: "b1", participants: [ids.client, ids.pro], auteurId: ids.client, texte: "Bonjour" };
  await assertSucceeds(setDoc(doc(as(ids.client), "messages", "m1"), m));
  await assertFails(setDoc(doc(as(ids.client2), "messages", "m2"), { ...m, id: "m2", auteurId: ids.client2, participants: [ids.client2] }));
  await assertSucceeds(getDocs(query(collection(as(ids.pro), "messages"), where("participants", "array-contains", ids.pro))));
  await assertFails(getDoc(doc(as(ids.client2), "messages", "m1")));
});

// ── Marketplace ────────────────────────────────────────────────────────────
test("marketplace : achat au prix de l'annonce, commission exacte", async () => {
  const db = as(ids.pro);
  const sale = over => ({ id: "s1", listingId: "l1", acheteurId: ids.pro, vendeurId: ids.pro2, participants: [ids.pro, ids.pro2], prix: 95.5, commission: 14.33, statut: "en_attente_paiement", ...over });
  await assertFails(setDoc(doc(db, "sales", "s1"), sale({ prix: 1, commission: 0.15 })));
  await assertFails(setDoc(doc(db, "sales", "s1"), sale({ statut: "payée" })));
  await assertSucceeds(setDoc(doc(db, "sales", "s1"), sale()));
  await assertFails(updateDoc(doc(db, "sales", "s1"), { statut: "payée" }));
  await assertFails(getDocs(collection(as(ids.client), "listings")));
  // Offre d'achat : seul le champ « offers » est modifiable par un autre professionnel
  await assertSucceeds(updateDoc(doc(db, "listings", "l1"), { offers: [{ id: "o1", buyerId: ids.pro, prix: 80 }] }));
  await assertFails(updateDoc(doc(db, "listings", "l1"), { prix: 1 }));
  await assertSucceeds(updateDoc(doc(as(ids.pro2), "listings", "l1"), { prix: 80 }));
});

// ── Divers ─────────────────────────────────────────────────────────────────
test("bannissement : chacun peut vérifier sa propre adresse seulement", async () => {
  const banni = env.authenticatedContext("x", { email: "banni@test.fr" }).firestore();
  await assertSucceeds(getDocs(query(collection(banni, "banned"), where("email", "==", "banni@test.fr"))));
  await assertFails(getDocs(collection(as(ids.client), "banned")));
});

test("techniciens et factures", async () => {
  await assertSucceeds(setDoc(doc(as(ids.partner), "techs", "t1"), { id: "t1", partenaireId: ids.partner, nom: "Tech" }));
  await assertFails(setDoc(doc(as(ids.pro), "techs", "t2"), { id: "t2", partenaireId: ids.pro }));
  await assertSucceeds(getDocs(query(collection(as(ids.partner), "techs"), where("partenaireId", "==", ids.partner))));
  await assertFails(getDocs(collection(as(ids.partner), "factures")));
  await assertSucceeds(getDocs(collection(as(ids.admin), "factures")));
});

test("compte banni : plus aucune écriture", async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), "accounts", ids.client), { banned: true }));
  await assertFails(updateDoc(doc(as(ids.client), "bookings", "b1"), { note: "x" }));
  await assertFails(updateDoc(doc(as(ids.client), "accounts", ids.client), { banned: false }));
});
