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
   • Frais de déplacement : si le client annule alors que l'artisan est en
     route, ou s'il est absent à l'arrivée, un forfait (30 € par défaut,
     modifiable par l'admin) est débité de l'empreinte et partagé comme une
     intervention.
   ⚠️ Si la commission change, mettre aussi à jour PCT_DEFAULT dans firestore.rules. */

export const LOCKR_COMMISSION = 0.15;
export const PRO_SHARE_DEFAULT = 0.85;   // = 1 − LOCKR_COMMISSION
export const PRO_SHARE_LEGACY = 0.40;    // missions antérieures au passage à 15 %
export const PARTNER_COMMISSION = 0.05;  // entreprises partenaires abonnées
export const MARKET_COMMISSION = 0.15;   // marketplace : commission LOCKR sur chaque vente
export const PCT_DEFAULT = Math.round(PRO_SHARE_DEFAULT * 100);
/* Bon transmis : la part de l'apporteur est plafonnée à 50 % (l'intervenant
   garde au moins 35 %). ⚠️ Aussi dans firestore.rules (TECH_PCT_MIN). */
export const APPORTEUR_MAX_PCT = 50;
export const TECH_PCT_MIN = PCT_DEFAULT - APPORTEUR_MAX_PCT;

/* Frais de déplacement (annulation tardive, client absent) */
export const FRAIS_DEPLACEMENT_DEFAULT = 30;
export const FRAIS_DEPLACEMENT_MAX = 150;
export const CLIENT_ABSENT_WAIT_MIN = 10;   // attente minimale sur place avant « Client absent »
/* Montant en vigueur : réglage de l'admin (settings/tarifs), sinon 30 € */
export const fraisDeplacementFrom = tarifs => {
  const v = Number(tarifs?.fraisDeplacement);
  return Number.isFinite(v) && v >= 0 && v <= FRAIS_DEPLACEMENT_MAX ? v : FRAIS_DEPLACEMENT_DEFAULT;
};

/* ─── DEMANDES « À LA UBER » ───
   Le client commande au prix de la grille LOCKR ; la demande part aux
   artisans en ligne dans un rayon de 25 km ; le premier qui accepte la prend.
   Le prix est un prix de départ : sur place, l'artisan peut proposer un devis
   pour un travail plus important (le complément est réglé par lien). */
export const DEMANDE_RAYON_KM = 25;
export const DEMANDE_ACCEPT_S = 30;            // temps pour accepter une demande affichée
export const DEMANDE_PRIORITE_MS = 60 * 1000;  // avance des artisans prioritaires (réglage admin)
export const URGENCE_SUPPLEMENT = 40;
export const PRIX_BASE = { serrurier: 90, plombier: 90, electricien: 90, chauffagiste: 110, fermetures: 110 };
export const prixDemande = (metier, urgence) => (PRIX_BASE[metier] || 90) + (urgence ? URGENCE_SUPPLEMENT : 0);

/* Marketplace : l'argent est conservé jusqu'à la réception de l'article,
   puis versé au vendeur (85 %). Sans réponse de l'acheteur, versement
   automatique après MARKETPLACE_RELEASE_DAYS jours. */
export const MARKETPLACE_RELEASE_DAYS = 14;

// Abonnement des entreprises partenaires (prépayé)
export const SUB_PRICES = { mensuel: 49.9, annuel: 499 };
export const SUB_DAYS = { mensuel: 30, annuel: 365 };

const round2 = x => Math.round((Number(x) || 0) * 100) / 100;

/* Mission annulée avec frais de déplacement : le forfait revient en entier à
   celui qui s'est déplacé (85 %, ou 95 % pour une entreprise partenaire),
   jamais à un apporteur. */
export const isTravelFeeOnly = b => b?.statut !== "terminée" && Number(b?.fraisDeplacement) > 0;
// Ordre : entreprise partenaire (95 %) > frais de déplacement (85 %) > part enregistrée sur la mission > ancien taux (40 %)
export const proShareRate = b => (b?.partenaireId ? 1 - PARTNER_COMMISSION
  : isTravelFeeOnly(b) ? PRO_SHARE_DEFAULT
  : b && Number(b.techPct) > 0 ? Number(b.techPct) / 100 : PRO_SHARE_LEGACY);
export const posterShareRate = b => (!isTravelFeeOnly(b) && Number(b?.posterPct) > 0 ? Number(b.posterPct) / 100 : 0);
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
export const marketSellerNet = sale => round2((Number(sale?.prix) || 0) - (Number(sale?.commission) || marketCommission(sale?.prix)));

/* Intervention qui donne lieu à paiement : terminée, ou annulée avec frais
   de déplacement (le forfait devient le montant de l'intervention). */
export const isBillable = b => b?.statut === "terminée" || Number(b?.fraisDeplacement) > 0;

/* Participants d'une intervention : seules ces personnes y ont accès */
export function bookingParticipants(b) {
  const ids = [b.clientId, b.artisanAccountId, b.partenaireId, b.postedBy]
    .filter(x => x && x !== "ext" && x !== "platform");
  return [...new Set(ids)];
}
