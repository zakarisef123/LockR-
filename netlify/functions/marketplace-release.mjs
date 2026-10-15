// Marketplace — après le paiement, l'argent attend la réception de l'article :
//   recu        — l'acheteur confirme la réception : 85 % sont virés au vendeur
//   probleme    — l'acheteur signale un problème : le versement est bloqué
//   liberer     — admin : verse au vendeur (ou retente un virement échoué)
//   rembourser  — admin : rembourse l'acheteur
// Le versement automatique après 14 jours est fait par marketplace-auto-release.
import { preflight, json, parseBody, nowIso } from "../lib/http.mjs";
import { adminReady, db, requestUser, isAdmin } from "../lib/admin.mjs";
import { stripeReady } from "../lib/stripe.mjs";
import { releaseSale, refundSale } from "../lib/marketplace.mjs";

export const handler = async (event) => {
  const stop = preflight(event);
  if (stop) return stop;
  if (!adminReady()) return json(503, { error: "payments_not_configured" });

  const user = await requestUser(event);
  if (!user?.account || user.account.banned) return json(401, { error: "auth_required" });

  const { saleId, action, motif } = parseBody(event);
  const id = String(saleId || "");
  const ref = db().doc(`sales/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return json(404, { error: "not_found" });
  const sale = snap.data();
  const buyer = sale.acheteurId === user.uid;

  try {
    if (action === "recu") {
      if (!buyer) return json(403, { error: "forbidden" });
      const r = await releaseSale(id, "recu", user.uid);
      return json(r.error ? 409 : 200, r);
    }
    if (action === "probleme") {
      if (!buyer) return json(403, { error: "forbidden" });
      if (sale.statut !== "payée") return json(409, { error: "invalid_state" });
      const texte = String(motif || "").trim().slice(0, 1000);
      if (texte.length < 5) return json(400, { error: "motif_required" });
      await ref.update({ statut: "litige", litige: { motif: texte, ouvertLe: nowIso(), par: user.uid } });
      return json(200, { ok: true });
    }
    if (action === "liberer" || action === "rembourser") {
      if (!isAdmin(user)) return json(403, { error: "forbidden" });
      if (action === "rembourser" && !stripeReady()) return json(503, { error: "payments_not_configured" });
      const r = action === "liberer" ? await releaseSale(id, "admin", user.uid) : await refundSale(id, user.uid);
      return json(r.error ? 409 : 200, r);
    }
    return json(400, { error: "invalid_action" });
  } catch (err) {
    console.error("marketplace-release:", err.message);
    return json(500, { error: "server_error" });
  }
};
