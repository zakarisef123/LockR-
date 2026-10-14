/* ─── MODÈLE ÉCONOMIQUE ET CALCULS DE PAIEMENT ───
   Module partagé entre l'application et les fonctions serveur (Netlify) :
   un montant n'est jamais calculé de deux façons différentes.

   • Intervention : l'artisan reçoit 85 %, LOCKR garde 15 % (LOCKR_COMMISSION).
   • Entreprise partenaire abonnée : 95 % / 5 % (PARTNER_COMMISSION).
   • Bon transmis par un professionnel : celui qui intervient reçoit la part
     fixée sur le bon (techPct), LOCKR garde 15 %, le reste revient au
     professionnel qui a transmis le bon (apporteur, posterPct).
   • Le taux est enregistré sur chaque mission à sa création ; les missions
     créées avant le passage à 15 % (sans taux enregistré) gardent leur taux
     d'origine : 40 % pour l'artisan.
   ⚠️ Si la commission change, mettre aussi à jour PCT_DEFAULT dans firestore.rules. */

export const LOCKR_COMMISSION = 0.15;
export const PRO_SHARE_DEFAULT = 0.85;   // = 1 − LOCKR_COMMISSION
export const PRO_SHARE_LEGACY = 0.40;    // missions antérieures au passage à 15 %
export const PARTNER_COMMISSION = 0.05;  // entreprises partenaires abonnées
export const MARKET_COMMISSION = 0.15;   // marketplace : commission LOCKR sur chaque vente
export const PCT_DEFAULT = Math.round(PRO_SHARE_DEFAULT * 100);

// Abonnement des entreprises partenaires (prépayé)
export const SUB_PRICES = { mensuel: 49.9, annuel: 499 };
export const SUB_DAYS = { mensuel: 30, annuel: 365 };

const round2 = x => Math.round((Number(x) || 0) * 100) / 100;

// Ordre : entreprise partenaire (95 %) > part enregistrée sur la mission > ancien taux (40 %)
export const proShareRate = b => (b?.partenaireId ? 1 - PARTNER_COMMISSION : b && Number(b.techPct) > 0 ? Number(b.techPct) / 100 : PRO_SHARE_LEGACY);
export const posterShareRate = b => (Number(b?.posterPct) > 0 ? Number(b.posterPct) / 100 : 0);
/* Part de l'apporteur pour un bon transmis : ce qui reste après la part de
   l'intervenant et la commission LOCKR (jamais négatif). */
export const posterPctFor = techPct => Math.max(0, PCT_DEFAULT - (Number(techPct) || 0));

export const bookingTotal = b => Number(b?.montantFinal ?? b?.montant ?? 0) || 0;
export const proShare = b => bookingTotal(b) * proShareRate(b);
export const posterShare = b => bookingTotal(b) * posterShareRate(b);
export const lockrShare = b => bookingTotal(b) - proShare(b) - posterShare(b);
export const posterOwed = b => (b?.posterPaid ? 0 : round2(posterShare(b)));
/* Part déjà virée automatiquement à l'artisan par Stripe Connect */
export const proAutoPaid = b => Number(b?.proVerseAuto) || 0;
export const proOwed = b => Math.max(0, round2(proShare(b) - proAutoPaid(b)));

/* Montants déjà réglés par le client : ancien acompte + paiements en ligne
   (débit de l'empreinte bancaire, lien de paiement…). */
export const acomptePaid = b => (b?.acompteClientPaye ? Number(b.acompte) || 0 : 0);
export const montantEncaisse = b => Number(b?.montantEncaisse) || 0;
export const resteAPayer = b => (b?.statutPaiement === "payé" ? 0 : Math.max(0, round2(bookingTotal(b) - acomptePaid(b) - montantEncaisse(b))));

/* Empreinte bancaire (montant réservé sur la carte, débité après l'intervention) */
export const empreinteActive = b => b?.empreinte?.statut === "autorisée";
export const empreinteMontant = b => (empreinteActive(b) ? Number(b.empreinte.montant) || 0 : 0);

/* Virement automatique Stripe Connect : uniquement au taux standard (la
   commission prélevée par Stripe est LOCKR_COMMISSION). Les autres cas
   (entreprise partenaire, bon à part négociée, apporteur, anciennes missions)
   sont versés par l'administration. */
export const isStandardRate = b => !posterShareRate(b) && !b?.partenaireId && Math.abs(proShareRate(b) - PRO_SHARE_DEFAULT) < 1e-9;
export const commissionCents = cents => Math.round(cents * LOCKR_COMMISSION);

/* Commission marketplace — même arrondi que firestore.rules */
export const marketCommission = prix => Math.round((Number(prix) || 0) * Math.round(MARKET_COMMISSION * 100)) / 100;

/* Participants d'une intervention : seules ces personnes y ont accès */
export function bookingParticipants(b) {
  const ids = [b.clientId, b.artisanAccountId, b.partenaireId, b.postedBy]
    .filter(x => x && x !== "ext" && x !== "platform");
  return [...new Set(ids)];
}
