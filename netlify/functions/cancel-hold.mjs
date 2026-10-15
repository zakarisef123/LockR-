// Annulation d'une intervention et sort de l'empreinte bancaire :
//   annulation_client   — le client annule avant le départ de l'artisan :
//                         gratuit, la réservation est libérée
//   refus_pro           — l'artisan refuse la mission (elle est republiée)
//   admin               — décision de l'administration (libération seule)
//   annulation_tardive  — le client annule alors que l'artisan est en route
//   client_absent       — l'artisan est sur place depuis au moins 10 min et
//                         le client est absent
// Dans les deux derniers cas, le forfait de frais de déplacement (30 € par
// défaut, réglage admin) est débité de l'empreinte et partagé comme une
// intervention. Sans carte enregistrée, il reste dû (visible par l'admin).
import { preflight, json, parseBody, nowIso } from "../lib/http.mjs";
import { adminReady, db, requestUser, isAdmin } from "../lib/admin.mjs";
import { stripeReady, stripeClient } from "../lib/stripe.mjs";
import { captureFromHold, fraisDeplacement } from "../lib/payments.mjs";
import { CLIENT_ABSENT_WAIT_MIN } from "../../src/lib/business.js";

const FREE_STATES = ["en_attente_paiement", "assignée"];

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  if (!adminReady()) return json(503, { error: "payments_not_configured" });

  const user = await requestUser(event);
  if (!user?.account || user.account.banned) return json(401, { error: "auth_required" });

  const { bookingId, reason } = parseBody(event);
  const id = String(bookingId || "");
  const ref = db().doc(`bookings/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return json(404, { error: "not_found" });
  const b = snap.data();
  const isClient = b.clientId === user.uid;
  const isWorker = b.artisanAccountId === user.uid || b.partenaireId === user.uid;

  let patch;
  let withFee = false;
  if (reason === "annulation_client") {
    if (!isClient && !isAdmin(user)) return json(403, { error: "forbidden" });
    if (!FREE_STATES.includes(b.statut)) return json(409, { error: "too_late" });
    patch = { statut: "annulée_client", annuleeLe: nowIso() };
  } else if (reason === "refus_pro") {
    if (!isWorker) return json(403, { error: "forbidden" });
    if (!FREE_STATES.includes(b.statut)) return json(409, { error: "too_late" });
    patch = { statut: "annulée", annulationRaison: "refusée_pro", annuleeLe: nowIso() };
  } else if (reason === "annulation_tardive") {
    if (!isClient && !isAdmin(user)) return json(403, { error: "forbidden" });
    if (b.statut !== "en_route") return json(409, { error: "invalid_state" });
    patch = { statut: "annulée_client", annulationRaison: "annulation_tardive", annuleeLe: nowIso() };
    withFee = true;
  } else if (reason === "client_absent") {
    if (!isWorker && !isAdmin(user)) return json(403, { error: "forbidden" });
    if (b.statut !== "en_cours") return json(409, { error: "invalid_state" });
    const arrived = new Date(b.arriveAt || 0).getTime();
    if (!isAdmin(user) && (!arrived || Date.now() - arrived < CLIENT_ABSENT_WAIT_MIN * 60000)) return json(409, { error: "wait", minutes: CLIENT_ABSENT_WAIT_MIN });
    patch = { statut: "annulée", annulationRaison: "client_absent", annuleeLe: nowIso() };
    withFee = true;
  } else if (reason === "admin") {
    if (!isAdmin(user)) return json(403, { error: "forbidden" });
    patch = {};
  } else {
    return json(400, { error: "invalid_reason" });
  }

  const e = b.empreinte;
  const hold = e?.statut === "autorisée" && e.paymentIntentId;
  if (hold && !stripeReady()) return json(503, { error: "payments_not_configured" });

  try {
    const frais = withFee ? await fraisDeplacement() : 0;
    if (frais > 0) {
      // Le forfait devient le montant de l'intervention (partagé comme elle)
      Object.assign(patch, { fraisDeplacement: frais, montantFinal: frais });
      if (hold) {
        const r = await captureFromHold(id, b, frais * 100, patch, user.uid);
        return json(200, { ok: true, frais, captured: r.captured, du: Math.max(0, frais - r.captured) });
      }
      await ref.update(patch);
      return json(200, { ok: true, frais, captured: 0, du: frais });
    }
    if (hold) {
      const pi = await stripeClient().paymentIntents.retrieve(e.paymentIntentId);
      if (pi.status === "requires_capture") await stripeClient().paymentIntents.cancel(pi.id);
      patch.empreinte = { ...e, statut: "libérée", libereeLe: nowIso() };
    }
    if (Object.keys(patch).length) await ref.update(patch);
    return json(200, { ok: true, frais: 0 });
  } catch (err) {
    console.error("cancel-hold:", err.message);
    return json(500, { error: "stripe_error" });
  }
};
