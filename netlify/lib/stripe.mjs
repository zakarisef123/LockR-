// Utilitaires communs aux fonctions serverless Netlify (Stripe).
import Stripe from "stripe";

export const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

// Préflight CORS / méthode / configuration Stripe. Renvoie une réponse si la
// requête doit s'arrêter là, sinon null.
export function guard(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  if (!process.env.STRIPE_SECRET_KEY) return json(503, { error: "payments_not_configured" });
  return null;
}

export const stripeClient = () => new Stripe(process.env.STRIPE_SECRET_KEY);

// Adresse publique du site : variable URL fournie par Netlify, sinon origine de la requête
export function siteOrigin(event) {
  const fromHeader = event.headers?.origin || "";
  return (process.env.URL || fromHeader || "https://lockr.fr").replace(/\/$/, "");
}

export function parseBody(event) {
  try { return JSON.parse(event.body || "{}"); } catch { return {}; }
}
