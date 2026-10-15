// Fonction planifiée (une fois par jour, voir netlify.toml) : verse au vendeur
// les ventes marketplace payées depuis plus de 14 jours sans problème signalé.
import { adminReady } from "../lib/admin.mjs";
import { releaseDueSales } from "../lib/marketplace.mjs";

export const handler = async () => {
  if (!adminReady()) return { statusCode: 503, body: "not_configured" };
  try {
    const released = await releaseDueSales();
    console.log(`marketplace-auto-release: ${released} vente(s) versée(s)`);
    return { statusCode: 200, body: JSON.stringify({ released }) };
  } catch (err) {
    console.error("marketplace-auto-release:", err.message);
    return { statusCode: 500, body: "error" };
  }
};
