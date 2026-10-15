// Outils HTTP communs aux fonctions Netlify.

export const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

// Préflight CORS et méthode. Renvoie une réponse si la requête s'arrête là.
export function preflight(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  return null;
}

export function parseBody(event) {
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body;
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

// Adresse publique du site : variable URL fournie par Netlify, sinon origine de la requête
export function siteOrigin(event) {
  const fromHeader = event.headers?.origin || "";
  return (process.env.URL || fromHeader || "https://lockr.fr").replace(/\/$/, "");
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const nowIso = () => new Date().toISOString();
export const round2 = x => Math.round((Number(x) || 0) * 100) / 100;
