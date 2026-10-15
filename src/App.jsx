import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSyncedState, useSyncStatus, clearSyncError, cleanForFirestore, resetDemoData, runBatch } from "./lib/sync.js";
import { IS_DEMO } from "./lib/config.js";
import {
  live, onAuthChange, signIn, signUp, cancelSignUp, createAccountDoc, isEmailBanned, signOutUser,
  resetPassword, sendVerification, refreshEmailVerified, changePassword, confirmPassword, deleteOwnAccount, currentUser,
} from "./lib/backend.js";
import {
  LOCKR_COMMISSION, PARTNER_COMMISSION, MARKET_COMMISSION, PCT_DEFAULT, SUB_PRICES,
  proShareRate, posterPctFor, bookingTotal, proShare, posterShare, lockrShare,
  posterOwed, proAutoPaid, proOwed, acomptePaid, resteAPayer, marketCommission,
  bookingParticipants, empreinteActive, empreinteMontant, montantEncaisse,
  TECH_PCT_MIN, APPORTEUR_MAX_PCT, CLIENT_ABSENT_WAIT_MIN, fraisDeplacementFrom, isBillable,
  FRAIS_DEPLACEMENT_DEFAULT,
  MARKETPLACE_RELEASE_DAYS, marketSellerNet,
} from "./lib/business.js";
import { compressImage, readImageInput } from "./lib/images.js";
import { randomId, passwordFields, checkPassword, normEmail, readSessionId, writeSessionId } from "./lib/auth.js";
import { startStripeCheckout, createCheckout, verifyCheckout, startConnectOnboarding, refreshConnectStatus, captureHold, releaseHold, getPlatformConfig, marketplaceAction } from "./lib/payments.js";

/* ─── PROTECTION CODE SOURCE ───
   Clic droit et raccourcis DevTools bloqués sur ordinateur. La copie de texte
   reste autorisée : les pros doivent pouvoir copier une adresse, un e-mail,
   un lien de paiement… (le blocage de la copie gênait l'utilisation). */
(function protect() {
  if (typeof window === "undefined") return;
  document.addEventListener("contextmenu", e => {
    const t = e.target;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.closest?.("a")) return;
    e.preventDefault();
  }, true);
  document.addEventListener("keydown", e => {
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && ["I","i","J","j","C","c"].includes(e.key)) ||
      (e.ctrlKey && ["U","u"].includes(e.key)) ||
      (e.metaKey && e.altKey && ["I","i","J","j","C","c"].includes(e.key))
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
})();

const uid = () => randomId(10);
const fmt = n => `${Math.round(Number(n) || 0)} €`;
const fmtFrom = (n, lang = "fr") => lang === "en" ? `From ${Math.round(Number(n) || 0)} €` : `À partir de ${Math.round(Number(n) || 0)} €`;
const fmtTime = d => d ? new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const ts = () => new Date().toISOString();
const initial = s => (String(s || "").trim().charAt(0) || "?").toUpperCase();
const firstName = s => String(s || "").trim().split(" ")[0] || "";

/* Modèle économique (commissions, reste à payer…) : src/lib/business.js,
   partagé avec les fonctions serveur. */

/* Identité de la société (factures, devis). ⚠️ À COMPLÉTER avec les
   informations officielles (Kbis) avant toute émission de facture réelle. */
const COMPANY = {
  nom: "LOCKR SAS",
  adresse: "Adresse du siège à compléter",
  siret: "SIRET à compléter",
  tva: "N° TVA intracommunautaire à compléter",
  email: "contact@lockr.fr",
};
/* Micro-entrepreneur — artisans (prestations de services artisanales, BIC).
   Barème 2026 (Urssaf / impots.gouv.fr) : à vérifier chaque 1er janvier. */
const AE = {
  cotisations: 0.212,         // cotisations sociales
  formation: 0.003,           // contribution à la formation professionnelle (artisans)
  versementLiberatoire: 0.017, // option impôt sur le revenu prélevé avec les cotisations
  seuilTva: 37500,            // franchise en base de TVA : seuil (CA de l'année précédente)
  seuilTvaMajore: 41250,      // dépassé en cours d'année → TVA due dès le jour du dépassement
  plafondMicro: 83600,        // plafond de CA du régime micro (2026-2028)
};
const URGENCE_SUPPLEMENT = 40;    // majoration affichée pour une urgence
/* État de l'empreinte bancaire d'une intervention, en clair */
const EMPREINTE_TXT = (b, lang = "fr") => {
  const fr = lang !== "en";
  const e = b?.empreinte;
  if (!e) return "";
  if (e.statut === "autorisée") return fr ? `💳 ${fmt(e.montant)} réservés sur la carte — débités après l'intervention` : `💳 ${fmt(e.montant)} held on the card — charged after the intervention`;
  if (e.statut === "débitée") return fr ? `💳 Carte débitée de ${fmt(e.debite)} ✓` : `💳 Card charged ${fmt(e.debite)} ✓`;
  if (e.statut === "libérée") return fr ? "💳 Réservation sur la carte libérée" : "💳 Card hold released";
  if (e.statut === "expirée") return fr ? "💳 Réservation expirée — paiement par lien" : "💳 Hold expired — payment by link";
  return "";
};
const pctLabel = b => `${Math.round(proShareRate(b) * 100)} %`;
/* Frais de déplacement facturés à la place de l'intervention */
const FRAIS_TXT = (b, lang = "fr") => {
  const fr = lang !== "en";
  if (!(Number(b?.fraisDeplacement) > 0)) return "";
  const why = b.annulationRaison === "client_absent" ? (fr ? "client absent" : "client absent") : (fr ? "annulation tardive" : "late cancellation");
  return fr ? `🚗 Frais de déplacement (${why}) : ${fmt(b.fraisDeplacement)}` : `🚗 Travel fee (${why}): ${fmt(b.fraisDeplacement)}`;
};

/* « Client absent » : l'artisan est sur place depuis au moins 10 minutes.
   Le forfait de déplacement est débité de l'empreinte (sinon il reste dû).
   Renvoie { ok, msg } ou null si l'artisan renonce. */
async function declareClientAbsent(b, { setBookings, setters, fraisDep = FRAIS_DEPLACEMENT_DEFAULT, lang = "fr" }) {
  const fr = lang !== "en";
  const waited = b.arriveAt ? (Date.now() - new Date(b.arriveAt).getTime()) / 60000 : Infinity;
  if (waited < CLIENT_ABSENT_WAIT_MIN) {
    const left = Math.max(1, Math.ceil(CLIENT_ABSENT_WAIT_MIN - waited));
    return { ok: false, msg: fr ? `Patientez encore ${left} min sur place (et essayez d'appeler le client) avant de le déclarer absent.` : `Please wait ${left} more min on site (and try calling the client) before declaring them absent.` };
  }
  const feeTxt = fraisDep > 0 ? (fr ? ` Des frais de déplacement de ${fmt(fraisDep)} seront facturés au client.` : ` A ${fmt(fraisDep)} travel fee will be charged to the client.`) : "";
  if (!window.confirm((fr ? "Déclarer le client absent ? La mission sera annulée." : "Declare the client absent? The job will be cancelled.") + feeTxt)) return null;
  if (live) {
    const r = await releaseHold(b.id, "client_absent");
    if (!r.ok) return { ok: false, msg: r.error === "wait" ? (fr ? `Attendez ${CLIENT_ABSENT_WAIT_MIN} minutes sur place avant de déclarer le client absent.` : `Wait ${CLIENT_ABSENT_WAIT_MIN} minutes on site first.`) : (fr ? "Impossible pour le moment, réessayez dans un instant." : "Not possible right now, please retry in a moment.") };
    if (!(r.frais > 0)) return { ok: true, msg: fr ? "Mission annulée (client absent)." : "Job cancelled (client absent)." };
    return { ok: true, msg: r.captured > 0
      ? (fr ? `Mission annulée — ${fmt(r.captured)} de frais de déplacement débités sur la carte du client.` : `Job cancelled — ${fmt(r.captured)} travel fee charged to the client's card.`)
      : (fr ? `Mission annulée — ${fmt(r.frais)} de frais de déplacement à régler par le client (suivi par LOCKR).` : `Job cancelled — ${fmt(r.frais)} travel fee owed by the client (handled by LOCKR).`) };
  }
  // Démonstration : même résultat, en local
  setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "annulée", annulationRaison: "client_absent", annuleeLe: ts(), ...(fraisDep > 0 ? { fraisDeplacement: fraisDep, montantFinal: fraisDep } : {}) } : x));
  if (empreinteActive(b)) {
    if (fraisDep > 0) applyPayment(setters || { setBookings }, { type: "capture", ref: b.id, amount: Math.min(fraisDep, empreinteMontant(b)), demo: true });
    else applyPayment(setters || { setBookings }, { type: "liberation", ref: b.id, demo: true });
  }
  return { ok: true, msg: fraisDep > 0 ? (fr ? `Mission annulée — ${fmt(fraisDep)} de frais de déplacement facturés au client.` : `Job cancelled — ${fmt(fraisDep)} travel fee charged to the client.`) : (fr ? "Mission annulée (client absent)." : "Job cancelled (client absent).") };
}

/* Données de démonstration : visibles uniquement par les comptes de démo
   (jamais par les vrais clients / artisans). */
const DEMO_RECORD_IDS = new Set(["b0","b1","b2","b3","b4","b5","pb1","pb2","pb3","bon1","bon2","bon3","bon4","bon5","bon6","bon7","l1","l2","l3","l4","l5","s1","s2","s3","m1","m2","m3"]);
// Identifiants des comptes d'exemple des premières versions (présents dans la
// base de production). Les comptes admin / équipe interne n'en font pas partie :
// en production, ce sont de vrais comptes.
const DEMO_ACCOUNT_IDS = new Set(["c1","c2","p1","p2","p3","p4","p5","p6","p7","p8","part1","part2"]);
const isDemoRecord = r => !!r && (r.isDemo === true || DEMO_RECORD_IDS.has(r.id));
const isDemoAccount = a => !!a && (a.isDemo === true || DEMO_ACCOUNT_IDS.has(a.id));
/* Un compte réel ne voit que les données réelles ; un compte de démo voit tout. */
// Version de démonstration : tout est visible. Production : les données de
// démo éventuellement restantes ne sont jamais montrées aux vrais comptes.
const visibleFor = (account, list) => (IS_DEMO || isDemoAccount(account) ? list : list.filter(r => !isDemoRecord(r)));

function useWindowSize() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}
const BP = 768; // breakpoint desktop

/* ─── TRANSLATIONS ─── */
const TRANS = {
  fr: {
    appTagline: "L'artisan arrive. Vous restez serein.",
    login: "Connexion", register: "Inscription", logout: "Déconnexion",
    email: "Adresse email", password: "Mot de passe", confirmPassword: "Confirmer le mot de passe",
    firstname: "Prénom", lastname: "Nom", phone: "Téléphone", city: "Ville / Région",
    individual: "Particulier", craftsman: "Artisan pro",
    findCraftsman: "Trouver un artisan", myMissions: "Mes missions",
    createAccount: "Créer un compte", freeAccount: "Créer un compte gratuit",
    alreadyMember: "Déjà inscrit ?", notMember: "Pas encore de compte ?",
    connectAs: "Se connecter", forgotPass: "Mot de passe oublié ?",
    minChars: "8 caractères minimum", passMismatch: "Les mots de passe ne correspondent pas",
    invalidEmail: "Email invalide", emailUsed: "Email déjà utilisé",
    invalidPhone: "Numéro de téléphone invalide", firstnameRequired: "Prénom requis", lastnameRequired: "Nom requis",
    emailSent: "Email envoyé !", checkInbox: "Consultez votre boîte mail",
    enterCode: "Saisissez le code reçu par email :", verifyCode: "Vérifier le code",
    wrongCode: "Code incorrect, réessayez.", accountVerified: "Compte vérifié !",
    welcome: "Bienvenue,", accessApp: "Accéder à l'application",
    generatingEmail: "Génération de l'email…", verifying: "Vérification du code…",
    codeNotInApp: "Le code a été envoyé par email. Il n'apparaît pas dans l'application.",
    cancel: "Annuler", back: "Retour", confirm: "Confirmer",
    available: "Disponible", unavailable: "Indisponible",
    urgent: "URGENT", reviews: "avis", verified: "Pro vérifié",
    newRequest: "Nouvelle demande", interventionType: "Type d'intervention",
    availableCraftsmen: "Artisans disponibles", noAvailable: "(aucun pour l'instant)",
    book: "Réserver", liveTracking: "Suivi en direct",
    onRoute: "En route", arrived: "Artisan arrivé", openDoor: "Ouvrez la porte",
    artisanArriving: "Votre artisan arrive",
    payInvoice: "Payer la facture", callArtisan: "Appeler",
    transport: "Moyen de transport", car: "Voiture", scooter: "Scooter",
    motorcycle: "Moto", bicycle: "Vélo", onFoot: "À pied",
    missions: "Missions", inProgress: "En cours", bonuses: "Bons", chat: "Chat",
    stats: "Stats", history: "Historique",
    // Auto-entreprise & facturation électronique
    autoTab: "Auto-Entreprise", factuTab: "Factu. Électronique",
    aeTitle: "Gestion Auto-Entrepreneur", aeCaTitle: "Chiffre d'affaires",
    aeCaMois: "CA ce mois", aeCaAn: "CA annuel", aeSeuilMois: "Seuil mensuel", aeSeuilAn: "Seuil annuel",
    aeCotisations: "Cotisations URSSAF", aeCotisRate: "Cotisations sociales (21,2 %)",
    aeCotisCalc: "Cotisations estimées", aeCotisAlert: "Pensez à déclarer avant le",
    aeSeuilAlert: "Attention : seuil de franchise TVA bientôt atteint", aeSeuilOk: "Sous le seuil TVA",
    aeCharges: "Charges sociales estimées", aeDeclaration: "Déclaration URSSAF",
    aeDeclare: "Déclarer ce mois", aeDeclareTitle: "Déclarer le CA du mois",
    aeCaSaisie: "CA à déclarer (€)", aeConfirmDecl: "Confirmer la déclaration", aeDeclDone: "Déclaration enregistrée",
    aeFrais: "Frais professionnels", aeAddFrais: "Ajouter un frais",
    aeFraisLabel: "Libellé", aeFraisMontant: "Montant (€)", aeFraisDate: "Date", aeFraisCat: "Catégorie",
    aeFraisCats: "Carburant,Outillage,Formation,Fournitures,Déplacement,Téléphone,Assurance,Autre",
    aeRecap: "Récapitulatif fiscal", aeNetEstime: "Revenu net estimé",
    aeTvaFranchise: "Franchise en base de TVA", aeRegimeMicro: "Régime micro-entrepreneur",
    aeFormation: "CFP (contribution formation)", aeFormationRate: "0,30% du CA",
    aeCFE: "CFE (cotisation foncière des entreprises)", aeRappelCFE: "Exigible en décembre",
    aeMemo: "Mémo fiscal", aeMemoPlaceholder: "Notes, rappels, échéances…",
    // Facturation électronique
    feTitle: "Facturation Électronique — Réforme 2026", feIntro: "La loi de finances 2024 impose la facturation électronique obligatoire entre professionnels (B2B) en France. Calendrier progressif à partir de septembre 2026.",
    feCalendar: "Calendrier d'application", feCalendarItems: "Sept. 2026 — Réception obligatoire (toutes entreprises)|Jan. 2027 — Emission obligatoire PME/ETI|Jan. 2027 — Emission obligatoire TPE/micro-entrepreneurs",
    fePDP: "Plateforme de Dématérialisation Partenaire (PDP)", fePDPDesc: "Vous devez choisir une PDP agréée par la DGFiP ou utiliser le portail public Chorus Pro pour émettre et recevoir vos factures électroniques.",
    fePDPList: "Chorus Pro (portail public gratuit)|Pennylane|Sellsy|Sage|Cegid|QuickBooks|Indy (auto-entrepreneurs)|Tiime|Axonaut",
    feMentions: "Mentions obligatoires sur facture électronique", feMentionsList: "Numéro SIREN/SIRET|Numéro de TVA intracommunautaire (si applicable)|Numéro de facture (séquence chronologique)|Date d'émission|Date de prestation|Désignation précise de la prestation|Montant HT, TVA, TTC|Délai de paiement et pénalités de retard|Mention TVA non applicable (franchise) si applicable|Coordonnées complètes émetteur et destinataire",
    feFormats: "Formats acceptés", feFormatsList: "Factur-X (PDF enrichi XML)|UBL 2.1|CII (Cross Industry Invoice)",
    feStatus: "Votre statut", feStatusAE: "Micro-entrepreneur : émission obligatoire en janvier 2027 — réception dès septembre 2026",
    feChecklist: "Checklist mise en conformité", feCheckItems: "Choisir une PDP ou ouvrir un compte Chorus Pro|Mettre à jour votre logiciel de facturation|Vérifier les mentions obligatoires sur vos modèles|Activer la réception électronique avant sept. 2026|Informer vos clients professionnels|Archiver vos factures électroniques 10 ans",
    feArchive: "Archivage légal", feArchiveDesc: "Les factures électroniques doivent être conservées 10 ans dans un format garantissant leur intégrité (non modifiable). Utilisez un SAE (Système d'Archivage Électronique) agréé.",
    feLcti: "Loi LCTI & mentions légales", feLctiDesc: "Depuis 2020, le médiateur de la consommation doit être mentionné sur vos factures et devis. Sanction : amende jusqu'à 15 000 €.",
    feReady: "Je suis prêt pour la réforme 2026", feNotReady: "Mise en conformité à faire",
    feMyChorPro: "Mon numéro Chorus Pro / PDP", feChorusPlaceholder: "Entrez votre référence PDP…",
    noMissionPending: "Aucune mission en attente", noMissionActive: "Aucune mission active",
    start: "Démarrer", refuse: "Refuser", viewMission: "Voir la mission en cours",
    earnings: "Mes revenus", thisMonth: "Ce mois",
    closeMission: "Clôturer la mission", invoicePhoto: "Photo de la facture *",
    photographOrSelect: "Photographier ou sélectionner",
    totalAmount: "Montant total de la facture *", paymentStatus: "Statut du paiement *",
    paid: "Payé", pending: "En attente", summary: "Récapitulatif",
    yourShare: "Votre part", lockrShare: "LOCKR",
    confirmPaid: "Confirmer — Facture payée", confirmPending: "Confirmer — Paiement en attente",
    edit: "Modifier", next: "Continuer",
    regionalChat: "Chat Pros", chatSubtitle: "Échangez avec les pros de votre région",
    noMessage: "Aucun message. Soyez le premier à écrire !",
    yourMessage: "Votre message…", send: "Envoyer",
    availableBonuses: "Bons disponibles", region: "Région", post: "Poster",
    noBonusRegion: "Aucun bon disponible dans votre région",
    yourSharePct: "Votre part", acceptBonus: "Accepter ce bon",
    postBonus: "Poster un bon", publishBonus: "Publier le bon",
    title: "Titre", clientAddress: "Adresse client", interventionTypeLabel: "Type d'intervention",
    estimatedAmount: "Montant estimé (€)", technicianShare: "Part du technicien",
    urgentIntervention: "Intervention urgente",
    helloUser: "Bonjour,", whatNeed: "De quoi avez-vous besoin ?",
    quickInterventions: "Interventions rapides", myInterventions: "Mes interventions",
    gpsActive: "GPS actif", artisanOnRoute: "Artisan en route",
    followLive: "Suivre en direct", min: "min",
    dashboard: "Dashboard", adminBonuses: "Bons", craftsmen: "Artisans", allMissions: "Missions",
    adminSurveillance: "Surveillance", surveillanceDesc: "Enregistrements des interventions — confidentiel admin", surveillanceEmpty: "Aucun enregistrement pour l'instant", surveillanceFlagged: "Signalé", surveillanceFlaggedAlert: "enregistrement(s) signalé(s) pour propos inappropriés", surveillanceDetectedTerms: "Termes détectés", surveillanceAudio: "Enregistrement audio", surveillanceTranscript: "Transcription écrite", surveillanceBanPro: "Bannir cet artisan", surveillanceBanReason: "Propos inappropriés détectés (surveillance)",
    revenue: "Chiffre d'affaires", platformRevenue: "Revenu plateforme",
    totalMissions: "Missions totales", prosRegistered: "Pros inscrits",
    platformRevenue6m: "Revenus plateforme (6 mois)", lockrBonuses: "Bons LOCKR",
    newBonus: "Nouveau", publishBonus2: "Publier ce bon", deleteBonus: "Supprimer",
    registeredCraftsmen: "Artisans inscrits", demoAccount: "Compte démo",
    allMissionsLabel: "Toutes les missions", techShare: "Part artisan",
    newLockrBonus: "Nouveau bon LOCKR", artisanShare: "Part artisan",
    certifRge: "RGE Certifié", qualibat: "Qualibat", proCertif: "Pro Certifié",
    artisanAgree: "Artisan Agréé", proLockr: "Pro LOCKR",
    paymentEncrypted: "Paiement chiffré SSL 256-bit",
    cardNumber: "Numéro de carte", cardHolder: "Titulaire", expiry: "Expiration", cvv: "CVV",
    pay: "Payer", paymentMethod: "Méthode de paiement",
    confirmWith: "Confirmer avec", confirmPayment: "Confirmer le paiement",
    payGuarantee1: "✓ Paiement sécurisé", payGuarantee2: "✓ Devis avant travaux", payGuarantee3: "✓ Artisan vérifié et assuré", payGuarantee4: "✓ Recours possible",
    changeMethod: "Changer de méthode", processing: "Transaction en cours…",
    paymentConfirmed: "Paiement confirmé !", debited: "débité avec succès", close: "Fermer",
    invoiceInvalid: "Montant invalide", invoiceRequired: "Une photo de facture est requise",
    cardInvalid: "Numéro de carte invalide", expInvalid: "Date d'expiration invalide",
    cvvInvalid: "CVV invalide", holderRequired: "Nom du titulaire requis",
    joinFree: "Rejoignez LOCKR gratuitement",
    settlementLabel: "Règlement de prestation",
    lang: "EN",
    // Calendar
    calendarTab: "Calendrier", noRdvDay: "Aucun RDV ce jour", rdvLabel: "RDV", rdv2Label: "2ème RDV",
    immediateIntervention: "Intervention immédiate", scheduleRdv: "Planifier un RDV",
    rdvDate: "Date du RDV", paymentDateLabel: "Date de paiement prévue",
    acompteLabel: "Acompte (€)", acompteOptional: "Acompte optionnel",
    acompteReceived: "Acompte reçu ✓", markAcompte: "Marquer acompte reçu",
    acompteNotif: "Acompte à recevoir :", secondRdv: "2ème RDV prévu le",
    confirmRdv: "Confirmer le RDV", bonAcceptMode: "Mode d'intervention",
    noRdv: "Aucun RDV planifié", today: "Aujourd'hui",
    rdvScheduled: "RDV planifié !", acompteSet: "Acompte noté",
    // PayModal
    payBtn: "Payer",
    // ClotureModal
    invoiceAdded: "Facture ajoutée", removeFile: "Supprimer", amountLabel: "Montant", selectImage: "Sélectionnez une image",
    yourShare40: "Votre part",
    // ChatRegional
    chatProRegion: "Chat Pros",
    // BonsScreen
    regionLabel: "Région", bonusAccepted: "Bon accepté !",
    // ChatIntervention
    interventionInProgress: "Intervention en cours", chatStart: "Début de la conversation",
    // ProApp
    artisanPro: "Artisan Pro", completedStat: "Terminées", netEarnings: "Gains net",
    progressLabel: "Progression", closeAndInvoice: "Terminer et facturer",
    noCompletedMission: "Aucune mission terminée", markAsPaid: "Marquer comme payé",
    earned: "gagnés", dispoShort: "Dispo", indispoShort: "Indispo", gains: "Gains",
    locating: "Localisation en cours…",
    // ClientApp
    statusAssigned: "Assignée", statusEnRoute: "En route", statusDone: "Terminée", statusInProgress: "En cours",
    statusCancelled: "Annulée", statusCancelledClient: "Annulée par le client",
    noIntervention: "Aucune intervention",
    payInvoiceBtn: "Payer la facture",
    selectInterventionType: "Sélectionnez un type d'intervention",
    reserveBtn: "Réserver",
    // LoginScreen
    loginFeature1: "Artisans certifiés & vérifiés", loginFeature2: "Suivi GPS en temps réel", loginFeature3: "Intervention en moins de 30 min",
    loginFeature4: "Paiement sécurisé en ligne", loginFeature5: "Support 7j/7 réactif",
    loginWhoTitle: "Qui sommes-nous ?",
    loginWhoText: "LOCKR est la plateforme française qui connecte les particuliers avec des artisans de confiance — plombiers, électriciens, serruriers, chauffagistes — vérifiés, assurés et notés par la communauté.",
    loginWhyTitle: "Pourquoi choisir LOCKR ?",
    loginStat1: "500+", loginStat1Label: "artisans certifiés",
    loginStat2: "12 000+", loginStat2Label: "missions réalisées",
    loginStat3: "98%", loginStat3Label: "clients satisfaits",
    wrongCredentials: "Email ou mot de passe incorrect", notVerified: "Compte non vérifié",
    loginTitle: "Connexion",
    // Marketplace
    marketplace: "Marketplace", marketplaceDesc: "Achetez et vendez du matériel entre pros",
    newListing: "Nouvelle annonce", myListings: "Mes annonces", allListings: "Toutes les annonces",
    listingTitle: "Titre de l'annonce", listingDesc: "Description", listingPrice: "Prix (€)",
    listingCategory: "Catégorie", listingCondition: "État",
    conditionNew: "Neuf", conditionGoodUsed: "Très bon état", conditionUsed: "Occasion",
    contactSeller: "Contacter", noListings: "Aucune annonce pour l'instant",
    postListing: "Publier l'annonce", listingPosted: "Annonce publiée !",
    deleteListing: "Supprimer", filterAll: "Tout", catTools: "Outils", catParts: "Pièces", catEquip: "Équipements", catMat: "Matériaux",
    markSold: "Marquer vendu", soldLabel: "VENDU",
    buyBtn: "Acheter maintenant", buyStep1Title: "Adresse de livraison", buyStep2Title: "Paiement sécurisé", buyStep3Title: "Confirmation",
    buyFullName: "Nom complet", buyAddress: "Adresse", buyCity: "Ville", buyZip: "Code postal", buyPhone: "Téléphone",
    buyCardNum: "Numéro de carte", buyExpiry: "Date d'expiration (MM/AA)", buyCvv: "CVV",
    buyNext: "Continuer", buyConfirm: "Confirmer la commande",
    buySuccess: "Commande confirmée !", buySuccessDesc: "Votre commande a été transmise au vendeur, qui vous contactera pour la livraison. Votre paiement est conservé par LOCKR : il n'est versé au vendeur qu'une fois l'article reçu (« J'ai reçu l'article » dans « Mes achats »).",
    buyTotal: "Total TTC", buySellerGets: "Le vendeur reçoit", buyCommInfo: "dont 15% de commission LOCKR",
    buyDelivery: "Livraison", buyPayment: "Paiement", buyRecap: "Récapitulatif",
    adminMarketplace: "Marketplace", adminMarketplaceDesc: "Suivi des ventes & commissions",
    totalSales: "Ventes totales", totalCommission: "Commissions LOCKR (15%)",
    salesHistory: "Historique des ventes", noSales: "Aucune vente enregistrée",
    commissionRate: "Commission LOCKR", seller: "Vendeur", buyer: "Acheteur",
    // RegisterChoiceScreen
    chooseProfile: "Choisissez votre profil",
    clientDesc: "Trouvez un artisan qualifié rapidement. Suivi en temps réel de votre intervention.",
    getStarted: "Commencer",
    proDesc: "Recevez des missions près de chez vous. Gérez votre activité et vos revenus.",
    proDocsRequired: "Documents professionnels requis (SIRET, assurance, pièce d'identité)",
    entrepriseChoice: "Entreprise / Partenaire",
    entrepriseDesc: "Gérez votre flotte de techniciens, publiez des bons de travail et bénéficiez d'un tableau de bord entreprise complet.",
    entrepriseDocsRequired: "Documents entreprise requis (SIRET, Kbis, RC Pro, IBAN)",
    // RegisterEntrepriseScreen
    entRegisterTitle: "Inscription Entreprise", entRegisterSubtitle: "Rejoignez le réseau partenaire LOCKR",
    entStep1: "Informations entreprise", entStep2: "Documents légaux", entStep3: "Confirmation",
    raisonSocialeLabel: "Raison sociale *", formeJuridique: "Forme juridique *",
    formeOptions: "SAS,SARL,SA,EURL,SNC,EI,Auto-entrepreneur,Autre",
    capitalLabel: "Capital social", rcsLabel: "N° RCS", tvaLabel: "N° TVA intracommunautaire",
    secteurActivite: "Secteurs d'activité *", assuranceRCLabel: "Assurance RC Pro *",
    kbisRequired: "Extrait Kbis requis (moins de 3 mois)", ibanEntLabel: "IBAN *",
    uploadKbisRequired: "Téléverser Kbis *", logoLabel: "Logo entreprise",
    entLegalNote: "Ces documents sont requis par la loi. Votre dossier sera examiné sous 48h ouvrées.",
    entSubmit: "Soumettre ma demande de partenariat",
    entPending: "Votre dossier est en cours d'examen. Vous recevrez une réponse sous 48h.",
    entSecteurs: "Serrurerie,Plomberie,Électricité,Chauffage,Fermetures,Multi-métiers",
    // RegisterClientScreen
    clientRegisterTitle: "Inscription Particulier", clientRegisterSubtitle: "Trouvez un artisan en quelques secondes",
    createMyAccount: "Créer mon compte", repeatPassword: "Répétez votre mot de passe",
    // RegisterProScreen
    joinProLockr: "Rejoignez les pros LOCKR", proRegisterTitle: "Inscription Artisan Pro",
    stepWord: "Étape", ofWord: "sur",
    personalInfo: "Informations personnelles", nextStepDocs: "Étape suivante — Documents",
    proDocuments: "Documents professionnels",
    proDocsLegalNote: "Ces documents sont requis par la loi et seront vérifiés par notre équipe sous 48h.",
    siretInvalid: "SIRET invalide (14 chiffres requis)", idCardRequired: "Carte d'identité requise", insuranceRequired: "Attestation d'assurance requise",
    siretLabel: "Numéro SIRET *", certifLabel: "Certification professionnelle", noCertif: "Aucune certification",
    certifRgeFull: "RGE — Reconnu Garant de l'Environnement",
    idCardLabel: "Pièce d'identité * (CNI ou Passeport)", uploadIdCard: "Téléverser CNI / Passeport",
    insuranceLabel: "Attestation assurance RC Pro *", uploadInsurance: "Téléverser attestation d'assurance",
    kbisLabel: "Extrait Kbis", uploadKbis: "Téléverser extrait Kbis", optionalWord: "optionnel",
    ibanLabel: "IBAN (pour vos paiements)",
    legalWarning: "En soumettant votre dossier, vous certifiez être en règle avec la législation française (auto-entrepreneur, société ou artisan enregistré). LOCKR se réserve le droit de vérifier et rejeter tout dossier incomplet.",
    submitDossier: "Soumettre mon dossier",
    // AdminApp
    bonusPublished: "Bon publié !", urgentLabel: "Urgent",
    titleLabel: "Titre", addressLabel: "Adresse", typeLabel: "Type", regionSelectLabel: "Région",
    estimatedAmountLabel: "Montant estimé (€)",
    // Feature 1 - photos avant/après
    photoAvant: "Photo avant", photoApres: "Photo après", takePhotoAvant: "Prendre photo avant", takePhotoApres: "Prendre photo après",
    photoAvantRequired: "Une photo avant est requise avant de démarrer", photoAdded: "Photo ajoutée",
    // Feature 2 - blocage paiement
    paymentBlockTitle: "Accès bloqué", paymentBlockMsg: "Vous avez des interventions impayées depuis plus de 7 jours. Résolvez-les pour recevoir de nouvelles propositions.",
    // Feature 3 - devis
    devisTitle: "Devis", devisAccept: "J'accepte le devis", devisAcceptRequired: "Vous devez accepter le devis pour continuer",
    devisService: "Prestation", devisArtisan: "Artisan", devisTotal: "Montant total", devisDeposit: "Acompte (50%)",
    devisModified: "Devis modifié", viewDevis: "Voir le devis", finalAmountLabel: "Montant final",
    // Feature 4 - acompte
    depositRequired: "Un acompte de 50% est requis pour confirmer la réservation", depositPayment: "Paiement de l'acompte",
    // Feature 5 - audio
    recordDiscussion: "Enregistrer la discussion", startRecording: "Démarrer l'enregistrement", stopRecording: "Arrêter", audioRecorded: "Enregistrement sauvegardé",
    // Feature 6 - satisfaction
    satisfactionTitle: "Comment s'est passée votre intervention ?", satisfactionSubmit: "Envoyer", satisfactionComment: "Commentaire (optionnel)",
    satisfactionDone: "Merci pour votre retour !",
    // Feature 7 - bannissement
    bannissements: "Bannissements", banUser: "Bannir", banReason: "Raison", banDate: "Date", bannedBy: "Banni par",
    banConfirmTitle: "Bannir l'utilisateur", banReasonPlaceholder: "Raison du bannissement…", banConfirm: "Confirmer le ban",
    accountBanned: "Votre compte a été suspendu. Veuillez contacter le support.",
    // Feature 9 - priorité
    recommendedForYou: "Recommandé pour vous",
    // Feature 10 - facture mensuelle
    monthlyReport: "Facture mensuelle", downloadMonthlyReport: "Télécharger ma facture du mois",
    monthlyReportTitle: "Récapitulatif mensuel", printDownload: "Imprimer / Télécharger",
    missionList: "Missions", subtotal: "Sous-total", yourShare40pct: "Votre part", totalLabel: "Total",
    // Feature 11 - photo profil
    uploadProfilePhoto: "Uploader une photo de profil",
    // Pro profil
    proProfile: "Mon Profil", editProfile: "Modifier mon profil", saveProfile: "Enregistrer les modifications",
    coverageRadius: "Rayon d'intervention (km)", workSchedule: "Horaires de travail",
    scheduleUpdated: "Profil mis à jour !", profileDays: "Jours disponibles",
    monday: "Lun", tuesday: "Mar", wednesday: "Mer", thursday: "Jeu",
    friday: "Ven", saturday: "Sam", sunday: "Dim",
    startHour: "Heure de début", endHour: "Heure de fin",
    myRatings: "Mes évaluations clients", noRatings: "Aucun avis pour l'instant",
    dossierStatus: "Statut du dossier", dossierApproved: "Dossier validé ✓", dossierRejected: "Dossier rejeté ✗", dossierPending: "En attente de validation",
    // Admin validations + clients
    validations: "Validations", pendingPros: "Pros en attente", noPendingPros: "Aucun dossier en attente de validation",
    approveDossier: "Valider le dossier", rejectDossier: "Rejeter", rejectReason: "Raison du rejet",
    rejectReasonPlaceholder: "Pourquoi ce dossier est-il rejeté ?", confirmReject: "Confirmer le rejet",
    allClients: "Clients", clientsCount: "clients inscrits",
    searchPlaceholder: "Rechercher…",
    // Litige client + annulation
    openLitige: "Ouvrir un litige", litigeTitle: "Motif du litige",
    litigePlaceholder: "Décrivez le problème…", litigeSubmit: "Envoyer le litige",
    litigeSubmitted: "Litige envoyé — notre équipe vous contactera sous 48h",
    myLitiges: "Mes litiges", noLitige: "Aucun litige en cours",
    cancelBooking: "Annuler", bookingCancelled: "Réservation annulée",
    myProfile: "Mon Profil", saveChanges: "Enregistrer",
    selectMetier: "Choisir un métier",
    metierSerrurier: "Serrurier", metierPlombier: "Plombier", metierElectricien: "Électricien", metierChauffagiste: "Chauffagiste",
    allMetiers: "Tous les métiers",
    // Partner / Partenaire
    partnerTab: "Entreprise", partnerBanner: "Espace Partenaire Certifié", partnerLogin: "Espace Partenaire",
    partnerCertified: "Partenaire Certifié ✓", partnerDashboard: "Tableau de bord",
    partnerTechs: "Techniciens", partnerFacturation: "Facturation", partnerContrat: "Contrat",
    partnerConformite: "Conformité", partnerDocuments: "Documents", partnerStats: "Statistiques", partnerProfil: "Profil",
    kpiMoisMissions: "Missions du mois", kpiCaMois: "CA du mois", kpiCommission: "Commission LOCKR",
    kpiTechs: "Techniciens actifs", kpiNote: "Note moyenne", kpiTaux: "Taux d'acceptation",
    lastMissions: "Dernières missions", conformiteAlerts: "Alertes conformité",
    documentMissing: "Document manquant", pendingValidationDoc: "En attente de validation",
    techAssigned: "Technicien assigné", assignTech: "— Assigner un technicien —", acceptMission: "Accepter",
    addTech: "Ajouter", addTechTitle: "Ajouter un technicien", deactivate: "Désactiver", activate: "Activer",
    commissionReport: "Relevé de commissions LOCKR", moisCa: "CA des missions terminées", netReverse: "Net reversé",
    invoicesEmitted: "Factures émises", noInvoice: "Aucune facture pour l'instant", downloadBtn: "Télécharger",
    contractTitle: "Contrat de partenariat", signatureDate: "Date de signature", contractActive: "Actif",
    downloadContract: "Télécharger le contrat signé", legalCompliance: "Conformité légale",
    complianceScore: "Score de conformité", legalObligations: "Obligations légales",
    requiredDocs: "Documents requis", docExpiry: "Expiration", uploadReplace: "📤 Uploader / Remplacer",
    statsMissionsMonth: "Missions par mois", statsTopTechs: "Top techniciens",
    statsIntervBreakdown: "Répartition interventions", statsAvgRating: "Note moyenne clients",
    statsBasedOn: "Basé sur", statsDoneMissions: "missions terminées",
    companyProfile: "Profil entreprise", legalName: "Raison sociale", rcsNum: "N° RCS",
    socialCapital: "Capital social", tvaNum: "N° TVA intracommunautaire", rcProInsurance: "Assurance RC Pro",
    sectors: "Secteurs d'activité", decoShort: "Déco.", moreTab: "Plus",
    missionAmount: "Montant", netPartenaire: "Net partenaire", contractSigned: "Date de signature :",
    // Platform call
    callInProgress: "Appel LOCKR en cours…", callConnected: "Connecté", callSecure: "Appel sécurisé via plateforme LOCKR",
    callHangup: "Raccrocher",
    // Bons new flow
    acceptBon: "Accepter le bon", callClient: "Appeler client", chatClient: "Chat LOCKR",
    planRdv: "Planifier le RDV", immediateRdv: "RDV immédiat", scheduleRdvBtn: "Planifier",
    callTimer: "min pour appeler le client", calledClient: "J'ai appelé le client",
    bonExpired: "Temps écoulé — bon réassigné",
    // Docs statuts
    docValid: "validé", docPending: "en_attente", docMissing: "non_fourni",
    docValidLabel: "Validé", docPendingLabel: "En attente", docMissingLabel: "Non fourni",
    // Stats partner extra
    statsMonthlyRevenue: "CA mensuel", statsLockrComm: "Commissions LOCKR",
    // Partner bons
    partnerBonsTab: "Bons publiés", postBonAll: "Publier pour tous les artisans",
    noPartnerBons: "Aucun bon publié pour l'instant", bonPostedAllCraftsmen: "Visible par tous les artisans LOCKR",
    bonOpenPlatform: "Ouvert à tous les artisans",
    // Partner fleet GPS + RH + abonnement
    fleetTab: "Flotte GPS", fleetTitle: "Suivi GPS de la flotte", fleetSubtitle: "Position en temps réel de vos employés",
    fleetOnline: "En ligne", fleetOnMission: "En mission", fleetOffline: "Hors ligne",
    fleetLastUpdate: "Mise à jour", fleetSpeed: "Vitesse", fleetCenterOn: "Centrer",
    fleetLiveBadge: "EN DIRECT", fleetNoTech: "Aucun employé actif à suivre",
    rhTab: "Gestion RH", rhTitle: "Gestion de l'entreprise", rhPlanning: "Planning de la semaine",
    rhLeaves: "Demandes de congés", rhApprove: "Accepter", rhReject: "Refuser",
    rhHours: "Heures travaillées (semaine)", rhBonuses: "Primes & bonus", rhAddBonus: "Attribuer une prime",
    rhBonusAmount: "Montant de la prime (€)", rhBonusReason: "Motif", rhNoLeave: "Aucune demande en attente",
    rhPayroll: "Masse salariale estimée", rhAlerts: "Alertes RH", rhDocExpiring: "Document expirant bientôt",
    rhDayOff: "Repos", rhMissionDay: "Mission", rhAvailable: "Disponible",
    rhViewWeek: "Semaine", rhViewHour: "Horaire", rhHourTip: "Cliquez sur une cellule pour voir le détail horaire",
    subTab: "Abonnement", subTitle: "Abonnement Entreprise LOCKR",
    subSubtitle: "Accédez à tous les outils de gestion de votre entreprise",
    subMonthly: "Mensuel", subAnnual: "Annuel", subPerMonth: "/mois", subPerYear: "/an",
    subBestOffer: "2 mois offerts", subChoose: "Choisir cette offre", subActive: "Abonnement actif",
    subUntil: "Valable jusqu'au", subCancel: "Résilier l'abonnement", subResume: "Réactiver",
    subBenefit1: "Commission réduite à 5% sur toutes les missions",
    subBenefit2: "Suivi GPS en temps réel de tous vos employés",
    subBenefit3: "Gestion RH complète : planning, congés, primes",
    subBenefit4: "Publication de bons pour tous les artisans LOCKR",
    subBenefit5: "Facturation et statistiques avancées",
    subBenefit6: "Support prioritaire 7j/7",
    subPaywallTitle: "Section Entreprise — accès payant",
    subPaywallText: "Choisissez une offre pour débloquer tous les outils de gestion de votre entreprise.",
    subPayNow: "S'abonner et payer", subConfirmed: "Abonnement activé !",
    // EarningsChart
    currentMonth: "mois en cours", clickMonthDetail: "Appuyez sur un mois pour voir le détail",
    noMissionThisMonth: "Aucune mission ce mois", downloadInvoiceMonth: "Télécharger la facture",
    missionsCount: "mission(s)", earningsShare: "Votre part des missions",
    // Mission statuses
    statusTerminee: "Terminée", statusEnAttente: "En attente", statusAcceptee: "Acceptée",
    statusPayee: "Payée", rdvScheduledShort: "✓ RDV planifié", delayExpired: "Délai expiré — bon remis en attente",
    // Cookie consent
    cookieTitle: "Votre vie privée nous importe",
    cookieText: "Nous utilisons des cookies essentiels pour le fonctionnement de l'application, et des cookies analytiques pour améliorer votre expérience. Conformément au RGPD et à la directive ePrivacy, votre consentement est requis pour les cookies non essentiels.",
    cookieAcceptAll: "Tout accepter", cookieRejectAll: "Refuser les non-essentiels", cookieCustomize: "Personnaliser",
    cookieEssential: "Cookies essentiels", cookieEssentialDesc: "Authentification, session, sécurité. Toujours actifs.",
    cookieAnalytics: "Cookies analytiques", cookieAnalyticsDesc: "Amélioration de l'expérience utilisateur. Anonymisés.",
    cookieMarketing: "Cookies marketing", cookieMarketingDesc: "Personnalisation des offres. Désactivés par défaut.",
    cookieSavePrefs: "Enregistrer mes préférences",
    cookieLearnMore: "Politique de confidentialité",
    // Mentions légales / CGU
    mentionsLegales: "Mentions légales", cgu: "CGU", cgv: "CGV", privacyPolicy: "Politique de confidentialité",
    legalFooter: "Mentions légales · CGU · Politique de confidentialité · Médiateur",
    mentionsTitle: "Mentions légales — LOCKR",
    mentionsEditor: "Éditeur : LOCKR SAS — Capital social : 10 000 € — SIRET : 000 000 000 00000 — RCS Paris",
    mentionsHost: "Hébergement : Vercel Inc. — 340 Pine Street, San Francisco, CA — USA",
    mentionsDPO: "DPO (Délégué à la Protection des Données) : dpo@lockr.fr",
    mentionsMediateur: "Médiateur de la consommation : CM2C — 14 rue Saint-Jean 75017 Paris — mediateur@cm2c.net",
    mentionsCnil: "Responsable de traitement : LOCKR SAS — Déclaration CNIL conforme au RGPD (UE 2016/679)",
    cguAccept: "J'accepte les CGU et la politique de confidentialité",
    cguRequired: "Vous devez accepter les CGU pour continuer",
    cguLink: "Lire les CGU",
    liabClientAccept: "Je reconnais que LOCKR est un simple intermédiaire de mise en relation : le contrat de prestation est conclu directement et exclusivement avec l'artisan intervenant, seul responsable de l'exécution, de la qualité et des dommages éventuels liés à son intervention. Tout recours s'exerce contre l'artisan et son assurance RC Pro.",
    liabProAccept: "En tant que professionnel indépendant, je reconnais être seul responsable de mes interventions, de leur conformité et des dommages causés, à l'exclusion de toute responsabilité de LOCKR. Je certifie disposer d'une assurance RC Pro valide couvrant mes prestations et je m'engage à garantir et indemniser LOCKR contre toute réclamation d'un client liée à mes interventions.",
    liabEntAccept: "En tant qu'entreprise, nous reconnaissons être seuls responsables des interventions réalisées par nos techniciens, de leur conformité et des dommages causés, à l'exclusion de toute responsabilité de LOCKR. Nous certifions disposer d'une assurance RC Pro valide couvrant nos prestations et nous engageons à garantir et indemniser LOCKR contre toute réclamation d'un client liée à nos interventions.",
    liabRequired: "Vous devez accepter cette clause de responsabilité pour continuer",
    // RGPD rights
    rgpdTitle: "Vos droits RGPD", rgpdRightsTitle: "Droits sur vos données personnelles",
    rgpdAccess: "Droit d'accès — demander une copie de vos données",
    rgpdRectif: "Droit de rectification — corriger vos données inexactes",
    rgpdErase: "Droit à l'effacement — supprimer votre compte et vos données",
    rgpdPorta: "Droit à la portabilité — exporter vos données (JSON/CSV)",
    rgpdOppose: "Droit d'opposition — s'opposer au traitement à des fins marketing",
    rgpdLimit: "Droit à la limitation — restreindre l'utilisation de vos données",
    rgpdContact: "Contacter le DPO : dpo@lockr.fr — Délai de réponse : 30 jours",
    rgpdCnil: "Réclamation CNIL : cnil.fr/plaintes",
    rgpdRequest: "Faire une demande RGPD",
    rgpdRequestSent: "Demande envoyée — réponse sous 30 jours",
    rgpdExport: "Exporter mes données", rgpdDelete: "Supprimer mon compte",
    rgpdDeleteConfirm: "Êtes-vous sûr ? Cette action est irréversible.",
    // Admin digital conformité
    adminDigitalTab: "Conformité Digitale",
    digitalConformiteTitle: "Conformité Numérique & Lois Digitales",
    digitalConformiteScore: "Score de conformité globale",
    digitalLaws: [
      { id: "rgpd", label: "RGPD / Règlement UE 2016/679", color: "#2563eb", desc: "Protection des données personnelles. Consentement, DPO, registre de traitement, notification de failles sous 72h.", items: ["Registre des traitements tenu à jour","DPO désigné (ou justification d'exemption)","Consentement cookies conforme (opt-in)","Politique de confidentialité accessible","Notification CNIL failles < 72h","Durées de conservation définies","Sous-traitants DPA signés"] },
      { id: "lcen", label: "LCEN — Loi pour la Confiance dans l'Économie Numérique (2004)", color: "#7c3aed", desc: "Mentions légales obligatoires sur tout site/app commercial, responsabilité hébergeur.", items: ["Mentions légales publiées (éditeur, hébergeur)","CGU/CGV accessibles avant achat","Droit de rétractation 14j mentionné","Médiateur de la consommation indiqué","Archivage contrats électroniques 10 ans","Accusé de réception commandes électroniques"] },
      { id: "dsa", label: "DSA — Digital Services Act (UE 2022/2065)", color: "#059669", desc: "Obligations pour les places de marché en ligne : signalement contenus illicites, transparence algorithmique.", items: ["Mécanisme de signalement d'annonces illicites","Transparence sur les recommandations algorithmiques","Point de contact unique désigné","Rapport de transparence annuel (si > 45M utilisateurs)","Politique de modération publiée","Lutte contre les faux avis en ligne"] },
      { id: "nis2", label: "NIS2 — Directive Cybersécurité (UE 2022/2555)", color: "#dc2626", desc: "Cybersécurité renforcée pour les opérateurs de services essentiels et numériques.", items: ["Politique de sécurité des SI documentée","Gestion des incidents cyber (détection + réponse)","Tests de pénétration réguliers","MFA activé pour tous les accès admin","Chiffrement des données en transit (TLS 1.3)","Chiffrement des données au repos","Sauvegardes régulières testées","Formation cybersécurité des équipes"] },
      { id: "sren", label: "Loi SREN — Sécurité et Régulation de l'Espace Numérique (2024)", color: "#d97706", desc: "Loi française transposant DSA + nouvelles obligations cyber, filtrage, identité numérique.", items: ["Blocage contenus illicites (CSAM, terrorisme)","Identité numérique France Connect+ compatible","Filtre parental accessible","Information utilisateurs sur les risques en ligne","Coopération avec l'ANSSI si incident majeur"] },
      { id: "rgaa", label: "RGAA v4 — Accessibilité Numérique (Décret 2019-768)", color: "#0891b2", desc: "Conformité accessibilité pour les services publics et entreprises >250M€ CA. Bonnes pratiques recommandées pour tous.", items: ["Déclaration d'accessibilité publiée","Contrastes couleurs conformes (AA minimum)","Navigation clavier complète","Alternatives textes images","Sous-titres vidéos","Formulaires accessibles (labels, erreurs)"] },
      { id: "eprivacy", label: "Directive ePrivacy — Cookies (transposée CNIL 2020)", color: "#16a34a", desc: "Consentement opt-in obligatoire pour tout cookie non essentiel. Durée max 13 mois.", items: ["Bandeau cookies conforme (opt-in)","Refus aussi simple qu'accepter","Cookies session < 13 mois","Pas de cookie wall (accès conditionné)","Liste cookies publiée","Analytics anonymisés ou consentis"] },
      { id: "tvafraude", label: "Loi Anti-fraude TVA (2018) — Logiciels de caisse", color: "#be185d", desc: "Logiciels de caisse certifiés NF525 ou équivalent. Inaltérabilité des données de transaction.", items: ["Logiciel de caisse certifié NF525","Données de transactions inaltérables","Piste d'audit complète des paiements","Attestation éditeur logiciel","Archivage transactions 6 ans"] },
      { id: "pcidss", label: "PCI-DSS v4 — Sécurité des Paiements par Carte", color: "#9333ea", desc: "Standard de sécurité pour le traitement des données de carte bancaire.", items: ["Prestataire PSP certifié PCI-DSS","Aucune donnée carte stockée en clair","HTTPS sur toutes les pages de paiement","3DS2 (authentification forte SCA/DSP2) activé","Tests de vulnérabilité réguliers","Journaux d'accès conservés 1 an"] },
    ],
  },
  en: {
    appTagline: "The craftsman arrives. You stay calm.",
    login: "Login", register: "Register", logout: "Logout",
    email: "Email address", password: "Password", confirmPassword: "Confirm password",
    firstname: "First name", lastname: "Last name", phone: "Phone", city: "City / Region",
    individual: "Individual", craftsman: "Pro craftsman",
    findCraftsman: "Find a craftsman", myMissions: "My missions",
    createAccount: "Create an account", freeAccount: "Create a free account",
    alreadyMember: "Already registered?", notMember: "No account yet?",
    connectAs: "Sign in", forgotPass: "Forgot password?",
    minChars: "8 characters minimum", passMismatch: "Passwords do not match",
    invalidEmail: "Invalid email", emailUsed: "Email already used",
    invalidPhone: "Invalid phone number", firstnameRequired: "First name required", lastnameRequired: "Last name required",
    emailSent: "Email sent!", checkInbox: "Check your inbox",
    enterCode: "Enter the code received by email:", verifyCode: "Verify code",
    wrongCode: "Incorrect code, try again.", accountVerified: "Account verified!",
    welcome: "Welcome,", accessApp: "Access the application",
    generatingEmail: "Sending email…", verifying: "Verifying code…",
    codeNotInApp: "The code was sent by email. It does not appear in the application.",
    cancel: "Cancel", back: "Back", confirm: "Confirm",
    available: "Available", unavailable: "Unavailable",
    urgent: "URGENT", reviews: "reviews", verified: "Verified pro",
    newRequest: "New request", interventionType: "Intervention type",
    availableCraftsmen: "Available craftsmen", noAvailable: "(none for now)",
    book: "Book", liveTracking: "Live tracking",
    onRoute: "On the way", arrived: "Craftsman arrived", openDoor: "Open the door",
    artisanArriving: "Your craftsman is arriving",
    payInvoice: "Pay invoice", callArtisan: "Call",
    transport: "Transport", car: "Car", scooter: "Scooter",
    motorcycle: "Motorcycle", bicycle: "Bicycle", onFoot: "On foot",
    missions: "Missions", inProgress: "In progress", bonuses: "Bonuses", chat: "Chat",
    stats: "Stats", history: "History",
    autoTab: "Self-Employment", factuTab: "E-Invoicing",
    aeTitle: "Self-Employment Management", aeCaTitle: "Revenue",
    aeCaMois: "Revenue this month", aeCaAn: "Annual revenue", aeSeuilMois: "Monthly threshold", aeSeuilAn: "Annual threshold",
    aeCotisations: "Social contributions", aeCotisRate: "Social contributions (21.2%)",
    aeCotisCalc: "Estimated contributions", aeCotisAlert: "Remember to file before",
    aeSeuilAlert: "Warning: VAT exemption threshold approaching", aeSeuilOk: "Below VAT threshold",
    aeCharges: "Estimated social charges", aeDeclaration: "URSSAF declaration",
    aeDeclare: "File this month", aeDeclareTitle: "File monthly revenue",
    aeCaSaisie: "Revenue to declare (€)", aeConfirmDecl: "Confirm filing", aeDeclDone: "Filing recorded",
    aeFrais: "Business expenses", aeAddFrais: "Add expense",
    aeFraisLabel: "Description", aeFraisMontant: "Amount (€)", aeFraisDate: "Date", aeFraisCat: "Category",
    aeFraisCats: "Fuel,Tools,Training,Supplies,Travel,Phone,Insurance,Other",
    aeRecap: "Tax summary", aeNetEstime: "Estimated net income",
    aeTvaFranchise: "VAT exemption (franchise en base)", aeRegimeMicro: "Micro-entrepreneur scheme",
    aeFormation: "Training contribution (CFP)", aeFormationRate: "0.30% of revenue",
    aeCFE: "CFE (local business tax)", aeRappelCFE: "Due in December",
    aeMemo: "Tax memo", aeMemoPlaceholder: "Notes, reminders, deadlines…",
    feTitle: "Electronic Invoicing — 2026 Reform", feIntro: "The 2024 finance law makes electronic invoicing mandatory for B2B transactions in France. Progressive rollout from September 2026.",
    feCalendar: "Implementation calendar", feCalendarItems: "Sept. 2026 — Mandatory reception (all companies)|Jan. 2027 — Mandatory issuance SMEs/mid-caps|Jan. 2027 — Mandatory issuance micro-entrepreneurs",
    fePDP: "Partner Dematerialisation Platform (PDP)", fePDPDesc: "You must choose a DGFiP-approved PDP or use the public Chorus Pro portal to issue and receive electronic invoices.",
    fePDPList: "Chorus Pro (free public portal)|Pennylane|Sellsy|Sage|Cegid|QuickBooks|Indy (self-employed)|Tiime|Axonaut",
    feMentions: "Mandatory fields on electronic invoice", feMentionsList: "SIREN/SIRET number|Intra-community VAT number (if applicable)|Invoice number (chronological)|Issue date|Service date|Precise service description|Amount excl. VAT, VAT, incl. VAT|Payment terms and late penalties|VAT exemption notice (franchise) if applicable|Full contact details of issuer and recipient",
    feFormats: "Accepted formats", feFormatsList: "Factur-X (XML-enriched PDF)|UBL 2.1|CII (Cross Industry Invoice)",
    feStatus: "Your status", feStatusAE: "Micro-entrepreneur: mandatory issuance from January 2027 — reception required from September 2026",
    feChecklist: "Compliance checklist", feCheckItems: "Choose a PDP or open a Chorus Pro account|Update your invoicing software|Check mandatory fields on your templates|Enable electronic reception before Sept. 2026|Notify your business clients|Archive electronic invoices for 10 years",
    feArchive: "Legal archiving", feArchiveDesc: "Electronic invoices must be kept for 10 years in a tamper-proof format. Use an approved EAS (Electronic Archiving System).",
    feLcti: "Consumer mediation & legal notices", feLctiDesc: "Since 2020, the consumer mediator must be mentioned on all invoices and quotes. Penalty: up to €15,000 fine.",
    feReady: "I'm ready for the 2026 reform", feNotReady: "Compliance action needed",
    feMyChorPro: "My Chorus Pro / PDP reference", feChorusPlaceholder: "Enter your PDP reference…",
    noMissionPending: "No pending mission", noMissionActive: "No active mission",
    start: "Start", refuse: "Decline", viewMission: "View ongoing mission",
    earnings: "My earnings", thisMonth: "This month",
    closeMission: "Close mission", invoicePhoto: "Invoice photo *",
    photographOrSelect: "Photograph or select",
    totalAmount: "Total invoice amount *", paymentStatus: "Payment status *",
    paid: "Paid", pending: "Pending", summary: "Summary",
    yourShare: "Your share", lockrShare: "LOCKR",
    confirmPaid: "Confirm — Invoice paid", confirmPending: "Confirm — Payment pending",
    edit: "Edit", next: "Continue",
    regionalChat: "Pro Chat", chatSubtitle: "Connect with pros in your region",
    noMessage: "No messages. Be the first to write!",
    yourMessage: "Your message…", send: "Send",
    availableBonuses: "Available bonuses", region: "Region", post: "Post",
    noBonusRegion: "No bonuses available in your region",
    yourSharePct: "Your share", acceptBonus: "Accept bonus",
    postBonus: "Post a bonus", publishBonus: "Publish bonus",
    title: "Title", clientAddress: "Client address", interventionTypeLabel: "Intervention type",
    estimatedAmount: "Estimated amount (€)", technicianShare: "Technician share",
    urgentIntervention: "Urgent intervention",
    helloUser: "Hello,", whatNeed: "What do you need?",
    quickInterventions: "Quick interventions", myInterventions: "My interventions",
    gpsActive: "GPS active", artisanOnRoute: "Craftsman on the way",
    followLive: "Follow live", min: "min",
    dashboard: "Dashboard", adminBonuses: "Bonuses", craftsmen: "Craftsmen", allMissions: "Missions",
    adminSurveillance: "Monitoring", surveillanceDesc: "Intervention recordings — admin confidential", surveillanceEmpty: "No recordings yet", surveillanceFlagged: "Flagged", surveillanceFlaggedAlert: "recording(s) flagged for inappropriate language", surveillanceDetectedTerms: "Detected terms", surveillanceAudio: "Audio recording", surveillanceTranscript: "Written transcript", surveillanceBanPro: "Ban this craftsman", surveillanceBanReason: "Inappropriate language detected (monitoring)",
    revenue: "Revenue", platformRevenue: "Platform revenue",
    totalMissions: "Total missions", prosRegistered: "Registered pros",
    platformRevenue6m: "Platform revenue (6 months)", lockrBonuses: "LOCKR Bonuses",
    newBonus: "New", publishBonus2: "Publish bonus", deleteBonus: "Delete",
    registeredCraftsmen: "Registered craftsmen", demoAccount: "Demo account",
    allMissionsLabel: "All missions", techShare: "Craftsman share",
    newLockrBonus: "New LOCKR bonus", artisanShare: "Craftsman share",
    certifRge: "RGE Certified", qualibat: "Qualibat", proCertif: "Pro Certified",
    artisanAgree: "Approved craftsman", proLockr: "Pro LOCKR",
    paymentEncrypted: "SSL 256-bit encrypted payment",
    cardNumber: "Card number", cardHolder: "Cardholder", expiry: "Expiry", cvv: "CVV",
    pay: "Pay", paymentMethod: "Payment method",
    confirmWith: "Confirm with", confirmPayment: "Confirm payment",
    payGuarantee1: "✓ Secure payment", payGuarantee2: "✓ Quote before work", payGuarantee3: "✓ Verified & insured craftsman", payGuarantee4: "✓ Recourse available",
    changeMethod: "Change method", processing: "Processing…",
    paymentConfirmed: "Payment confirmed!", debited: "debited successfully", close: "Close",
    invoiceInvalid: "Invalid amount", invoiceRequired: "An invoice photo is required",
    cardInvalid: "Invalid card number", expInvalid: "Invalid expiry date",
    cvvInvalid: "Invalid CVV", holderRequired: "Cardholder name required",
    joinFree: "Join LOCKR for free",
    settlementLabel: "Service payment",
    lang: "FR",
    // Calendar
    calendarTab: "Calendar", noRdvDay: "No appointment this day", rdvLabel: "Appt", rdv2Label: "2nd Appt",
    immediateIntervention: "Immediate intervention", scheduleRdv: "Schedule appointment",
    rdvDate: "Appointment date", paymentDateLabel: "Expected payment date",
    acompteLabel: "Deposit (€)", acompteOptional: "Optional deposit",
    acompteReceived: "Deposit received ✓", markAcompte: "Mark deposit received",
    acompteNotif: "Deposit to collect:", secondRdv: "2nd appt scheduled on",
    confirmRdv: "Confirm appointment", bonAcceptMode: "Intervention mode",
    noRdv: "No scheduled appointment", today: "Today",
    rdvScheduled: "Appointment scheduled!", acompteSet: "Deposit noted",
    // PayModal
    payBtn: "Pay",
    // ClotureModal
    invoiceAdded: "Invoice added", removeFile: "Remove", amountLabel: "Amount", selectImage: "Please select an image",
    yourShare40: "Your share",
    // ChatRegional
    chatProRegion: "Pro Chat",
    // BonsScreen
    regionLabel: "Region", bonusAccepted: "Bonus accepted!",
    // ChatIntervention
    interventionInProgress: "Intervention in progress", chatStart: "Start of conversation",
    // ProApp
    artisanPro: "Pro Craftsman", completedStat: "Completed", netEarnings: "Net earnings",
    progressLabel: "Progress", closeAndInvoice: "Complete & invoice",
    noCompletedMission: "No completed mission", markAsPaid: "Mark as paid",
    earned: "earned", dispoShort: "Avail.", indispoShort: "N/A", gains: "Earnings",
    locating: "Locating…",
    // ClientApp
    statusAssigned: "Assigned", statusEnRoute: "En route", statusDone: "Done", statusInProgress: "In progress",
    statusCancelled: "Cancelled", statusCancelledClient: "Cancelled by client",
    noIntervention: "No intervention",
    payInvoiceBtn: "Pay invoice",
    selectInterventionType: "Select an intervention type",
    reserveBtn: "Book",
    // LoginScreen
    loginFeature1: "Certified & verified craftsmen", loginFeature2: "Real-time GPS tracking", loginFeature3: "Intervention in under 30 min",
    loginFeature4: "Secure online payment", loginFeature5: "Responsive 7/7 support",
    loginWhoTitle: "Who are we?",
    loginWhoText: "LOCKR is the French platform connecting individuals with trusted craftsmen — plumbers, electricians, locksmiths, heating engineers — verified, insured and rated by the community.",
    loginWhyTitle: "Why choose LOCKR?",
    loginStat1: "500+", loginStat1Label: "certified craftsmen",
    loginStat2: "12 000+", loginStat2Label: "missions completed",
    loginStat3: "98%", loginStat3Label: "satisfied clients",
    wrongCredentials: "Incorrect email or password", notVerified: "Account not verified",
    loginTitle: "Sign in",
    marketplace: "Marketplace", marketplaceDesc: "Buy and sell materials between pros",
    newListing: "New listing", myListings: "My listings", allListings: "All listings",
    listingTitle: "Listing title", listingDesc: "Description", listingPrice: "Price (€)",
    listingCategory: "Category", listingCondition: "Condition",
    conditionNew: "New", conditionGoodUsed: "Like new", conditionUsed: "Used",
    contactSeller: "Contact", noListings: "No listings yet",
    postListing: "Post listing", listingPosted: "Listing posted!",
    deleteListing: "Delete", filterAll: "All", catTools: "Tools", catParts: "Parts", catEquip: "Equipment", catMat: "Materials",
    markSold: "Mark as sold", soldLabel: "SOLD",
    buyBtn: "Buy now", buyStep1Title: "Delivery address", buyStep2Title: "Secure payment", buyStep3Title: "Confirmation",
    buyFullName: "Full name", buyAddress: "Address", buyCity: "City", buyZip: "Postal code", buyPhone: "Phone",
    buyCardNum: "Card number", buyExpiry: "Expiry date (MM/YY)", buyCvv: "CVV",
    buyNext: "Continue", buyConfirm: "Confirm order",
    buySuccess: "Order confirmed!", buySuccessDesc: "Your order has been sent to the seller, who will contact you for delivery. Your payment is held by LOCKR and only released to the seller once you have received the item (\"I received the item\" in \"My purchases\").",
    buyTotal: "Total", buySellerGets: "Seller receives", buyCommInfo: "incl. 15% LOCKR commission",
    buyDelivery: "Delivery", buyPayment: "Payment", buyRecap: "Summary",
    adminMarketplace: "Marketplace", adminMarketplaceDesc: "Sales & commissions tracking",
    totalSales: "Total sales", totalCommission: "LOCKR commissions (15%)",
    salesHistory: "Sales history", noSales: "No sales recorded",
    commissionRate: "LOCKR commission", seller: "Seller", buyer: "Buyer",
    // RegisterChoiceScreen
    chooseProfile: "Choose your profile",
    clientDesc: "Find a qualified craftsman quickly. Real-time tracking of your intervention.",
    getStarted: "Get started",
    proDesc: "Receive missions near you. Manage your activity and revenue.",
    proDocsRequired: "Professional documents required (SIRET, insurance, ID)",
    // RegisterClientScreen
    clientRegisterTitle: "Individual Registration", clientRegisterSubtitle: "Find a craftsman in seconds",
    createMyAccount: "Create my account", repeatPassword: "Repeat your password",
    // RegisterProScreen
    joinProLockr: "Join LOCKR pros", proRegisterTitle: "Pro Craftsman Registration",
    stepWord: "Step", ofWord: "of",
    personalInfo: "Personal information", nextStepDocs: "Next step — Documents",
    proDocuments: "Professional documents",
    proDocsLegalNote: "These documents are required by law and will be verified by our team within 48h.",
    siretInvalid: "Invalid SIRET (14 digits required)", idCardRequired: "ID card required", insuranceRequired: "Insurance certificate required",
    siretLabel: "SIRET Number *", certifLabel: "Professional certification", noCertif: "No certification",
    certifRgeFull: "RGE — Recognized Environmental Guarantor",
    idCardLabel: "ID Document * (National ID or Passport)", uploadIdCard: "Upload ID / Passport",
    insuranceLabel: "Professional liability insurance *", uploadInsurance: "Upload insurance certificate",
    kbisLabel: "Kbis extract", uploadKbis: "Upload Kbis extract", optionalWord: "optional",
    ibanLabel: "IBAN (for your payments)",
    legalWarning: "By submitting your application, you certify compliance with applicable law (sole trader, company or registered craftsman). LOCKR reserves the right to verify and reject any incomplete application.",
    submitDossier: "Submit my application",
    // AdminApp
    bonusPublished: "Bonus published!", urgentLabel: "Urgent",
    titleLabel: "Title", addressLabel: "Address", typeLabel: "Type", regionSelectLabel: "Region",
    estimatedAmountLabel: "Estimated amount (€)",
    // Feature 1 - photos before/after
    photoAvant: "Before photo", photoApres: "After photo", takePhotoAvant: "Take before photo", takePhotoApres: "Take after photo",
    photoAvantRequired: "A before photo is required before starting", photoAdded: "Photo added",
    // Feature 2 - payment block
    paymentBlockTitle: "Access blocked", paymentBlockMsg: "You have unpaid interventions older than 7 days. Please resolve them to receive new proposals.",
    // Feature 3 - quote
    devisTitle: "Quote", devisAccept: "I accept the quote", devisAcceptRequired: "You must accept the quote to continue",
    devisService: "Service", devisArtisan: "Craftsman", devisTotal: "Total amount", devisDeposit: "Deposit (50%)",
    devisModified: "Modified quote", viewDevis: "View quote", finalAmountLabel: "Final amount",
    // Feature 4 - deposit
    depositRequired: "A 50% deposit is required to confirm booking", depositPayment: "Deposit payment",
    // Feature 5 - audio
    recordDiscussion: "Record discussion", startRecording: "Start recording", stopRecording: "Stop", audioRecorded: "Recording saved",
    // Feature 6 - satisfaction
    satisfactionTitle: "How was your intervention?", satisfactionSubmit: "Submit", satisfactionComment: "Comment (optional)",
    satisfactionDone: "Thank you for your feedback!",
    // Feature 7 - ban
    bannissements: "Bans", banUser: "Ban", banReason: "Reason", banDate: "Date", bannedBy: "Banned by",
    banConfirmTitle: "Ban user", banReasonPlaceholder: "Reason for ban…", banConfirm: "Confirm ban",
    accountBanned: "Your account has been suspended. Please contact support.",
    // Feature 9 - priority
    recommendedForYou: "Recommended for you",
    // Feature 10 - monthly invoice
    monthlyReport: "Monthly invoice", downloadMonthlyReport: "Download my monthly invoice",
    monthlyReportTitle: "Monthly summary", printDownload: "Print / Download",
    missionList: "Missions", subtotal: "Subtotal", yourShare40pct: "Your share", totalLabel: "Total",
    // Feature 11 - profile photo
    uploadProfilePhoto: "Upload profile photo",
    // Pro profile
    proProfile: "My Profile", editProfile: "Edit my profile", saveProfile: "Save changes",
    coverageRadius: "Coverage radius (km)", workSchedule: "Work schedule",
    scheduleUpdated: "Profile updated!", profileDays: "Available days",
    monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
    friday: "Fri", saturday: "Sat", sunday: "Sun",
    startHour: "Start time", endHour: "End time",
    myRatings: "Client ratings", noRatings: "No reviews yet",
    dossierStatus: "Dossier status", dossierApproved: "Dossier approved ✓", dossierRejected: "Dossier rejected ✗", dossierPending: "Pending validation",
    // Admin
    validations: "Validations", pendingPros: "Pending pros", noPendingPros: "No dossiers pending validation",
    approveDossier: "Approve dossier", rejectDossier: "Reject", rejectReason: "Reason for rejection",
    rejectReasonPlaceholder: "Why is this dossier rejected?", confirmReject: "Confirm rejection",
    allClients: "Clients", clientsCount: "registered clients",
    searchPlaceholder: "Search…",
    // Client litige + cancel
    openLitige: "Open a dispute", litigeTitle: "Reason for dispute",
    litigePlaceholder: "Describe the issue…", litigeSubmit: "Submit dispute",
    litigeSubmitted: "Dispute submitted — our team will contact you within 48h",
    myLitiges: "My disputes", noLitige: "No open disputes",
    cancelBooking: "Cancel", bookingCancelled: "Booking cancelled",
    myProfile: "My Profile", saveChanges: "Save",
    selectMetier: "Choose a trade", metierSerrurier: "Locksmith", metierPlombier: "Plumber", metierElectricien: "Electrician", metierChauffagiste: "Heating engineer", allMetiers: "All trades",
    // Partner
    partnerTab: "Enterprise", partnerBanner: "Certified Partner Space", partnerLogin: "Partner Space",
    partnerCertified: "Certified Partner ✓", partnerDashboard: "Dashboard",
    partnerTechs: "Technicians", partnerFacturation: "Billing", partnerContrat: "Contract",
    partnerConformite: "Compliance", partnerDocuments: "Documents", partnerStats: "Statistics", partnerProfil: "Profile",
    kpiMoisMissions: "Monthly missions", kpiCaMois: "Monthly revenue", kpiCommission: "LOCKR commission",
    kpiTechs: "Active technicians", kpiNote: "Average rating", kpiTaux: "Acceptance rate",
    lastMissions: "Recent missions", conformiteAlerts: "Compliance alerts",
    documentMissing: "Missing document", pendingValidationDoc: "Pending validation",
    techAssigned: "Assigned technician", assignTech: "— Assign a technician —", acceptMission: "Accept",
    addTech: "Add", addTechTitle: "Add a technician", deactivate: "Deactivate", activate: "Activate",
    commissionReport: "LOCKR commission report", moisCa: "Completed missions revenue", netReverse: "Net paid out",
    invoicesEmitted: "Invoices issued", noInvoice: "No invoices yet", downloadBtn: "Download",
    contractTitle: "Partnership contract", signatureDate: "Signature date", contractActive: "Active",
    downloadContract: "Download signed contract", legalCompliance: "Legal compliance",
    complianceScore: "Compliance score", legalObligations: "Legal obligations",
    requiredDocs: "Required documents", docExpiry: "Expiry", uploadReplace: "📤 Upload / Replace",
    statsMissionsMonth: "Missions per month", statsTopTechs: "Top technicians",
    statsIntervBreakdown: "Intervention breakdown", statsAvgRating: "Average client rating",
    statsBasedOn: "Based on", statsDoneMissions: "completed missions",
    companyProfile: "Company profile", legalName: "Company name", rcsNum: "RCS No.",
    socialCapital: "Share capital", tvaNum: "EU VAT number", rcProInsurance: "Professional liability insurance",
    sectors: "Business sectors", decoShort: "Sign out", moreTab: "More",
    missionAmount: "Amount", netPartenaire: "Partner net", contractSigned: "Signature date:",
    // Platform call
    callInProgress: "LOCKR call in progress…", callConnected: "Connected", callSecure: "Secure call via LOCKR platform",
    callHangup: "Hang up",
    // Bons new flow
    acceptBon: "Accept bonus", callClient: "Call client", chatClient: "LOCKR Chat",
    planRdv: "Schedule appointment", immediateRdv: "Immediate appointment", scheduleRdvBtn: "Schedule",
    callTimer: "min to call the client", calledClient: "I called the client",
    bonExpired: "Time's up — bonus reassigned",
    // Doc statuses
    docValid: "validated", docPending: "pending", docMissing: "not_provided",
    docValidLabel: "Validated", docPendingLabel: "Pending", docMissingLabel: "Not provided",
    // Stats partner extra
    statsMonthlyRevenue: "Monthly revenue", statsLockrComm: "LOCKR commissions",
    // Partner bons
    partnerBonsTab: "Published Bonuses", postBonAll: "Post for all craftsmen",
    noPartnerBons: "No bonuses posted yet", bonPostedAllCraftsmen: "Visible to all LOCKR craftsmen",
    bonOpenPlatform: "Open to all craftsmen",
    // Partner fleet GPS + HR + subscription
    fleetTab: "GPS Fleet", fleetTitle: "Fleet GPS tracking", fleetSubtitle: "Real-time position of your employees",
    fleetOnline: "Online", fleetOnMission: "On mission", fleetOffline: "Offline",
    fleetLastUpdate: "Updated", fleetSpeed: "Speed", fleetCenterOn: "Center",
    fleetLiveBadge: "LIVE", fleetNoTech: "No active employee to track",
    rhTab: "HR Management", rhTitle: "Company management", rhPlanning: "Weekly schedule",
    rhLeaves: "Leave requests", rhApprove: "Approve", rhReject: "Reject",
    rhHours: "Hours worked (week)", rhBonuses: "Bonuses & rewards", rhAddBonus: "Grant a bonus",
    rhBonusAmount: "Bonus amount (€)", rhBonusReason: "Reason", rhNoLeave: "No pending request",
    rhPayroll: "Estimated payroll", rhAlerts: "HR alerts", rhDocExpiring: "Document expiring soon",
    rhDayOff: "Day off", rhMissionDay: "Mission", rhAvailable: "Available",
    rhViewWeek: "Week", rhViewHour: "Hourly", rhHourTip: "Tap a cell to see hourly view",
    subTab: "Subscription", subTitle: "LOCKR Enterprise Subscription",
    subSubtitle: "Access all your company management tools",
    subMonthly: "Monthly", subAnnual: "Annual", subPerMonth: "/month", subPerYear: "/year",
    subBestOffer: "2 months free", subChoose: "Choose this plan", subActive: "Active subscription",
    subUntil: "Valid until", subCancel: "Cancel subscription", subResume: "Reactivate",
    subBenefit1: "Reduced 5% commission on all missions",
    subBenefit2: "Real-time GPS tracking of all your employees",
    subBenefit3: "Full HR management: schedule, leaves, bonuses",
    subBenefit4: "Post bonuses to all LOCKR craftsmen",
    subBenefit5: "Advanced invoicing and statistics",
    subBenefit6: "Priority support 7 days a week",
    subPaywallTitle: "Enterprise section — paid access",
    subPaywallText: "Choose a plan to unlock all your company management tools.",
    subPayNow: "Subscribe and pay", subConfirmed: "Subscription activated!",
    // EarningsChart
    currentMonth: "current month", clickMonthDetail: "Tap a month to see details",
    noMissionThisMonth: "No missions this month", downloadInvoiceMonth: "Download invoice",
    missionsCount: "mission(s)", earningsShare: "Your share of missions",
    // Mission statuses
    statusTerminee: "Completed", statusEnAttente: "Pending", statusAcceptee: "Accepted",
    statusPayee: "Paid", rdvScheduledShort: "✓ Appointment scheduled", delayExpired: "Time's up — bonus reassigned",
    // Cookie consent
    cookieTitle: "Your privacy matters",
    cookieText: "We use essential cookies for the app to function, and analytics cookies to improve your experience. Under GDPR and the ePrivacy directive, your consent is required for non-essential cookies.",
    cookieAcceptAll: "Accept all", cookieRejectAll: "Reject non-essential", cookieCustomize: "Customize",
    cookieEssential: "Essential cookies", cookieEssentialDesc: "Authentication, session, security. Always active.",
    cookieAnalytics: "Analytics cookies", cookieAnalyticsDesc: "Improve user experience. Anonymised.",
    cookieMarketing: "Marketing cookies", cookieMarketingDesc: "Personalised offers. Off by default.",
    cookieSavePrefs: "Save my preferences",
    cookieLearnMore: "Privacy policy",
    // Legal / T&Cs
    mentionsLegales: "Legal notices", cgu: "T&Cs", cgv: "T&Cs (Sales)", privacyPolicy: "Privacy policy",
    legalFooter: "Legal notices · T&Cs · Privacy policy · Mediator",
    mentionsTitle: "Legal Notices — LOCKR",
    mentionsEditor: "Publisher: LOCKR SAS — Share capital: €10,000 — SIRET: 000 000 000 00000 — RCS Paris",
    mentionsHost: "Hosting: Vercel Inc. — 340 Pine Street, San Francisco, CA — USA",
    mentionsDPO: "DPO (Data Protection Officer): dpo@lockr.fr",
    mentionsMediateur: "Consumer mediator: CM2C — 14 rue Saint-Jean 75017 Paris — mediateur@cm2c.net",
    mentionsCnil: "Data controller: LOCKR SAS — GDPR compliant (EU 2016/679)",
    cguAccept: "I accept the T&Cs and privacy policy",
    cguRequired: "You must accept the T&Cs to continue",
    cguLink: "Read T&Cs",
    liabClientAccept: "I acknowledge that LOCKR is a mere connecting intermediary: the service contract is concluded directly and exclusively with the intervening craftsman, who is solely responsible for the performance, quality and any damage related to his intervention. Any claim shall be brought against the craftsman and his professional liability insurance.",
    liabProAccept: "As an independent professional, I acknowledge that I am solely responsible for my interventions, their compliance and any damage caused, to the exclusion of any liability of LOCKR. I certify that I hold valid professional liability insurance covering my services and undertake to indemnify and hold LOCKR harmless against any client claim related to my interventions.",
    liabEntAccept: "As a company, we acknowledge that we are solely responsible for the interventions carried out by our technicians, their compliance and any damage caused, to the exclusion of any liability of LOCKR. We certify that we hold valid professional liability insurance covering our services and undertake to indemnify and hold LOCKR harmless against any client claim related to our interventions.",
    liabRequired: "You must accept this liability clause to continue",
    // GDPR rights
    rgpdTitle: "Your GDPR rights", rgpdRightsTitle: "Your personal data rights",
    rgpdAccess: "Right of access — request a copy of your data",
    rgpdRectif: "Right to rectification — correct inaccurate data",
    rgpdErase: "Right to erasure — delete your account and data",
    rgpdPorta: "Right to portability — export your data (JSON/CSV)",
    rgpdOppose: "Right to object — opt out of marketing processing",
    rgpdLimit: "Right to restriction — limit use of your data",
    rgpdContact: "Contact DPO: dpo@lockr.fr — Response time: 30 days",
    rgpdCnil: "CNIL complaint: cnil.fr/plaintes",
    rgpdRequest: "Submit a GDPR request",
    rgpdRequestSent: "Request sent — response within 30 days",
    rgpdExport: "Export my data", rgpdDelete: "Delete my account",
    rgpdDeleteConfirm: "Are you sure? This action is irreversible.",
    // Admin digital compliance
    adminDigitalTab: "Digital Compliance",
    digitalConformiteTitle: "Digital Compliance & Digital Laws",
    digitalConformiteScore: "Overall compliance score",
    digitalLaws: [
      { id: "rgpd", label: "GDPR / EU Regulation 2016/679", color: "#2563eb", desc: "Personal data protection. Consent, DPO, processing register, breach notification within 72h.", items: ["Processing register up to date","DPO appointed (or exemption justified)","Cookie consent compliant (opt-in)","Privacy policy accessible","CNIL breach notification < 72h","Retention periods defined","DPA signed with sub-processors"] },
      { id: "lcen", label: "LCEN — Digital Economy Trust Act (2004)", color: "#7c3aed", desc: "Mandatory legal notices on any commercial website/app, hosting liability.", items: ["Legal notices published (publisher, host)","T&Cs/Sales T&Cs accessible before purchase","14-day right of withdrawal mentioned","Consumer mediator listed","Electronic contracts archived 10 years","Order acknowledgement sent electronically"] },
      { id: "dsa", label: "DSA — Digital Services Act (EU 2022/2065)", color: "#059669", desc: "Obligations for online marketplaces: illegal content reporting, algorithmic transparency.", items: ["Illegal listing reporting mechanism","Transparency on algorithmic recommendations","Single point of contact designated","Annual transparency report (if >45M users)","Moderation policy published","Fake review prevention"] },
      { id: "nis2", label: "NIS2 — Cybersecurity Directive (EU 2022/2555)", color: "#dc2626", desc: "Enhanced cybersecurity for essential and digital service operators.", items: ["IT security policy documented","Cyber incident management (detection + response)","Regular penetration testing","MFA enabled for all admin access","Data in transit encrypted (TLS 1.3)","Data at rest encrypted","Regular tested backups","Cybersecurity training for teams"] },
      { id: "sren", label: "SREN Act — Digital Security & Regulation (France 2024)", color: "#d97706", desc: "French law transposing DSA + new cyber obligations, filtering, digital identity.", items: ["Illegal content blocking (CSAM, terrorism)","France Connect+ digital identity compatible","Parental filter accessible","Users informed of online risks","Cooperation with ANSSI on major incidents"] },
      { id: "rgaa", label: "RGAA v4 — Web Accessibility (Decree 2019-768)", color: "#0891b2", desc: "Accessibility compliance for public services and companies >€250M revenue. Best practice for all.", items: ["Accessibility statement published","Colour contrasts compliant (AA minimum)","Full keyboard navigation","Image alt text","Video subtitles","Accessible forms (labels, errors)"] },
      { id: "eprivacy", label: "ePrivacy Directive — Cookies (CNIL 2020)", color: "#16a34a", desc: "Opt-in consent mandatory for all non-essential cookies. Max duration 13 months.", items: ["Cookie banner compliant (opt-in)","Reject as easy as accept","Session cookies < 13 months","No cookie wall (no conditional access)","Cookie list published","Analytics anonymised or consented"] },
      { id: "tvafraude", label: "Anti-VAT Fraud Act (France 2018) — POS Software", color: "#be185d", desc: "Certified NF525 (or equivalent) POS software. Transaction data immutability.", items: ["NF525-certified POS software","Immutable transaction data","Complete payment audit trail","Software publisher certificate","Transactions archived 6 years"] },
      { id: "pcidss", label: "PCI-DSS v4 — Payment Card Security", color: "#9333ea", desc: "Security standard for processing payment card data.", items: ["PCI-DSS certified PSP used","No card data stored in plain text","HTTPS on all payment pages","3DS2 (strong auth SCA/PSD2) enabled","Regular vulnerability testing","Access logs kept 1 year"] },
    ],
  }
};

const T = {
  bg: "#ffffff", surface: "#ffffff", card: "#f8f9ff", border: "rgba(0,0,0,.08)",
  borderHi: "rgba(201,160,48,.45)", accent: "#c9a030", accent2: "#e8c55a",
  success: "#1e9e6b", warn: "#d97706", danger: "#dc2626",
  textHi: "#1c1c1c", textMid: "rgba(28,28,28,.55)", textLo: "rgba(28,28,28,.38)",
  grad: "linear-gradient(135deg,#c9a030,#a87820)", gradBtn: "linear-gradient(135deg,#c9a030,#a87820)",
  gold: "#c9a030",
};


/* ─── COUNTRY CODES ─── */
const COUNTRY_CODES = [
  { code: "+33", flag: "🇫🇷", name: "France" },
  { code: "+1", flag: "🇺🇸", name: "USA/Canada" },
  { code: "+44", flag: "🇬🇧", name: "Royaume-Uni" },
  { code: "+49", flag: "🇩🇪", name: "Allemagne" },
  { code: "+34", flag: "🇪🇸", name: "Espagne" },
  { code: "+39", flag: "🇮🇹", name: "Italie" },
  { code: "+32", flag: "🇧🇪", name: "Belgique" },
  { code: "+41", flag: "🇨🇭", name: "Suisse" },
  { code: "+351", flag: "🇵🇹", name: "Portugal" },
  { code: "+31", flag: "🇳🇱", name: "Pays-Bas" },
  { code: "+212", flag: "🇲🇦", name: "Maroc" },
  { code: "+213", flag: "🇩🇿", name: "Algérie" },
  { code: "+216", flag: "🇹🇳", name: "Tunisie" },
  { code: "+221", flag: "🇸🇳", name: "Sénégal" },
  { code: "+225", flag: "🇨🇮", name: "Côte d'Ivoire" },
  { code: "+237", flag: "🇨🇲", name: "Cameroun" },
  { code: "+243", flag: "🇨🇩", name: "RD Congo" },
  { code: "+52", flag: "🇲🇽", name: "Mexique" },
  { code: "+55", flag: "🇧🇷", name: "Brésil" },
  { code: "+61", flag: "🇦🇺", name: "Australie" },
  { code: "+81", flag: "🇯🇵", name: "Japon" },
  { code: "+82", flag: "🇰🇷", name: "Corée du Sud" },
  { code: "+86", flag: "🇨🇳", name: "Chine" },
  { code: "+91", flag: "🇮🇳", name: "Inde" },
  { code: "+971", flag: "🇦🇪", name: "Émirats" },
  { code: "+966", flag: "🇸🇦", name: "Arabie Saoudite" },
  { code: "+7", flag: "🇷🇺", name: "Russie" },
  { code: "+380", flag: "🇺🇦", name: "Ukraine" },
  { code: "+48", flag: "🇵🇱", name: "Pologne" },
  { code: "+20", flag: "🇪🇬", name: "Égypte" },
];

/* ─── PHONE INPUT COMPONENT ─── */
function PhoneInput({ value, onChange, placeholder }) {
  const [countryCode, setCountryCode] = useState("+33");
  const [localNum, setLocalNum] = useState(() => (value && value.startsWith("+33") ? value.slice(3) : ""));
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState("");
  const dropRef = useRef(null);

  const filtered = COUNTRY_CODES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.includes(search)
  );

  useEffect(() => {
    const handleClick = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setShowDropdown(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleNumChange = useCallback((e) => {
    const v = e.target.value;
    setLocalNum(v);
    onChange(countryCode + v);
  }, [countryCode, onChange]);

  const selectCode = useCallback((code) => {
    setCountryCode(code);
    onChange(code + localNum);
    setShowDropdown(false);
    setSearch("");
  }, [localNum, onChange]);

  const current = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  return (
    <div style={{ position: "relative" }} ref={dropRef}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowDropdown(d => !d)}
          style={{
            background: "rgba(0,0,0,.03)",
            border: "1px solid rgba(0,0,0,.08)",
            borderRadius: 10,
            color: T.textHi,
            fontSize: 13,
            padding: "12px 10px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
            flexShrink: 0,
            fontFamily: "'Inter',sans-serif",
          }}
        >
          <span>{current.flag}</span>
          <span>{current.code}</span>
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <input
          className="lk-input"
          value={localNum}
          onChange={handleNumChange}
          placeholder={placeholder || "6 12 34 56 78"}
          type="tel"
          style={{ flex: 1 }}
        />
      </div>
      {showDropdown && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 9999,
          background: T.surface, border: "1px solid rgba(0,0,0,.08)",
          borderRadius: 12, minWidth: 240, maxHeight: 280, overflow: "hidden",
          display: "flex", flexDirection: "column", marginTop: 4,
          boxShadow: "0 8px 32px rgba(0,0,0,.5)"
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
            <input
              className="lk-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un pays…"
              style={{ fontSize: 12, padding: "8px 10px" }}
              autoFocus
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => selectCode(c.code)}
                style={{
                  width: "100%", background: c.code === countryCode ? "rgba(28,28,28,.06)" : "none",
                  border: "none", padding: "10px 14px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                <span style={{ fontSize: 18 }}>{c.flag}</span>
                <span style={{ color: T.textHi, fontSize: 13, flex: 1 }}>{c.name}</span>
                <span style={{ color: T.textMid, fontSize: 12 }}>{c.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── DATA ─── */
// Artisans réels (pas de faux) — uniquement utilisés en mode démo
const DEMO_ARTISANS = [
  { id: "a1", nom: "Karim Benali", note: 4.9, avis: 127, tarif: 90, distance: 1.2, dispo: true, certif: "RGE Certifié", color: "#5b8def", tel: "0601020304", ville: "Paris", lat: 48.8566, lng: 2.3522, isDemo: true, transport: "voiture", metier: "serrurier" },
  { id: "a2", nom: "Youssef Mrani", note: 4.7, avis: 89, tarif: 80, distance: 2.1, dispo: true, certif: "Qualibat", color: "#7b6ef6", tel: "0605060708", ville: "Paris", lat: 48.860, lng: 2.340, isDemo: true, transport: "scooter", metier: "serrurier" },
  { id: "a3", nom: "Ahmed Tazi", note: 4.8, avis: 203, tarif: 95, distance: 3.4, dispo: false, certif: "Pro Certifié", color: "#3ecf8e", tel: "0609101112", ville: "Paris", lat: 48.850, lng: 2.360, isDemo: true, transport: "voiture", metier: "serrurier" },
  { id: "a4", nom: "Thomas Leclerc", note: 4.6, avis: 54, tarif: 75, distance: 4.8, dispo: true, certif: "Artisan Agréé", color: "#f5a623", tel: "0612131415", ville: "Lyon", lat: 45.764, lng: 4.834, isDemo: true, transport: "scooter", metier: "serrurier" },
  // Plombiers
  { id: "a5", nom: "Marc Fontaine", note: 4.8, avis: 92, tarif: 85, distance: 1.8, dispo: true, certif: "Qualibat", color: "#0ea5e9", tel: "0614151617", ville: "Paris", lat: 48.862, lng: 2.342, isDemo: true, transport: "voiture", metier: "plombier" },
  { id: "a6", nom: "Julien Moreau", note: 4.6, avis: 64, tarif: 75, distance: 3.2, dispo: true, certif: "Pro Certifié", color: "#38bdf8", tel: "0618192021", ville: "Paris", lat: 48.858, lng: 2.352, isDemo: true, transport: "scooter", metier: "plombier" },
  // Électriciens
  { id: "a7", nom: "Nicolas Laurent", note: 4.9, avis: 148, tarif: 90, distance: 2.0, dispo: true, certif: "RGE Certifié", color: "#f59e0b", tel: "0622232425", ville: "Paris", lat: 48.868, lng: 2.335, isDemo: true, transport: "voiture", metier: "electricien" },
  { id: "a8", nom: "David Petit", note: 4.7, avis: 77, tarif: 80, distance: 2.9, dispo: false, certif: "Qualibat", color: "#fbbf24", tel: "0626272829", ville: "Paris", lat: 48.855, lng: 2.358, isDemo: true, transport: "voiture", metier: "electricien" },
  // Chauffagistes
  { id: "a9", nom: "Pierre Rousseau", note: 4.8, avis: 113, tarif: 95, distance: 1.5, dispo: true, certif: "RGE Certifié", color: "#ef4444", tel: "0630313233", ville: "Paris", lat: 48.870, lng: 2.328, isDemo: true, transport: "voiture", metier: "chauffagiste" },
  { id: "a10", nom: "Antoine Bernard", note: 4.5, avis: 58, tarif: 85, distance: 3.7, dispo: true, certif: "Pro Certifié", color: "#f87171", tel: "0634353637", ville: "Lyon", lat: 45.760, lng: 4.840, isDemo: true, transport: "voiture", metier: "chauffagiste" },
];

const PROBLEMES = [
  // ── Serrurier ──
  { id: "ouverture",   metier: "serrurier",    label: "Porte claquée",           labelEn: "Locked out",              urgence: true,  desc: "Ouverture sans destruction",          descEn: "Non-destructive opening" },
  { id: "serrure",     metier: "serrurier",    label: "Changer la serrure",       labelEn: "Change the lock",         urgence: false, desc: "Cylindre ou serrure multipoints",     descEn: "Cylinder or multipoint lock" },
  { id: "blindage",    metier: "serrurier",    label: "Blindage de porte",        labelEn: "Door reinforcement",      urgence: false, desc: "Renforcement anti-effraction",        descEn: "Anti-burglary reinforcement" },
  { id: "digicode",    metier: "serrurier",    label: "Badge / Digicode",         labelEn: "Badge / Digicode",        urgence: false, desc: "Installation ou remplacement",        descEn: "Installation or replacement" },
  { id: "coffre",      metier: "serrurier",    label: "Coffre-fort bloqué",       labelEn: "Blocked safe",            urgence: true,  desc: "Ouverture sans dommage",              descEn: "Opening without damage" },
  { id: "serrure_autre", metier: "serrurier",  label: "Autre serrurerie",         labelEn: "Other locksmith work",    urgence: false, desc: "Décrivez votre besoin",               descEn: "Describe your need" },
  // ── Clé voiture (sous serrurier) ──
  { id: "cle_voiture_duplicata", metier: "serrurier", label: "Duplicata clé voiture", labelEn: "Car key duplicate", urgence: false, desc: "Copie de clé auto toutes marques", descEn: "Car key copy all brands" },
  { id: "cle_voiture_remplacement", metier: "serrurier", label: "Clé de remplacement", labelEn: "Replacement car key", urgence: true, desc: "Clé perdue ou cassée", descEn: "Lost or broken key" },
  { id: "cle_voiture_telecommande", metier: "serrurier", label: "Programmation télécommande", labelEn: "Remote programming", urgence: false, desc: "Programmation télécommande véhicule", descEn: "Vehicle remote programming" },
  { id: "cle_voiture_ouverture", metier: "serrurier", label: "Ouverture véhicule", labelEn: "Vehicle opening", urgence: true, desc: "Clé enfermée dans le véhicule", descEn: "Key locked inside vehicle" },
  { id: "cle_voiture_cassee", metier: "serrurier", label: "Clé cassée dans contact", labelEn: "Key broken in ignition", urgence: true, desc: "Extraction clé cassée dans contact", descEn: "Broken key extraction from ignition" },
  // ── Rideaux métalliques ──
  { id: "rideaux_install",   metier: "fermetures", label: "Installation rideau métallique",  labelEn: "Metal shutter installation", urgence: false, desc: "Installation neuve", descEn: "New installation" },
  { id: "rideaux_rep",       metier: "fermetures", label: "Réparation rideau métallique",    labelEn: "Metal shutter repair",       urgence: false, desc: "Réparation toutes pannes", descEn: "All fault repair" },
  { id: "rideaux_deblocage", metier: "fermetures", label: "Déblocage rideau métallique",     labelEn: "Metal shutter unlocking",    urgence: true,  desc: "Déblocage d'urgence", descEn: "Emergency unlocking" },
  { id: "rideaux_motorisation", metier: "fermetures", label: "Motorisation rideau",          labelEn: "Shutter motorisation",       urgence: false, desc: "Ajout moteur électrique", descEn: "Electric motor addition" },
  // ── Volets roulants ──
  { id: "volets_install",    metier: "fermetures", label: "Installation volet roulant",      labelEn: "Rolling shutter installation", urgence: false, desc: "Pose volet roulant", descEn: "Rolling shutter installation" },
  { id: "volets_rep",        metier: "fermetures", label: "Réparation volet roulant",        labelEn: "Rolling shutter repair",       urgence: false, desc: "Réparation mécanisme", descEn: "Mechanism repair" },
  { id: "volets_deblocage",  metier: "fermetures", label: "Déblocage volet roulant",         labelEn: "Rolling shutter unlocking",    urgence: true,  desc: "Volet bloqué ou coincé", descEn: "Blocked or stuck shutter" },
  { id: "volets_motorisation", metier: "fermetures", label: "Motorisation volet roulant",    labelEn: "Rolling shutter motorisation", urgence: false, desc: "Motorisation électrique", descEn: "Electric motorisation" },
  { id: "volets_lame",       metier: "fermetures", label: "Remplacement lame volet",         labelEn: "Shutter slat replacement",     urgence: false, desc: "Remplacement lames cassées", descEn: "Broken slat replacement" },
  // ── Porte de garage ──
  { id: "garage_basculante", metier: "fermetures", label: "Porte garage basculante",         labelEn: "Tilting garage door",          urgence: false, desc: "Porte basculante manuelle/auto", descEn: "Manual/automatic tilting door" },
  { id: "garage_sectionnelle", metier: "fermetures", label: "Porte garage sectionnelle",     labelEn: "Sectional garage door",        urgence: false, desc: "Porte sectionnelle panneaux", descEn: "Panel sectional door" },
  { id: "garage_sequentielle", metier: "fermetures", label: "Porte garage séquentielle",     labelEn: "Sequential garage door",       urgence: false, desc: "Porte séquentielle latérale", descEn: "Lateral sequential door" },
  { id: "garage_motorisation", metier: "fermetures", label: "Motorisation porte garage",     labelEn: "Garage door motorisation",     urgence: false, desc: "Ajout moteur ouverture auto", descEn: "Auto opening motor addition" },
  { id: "garage_rep",        metier: "fermetures", label: "Réparation porte garage",         labelEn: "Garage door repair",           urgence: false, desc: "Réparation mécanisme ou moteur", descEn: "Mechanism or motor repair" },
  // ── Portail ──
  { id: "portail_battant",   metier: "fermetures", label: "Portail battant",                 labelEn: "Swing gate",                   urgence: false, desc: "Installation ou réparation portail battant", descEn: "Swing gate installation or repair" },
  { id: "portail_coulissant",metier: "fermetures", label: "Portail coulissant",              labelEn: "Sliding gate",                 urgence: false, desc: "Installation ou réparation portail coulissant", descEn: "Sliding gate installation or repair" },
  { id: "portail_motorisation", metier: "fermetures", label: "Motorisation portail",         labelEn: "Gate motorisation",            urgence: false, desc: "Ajout moteur électrique portail", descEn: "Electric motor for gate" },
  { id: "portail_telecommande", metier: "fermetures", label: "Télécommande portail",         labelEn: "Gate remote control",          urgence: false, desc: "Remplacement ou programmation télécommande", descEn: "Remote replacement or programming" },
  { id: "portail_rep",       metier: "fermetures", label: "Réparation portail",              labelEn: "Gate repair",                  urgence: false, desc: "Réparation toutes pannes portail", descEn: "All gate fault repair" },
  // ── Plombier ──
  { id: "fuite_eau",   metier: "plombier",     label: "Fuite d'eau urgente",      labelEn: "Urgent water leak",       urgence: true,  desc: "Détection et réparation rapide",      descEn: "Fast detection and repair" },
  { id: "debouchage",  metier: "plombier",     label: "Débouchage canalisation",  labelEn: "Drain unclogging",        urgence: true,  desc: "Évier, douche, WC, colonne",          descEn: "Sink, shower, toilet, pipe" },
  { id: "chauffe_eau", metier: "plombier",     label: "Chauffe-eau / Ballon",     labelEn: "Water heater / Boiler",   urgence: false, desc: "Panne, fuite ou remplacement",        descEn: "Failure, leak or replacement" },
  { id: "robinetterie",metier: "plombier",     label: "Robinetterie / Mitigeur",  labelEn: "Tap / Mixer",             urgence: false, desc: "Réparation ou installation",          descEn: "Repair or installation" },
  { id: "wc",          metier: "plombier",     label: "WC / Chasse d'eau",        labelEn: "Toilet / Flush",          urgence: false, desc: "Fuite, bruit ou remplacement",        descEn: "Leak, noise or replacement" },
  { id: "salle_bain",  metier: "plombier",     label: "Salle de bain complète",   labelEn: "Full bathroom",           urgence: false, desc: "Installation ou rénovation",          descEn: "Installation or renovation" },
  { id: "plomb_autre", metier: "plombier",     label: "Autre plomberie",          labelEn: "Other plumbing",          urgence: false, desc: "Décrivez votre besoin",               descEn: "Describe your need" },
  // ── Électricien ──
  { id: "panne_elec",  metier: "electricien",  label: "Panne électrique",         labelEn: "Power failure",           urgence: true,  desc: "Diagnostic et remise en service",     descEn: "Diagnosis and restart" },
  { id: "disjoncteur", metier: "electricien",  label: "Tableau / Disjoncteur",    labelEn: "Panel / Circuit breaker", urgence: false, desc: "Mise aux normes ou remplacement",     descEn: "Compliance or replacement" },
  { id: "prise",       metier: "electricien",  label: "Prise / Interrupteur",     labelEn: "Socket / Switch",         urgence: false, desc: "Pose ou remplacement",                descEn: "Installation or replacement" },
  { id: "eclairage",   metier: "electricien",  label: "Éclairage / Spots LED",    labelEn: "Lighting / LED Spots",    urgence: false, desc: "Installation ou dépannage",           descEn: "Installation or repair" },
  { id: "domotique",   metier: "electricien",  label: "Domotique / Alarme",       labelEn: "Smart home / Alarm",      urgence: false, desc: "Installation ou programmation",       descEn: "Installation or programming" },
  { id: "tableau_elec",metier: "electricien",  label: "Mise aux normes NF C 15",  labelEn: "Electrical compliance",   urgence: false, desc: "Audit et mise en conformité",         descEn: "Audit and compliance" },
  { id: "elec_autre",  metier: "electricien",  label: "Autre électricité",        labelEn: "Other electrical work",   urgence: false, desc: "Décrivez votre besoin",               descEn: "Describe your need" },
  // ── Chauffagiste ──
  { id: "chaudiere",   metier: "chauffagiste", label: "Chaudière en panne",       labelEn: "Boiler breakdown",        urgence: true,  desc: "Dépannage toutes marques",            descEn: "Repair all brands" },
  { id: "entretien_ch",metier: "chauffagiste", label: "Entretien chaudière",      labelEn: "Boiler maintenance",      urgence: false, desc: "Révision annuelle obligatoire",       descEn: "Annual mandatory service" },
  { id: "radiateur",   metier: "chauffagiste", label: "Radiateur / Robinet TRV",  labelEn: "Radiator / TRV valve",    urgence: false, desc: "Purge, remplacement, pose",           descEn: "Bleed, replace, install" },
  { id: "pac",         metier: "chauffagiste", label: "Pompe à chaleur",          labelEn: "Heat pump",               urgence: false, desc: "Installation ou dépannage PAC",       descEn: "Heat pump install or repair" },
  { id: "clim",        metier: "chauffagiste", label: "Climatisation réversible", labelEn: "Reversible AC",           urgence: false, desc: "Pose, entretien, recharge gaz",       descEn: "Install, maintenance, gas" },
  { id: "plancher_ch", metier: "chauffagiste", label: "Plancher chauffant",       labelEn: "Underfloor heating",      urgence: false, desc: "Installation ou dépannage",           descEn: "Installation or repair" },
  { id: "chauff_autre",metier: "chauffagiste", label: "Autre chauffage",          labelEn: "Other heating work",      urgence: false, desc: "Décrivez votre besoin",               descEn: "Describe your need" },
];

/* Comptes initiaux (injectés une seule fois dans une base vide).
   Les mots de passe sont stockés hachés (PBKDF2) — jamais en clair.
   Comptes de démo : mot de passe « 1234 ». */
const DEMO_PASS = { salt: "cuq4fq7e3lb0y5e2", passHash: "91880192b5613f1bc6c5d75267caf23af51a32174463a4e3c743bc5468a5110b" };
const INIT_ACCOUNTS = [
  { id: "c1", role: "client", nom: "Martin Dupont", email: "client@demo.fr", ...DEMO_PASS, verified: true, isDemo: true, ville: "Paris" },
  { id: "c2", role: "client", nom: "Sophie Bernard", email: "sophie@demo.fr", ...DEMO_PASS, verified: true, isDemo: true, ville: "Paris" },
  { id: "p1", role: "pro", artisanId: "a1", nom: "Karim Benali", email: "karim@demo.fr", ...DEMO_PASS, verified: true, photo: null, ville: "Paris", lat: 48.8566, lng: 2.3522, isDemo: true, dossierStatus: "approved", metiers: ["serrurier"], metier: "serrurier" },
  { id: "p2", role: "pro", artisanId: "a2", nom: "Youssef Mrani", email: "youssef@demo.fr", ...DEMO_PASS, verified: true, photo: null, ville: "Paris", lat: 48.860, lng: 2.340, isDemo: true, dossierStatus: "approved", metiers: ["serrurier"], metier: "serrurier" },
  { id: "p3", role: "pro", artisanId: "a5", nom: "Marc Fontaine",    email: "marc@demo.fr",    ...DEMO_PASS, verified: true, photo: null, ville: "Paris", lat: 48.862, lng: 2.342, isDemo: true, dossierStatus: "approved", metiers: ["plombier"], metier: "plombier" },
  { id: "p4", role: "pro", artisanId: "a6", nom: "Julien Moreau",    email: "julien@demo.fr",  ...DEMO_PASS, verified: true, photo: null, ville: "Paris", lat: 48.858, lng: 2.352, isDemo: true, dossierStatus: "approved", metiers: ["plombier"], metier: "plombier" },
  { id: "p5", role: "pro", artisanId: "a7", nom: "Nicolas Laurent",  email: "nicolas@demo.fr", ...DEMO_PASS, verified: true, photo: null, ville: "Paris", lat: 48.868, lng: 2.335, isDemo: true, dossierStatus: "approved", metiers: ["electricien"], metier: "electricien" },
  { id: "p6", role: "pro", artisanId: "a8", nom: "David Petit",      email: "david@demo.fr",   ...DEMO_PASS, verified: true, photo: null, ville: "Paris", lat: 48.855, lng: 2.358, isDemo: true, dossierStatus: "approved", metiers: ["electricien"], metier: "electricien" },
  { id: "p7", role: "pro", artisanId: "a9", nom: "Pierre Rousseau",  email: "pierre@demo.fr",  ...DEMO_PASS, verified: true, photo: null, ville: "Paris", lat: 48.870, lng: 2.328, isDemo: true, dossierStatus: "approved", metiers: ["chauffagiste"], metier: "chauffagiste" },
  { id: "p8", role: "pro", artisanId: "a10", nom: "Antoine Bernard", email: "antoine@demo.fr", ...DEMO_PASS, verified: true, photo: null, ville: "Lyon",  lat: 45.760, lng: 4.840, isDemo: true, dossierStatus: "approved", metiers: ["chauffagiste"], metier: "chauffagiste" },
  { id: "admin1", role: "admin", nom: "Admin Démo", email: "admin@demo.fr", ...DEMO_PASS, isDemo: true },
  { id: "part1", role: "partenaire", nom: "BâtiPro SARL", email: "contact@batipro.fr", ...DEMO_PASS, verified: true, isDemo: true, dossierStatus: "approved", siret: "12345678900012", rcs: "Paris B 123 456 789", capital: "50 000 €", assurance: "AXA Pro RC n°AX-2024-001", qualibat: "8711 — Serrurerie", tva: "FR12345678900", iban: "FR76 3000 6000 0112 3456 7890 189", secteurs: ["serrurier","plombier"], ville: "Paris", logo: null, statut: "actif", dateContrat: "2024-01-15" },
  { id: "part2", role: "partenaire", nom: "Électro Services SAS", email: "info@electroservices.fr", ...DEMO_PASS, verified: true, isDemo: true, dossierStatus: "approved", siret: "98765432100021", rcs: "Lyon B 987 654 321", capital: "100 000 €", assurance: "Generali Pro n°GEN-2023-445", qualibat: "RGE — QualiElec", tva: "FR98765432100", iban: "FR76 1027 8060 0001 2345 6789 010", secteurs: ["electricien","chauffagiste"], ville: "Lyon", logo: null, statut: "actif", dateContrat: "2023-11-01" },
  { id: "part_lockr", role: "partenaire", nom: "LOCKR — Équipe interne", email: "equipe@demo.fr", ...DEMO_PASS, isDemo: true, internalAccess: true, dossierStatus: "approved", siret: "92345678900012", rcs: "Paris B 923 456 789", capital: "10 000 €", assurance: "AXA France IARD", qualibat: "—", tva: "FR32923456789", iban: "FR76 3000 6000 0112 3456 7890 189", secteurs: ["serrurier","plombier","electricien","chauffagiste","fermetures"], ville: "Paris", logo: null, statut: "actif", dateContrat: "2024-01-01" },
];

const daysAgo = n => new Date(Date.now() - 86400000 * n).toISOString();
const INIT_BOOKINGS = [
  { id: "b0", isDemo: true, clientId: "c1", artisanId: "a1", clientNom: "Martin Dupont", adresse: "12 rue de la Paix, Paris", probleme: "ouverture", montant: 130, statut: "terminée", montantFinal: 130, statutPaiement: "payé", createdAt: daysAgo(5), bonType: "platform" },
  { id: "b1", isDemo: true, clientId: "c1", artisanId: "a1", clientNom: "Martin Dupont", adresse: "12 rue de la Paix, Paris", probleme: "serrure", montant: 95, statut: "terminée", montantFinal: 95, statutPaiement: "en_attente", createdAt: daysAgo(2), bonType: "platform" },
  { id: "b2", isDemo: true, clientId: "c2", artisanId: "a2", clientNom: "Sophie Bernard", adresse: "8 avenue Montaigne, Paris", probleme: "blindage", montant: 350, statut: "terminée", montantFinal: 350, statutPaiement: "payé", createdAt: daysAgo(10), bonType: "platform" },
  { id: "b3", isDemo: true, clientId: "c1", artisanId: "a5", clientNom: "Martin Dupont",  adresse: "12 rue de la Paix, Paris", probleme: "fuite_eau",  montant: 110, statut: "terminée", montantFinal: 110, statutPaiement: "payé", createdAt: daysAgo(3), bonType: "platform" },
  { id: "b4", isDemo: true, clientId: "c2", artisanId: "a7", clientNom: "Sophie Bernard", adresse: "8 avenue Montaigne, Paris", probleme: "panne_elec", montant: 130, statut: "terminée", montantFinal: 130, statutPaiement: "payé", createdAt: daysAgo(7), bonType: "platform" },
  { id: "b5", isDemo: true, clientId: "c1", artisanId: "a9", clientNom: "Martin Dupont",  adresse: "12 rue de la Paix, Paris", probleme: "chaudiere",  montant: 150, statut: "assignée", createdAt: new Date(Date.now() - 3600000).toISOString(), bonType: "platform", clientPos: [48.8686, 2.3313] },
  // Missions de l'entreprise partenaire de démo (BâtiPro)
  { id: "pb1", isDemo: true, partenaireId: "part1", partenaireNom: "BâtiPro SARL", clientId: "ext", clientNom: "Jean Lefebvre", adresse: "34 rue du Faubourg, Paris 10", probleme: "serrure", typeIntervention: "Remplacement serrure 3 points", montant: 280, montantFinal: 280, statut: "terminée", statutPaiement: "payé", technicienId: "tech1", createdAt: daysAgo(3), bonType: "partner" },
  { id: "pb2", isDemo: true, partenaireId: "part1", partenaireNom: "BâtiPro SARL", clientId: "ext", clientNom: "Marie Dubois", adresse: "8 avenue de la République, Paris 11", probleme: "blindage", typeIntervention: "Blindage porte palière", montant: 450, statut: "en_cours", technicienId: "tech2", createdAt: daysAgo(1), bonType: "partner" },
  { id: "pb3", isDemo: true, partenaireId: "part1", partenaireNom: "BâtiPro SARL", clientId: "ext", clientNom: "Pierre Martin", adresse: "22 bd Voltaire, Paris 11", probleme: "ouverture", typeIntervention: "Ouverture porte claquée", montant: 160, statut: "en_attente", technicienId: null, createdAt: new Date(Date.now() - 3600000 * 2).toISOString(), bonType: "partner" },
].map(b => (b.partenaireId || b.techPct ? b : { ...b, techPct: PCT_DEFAULT }));

const INIT_BONS = [
  { id: "bon1", isDemo: true, titre: "Porte claquée urgence", adresse: "15 rue Lepic, Paris 18", probleme: "ouverture", urgence: true, montantEstime: 140, postedBy: "platform", postedByNom: "LOCKR", region: "Paris", lat: 48.884, lng: 2.337, createdAt: new Date(Date.now() - 3600000).toISOString(), techPct: 40 },
  { id: "bon2", isDemo: true, titre: "Changement serrure 3 points", adresse: "42 bd Haussmann, Paris 9", probleme: "serrure", urgence: false, montantEstime: 190, postedBy: "p1", postedByNom: "Karim Benali", region: "Paris", lat: 48.874, lng: 2.330, createdAt: new Date(Date.now() - 7200000).toISOString(), techPct: 35 },
  { id: "bon3", isDemo: true, titre: "Blindage porte appartement", adresse: "8 rue du Commerce, Lyon", probleme: "blindage", urgence: false, montantEstime: 420, postedBy: "platform", postedByNom: "LOCKR", region: "Lyon", lat: 45.750, lng: 4.830, createdAt: new Date(Date.now() - 14400000).toISOString(), techPct: 40 },
  { id: "bon4", isDemo: true, titre: "Fuite sous évier urgent",         adresse: "22 rue Oberkampf, Paris 11", probleme: "fuite_eau",   urgence: true,  montantEstime: 120, postedBy: "platform", postedByNom: "LOCKR", region: "Paris", lat: 48.864, lng: 2.370, createdAt: new Date(Date.now() - 1800000).toISOString(),  techPct: 38 },
  { id: "bon5", isDemo: true, titre: "Tableau électrique hors normes",  adresse: "3 rue de Rivoli, Paris 1",   probleme: "disjoncteur", urgence: false, montantEstime: 280, postedBy: "platform", postedByNom: "LOCKR", region: "Paris", lat: 48.856, lng: 2.348, createdAt: new Date(Date.now() - 5400000).toISOString(),  techPct: 35 },
  { id: "bon6", isDemo: true, titre: "Chaudière Vaillant en panne",     adresse: "18 rue de la Croix, Lyon",   probleme: "chaudiere",   urgence: true,  montantEstime: 200, postedBy: "platform", postedByNom: "LOCKR", region: "Lyon",  lat: 45.755, lng: 4.845, createdAt: new Date(Date.now() - 9000000).toISOString(),  techPct: 40 },
  { id: "bon7", isDemo: true, titre: "Installation pompe à chaleur",    adresse: "5 allée des Roses, Paris 14", probleme: "pac",         urgence: false, montantEstime: 600, postedBy: "platform", postedByNom: "LOCKR", region: "Paris", lat: 48.833, lng: 2.330, createdAt: new Date(Date.now() - 18000000).toISOString(), techPct: 35 },
];

const INIT_LISTINGS = [
  { id: "l1", isDemo: true, proId: "p1", proNom: "Karim Benali", metier: "serrurier", titre: "Perceuse à percussion Bosch GSB 18V-55 — kit complet", desc: "Vendue avec 2 batteries, chargeur et mallette. Très peu utilisée, parfait état. Idéale pour pose de serrures.", prix: 180, categorie: "Outils", etat: "Très bon état", photo: null, tel: "0601020304", createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), sold: false },
  { id: "l2", isDemo: true, proId: "p3", proNom: "Marc Fontaine",  metier: "plombier",  titre: "Lot de raccords à compression 15mm — 50 pièces neuves", desc: "Lot de raccords laiton 15mm, jamais utilisés, achetés en trop. Marque Giacomini.", prix: 45, categorie: "Pièces", etat: "Neuf", photo: null, tel: "0614151617", createdAt: new Date(Date.now() - 86400000 * 5).toISOString(), sold: false },
  { id: "l3", isDemo: true, proId: "p5", proNom: "Nicolas Laurent", metier: "electricien", titre: "Tableau électrique Legrand 13 rangées — neuf sous blister", desc: "Tableau coffret 13 rangées 26 modules. Acheté en double commande, jamais ouvert.", prix: 120, categorie: "Équipements", etat: "Neuf", photo: null, tel: "0622232425", createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), sold: false },
  { id: "l4", isDemo: true, proId: "p7", proNom: "Pierre Rousseau", metier: "chauffagiste", titre: "Chaudière Vaillant ecoTEC plus 24kW — révisée", desc: "Chaudière déposée lors d'un remplacement chez client. Révisée, garantie 6 mois pièces. Idéale dépannage.", prix: 550, categorie: "Équipements", etat: "Occasion", photo: null, tel: "0630313233", createdAt: new Date(Date.now() - 86400000 * 7).toISOString(), sold: false },
  { id: "l5", isDemo: true, proId: "p4", proNom: "Julien Moreau",   metier: "plombier",  titre: "Robinets thermostatiques Danfoss — lot de 8", desc: "Robinets thermostatiques RAV-N + RA-N, déposés lors rénovation. Recondés, propres, fonctionnels.", prix: 60, categorie: "Pièces", etat: "Occasion", photo: null, tel: "0618192021", createdAt: new Date(Date.now() - 86400000 * 1).toISOString(), sold: false },
];

// Ventes demo déjà conclues (pour l'admin)
const INIT_SALES = [
  { id: "s1", isDemo: true, listingId: "demo", vendeurId: "p2", vendeurNom: "Youssef Mrani", acheteurNom: "Karim Benali", metier: "serrurier", titre: "Mallette outils serrurier complète", prix: 220, commission: 33, createdAt: new Date(Date.now() - 86400000 * 12).toISOString() },
  { id: "s2", isDemo: true, listingId: "demo", vendeurId: "p3", vendeurNom: "Marc Fontaine",  acheteurNom: "Julien Moreau", metier: "plombier", titre: "Pompe à vide refroidissement", prix: 150, commission: 22.5, createdAt: new Date(Date.now() - 86400000 * 8).toISOString() },
  { id: "s3", isDemo: true, listingId: "demo", vendeurId: "p5", vendeurNom: "Nicolas Laurent", acheteurNom: "David Petit", metier: "electricien", titre: "Testeur de câble réseau Fluke", prix: 95, commission: 14.25, createdAt: new Date(Date.now() - 86400000 * 4).toISOString() },
];


const INIT_CHAT = [
  { id: "m1", isDemo: true, region: "Paris", auteurId: "p1", auteurNom: "Karim Benali", texte: "Salut les gars, quelqu'un a une référence pour les cylindres Mul-T-Lock ?", createdAt: new Date(Date.now() - 3600000 * 2).toISOString(), photo: null },
  { id: "m2", isDemo: true, region: "Paris", auteurId: "p2", auteurNom: "Youssef Mrani", texte: "Oui je commande chez Pro-Serrurerie, livraison J+1 à Paris.", createdAt: new Date(Date.now() - 3600000).toISOString(), photo: null },
  { id: "m3", isDemo: true, region: "Lyon", auteurId: "p2", auteurNom: "Youssef Mrani", texte: "Bonjour Lyon ! Quelqu'un disponible pour sous-traiter ce soir ?", createdAt: new Date(Date.now() - 7200000).toISOString(), photo: null },
];

/* ─── ICONS ─── */
const Icon = {
  lock: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  key: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>,
  door: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4H3v18h18V8z"/><path d="M13 4v4h4"/><circle cx="15" cy="13" r="1" fill={c}/></svg>,
  shield: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  safe: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="16" rx="2"/><circle cx="12" cy="11" r="3"/><path d="M17 11h2M5 11h2m5-5v2m0 6v2"/></svg>,
  code: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  tool: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  home: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  map: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>,
  pin: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  star: (c="currentColor",s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill={c} stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  check: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x: (c="currentColor",s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  trash: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  arrow: (c="currentColor",s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  back: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  user: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  phone: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  card: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  clock: (c="currentColor",s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  euro: (c="currentColor",s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12M4 14h12M19 6a7 7 0 1 0 0 12"/></svg>,
  bell: (c="currentColor",s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  mail: (c="currentColor",s=28)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  file: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  cam: (c="currentColor",s=32)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  list: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  hist: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-5.4"/></svg>,
  chart: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  chat: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  calendar: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  percent: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  admin: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>,
  send: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  image: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  sign: (c="currentColor",s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  plus: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  warning: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  eye: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  droplet: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M12 2C12 2 4 10.5 4 15a8 8 0 0 0 16 0c0-4.5-8-13-8-13z"/></svg>,
  bolt: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>,
  flame: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M12 2c0 0-8 8-8 14a8 8 0 0 0 16 0c0-3-2-6-2-6s-1 3-4 3c-2 0-3-2-3-4 0-2 1-4 1-7z"/></svg>,
  settings: (c="currentColor",s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

const PROB_ICONS = {
  // Serrurier
  ouverture: Icon.door, serrure: Icon.key, blindage: Icon.shield, coffre: Icon.safe, digicode: Icon.code, serrure_autre: Icon.tool,
  // Clé voiture
  cle_voiture_duplicata: Icon.key, cle_voiture_remplacement: Icon.key, cle_voiture_telecommande: Icon.key, cle_voiture_ouverture: Icon.door, cle_voiture_cassee: Icon.key,
  // Fermetures
  rideaux_install: Icon.home, rideaux_rep: Icon.tool, rideaux_deblocage: Icon.tool, rideaux_motorisation: Icon.bolt,
  volets_install: Icon.home, volets_rep: Icon.tool, volets_deblocage: Icon.tool, volets_motorisation: Icon.bolt, volets_lame: Icon.tool,
  garage_basculante: Icon.home, garage_sectionnelle: Icon.home, garage_sequentielle: Icon.home, garage_motorisation: Icon.bolt, garage_rep: Icon.tool,
  portail_battant: Icon.home, portail_coulissant: Icon.home, portail_motorisation: Icon.bolt, portail_telecommande: Icon.code, portail_rep: Icon.tool,
  // Plombier
  fuite_eau: Icon.droplet, debouchage: Icon.droplet, chauffe_eau: Icon.droplet, robinetterie: Icon.droplet, wc: Icon.droplet, salle_bain: Icon.droplet, plomb_autre: Icon.tool,
  // Électricien
  panne_elec: Icon.bolt, disjoncteur: Icon.bolt, prise: Icon.bolt, eclairage: Icon.bolt, domotique: Icon.bolt, tableau_elec: Icon.bolt, elec_autre: Icon.tool,
  // Chauffagiste
  chaudiere: Icon.flame, entretien_ch: Icon.flame, radiateur: Icon.flame, pac: Icon.flame, clim: Icon.flame, plancher_ch: Icon.flame, chauff_autre: Icon.tool,
};

const METIERS = [
  { id: "serrurier",    label: "Serrurier",    labelEn: "Locksmith",        color: "#1e3a8a", icon: Icon.key,     desc: "Ouverture, serrure, blindage", descEn: "Opening, lock, reinforcement",
    photo: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    heroBg: "linear-gradient(135deg,#1e3a8a,#1e40af)" },
  { id: "plombier",     label: "Plombier",     labelEn: "Plumber",          color: "#0ea5e9", icon: Icon.droplet, desc: "Fuite, débouchage, sanitaire",  descEn: "Leak, unclogging, sanitary",
    photo: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=800&q=80",
    heroBg: "linear-gradient(135deg,#0c4a6e,#0369a1)" },
  { id: "electricien",  label: "Électricien",  labelEn: "Electrician",      color: "#f59e0b", icon: Icon.bolt,    desc: "Panne, tableau, installation",  descEn: "Failure, panel, installation",
    photo: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&q=80",
    heroBg: "linear-gradient(135deg,#78350f,#d97706)" },
  { id: "chauffagiste", label: "Chauffagiste", labelEn: "Heating engineer", color: "#ef4444", icon: Icon.flame,   desc: "Chaudière, PAC, radiateur",     descEn: "Boiler, heat pump, radiator",
    photo: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
    heroBg: "linear-gradient(135deg,#7f1d1d,#dc2626)" },
  { id: "fermetures",   label: "Fermetures",   labelEn: "Shutters & Gates", color: "#6d28d9", icon: Icon.home,    desc: "Rideaux, volets, portail, garage", descEn: "Shutters, blinds, gates, garage",
    photo: "https://5.imimg.com/data5/SELLER/Default/2024/2/387831320/WJ/FZ/OR/112702737/collapsible-shutter-gate-1000x1000.jpg",
    heroBg: "linear-gradient(135deg,#4c1d95,#6d28d9)" },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
@import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
*{box-sizing:border-box;margin:0;padding:0}
/* Mode sombre — inversion douce, images et cartes préservées */
.lk-dark{filter:invert(.93) hue-rotate(180deg);background:#151515}
.lk-dark img,.lk-dark video,.lk-dark .leaflet-container{filter:invert(1) hue-rotate(180deg)}
body{font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;background:#fffbf0}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-thumb{background:#d0d0cc;border-radius:4px}
.leaflet-container{background:#e8e8e4 !important}
.leaflet-tile{filter:brightness(1) saturate(0.85) contrast(1.05)}
.leaflet-control-zoom{border:none !important;box-shadow:0 2px 8px rgba(0,0,0,.15) !important}
.leaflet-control-zoom a{background:#fff !important;color:#1c1c1c !important;border:1px solid rgba(0,0,0,.1) !important;border-radius:8px !important}
.leaflet-control-attribution{display:none !important}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes checkPop{0%{transform:scale(0);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes notif{0%{transform:translateY(-80px);opacity:0}15%{transform:translateY(0);opacity:1}80%{transform:translateY(0);opacity:1}100%{transform:translateY(-80px);opacity:0}}
.lk-btn{background:linear-gradient(135deg,#c9a030,#a87820);border:none;border-radius:12px;padding:14px 20px;color:#fff;font-weight:700;font-size:14px;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s;font-family:'Inter',sans-serif;box-shadow:0 2px 12px rgba(201,160,48,.35)}
.lk-btn:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(201,160,48,.45)}
.lk-btn:active{transform:translateY(0)}
.lk-btn:disabled{opacity:.4;cursor:not-allowed;transform:none!important}
.lk-ghost{background:#fff;border:1.5px solid rgba(201,160,48,.25);border-radius:10px;color:#a87820;font-size:13px;font-weight:600;cursor:pointer;padding:9px 14px;transition:all .15s;font-family:'Inter',sans-serif;box-shadow:0 2px 8px rgba(201,160,48,.1)}
.lk-ghost:hover{background:#fffdf0;border-color:rgba(201,160,48,.5);box-shadow:0 4px 14px rgba(201,160,48,.18)}
.lk-card{background:#ffffff;border:1.5px solid rgba(201,160,48,.15);border-radius:16px;transition:all .2s;box-shadow:0 4px 18px rgba(201,160,48,.1)}
.lk-card:hover{border-color:rgba(201,160,48,.38);box-shadow:0 6px 26px rgba(201,160,48,.18)}
.lk-input{width:100%;background:#f8f8f6;border:1px solid rgba(0,0,0,.12);border-radius:10px;color:#1c1c1c;font-size:14px;padding:12px 14px;outline:none;transition:border-color .15s;font-family:'Inter',sans-serif}
.lk-input:focus{border-color:rgba(201,160,48,.5);background:#ffffff;box-shadow:0 0 0 3px rgba(201,160,48,.12)}
.lk-input::placeholder{color:rgba(28,28,28,.3)}
.lk-label{display:block;color:rgba(28,28,28,.45);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;margin-bottom:7px}
.lk-tag-urgent{background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.2);color:#dc2626;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;letter-spacing:.5px;text-transform:uppercase}
.lk-badge-ok{background:rgba(30,158,107,.08);border:1px solid rgba(30,158,107,.18);color:#1e9e6b;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px}
.lk-badge-off{background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.15);color:#dc2626;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px}
.notif-banner{animation:notif 5s ease forwards;position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9999;max-width:420px;width:95%}
select.lk-input option{background:#ffffff;color:#1c1c1c}
/* ─── RESPONSIVE ─── */
@media (min-width: 768px) {
  .lk-desktop-sidebar{width:240px;flex-shrink:0;height:100vh;position:sticky;top:0;background:#fff;border-right:1px solid rgba(0,0,0,.08);display:flex;flex-direction:column;overflow-y:auto}
  .lk-desktop-content{flex:1;overflow-y:auto;min-width:0}
  .lk-desktop-shell{display:flex;min-height:100vh}
  .lk-desktop-main{max-width:900px;margin:0 auto;padding:28px 32px}
  .lk-desktop-2col{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  .lk-desktop-3col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
  .lk-card:hover{transform:translateY(-2px);border-color:rgba(201,160,48,.38);box-shadow:0 8px 30px rgba(201,160,48,.2)}
}
@media (max-width: 767px) {
  .lk-desktop-sidebar{display:none!important}
  .lk-desktop-shell{display:block}
  .lk-desktop-main{padding:14px}
  .lk-desktop-2col{display:block}
  .lk-desktop-3col{display:block}
}
`;

/* ─── MAP HELPERS ─── */
let leafletPromise = null;
function loadLeaflet() {
  // Un seul chargement du script, partagé par toutes les cartes de la page
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise(resolve => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => resolve(window.L);
      s.onerror = () => { leafletPromise = null; resolve(null); };
      document.head.appendChild(s);
    });
  }
  return leafletPromise;
}

/* ─── Geocode une adresse via Nominatim ─── */
async function geocodeAddress(address) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, {
      headers: { "Accept-Language": "fr" }
    });
    const d = await r.json();
    if (d[0]) return [parseFloat(d[0].lat), parseFloat(d[0].lon)];
  } catch { /* géocodage indisponible : pas de coordonnées */ }
  return null;
}

/* ─── Itinéraire OSRM (route routière réelle) ─── */
async function fetchRoute(aLat, aLng, cLat, cLng) {
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${aLng},${aLat};${cLng},${cLat}?overview=full&geometries=geojson`
    );
    const d = await r.json();
    if (d.routes?.[0]) {
      return {
        coords: d.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        durationSec: d.routes[0].duration,
        distanceM: d.routes[0].distance,
      };
    }
  } catch { /* service d'itinéraire indisponible */ }
  // Repli ligne droite : distance à vol d'oiseau, vitesse urbaine moyenne ~25 km/h
  const km = haversineKm({ lat: aLat, lng: aLng }, { lat: cLat, lng: cLng });
  return {
    coords: [[aLat, aLng], [cLat, cLng]],
    durationSec: Math.max(120, (km / 25) * 3600),
    distanceM: km * 1000,
  };
}

/* ─── FLEET MAP — techniciens placés sur le lieu de leur mission en cours ─── */
function FleetMap({ techs = [], tr, focusId = null }) {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const markers = useRef({});
  const statusColor = (st) => st === "en_mission" ? "#c9a030" : st === "actif" ? "#1e9e6b" : "#9ca3af";
  const key = techs.map(t => `${t.id}:${t.lat}:${t.lng}:${t.statut}`).join(",");

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = await loadLeaflet();
      if (!L || dead || !mapRef.current) return;
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
      const map = L.map(mapRef.current, { center: [48.8566, 2.3522], zoom: 12, zoomControl: false, attributionControl: false });
      mapObj.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd" }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      markers.current = {};
      const pts = [];
      techs.forEach(t => {
        if (!t.lat || !t.lng) return;
        const col = statusColor(t.statut);
        const icon = L.divIcon({
          html: `<div style="background:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.25);border:3px solid ${col};font-weight:800;font-size:14px;color:${col};font-family:Inter,sans-serif">${initial(t.prenom)}${initial(t.nom)}</div>`,
          className: "", iconSize: [40, 40], iconAnchor: [20, 20],
        });
        const mk = L.marker([t.lat, t.lng], { icon }).addTo(map);
        const esc = v => String(v || "").replace(/[<>&"]/g, "");
        mk.bindPopup(`<b>${esc(t.prenom)} ${esc(t.nom)}</b><br/>${esc(t.metier)}${t.mission ? `<br/>${esc(t.mission.clientNom)} — ${esc(t.mission.adresse)}` : ""}`);
        markers.current[t.id] = mk;
        pts.push([t.lat, t.lng]);
      });
      if (pts.length === 1) map.setView(pts[0], 14);
      else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50] });
    })();
    return () => { dead = true; if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; } };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const mk = focusId && markers.current[focusId];
    if (mk && mapObj.current) { mapObj.current.flyTo(mk.getLatLng(), 15, { duration: 0.8 }); mk.openPopup(); }
  }, [focusId]);

  return (
    <div style={{ position: "relative", height: 340, background: "#e8eaf0", overflow: "hidden", borderRadius: 16 }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      {techs.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, pointerEvents: "none" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: T.textMid, boxShadow: "0 2px 10px rgba(0,0,0,.12)" }}>{tr?.fleetNoTech || "Aucun technicien en mission"}</div>
        </div>
      )}
    </div>
  );
}

/* ─── LIVE MAP ───
   Suivi réel : la carte affiche la DERNIÈRE POSITION GPS partagée par
   l'artisan (mise à jour depuis son téléphone pendant le trajet) et l'adresse
   du client. Plus aucune animation simulée. */
function LiveMap({ clientPos = null, artisanPos = null, artisanColor = "#5b8def", compact = false, artisan = null, statut = "en_route", lang = "fr" }) {
  const fr = lang !== "en";
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const Lref = useRef(null);
  const artMk = useRef(null);
  const routeLine = useRef(null);
  const lastRouteFrom = useRef(null);
  const fitted = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [eta, setEta] = useState(null);
  const [distKm, setDistKm] = useState(null);
  const H = compact ? 240 : 340;
  const cLat = clientPos?.[0] ?? null, cLng = clientPos?.[1] ?? null;
  const aLat = artisanPos?.[0] ?? null, aLng = artisanPos?.[1] ?? null;

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = await loadLeaflet();
      if (!L || dead || !mapRef.current || mapObj.current) return;
      Lref.current = L;
      const center = cLat != null ? [cLat, cLng] : aLat != null ? [aLat, aLng] : [48.8566, 2.3522];
      const map = L.map(mapRef.current, { center, zoom: 14, zoomControl: false, attributionControl: false });
      mapObj.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd" }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      if (cLat != null) {
        const clientIcon = L.divIcon({
          html: `<div style="position:relative;width:22px;height:22px"><div style="position:absolute;inset:0;border-radius:50%;background:#1a56db;opacity:.2;animation:uberPulse 1.8s ease-out infinite"></div><div style="position:absolute;inset:4px;border-radius:50%;background:#1a56db;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(26,86,219,.5)"></div></div>`,
          className: "", iconSize: [22, 22], iconAnchor: [11, 11],
        });
        L.marker([cLat, cLng], { icon: clientIcon, zIndexOffset: 10 }).addTo(map);
      }
      setMapReady(true);
    })();
    return () => {
      dead = true;
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
      artMk.current = null; routeLine.current = null; lastRouteFrom.current = null; fitted.current = false;
      setMapReady(false);
    };
  }, [cLat, cLng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Position de l'artisan : marqueur déplacé + itinéraire recalculé s'il a bougé de plus de 150 m
  useEffect(() => {
    const L = Lref.current, map = mapObj.current;
    if (!mapReady || !L || !map || aLat == null) return;
    if (!artMk.current) {
      const artIcon = L.divIcon({
        html: `<div style="background:#fff;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.22);border:2.5px solid ${artisanColor}"><svg width="24" height="24" viewBox="0 0 40 40" fill="none"><rect x="6" y="16" width="28" height="14" rx="4" fill="${artisanColor}"/><rect x="10" y="10" width="20" height="10" rx="3" fill="${artisanColor}"/><circle cx="12" cy="30" r="4" fill="#333"/><circle cx="28" cy="30" r="4" fill="#333"/></svg></div>`,
        className: "", iconSize: [44, 44], iconAnchor: [22, 22],
      });
      artMk.current = L.marker([aLat, aLng], { icon: artIcon, zIndexOffset: 20 }).addTo(map);
    } else {
      artMk.current.setLatLng([aLat, aLng]);
    }
    if (cLat == null) { map.panTo([aLat, aLng]); return; }
    const moved = !lastRouteFrom.current || haversineKm({ lat: lastRouteFrom.current[0], lng: lastRouteFrom.current[1] }, { lat: aLat, lng: aLng }) > 0.15;
    if (!moved) return;
    lastRouteFrom.current = [aLat, aLng];
    let alive = true;
    fetchRoute(aLat, aLng, cLat, cLng).then(route => {
      if (!alive || !mapObj.current) return;
      if (routeLine.current) routeLine.current.setLatLngs(route.coords);
      else routeLine.current = L.polyline(route.coords, { color: artisanColor, weight: 5, opacity: .85, lineCap: "round" }).addTo(mapObj.current);
      setEta(Math.round(route.durationSec / 60));
      setDistKm((route.distanceM / 1000).toFixed(1));
      if (!fitted.current) { mapObj.current.fitBounds(L.latLngBounds([[aLat, aLng], [cLat, cLng]]), { padding: [60, 60] }); fitted.current = true; }
    });
    return () => { alive = false; };
  }, [aLat, aLng, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const nom = artisan?.nom || (fr ? "Votre artisan" : "Your craftsman");
  let title, sub, ok = false;
  if (statut === "en_cours") { ok = true; title = fr ? "Artisan sur place" : "Craftsman on site"; sub = fr ? "L'intervention est en cours." : "The intervention is in progress."; }
  else if (statut === "en_route") {
    title = eta != null ? `${eta} min${distKm ? ` · ${distKm} km` : ""}` : (fr ? "En route" : "On the way");
    sub = aLat != null ? `${nom} ${fr ? "est en route" : "is on the way"}` : `${nom} ${fr ? "est en route (position non partagée)" : "is on the way (location not shared)"}`;
  } else { title = fr ? "Intervention confirmée" : "Booking confirmed"; sub = fr ? `${nom} vous prévient dès son départ.` : `${nom} will let you know when leaving.`; }

  return (
    <div style={{ position: "relative", height: H, background: "#e8eaf0", overflow: "hidden", borderRadius: compact ? 16 : 0 }}>
      <style>{`@keyframes uberPulse{0%{transform:scale(1);opacity:.25}70%{transform:scale(2.6);opacity:0}100%{transform:scale(2.6);opacity:0}}`}</style>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 110, background: "linear-gradient(0deg, rgba(255,255,255,1) 40%, transparent)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 16px 14px", zIndex: 500 }}>
        <div style={{ background: "#fff", borderRadius: 18, padding: "12px 16px", boxShadow: "0 -2px 20px rgba(0,0,0,.1)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: ok ? "#dcfce7" : `${artisanColor}18`, border: ok ? "none" : `2px solid ${artisanColor}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {ok ? Icon.check("#16a34a", 20) : <span style={{ color: artisanColor, fontWeight: 800, fontSize: 18 }}>{initial(artisan?.nom || "A")}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>{title}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
          </div>
          {statut === "en_route" && aLat != null && (
            <div style={{ background: "#fee2e2", borderRadius: 20, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", animation: "blink 1.2s infinite" }} />
              <span style={{ color: "#ef4444", fontSize: 10, fontWeight: 700 }}>LIVE</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Adresse masquée avant acceptation : garde uniquement le quartier/la ville,
   jamais le numéro ni le nom de rue — protection de la vie privée du client. */
function maskAddress(adresse) {
  if (!adresse) return "";
  const parts = adresse.split(",").map(s => s.trim());
  return parts.length > 1 ? parts.slice(1).join(", ") : adresse.replace(/^\d+\s*/, "");
}
/* Itinéraire GPS — préfère les coordonnées GPS exactes (point géographique) à
   l'adresse texte quand elles sont disponibles ; ouvre Google Maps (Waze
   compatible via le même schéma universel sur mobile). */
function openGpsRoute({ lat, lng, adresse } = {}) {
  const dest = (lat && lng) ? `${lat},${lng}` : encodeURIComponent(adresse || "");
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`, "_blank");
}

/* Monogramme LOCKR (le "O" cerclé, coupé) — utilisé comme icône compacte
   partout où le mot complet ne rentre pas (favicon, badges carrés, avatars). */
/* Logo unique LOCKR — un seul fichier (public/logolockr.png), utilisé à la
   fois comme logo dans toute l'app (via ce composant) et comme favicon
   (référencé directement dans index.html). Ratio 1088x320 (≈3.4:1). */
const LOGO_RATIO = 833 / 177; // logo recadré sur le texte (public/logolockr.png)
function Logo({ height = 32, light = false, style }) {
  // "light" bascule le logo (noir) en blanc — pour les fonds sombres/photos
  const filter = light ? "brightness(0) invert(1)" : undefined;
  return <img src="/logolockr.png" alt="LOCKR" style={{ height, width: height * LOGO_RATIO, objectFit: "contain", display: "inline-block", filter, ...style }} />;
}
// Alias rétrocompatibles : toutes les anciennes variantes pointent vers le même fichier.
function LockrLogo({ size = 30, light = false }) {
  return <Logo height={size} light={light} />;
}
function LockrWordmark({ height = 32, light = true }) {
  // Les usages de LockrWordmark étaient tous sur fond sombre — blanc par défaut
  return <Logo height={height} light={light} />;
}

function PayLogo({ id, size = 44 }) {
  const s = { width: size, height: size, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  if (id === "visa") return (
    <div style={{ ...s, background: "#fff", border: "1.5px solid #e2e8f0" }}>
      <svg width={size * 0.72} height={size * 0.28} viewBox="0 0 72 28">
        <text x="0" y="22" fontFamily="Arial,sans-serif" fontWeight="900" fontStyle="italic" fontSize="26" fill="#1a1f71" letterSpacing="-1">VISA</text>
      </svg>
    </div>
  );
  if (id === "mastercard") return (
    <div style={{ ...s, background: "#fff", border: "1.5px solid #e2e8f0" }}>
      <svg width={size * 0.7} height={size * 0.44} viewBox="0 0 44 28">
        <circle cx="16" cy="14" r="13" fill="#eb001b"/>
        <circle cx="28" cy="14" r="13" fill="#f79e1b"/>
        <path d="M22 5.3a13 13 0 0 1 0 17.4A13 13 0 0 1 22 5.3z" fill="#ff5f00"/>
      </svg>
    </div>
  );
  if (id === "cb") return (
    <div style={{ ...s, background: "#0052cc", border: "1.5px solid #0041a3" }}>
      <svg width={size * 0.6} height={size * 0.4} viewBox="0 0 36 24">
        <text x="2" y="19" fontFamily="Arial,sans-serif" fontWeight="900" fontSize="20" fill="#fff">CB</text>
      </svg>
    </div>
  );
  if (id === "paypal") return (
    <div style={{ ...s, background: "#fff", border: "1.5px solid #e2e8f0" }}>
      <svg width={size * 0.75} height={size * 0.55} viewBox="0 0 60 44" fill="none">
        <text x="0" y="32" fontFamily="Arial,sans-serif" fontWeight="900" fontSize="18" fill="#003087">Pay</text>
        <text x="31" y="32" fontFamily="Arial,sans-serif" fontWeight="900" fontSize="18" fill="#009cde">Pal</text>
      </svg>
    </div>
  );
  if (id === "apple") return (
    <div style={{ ...s, background: "#000", flexDirection: "column", gap: 2 }}>
      <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 20 20" fill="white">
        <path d="M14.1 10.7c0-2 1.6-3 1.7-3-.9-1.4-2.4-1.5-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6 1.2 0 1.5.6 2.6.6s1.8-1 2.5-2c.4-.6.8-1.3 1-2-2.2-.8-2.1-3.4-2.1-3.4zM12.3 4.7c.6-.7 1-1.6.9-2.5-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.6-.9 2.5.9.1 1.9-.5 2.6-1.3z"/>
      </svg>
      <span style={{ color: "#fff", fontSize: 9, fontWeight: 700, fontFamily: "-apple-system,Arial,sans-serif", letterSpacing: ".2px" }}>Pay</span>
    </div>
  );
  if (id === "google") return (
    <div style={{ ...s, background: "#fff", border: "1.5px solid #e2e8f0", flexDirection: "column", gap: 1 }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <span style={{ color: "#5f6368", fontSize: 8, fontWeight: 700, fontFamily: "Arial,sans-serif" }}>Pay</span>
    </div>
  );
  if (id === "virement") return (
    <div style={{ ...s, background: "#059669" }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path d="M3 21v-2h18v2H3zm0-14v-2l9-5 9 5v2H3zm2-2h14l-7-3.9L5 5zm7 11c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm-5 0c-.6 0-1-.4-1-1v-7c0-.6.4-1 1-1s1 .4 1 1v7c0 .6-.4 1-1 1zm10 0c-.6 0-1-.4-1-1v-7c0-.6.4-1 1-1s1 .4 1 1v7c0 .6-.4 1-1 1zm-5-5c-.6 0-1-.4-1-1v-3c0-.6.4-1 1-1s1 .4 1 1v3c0 .6-.4 1-1 1z" fill="white"/>
      </svg>
    </div>
  );
  return <div style={{ ...s, background: "#f1f5f9" }} />;
}

const pLabel = (p, lang) => (lang === "en" && p?.labelEn) ? p.labelEn : (p?.label || "");
const pDesc  = (p, lang) => (lang === "en" && p?.descEn)  ? p.descEn  : (p?.desc  || "");

const tStatut = (s, tr) => {
  const map = {
    "terminée": tr.statusTerminee, "en_cours": tr.statusInProgress, "en_attente": tr.statusEnAttente,
    "acceptée": tr.statusAcceptee, "payée": tr.statusPayee, "assignée": tr.statusAssigned,
    "actif": tr.available, "inactif": tr.unavailable, "en_mission": tr.statusInProgress,
    "validé": tr.docValidLabel, "non_fourni": tr.docMissingLabel,
  };
  return map[s] || s;
};

/* ─── DISPATCH PRIORITAIRE ───
   L'admin définit un ordre de priorité (max 15 techniciens). Un bon d'intervention
   est proposé au technicien n°1 pendant 2 minutes ; sans réponse, il défile au
   n°2, etc. Après le dernier de la liste, le bon devient visible par tous. */
const DISPATCH_WINDOW_MS = 2 * 60 * 1000;

function dispatchState(bon, priorityOrder) {
  if (!priorityOrder || priorityOrder.length === 0) return { open: true, idx: -1, remaining: 0 };
  const start = new Date(bon.dispatchTs || bon.createdAt).getTime();
  const idx = Math.floor((Date.now() - start) / DISPATCH_WINDOW_MS);
  if (idx >= priorityOrder.length) return { open: true, idx: -1, remaining: 0 };
  const remaining = DISPATCH_WINDOW_MS - ((Date.now() - start) % DISPATCH_WINDOW_MS);
  return { open: false, idx, current: priorityOrder[idx], remaining };
}

function bonVisibleForPro(bon, artisanId, priorityOrder) {
  // La cascade prioritaire ne concerne que les interventions de la plateforme
  if (bon.postedBy !== "platform") return true;
  if (!priorityOrder || priorityOrder.length === 0) return true;
  // Les bons plateforme sont réservés EXCLUSIVEMENT aux artisans choisis par l'admin
  if (!priorityOrder.includes(artisanId)) return false;
  const st = dispatchState(bon, priorityOrder);
  // Après le tour complet : visible par tous les artisans de la liste (jamais les autres)
  return st.open || st.current === artisanId;
}

/* Virements automatiques (Stripe Connect Express) — l'artisan connecte son IBAN
   chez Stripe ; ensuite chaque paiement client est partagé automatiquement :
   sa part (85 %) lui est versée directement, la commission LOCKR est retenue.
   C'est le serveur qui crée le compte Stripe et vérifie son activation. */
function StripeConnectCard({ lang = "fr", account, compact = false }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const fr = lang !== "en";
  const done = !!account?.stripeOnboarded;

  const activate = async () => {
    setLoading(true); setErr("");
    const r = live ? await startConnectOnboarding() : null;
    if (r?.url) { window.location.href = r.url; return; }
    setErr(live
      ? (fr ? "Les virements automatiques ne sont pas encore disponibles sur la plateforme. Votre part vous est versée par virement LOCKR." : "Automatic payouts are not available on the platform yet. Your share is paid by LOCKR bank transfer.")
      : (fr ? "Version de démonstration : l'inscription Stripe n'est pas disponible." : "Demo version: Stripe registration is not available."));
    setLoading(false);
  };
  const recheck = async () => {
    setLoading(true); setErr("");
    const r = await refreshConnectStatus();
    if (!r?.onboarded) setErr(fr ? "Inscription Stripe pas encore terminée (identité ou IBAN à compléter)." : "Stripe registration not finished yet (identity or IBAN missing).");
    setLoading(false);
  };

  const actions = !done && (
    <>
      <button onClick={activate} disabled={loading} className="lk-btn" style={{ fontSize: 12 }}>
        {loading ? (fr ? "Ouverture…" : "Opening…") : (account?.stripeAccountId ? (fr ? "Terminer l'activation" : "Finish activation") : (fr ? "Activer les virements automatiques" : "Enable automatic payouts"))}
      </button>
      {live && account?.stripeAccountId && (
        <button onClick={recheck} disabled={loading} className="lk-ghost" style={{ width: "100%", fontSize: 12, marginTop: 8 }}>{fr ? "J'ai terminé — vérifier" : "I'm done — check"}</button>
      )}
      {err && <div style={{ color: T.warn, fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>{err}</div>}
    </>
  );
  if (compact) return actions || null;
  return (
    <div className="lk-card" style={{ padding: "18px 20px", marginTop: 20, borderLeft: `4px solid ${done ? T.success : T.accent}` }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 6 }}>💶 {fr ? "Virements automatiques" : "Automatic payouts"}</div>
      <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.6, marginBottom: 12 }}>
        {done
          ? (fr ? "Vos virements automatiques sont activés ✓ — votre part de chaque intervention est versée directement sur votre compte bancaire." : "Automatic payouts enabled ✓ — your share of each intervention is paid directly to your bank account.")
          : (fr ? "Connectez votre IBAN de façon sécurisée (Stripe) pour recevoir automatiquement votre part de chaque intervention." : "Securely connect your IBAN (Stripe) to automatically receive your share of each intervention.")}
      </div>
      {actions}
    </div>
  );
}

/* Modale : générer et envoyer un lien de paiement Stripe à un client
   (SMS, e-mail, copie du lien, ou QR code à scanner sur place). */
function SendPaymentLinkModal({ amount, bookingId, clientNom, clientTel, onClose, lang = "fr" }) {
  const fr = lang !== "en";
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    // Le montant est recalculé par le serveur (reste à payer de l'intervention)
    (live ? createCheckout({ type: "lien_client", ref: bookingId }) : Promise.resolve(null))
      .then(u => { if (alive) { setUrl(u); setLoading(false); } });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const smsBody = fr
    ? `Bonjour, voici le lien pour régler votre intervention LOCKR (${fmt(amount)}) en toute sécurité par carte : ${url || ""}`
    : `Hello, here is the link to securely pay for your LOCKR intervention (${fmt(amount)}) by card: ${url || ""}`;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 9995, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", maxHeight: "90vh", overflowY: "auto", animation: "slideUp .3s ease", fontFamily: "'Inter',sans-serif" }}>
        <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{fr ? "Lien de paiement" : "Payment link"}</div>
          <div style={{ color: T.textLo, fontSize: 12 }}>{fr ? `Pour ${clientNom || "le client"} · ${fmt(amount)}` : `For ${clientNom || "the client"} · ${fmt(amount)}`}</div>
        </div>
        {loading && <div style={{ textAlign: "center", padding: "30px 0", color: T.textLo, fontSize: 13 }}>{fr ? "Génération du lien sécurisé…" : "Generating secure link…"}</div>}
        {!loading && !url && (
          <div style={{ background: "rgba(240,101,101,.07)", border: "1px solid rgba(240,101,101,.2)", borderRadius: 10, padding: "12px 14px", color: T.danger, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
            {live
              ? (fr ? "Paiement en ligne non configuré pour le moment. Contactez l'administrateur LOCKR." : "Online payment not configured yet. Contact the LOCKR administrator.")
              : (fr ? "Version de démonstration : les liens de paiement ne sont pas disponibles." : "Demo version: payment links are not available.")}
          </div>
        )}
        {url && !loading && (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`} alt="QR code paiement" width={180} height={180} style={{ borderRadius: 12, border: "1px solid rgba(0,0,0,.08)" }} />
            </div>
            <div style={{ textAlign: "center", color: T.textLo, fontSize: 11, marginBottom: 18 }}>
              {fr ? "Faites scanner ce QR code au client pour payer sur place par carte." : "Have the client scan this QR code to pay on-site by card."}
            </div>
            <a href={clientTel ? `sms:${clientTel}?&body=${encodeURIComponent(smsBody)}` : `sms:?&body=${encodeURIComponent(smsBody)}`} className="lk-btn" style={{ marginBottom: 10, textDecoration: "none" }}>
              {fr ? "Envoyer par SMS" : "Send by SMS"}
            </a>
            <a href={`mailto:?subject=${encodeURIComponent(fr ? "Votre lien de paiement LOCKR" : "Your LOCKR payment link")}&body=${encodeURIComponent(smsBody)}`} className="lk-ghost" style={{ width: "100%", marginBottom: 10, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {fr ? "Envoyer par e-mail" : "Send by e-mail"}
            </a>
            <button onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }} className="lk-ghost" style={{ width: "100%", marginBottom: 10 }}>
              {copied ? (fr ? "Lien copié ✓" : "Link copied ✓") : (fr ? "Copier le lien" : "Copy link")}
            </button>
          </>
        )}
        <button onClick={onClose} className="lk-ghost" style={{ width: "100%" }}>{fr ? "Fermer" : "Close"}</button>
      </div>
    </div>,
    document.body
  );
}

/* ─── VALIDATIONS COMMUNES ─── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASS = 8;
/* SIRET : 14 chiffres + clé de Luhn (algorithme officiel INSEE) */
function siretValid(v) {
  const d = String(v || "").replace(/\s/g, "");
  if (!/^\d{14}$/.test(d)) return false;
  if (d.startsWith("356000000")) return true; // La Poste : exception officielle
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let n = Number(d[i]);
    if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}
/* IBAN : contrôle de la clé (modulo 97, norme ISO 13616) */
function ibanValid(v) {
  const s = String(v || "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of r) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
}
const emailTaken = (accounts, email) => accounts.some(a => normEmail(a.email) === normEmail(email));
/* Création d'un compte : e-mail normalisé, mot de passe haché */
async function buildAccount(fields, password) {
  return { id: uid(), createdAt: ts(), ...fields, email: normEmail(fields.email), ...(await passwordFields(password)) };
}

/* Case à cocher CGU avec lien réellement cliquable vers le Centre légal */
function CguCheckbox({ checked, onChange, err, tr, openLegal }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: T.accent }} />
        <span style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>
          {tr.cguAccept} — <button type="button" onClick={e => { e.preventDefault(); openLegal && openLegal("cgu"); }} style={{ background: "none", border: "none", padding: 0, color: T.accent, textDecoration: "underline", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{tr.cguLink}</button>
        </span>
      </label>
      {err && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

/* ─── FIELD (hors composant pour éviter le re-mount à chaque frappe) ─── */
function Field({ label, value, onChange, placeholder, type = "text", err, autoComplete = "off" }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="lk-label">{label}</label>
      <input
        type={type}
        className="lk-input"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={onChange}
        style={{ background: err ? "rgba(240,101,101,.06)" : "", borderColor: err ? "rgba(240,101,101,.4)" : "" }}
      />
      {err && <div style={{ color: T.danger, fontSize: 11, marginTop: 5 }}>{err}</div>}
    </div>
  );
}


/* Résultat d'une inscription refusée → erreurs du formulaire */
function registerErrors(code, lang) {
  const msg = authErrorText(code, lang);
  return ["email_used", "invalid_email", "banned"].includes(code) ? { email: msg } : code === "weak_password" ? { pass: msg } : { form: msg };
}
function FormError({ err }) {
  return err ? <div role="alert" style={{ color: T.danger, fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>{err}</div> : null;
}

/* ─── REGISTER CHOICE ─── */
function RegisterChoiceScreen({ onChoice, onBack, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const w = useWindowSize();
  const isDesktop = w >= BP;
  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: isDesktop ? "row" : "column", alignItems: isDesktop ? "stretch" : "center", justifyContent: isDesktop ? "flex-start" : "center", padding: isDesktop ? "0" : "28px 18px" }}>
      <style>{CSS}</style>
      {isDesktop && (
        <div style={{ width: 360, flexShrink: 0, background: "linear-gradient(135deg,#1c1c1c,#2e2e2e)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px" }}>
          <div style={{ marginBottom: 20 }}>
<LockrWordmark height={56} />
          </div>
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: 14, textAlign: "center", lineHeight: 1.7 }}>{tr.appTagline}</div>
        </div>
      )}
      <div style={{ flex: isDesktop ? 1 : undefined, display: "flex", alignItems: "center", justifyContent: "center", padding: isDesktop ? "40px" : "0", width: isDesktop ? undefined : "100%" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 40 }}>
          <button onClick={onBack} className="lk-ghost" style={{ padding: "9px 13px" }}>{Icon.back()}</button>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.textHi, letterSpacing: "-.5px" }}>{tr.createAccount}</div>
            <div style={{ color: T.textLo, fontSize: 13, marginTop: 2 }}>{tr.chooseProfile}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <button onClick={() => onChoice("client")} style={{ background: T.surface, border: `2px solid ${T.border}`, borderRadius: 18, padding: "22px 20px", cursor: "pointer", textAlign: "left", fontFamily: "'Inter',sans-serif", transition: "all .2s", boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
            <div style={{ width: 48, height: 48, background: "rgba(201,160,48,.1)", border: "1.5px solid rgba(201,160,48,.25)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              {Icon.user(T.gold, 22)}
            </div>
            <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{tr.individual}</div>
            <div style={{ color: T.textMid, fontSize: 13, lineHeight: 1.5 }}>{tr.clientDesc}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
              <span style={{ color: T.accent, fontWeight: 600, fontSize: 13 }}>{tr.getStarted}</span>
              {Icon.arrow(T.accent, 13)}
            </div>
          </button>
          <button onClick={() => onChoice("pro")} style={{ background: T.surface, border: `2px solid ${T.border}`, borderRadius: 18, padding: "22px 20px", cursor: "pointer", textAlign: "left", fontFamily: "'Inter',sans-serif", transition: "all .2s", boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
            <div style={{ width: 48, height: 48, background: "rgba(28,28,28,.06)", border: "1.5px solid rgba(28,28,28,.12)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              {Icon.tool(T.accent, 22)}
            </div>
            <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{tr.craftsman}</div>
            <div style={{ color: T.textMid, fontSize: 13, lineHeight: 1.5 }}>{tr.proDesc}</div>
            <div style={{ color: T.textLo, fontSize: 11, marginTop: 6, fontStyle: "italic" }}>{tr.proDocsRequired}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
              <span style={{ color: T.accent, fontWeight: 600, fontSize: 13 }}>{tr.getStarted}</span>
              {Icon.arrow(T.accent, 13)}
            </div>
          </button>

          {/* Entreprise / Partenaire */}
          <button onClick={() => onChoice("entreprise")} style={{ background: "linear-gradient(135deg,rgba(201,160,48,.06),rgba(201,160,48,.02))", border: `2px solid rgba(201,160,48,.35)`, borderRadius: 18, padding: "22px 20px", cursor: "pointer", textAlign: "left", fontFamily: "'Inter',sans-serif", transition: "all .2s", boxShadow: "0 2px 16px rgba(201,160,48,.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ width: 48, height: 48, background: "rgba(201,160,48,.15)", border: "1.5px solid rgba(201,160,48,.35)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {Icon.shield(T.accent, 22)}
              </div>
              <span style={{ background: T.accent, color: "#fff", fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 20, letterSpacing: ".5px" }}>PARTENAIRE</span>
            </div>
            <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{tr.entrepriseChoice}</div>
            <div style={{ color: T.textMid, fontSize: 13, lineHeight: 1.5 }}>{tr.entrepriseDesc}</div>
            <div style={{ color: T.textLo, fontSize: 11, marginTop: 6, fontStyle: "italic" }}>{tr.entrepriseDocsRequired}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
              <span style={{ color: T.accent, fontWeight: 600, fontSize: 13 }}>{tr.getStarted}</span>
              {Icon.arrow(T.accent, 13)}
            </div>
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ─── REGISTER CLIENT ─── */
function RegisterClientScreen({ onBack, onRegister, lang = "fr", openLegal }) {
  const tr = TRANS[lang] || TRANS.fr;
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [ville, setVille] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errs, setErrs] = useState({});
  const [saving, setSaving] = useState(false);
  const [cguOk, setCguOk] = useState(false);
  const [liabOk, setLiabOk] = useState(false);

  const clr = k => setErrs(p => { const e = { ...p }; delete e[k]; return e; });

  const validate = () => {
    const e = {};
    if (!prenom.trim()) e.prenom = tr.firstnameRequired;
    if (!nom.trim()) e.nom = tr.lastnameRequired;
    if (!EMAIL_RE.test(email.trim())) e.email = tr.invalidEmail;
    if (!tel || tel.replace(/\D/g, "").length < 9) e.tel = tr.invalidPhone;
    if (pass.length < MIN_PASS) e.pass = tr.minChars;
    if (pass !== confirm) e.confirm = tr.passMismatch;
    if (!cguOk) e.cgu = tr.cguRequired;
    if (!liabOk) e.liab = tr.liabRequired;
    return e;
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrs(e); return; }
    setSaving(true);
    const r = await onRegister({ role: "client", nom: `${prenom.trim()} ${nom.trim()}`, email, photo: null, ville: ville.trim(), tel, cguAcceptedAt: ts(), liabAcceptedAt: ts() }, pass);
    if (!r.ok) { setSaving(false); setErrs(registerErrors(r.error, lang)); }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", overflowY: "auto", display: "flex", flexDirection: isDesktop ? "row" : "column" }}>
      <style>{CSS}</style>
      {isDesktop && (
        <div style={{ width: 320, flexShrink: 0, background: "linear-gradient(135deg,#1c1c1c,#2e2e2e)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px", minHeight: "100vh" }}>
          <div style={{ marginBottom: 20 }}>
<LockrWordmark height={56} />
          </div>
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: 14, textAlign: "center", lineHeight: 1.7 }}>{tr.appTagline}</div>
        </div>
      )}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: isDesktop ? 520 : 440, width: "100%", margin: "0 auto", padding: "28px 18px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <button onClick={onBack} className="lk-ghost" style={{ padding: "9px 13px" }}>{Icon.back()}</button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.textHi }}>{tr.clientRegisterTitle}</div>
            <div style={{ color: T.textLo, fontSize: 13, marginTop: 2 }}>{tr.clientRegisterSubtitle}</div>
          </div>
        </div>
        <div className="lk-card" style={{ padding: "22px 18px", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label className="lk-label">{tr.firstname}</label>
              <input className="lk-input" value={prenom} placeholder="Jean" autoComplete="off" onChange={e => { setPrenom(e.target.value); clr("prenom"); }} style={{ borderColor: errs.prenom ? "rgba(220,38,38,.4)" : "" }} />
              {errs.prenom && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.prenom}</div>}
            </div>
            <div>
              <label className="lk-label">{tr.lastname}</label>
              <input className="lk-input" value={nom} placeholder="Dupont" autoComplete="off" onChange={e => { setNom(e.target.value); clr("nom"); }} style={{ borderColor: errs.nom ? "rgba(220,38,38,.4)" : "" }} />
              {errs.nom && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.nom}</div>}
            </div>
          </div>
          <Field label={tr.email} value={email} onChange={e => { setEmail(e.target.value); clr("email"); }} placeholder="jean@email.fr" type="email" err={errs.email} autoComplete="email" />
          <div style={{ marginBottom: 14 }}>
            <label className="lk-label">{tr.phone}</label>
            <PhoneInput value={tel} onChange={v => { setTel(v); clr("tel"); }} />
            {errs.tel && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.tel}</div>}
          </div>
          <Field label={tr.city} value={ville} onChange={e => setVille(e.target.value)} placeholder="Paris" err={errs.ville} />
          <div style={{ borderTop: "1px solid rgba(0,0,0,.06)", paddingTop: 18, marginBottom: 8 }}>
            <Field label={tr.password} value={pass} onChange={e => { setPass(e.target.value); clr("pass"); }} placeholder={tr.minChars} type="password" err={errs.pass} autoComplete="new-password" />
            <Field label={tr.confirmPassword} value={confirm} onChange={e => { setConfirm(e.target.value); clr("confirm"); }} placeholder={tr.repeatPassword} type="password" err={errs.confirm} />
          </div>
          <CguCheckbox checked={cguOk} onChange={v => { setCguOk(v); clr("cgu"); }} err={errs.cgu} tr={tr} openLegal={openLegal} />
          {/* Clause de responsabilité — recours contre l'artisan uniquement */}
          <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(201,160,48,.05)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 12 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={liabOk} onChange={e => { setLiabOk(e.target.checked); clr("liab"); }} style={{ marginTop: 3, accentColor: T.accent }} />
              <span style={{ fontSize: 11, color: T.textMid, lineHeight: 1.55 }}>{tr.liabClientAccept}</span>
            </label>
            {errs.liab && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.liab}</div>}
          </div>
          <FormError err={errs.form} />
          <button onClick={submit} disabled={saving} className="lk-btn">{saving ? "…" : <>{tr.createMyAccount} {Icon.arrow("#fff", 14)}</>}</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <span style={{ color: T.textLo, fontSize: 13 }}>{tr.alreadyMember} </span>
          <button onClick={onBack} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", padding: "12px 6px", minHeight: 44 }}>{tr.connectAs}</button>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ─── REGISTER PRO ─── */
function RegisterProScreen({ onBack, onRegister, lang = "fr", openLegal }) {
  const tr = TRANS[lang] || TRANS.fr;
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [step, setStep] = useState(1);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [ville, setVille] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [transport, setTransport] = useState("voiture");
  const [metiers, setMetiers] = useState(["serrurier"]); // plusieurs secteurs possibles
  const [siret, setSiret] = useState("");
  const [iban, setIban] = useState("");
  const [certif, setCertif] = useState("aucune");
  const [idCardFile, setIdCardFile] = useState(null);
  const [insuranceFile, setInsuranceFile] = useState(null);
  const [kbisFile, setKbisFile] = useState(null);
  const [errs, setErrs] = useState({});
  const [saving, setSaving] = useState(false);
  const [cguOk, setCguOk] = useState(false);
  const [liabOk, setLiabOk] = useState(false);
  const idRef = useRef(null);
  const insRef = useRef(null);
  const kbisRef = useRef(null);

  const clr = k => setErrs(p => { const e = { ...p }; delete e[k]; return e; });

  /* Vérification automatique d'un document : format accepté (photo/PDF) et
     taille max 10 Mo. Renvoie null si valide, sinon le message d'erreur. */
  const checkDoc = (f) => {
    if (!f) return lang === "en" ? "File missing" : "Fichier manquant";
    const okType = /\.(jpe?g|png|webp|heic|pdf)$/i.test(f.name) || /^image\/|pdf$/.test(f.type);
    if (!okType) return lang === "en" ? "Invalid format — photo or PDF only" : "Format invalide — photo ou PDF uniquement";
    if (f.size > 10 * 1024 * 1024) return lang === "en" ? "File too large (max 10 MB)" : "Fichier trop lourd (max 10 Mo)";
    return null;
  };

  const validateStep1 = () => {
    const e = {};
    if (!prenom.trim()) e.prenom = tr.firstnameRequired;
    if (!nom.trim()) e.nom = tr.lastnameRequired;
    if (!EMAIL_RE.test(email.trim())) e.email = tr.invalidEmail;
    if (!tel || tel.replace(/\D/g, "").length < 9) e.tel = tr.invalidPhone;
    if (!ville.trim()) e.ville = lang === "en" ? "City required (used to show you nearby jobs)" : "Ville requise (sert à vous proposer les interventions proches)";
    if (pass.length < MIN_PASS) e.pass = tr.minChars;
    if (pass !== confirm) e.confirm = tr.passMismatch;
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e = {};
    if (metiers.length === 0) e.metiers = lang === "en" ? "Select at least one sector" : "Sélectionnez au moins un secteur d'activité";
    if (!siretValid(siret)) e.siret = tr.siretInvalid;
    const idErr = checkDoc(idCardFile); if (idErr) e.idCard = idCardFile ? idErr : tr.idCardRequired;
    const insErr = checkDoc(insuranceFile); if (insErr) e.insurance = insuranceFile ? insErr : tr.insuranceRequired;
    const kbisErr = checkDoc(kbisFile); if (kbisErr) e.kbis = kbisFile ? kbisErr : (lang === "en" ? "Kbis / INSEE certificate required" : "Kbis ou avis de situation INSEE requis");
    if (iban.trim() && !ibanValid(iban)) e.iban = lang === "en" ? "Invalid IBAN" : "IBAN invalide";
    if (!cguOk) e.cgu = tr.cguRequired;
    if (!liabOk) e.liab = tr.liabRequired;
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const goStep2 = () => { if (validateStep1()) setStep(2); };

  const submit = async () => {
    if (!validateStep2()) return;
    setSaving(true);
    const geo = await geocodeAddress(ville.trim());
    const r = await onRegister({
      role: "pro",
      nom: `${prenom.trim()} ${nom.trim()}`, email,
      photo: null, ville: ville.trim(), tel, transport, metier: metiers[0], metiers, siret: siret.replace(/\s/g, ""), iban: iban.replace(/\s/g, ""), certif,
      ...(geo ? { lat: geo[0], lng: geo[1] } : {}),
      hasIdCard: !!idCardFile, hasInsurance: !!insuranceFile, hasKbis: !!kbisFile,
      docNames: { idCard: idCardFile?.name || "", insurance: insuranceFile?.name || "", kbis: kbisFile?.name || "" },
      dossierStatus: "pending", dispo: true,
      cguAcceptedAt: ts(), liabAcceptedAt: ts(),
    }, pass);
    if (!r.ok) {
      setSaving(false);
      const e = registerErrors(r.error, lang);
      setErrs(e);
      if (e.email || e.pass) setStep(1);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", overflowY: "auto", display: "flex", flexDirection: isDesktop ? "row" : "column" }}>
      <style>{CSS}</style>
      {isDesktop && (
        <div style={{ width: 320, flexShrink: 0, background: "linear-gradient(135deg,#1c1c1c,#2e2e2e)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px", minHeight: "100vh", position: "sticky", top: 0, alignSelf: "flex-start" }}>
          <div style={{ marginBottom: 20 }}>
<LockrWordmark height={56} />
          </div>
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: 14, textAlign: "center", lineHeight: 1.7 }}>{tr.joinProLockr}</div>
        </div>
      )}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: isDesktop ? 520 : 480, width: "100%", margin: "0 auto", padding: "28px 18px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <button onClick={step === 1 ? onBack : () => setStep(1)} className="lk-ghost" style={{ padding: "9px 13px" }}>{Icon.back()}</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.textHi }}>{tr.proRegisterTitle}</div>
            <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{tr.stepWord} {step} {tr.ofWord} 2</div>
          </div>
        </div>

        {/* Barre de progression */}
        <div style={{ height: 4, background: "rgba(0,0,0,.07)", borderRadius: 2, marginBottom: 24 }}>
          <div style={{ height: "100%", borderRadius: 2, background: T.grad, width: step === 1 ? "50%" : "100%", transition: "width .4s ease" }} />
        </div>

        {step === 1 && (
          <div className="lk-card" style={{ padding: "22px 18px", marginBottom: 16 }}>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
              {Icon.user(T.accent, 16)} {tr.personalInfo}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label className="lk-label">{tr.firstname}</label>
                <input className="lk-input" value={prenom} placeholder="Jean" autoComplete="off" onChange={e => { setPrenom(e.target.value); clr("prenom"); }} style={{ borderColor: errs.prenom ? "rgba(220,38,38,.4)" : "" }} />
                {errs.prenom && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.prenom}</div>}
              </div>
              <div>
                <label className="lk-label">{tr.lastname}</label>
                <input className="lk-input" value={nom} placeholder="Dupont" autoComplete="off" onChange={e => { setNom(e.target.value); clr("nom"); }} style={{ borderColor: errs.nom ? "rgba(220,38,38,.4)" : "" }} />
                {errs.nom && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.nom}</div>}
              </div>
            </div>
            <Field label={tr.email} value={email} onChange={e => { setEmail(e.target.value); clr("email"); }} placeholder="pro@email.fr" type="email" err={errs.email} autoComplete="email" />
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.phone}</label>
              <PhoneInput value={tel} onChange={v => { setTel(v); clr("tel"); }} />
              {errs.tel && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.tel}</div>}
            </div>
            <Field label={tr.city} value={ville} onChange={e => { setVille(e.target.value); clr("ville"); }} placeholder="Paris" err={errs.ville} />
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.transport}</label>
              <select className="lk-input" value={transport} onChange={e => setTransport(e.target.value)} style={{ cursor: "pointer" }}>
                <option value="voiture">{tr.car}</option>
                <option value="scooter">{tr.scooter}</option>
                <option value="moto">{tr.motorcycle}</option>
                <option value="velo">{tr.bicycle}</option>
                <option value="pied">{tr.onFoot}</option>
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.selectMetier} <span style={{ color: T.textLo, fontWeight: 400, textTransform: "none" }}>({lang === "en" ? "several possible" : "plusieurs possibles"})</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  { id: "serrurier", l: tr.metierSerrurier },
                  { id: "plombier", l: tr.metierPlombier },
                  { id: "electricien", l: tr.metierElectricien },
                  { id: "chauffagiste", l: tr.metierChauffagiste },
                  { id: "fermetures", l: lang === "en" ? "Shutters & gates" : "Fermetures (volets, rideaux, portails)" },
                ].map(m => {
                  const on = metiers.includes(m.id);
                  return (
                    <button key={m.id} type="button"
                      onClick={() => { setMetiers(p => on ? p.filter(x => x !== m.id) : [...p, m.id]); clr("metiers"); }}
                      style={{ background: on ? "rgba(201,160,48,.1)" : "#fff", border: `1.5px solid ${on ? T.accent : T.border}`, borderRadius: 20, padding: "9px 16px", fontSize: 13, fontWeight: 700, color: on ? T.accent : T.textMid, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
                      {on && Icon.check(T.accent, 13)} {m.l}
                    </button>
                  );
                })}
              </div>
              {errs.metiers && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.metiers}</div>}
            </div>
            <div style={{ borderTop: "1px solid rgba(0,0,0,.06)", paddingTop: 18, marginBottom: 8 }}>
              <Field label={tr.password} value={pass} onChange={e => { setPass(e.target.value); clr("pass"); }} placeholder={tr.minChars} type="password" err={errs.pass} autoComplete="new-password" />
              <Field label={tr.confirmPassword} value={confirm} onChange={e => { setConfirm(e.target.value); clr("confirm"); }} placeholder={tr.repeatPassword} type="password" err={errs.confirm} />
            </div>
            <button onClick={goStep2} className="lk-btn">{tr.nextStepDocs} {Icon.arrow("#fff", 14)}</button>
          </div>
        )}

        {step === 2 && (
          <div className="lk-card" style={{ padding: "22px 18px", marginBottom: 16 }}>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              {Icon.shield(T.accent, 16)} {tr.proDocuments}
            </div>
            <div style={{ color: T.textLo, fontSize: 12, marginBottom: 20, lineHeight: 1.5 }}>
              {tr.proDocsLegalNote}
            </div>

            {/* SIRET */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.siretLabel}</label>
              <input className="lk-input" value={siret} onChange={e => { setSiret(e.target.value); clr("siret"); }} placeholder="123 456 789 00015" maxLength={17} style={{ borderColor: errs.siret ? "rgba(220,38,38,.4)" : "" }} />
              {errs.siret && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.siret}</div>}
            </div>

            {/* Certification */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.certifLabel}</label>
              <select className="lk-input" value={certif} onChange={e => setCertif(e.target.value)} style={{ cursor: "pointer" }}>
                <option value="aucune">{tr.noCertif}</option>
                <option value="rge">{tr.certifRgeFull}</option>
                <option value="qualibat">Qualibat</option>
                <option value="qualifelec">Qualifelec</option>
                <option value="artisan_agree">Artisan Agréé</option>
              </select>
            </div>

            {/* Carte d'identité */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.idCardLabel}</label>
              <input type="file" accept="image/*,.pdf" ref={idRef} onChange={e => { const f = e.target.files?.[0]; if (!f) return; const err = checkDoc(f); if (err) { setIdCardFile(null); setErrs(p => ({ ...p, idCard: err })); } else { setIdCardFile(f); clr("idCard"); } }} style={{ display: "none" }} />
              <button type="button" onClick={() => idRef.current?.click()} style={{ width: "100%", background: idCardFile ? "rgba(30,158,107,.06)" : "rgba(0,0,0,.02)", border: `1.5px dashed ${errs.idCard ? "rgba(220,38,38,.5)" : idCardFile ? "rgba(30,158,107,.4)" : "rgba(0,0,0,.15)"}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: "'Inter',sans-serif" }}>
                {idCardFile ? Icon.check(T.success, 18) : Icon.file(T.textLo, 18)}
                <span style={{ color: idCardFile ? T.success : T.textMid, fontSize: 13, fontWeight: 600 }}>
                  {idCardFile ? `${idCardFile.name} — ✓` : tr.uploadIdCard}
                </span>
              </button>
              {errs.idCard && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.idCard}</div>}
            </div>

            {/* Assurance RC Pro */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.insuranceLabel}</label>
              <input type="file" accept="image/*,.pdf" ref={insRef} onChange={e => { const f = e.target.files?.[0]; if (!f) return; const err = checkDoc(f); if (err) { setInsuranceFile(null); setErrs(p => ({ ...p, insurance: err })); } else { setInsuranceFile(f); clr("insurance"); } }} style={{ display: "none" }} />
              <button type="button" onClick={() => insRef.current?.click()} style={{ width: "100%", background: insuranceFile ? "rgba(30,158,107,.06)" : "rgba(0,0,0,.02)", border: `1.5px dashed ${errs.insurance ? "rgba(220,38,38,.5)" : insuranceFile ? "rgba(30,158,107,.4)" : "rgba(0,0,0,.15)"}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: "'Inter',sans-serif" }}>
                {insuranceFile ? Icon.check(T.success, 18) : Icon.shield(T.textLo, 18)}
                <span style={{ color: insuranceFile ? T.success : T.textMid, fontSize: 13, fontWeight: 600 }}>
                  {insuranceFile ? `${insuranceFile.name} — ✓` : tr.uploadInsurance}
                </span>
              </button>
              {errs.insurance && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.insurance}</div>}
            </div>

            {/* Kbis (optionnel) */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.kbisLabel} *</label>
              <input type="file" accept="image/*,.pdf" ref={kbisRef} onChange={e => { const f = e.target.files?.[0]; if (!f) return; const err = checkDoc(f); if (err) { setKbisFile(null); setErrs(p => ({ ...p, kbis: err })); } else { setKbisFile(f); clr("kbis"); } }} style={{ display: "none" }} />
              <button type="button" onClick={() => kbisRef.current?.click()} style={{ width: "100%", background: kbisFile ? "rgba(30,158,107,.06)" : "rgba(0,0,0,.02)", border: `1.5px dashed ${kbisFile ? "rgba(30,158,107,.4)" : "rgba(0,0,0,.15)"}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: "'Inter',sans-serif" }}>
                {kbisFile ? Icon.check(T.success, 18) : Icon.file(T.textLo, 18)}
                <span style={{ color: kbisFile ? T.success : T.textMid, fontSize: 13, fontWeight: 600 }}>
                  {kbisFile ? `${kbisFile.name} — ✓` : tr.uploadKbis}
                </span>
              </button>
              {errs.kbis && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.kbis}</div>}
            </div>

            {/* IBAN */}
            <div style={{ marginBottom: 20 }}>
              <label className="lk-label">{tr.ibanLabel} <span style={{ color: T.textLo, fontWeight: 400, textTransform: "none" }}>({tr.optionalWord})</span></label>
              <input className="lk-input" value={iban} onChange={e => { setIban(e.target.value.toUpperCase()); clr("iban"); }} placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
              {errs.iban && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.iban}</div>}
            </div>

            {/* Avertissement légal */}
            <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                {Icon.warning(T.warn, 16)}
                <div style={{ color: T.textMid, fontSize: 12, lineHeight: 1.6 }}>
                  {tr.legalWarning}
                </div>
              </div>
            </div>

            <CguCheckbox checked={cguOk} onChange={v => { setCguOk(v); clr("cgu"); }} err={errs.cgu} tr={tr} openLegal={openLegal} />
            {/* Clause de responsabilité professionnelle — engagement d'indemnisation */}
            <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(201,160,48,.05)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 12 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={liabOk} onChange={e => { setLiabOk(e.target.checked); clr("liab"); }} style={{ marginTop: 3, accentColor: T.accent }} />
                <span style={{ fontSize: 11, color: T.textMid, lineHeight: 1.55 }}>{tr.liabProAccept}</span>
              </label>
              {errs.liab && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.liab}</div>}
            </div>
            <FormError err={errs.form} />
            <button onClick={submit} disabled={saving} className="lk-btn">{saving ? "…" : <>{tr.submitDossier} {Icon.check("#fff", 14)}</>}</button>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <span style={{ color: T.textLo, fontSize: 13 }}>{tr.alreadyMember} </span>
          <button onClick={onBack} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", padding: "12px 6px", minHeight: 44 }}>{tr.connectAs}</button>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ─── REGISTER ENTREPRISE ─── */
function RegisterEntrepriseScreen({ onBack, onRegister, lang = "fr", openLegal }) {
  const tr = TRANS[lang] || TRANS.fr;
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [step, setStep] = useState(1);
  // Step 1 — Infos entreprise
  const [raisonSociale, setRaisonSociale] = useState("");
  const [forme, setForme] = useState("SARL");
  const [siret, setSiret] = useState("");
  const [capital, setCapital] = useState("");
  const [rcs, setRcs] = useState("");
  const [tva, setTva] = useState("");
  const [ville, setVille] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [secteurs, setSecteurs] = useState([]);
  // Step 2 — Documents
  const [kbisFile, setKbisFile] = useState(null);
  const [rcProFile, setRcProFile] = useState(null);
  const ibanFile = null;
  const [logoFile, setLogoFile] = useState(null);
  const [iban, setIban] = useState("");
  const [cguOk, setCguOk] = useState(false);
  const [liabOk, setLiabOk] = useState(false);
  const [errs, setErrs] = useState({});
  const [saving, setSaving] = useState(false);
  const kbisRef = useRef(null);
  const rcRef = useRef(null);
  const logoRef = useRef(null);

  const clr = k => setErrs(p => { const e = { ...p }; delete e[k]; return e; });
  const formeOptions = (tr.formeOptions || "SAS,SARL,SA,EURL,SNC,EI,Auto-entrepreneur,Autre").split(",");
  // Secteurs reliés aux identifiants de métier utilisés partout dans l'application
  const secteurOptions = [
    { id: "serrurier", l: lang === "en" ? "Locksmithing" : "Serrurerie" },
    { id: "plombier", l: lang === "en" ? "Plumbing" : "Plomberie" },
    { id: "electricien", l: lang === "en" ? "Electrical" : "Électricité" },
    { id: "chauffagiste", l: lang === "en" ? "Heating" : "Chauffage" },
    { id: "fermetures", l: lang === "en" ? "Shutters & gates" : "Fermetures" },
  ];

  const toggleSecteur = (s) => setSecteurs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const validateStep1 = () => {
    const e = {};
    if (!raisonSociale.trim()) e.rs = lang === "en" ? "Company name required" : "Raison sociale requise";
    if (!siretValid(siret)) e.siret = tr.siretInvalid;
    if (!EMAIL_RE.test(email.trim())) e.email = tr.invalidEmail;
    if (!tel || tel.replace(/\D/g, "").length < 9) e.tel = tr.invalidPhone;
    if (!ville.trim()) e.ville = lang === "en" ? "City required" : "Ville requise";
    if (pass.length < MIN_PASS) e.pass = tr.minChars;
    if (pass !== confirm) e.confirm = tr.passMismatch;
    if (secteurs.length === 0) e.secteurs = lang === "en" ? "Select at least one sector" : "Sélectionnez au moins un secteur";
    setErrs(e); return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e = {};
    if (!kbisFile) e.kbis = lang === "en" ? "Kbis required" : "Extrait Kbis requis";
    if (!rcProFile) e.rc = lang === "en" ? "RC Pro required" : "Attestation RC Pro requise";
    if (!iban.trim()) e.iban = lang === "en" ? "IBAN required" : "IBAN requis";
    else if (!ibanValid(iban)) e.iban = lang === "en" ? "Invalid IBAN" : "IBAN invalide";
    if (!cguOk) e.cgu = tr.cguRequired;
    if (!liabOk) e.liab = tr.liabRequired;
    setErrs(e); return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validateStep2()) return;
    setSaving(true);
    const r = await onRegister({
      role: "partenaire",
      nom: raisonSociale.trim(), email,
      forme, siret: siret.replace(/\s/g, ""), capital, rcs, tva, iban: iban.replace(/\s/g, ""), ville: ville.trim(), tel,
      secteurs,
      assurance: rcProFile ? "RC Pro fournie" : "",
      qualibat: "", logo: null,
      docNames: { kbis: kbisFile || "", rcPro: rcProFile || "", iban: ibanFile || "", logo: logoFile || "" },
      statut: "en_attente", dateContrat: new Date().toLocaleDateString("fr-FR"),
      dossierStatus: "pending",
      cguAcceptedAt: ts(), liabAcceptedAt: ts(),
    }, pass);
    if (!r.ok) {
      setSaving(false);
      const e = registerErrors(r.error, lang);
      setErrs(e);
      if (e.email || e.pass) setStep(1);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", overflowY: "auto", display: "flex", flexDirection: isDesktop ? "row" : "column" }}>
      <style>{CSS}</style>
      {isDesktop && (
        <div style={{ width: 320, flexShrink: 0, background: "linear-gradient(135deg,#1c1c1c,#2e2e2e)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px", minHeight: "100vh", position: "sticky", top: 0 }}>
          <div style={{ width: 56, height: 56, background: "rgba(201,160,48,.15)", border: "1.5px solid rgba(201,160,48,.3)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>{Icon.shield("#c9a030", 26)}</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", marginBottom: 12 }}>LOCKR</div>
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: 13, textAlign: "center", lineHeight: 1.7 }}>{lang === "en" ? "Join the LOCKR partner network" : "Rejoignez le réseau partenaire LOCKR"}</div>
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
            {[lang === "en" ? `${PARTNER_COMMISSION * 100}% commission on all missions` : `Commission de ${PARTNER_COMMISSION * 100} % sur toutes les missions`,
              lang === "en" ? "Real-time GPS fleet tracking" : "Suivi GPS flotte en temps réel",
              lang === "en" ? "Full HR management" : "Gestion RH complète",
              lang === "en" ? "Dedicated marketplace" : "Marketplace dédié"].map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {Icon.check("#c9a030", 13)}
                <span style={{ color: "rgba(255,255,255,.65)", fontSize: 12 }}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 560, width: "100%", padding: "28px 18px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <button onClick={step === 1 ? onBack : () => setStep(1)} className="lk-ghost" style={{ padding: "9px 13px" }}>{Icon.back()}</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.textHi }}>{tr.entRegisterTitle}</div>
            <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{tr.stepWord} {step} {tr.ofWord} 2 — {step === 1 ? tr.entStep1 : tr.entStep2}</div>
          </div>
        </div>
        {/* Barre de progression */}
        <div style={{ height: 4, background: "rgba(0,0,0,.07)", borderRadius: 2, marginBottom: 24 }}>
          <div style={{ height: "100%", borderRadius: 2, background: T.grad, width: step === 1 ? "50%" : "100%", transition: "width .4s" }} />
        </div>

        {step === 1 && (
          <div className="lk-card" style={{ padding: "22px 18px" }}>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 18, display: "flex", gap: 8, alignItems: "center" }}>{Icon.shield(T.accent, 16)} {tr.entStep1}</div>
            <Field label={tr.raisonSocialeLabel} value={raisonSociale} onChange={e => { setRaisonSociale(e.target.value); clr("rs"); }} placeholder="BâtiPro SARL" err={errs.rs} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label className="lk-label">{tr.formeJuridique}</label>
                <select className="lk-input" value={forme} onChange={e => setForme(e.target.value)} style={{ cursor: "pointer" }}>
                  {formeOptions.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <Field label={tr.siretLabel} value={siret} onChange={e => { setSiret(e.target.value); clr("siret"); }} placeholder="12345678900012" err={errs.siret} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <Field label={tr.capitalLabel + " (€)"} value={capital} onChange={e => setCapital(e.target.value)} placeholder="50 000" />
              <Field label={tr.rcsLabel} value={rcs} onChange={e => setRcs(e.target.value)} placeholder="Paris B 123 456 789" />
            </div>
            <Field label={tr.tvaLabel} value={tva} onChange={e => setTva(e.target.value)} placeholder="FR12345678900" />
            <Field label={tr.email} value={email} onChange={e => { setEmail(e.target.value); clr("email"); }} placeholder="contact@entreprise.fr" type="email" err={errs.email} autoComplete="email" />
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.phone}</label>
              <PhoneInput value={tel} onChange={v => { setTel(v); clr("tel"); }} />
              {errs.tel && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.tel}</div>}
            </div>
            <Field label={tr.city} value={ville} onChange={e => { setVille(e.target.value); clr("ville"); }} placeholder="Paris" err={errs.ville} />
            {/* Secteurs */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.secteurActivite}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {secteurOptions.map(o => (
                  <button key={o.id} type="button" onClick={() => { toggleSecteur(o.id); clr("secteurs"); }} style={{ border: `1.5px solid ${secteurs.includes(o.id) ? T.accent : T.border}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", background: secteurs.includes(o.id) ? "rgba(201,160,48,.1)" : T.surface, color: secteurs.includes(o.id) ? T.accent : T.textMid }}>{o.l}</button>
                ))}
              </div>
              {errs.secteurs && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.secteurs}</div>}
            </div>
            <div style={{ borderTop: "1px solid rgba(0,0,0,.06)", paddingTop: 18, marginBottom: 8 }}>
              <Field label={tr.password} value={pass} onChange={e => { setPass(e.target.value); clr("pass"); }} placeholder={tr.minChars} type="password" err={errs.pass} autoComplete="new-password" />
              <Field label={tr.confirmPassword} value={confirm} onChange={e => { setConfirm(e.target.value); clr("confirm"); }} placeholder={tr.repeatPassword || tr.confirmPassword} type="password" err={errs.confirm} />
            </div>
            <button onClick={() => { if (validateStep1()) setStep(2); }} className="lk-btn">{tr.next} {Icon.arrow("#fff", 14)}</button>
          </div>
        )}

        {step === 2 && (
          <div className="lk-card" style={{ padding: "22px 18px" }}>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 18, display: "flex", gap: 8, alignItems: "center" }}>{Icon.file(T.accent, 16)} {tr.entStep2}</div>
            <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: T.textMid }}>{tr.entLegalNote}</div>

            {/* Kbis */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.uploadKbisRequired}</label>
              <input type="file" ref={kbisRef} accept=".pdf,.jpg,.png" style={{ display: "none" }} onChange={e => setKbisFile(e.target.files?.[0]?.name || null)} />
              <button type="button" onClick={() => kbisRef.current?.click()} className="lk-ghost" style={{ width: "100%", justifyContent: "flex-start", gap: 8, fontSize: 12, color: kbisFile ? T.success : T.textMid }}>
                {Icon.file(kbisFile ? T.success : T.textMid, 14)} {kbisFile || tr.uploadKbis}
              </button>
              {errs.kbis && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.kbis}</div>}
            </div>

            {/* RC Pro */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.assuranceRCLabel}</label>
              <input type="file" ref={rcRef} accept=".pdf,.jpg,.png" style={{ display: "none" }} onChange={e => setRcProFile(e.target.files?.[0]?.name || null)} />
              <button type="button" onClick={() => rcRef.current?.click()} className="lk-ghost" style={{ width: "100%", justifyContent: "flex-start", gap: 8, fontSize: 12, color: rcProFile ? T.success : T.textMid }}>
                {Icon.shield(rcProFile ? T.success : T.textMid, 14)} {rcProFile || tr.uploadInsurance}
              </button>
              {errs.rc && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.rc}</div>}
            </div>

            {/* IBAN */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.ibanEntLabel}</label>
              <input className="lk-input" value={iban} onChange={e => { setIban(e.target.value); clr("iban"); }} placeholder="FR76 3000 6000 0112 3456 7890 189" />
              {errs.iban && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.iban}</div>}
            </div>

            {/* Logo (optionnel) */}
            <div style={{ marginBottom: 18 }}>
              <label className="lk-label">{tr.logoLabel} ({tr.optionalWord})</label>
              <input type="file" ref={logoRef} accept=".jpg,.png,.svg" style={{ display: "none" }} onChange={e => setLogoFile(e.target.files?.[0]?.name || null)} />
              <button type="button" onClick={() => logoRef.current?.click()} className="lk-ghost" style={{ width: "100%", justifyContent: "flex-start", gap: 8, fontSize: 12, color: logoFile ? T.success : T.textMid }}>
                {Icon.image(logoFile ? T.success : T.textMid, 14)} {logoFile || (lang === "en" ? "Upload logo" : "Téléverser logo")}
              </button>
            </div>

            <CguCheckbox checked={cguOk} onChange={v => { setCguOk(v); clr("cgu"); }} err={errs.cgu} tr={tr} openLegal={openLegal} />

            {/* Clause de responsabilité entreprise — engagement d'indemnisation */}
            <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(201,160,48,.05)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 12 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={liabOk} onChange={e => { setLiabOk(e.target.checked); clr("liab"); }} style={{ marginTop: 3, accentColor: T.accent }} />
                <span style={{ fontSize: 11, color: T.textMid, lineHeight: 1.55 }}>{tr.liabEntAccept}</span>
              </label>
              {errs.liab && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.liab}</div>}
            </div>

            {/* Récap infos step 1 */}
            <div style={{ background: "rgba(0,0,0,.03)", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 12, color: T.textMid }}>
              <div style={{ fontWeight: 700, color: T.textHi, marginBottom: 6 }}>{raisonSociale} — {forme}</div>
              <div>SIRET : {siret}</div>
              <div>{email} · {ville}</div>
              <div style={{ marginTop: 4 }}>{secteurOptions.filter(o => secteurs.includes(o.id)).map(o => o.l).join(", ")}</div>
            </div>

            <div style={{ background: "rgba(30,158,107,.05)", border: "1px solid rgba(30,158,107,.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: T.textMid }}>{tr.entPending}</div>
            <FormError err={errs.form} />
            <button onClick={submit} disabled={saving} className="lk-btn">{saving ? "…" : <>{tr.entSubmit} {Icon.check("#fff", 14)}</>}</button>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <span style={{ color: T.textLo, fontSize: 13 }}>{tr.alreadyMember} </span>
          <button onClick={onBack} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", padding: "12px 6px", minHeight: 44 }}>{tr.connectAs}</button>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ─── LOGIN ─── */
function LoginScreen({ onLogin, onRegister, accounts, setAccounts, accountsReady = true, lang = "fr", setLang }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetState, setResetState] = useState(null); // null | "busy" | "sent" | message d'erreur
  // Ancien compte avec un mot de passe trop court : nouveau mot de passe demandé
  const [newPass, setNewPass] = useState(null);
  const w = useWindowSize();
  const isDesktop = w >= BP;

  // Un seul formulaire : le type de compte (client, artisan, entreprise, admin)
  // est reconnu automatiquement — plus besoin de choisir le bon onglet.
  const demos = [
    { email: "client@demo.fr", label: fr ? "Client" : "Client" },
    { email: "karim@demo.fr", label: fr ? "Artisan" : "Craftsman" },
    { email: "contact@batipro.fr", label: fr ? "Entreprise" : "Company" },
    { email: "admin@demo.fr", label: "Admin" },
  ];

  const login = async (emailArg, passArg) => {
    const em = normEmail(emailArg ?? email);
    const pw = passArg ?? pass;
    if (!em || !pw) { setErr(tr.wrongCredentials); return; }
    if (live) {
      let np;
      if (newPass) {
        if (newPass.p1.length < MIN_PASS) { setErr(authErrorText("weak_password", lang)); return; }
        if (newPass.p1 !== newPass.p2) { setErr(tr.passMismatch); return; }
        np = newPass.p1;
      }
      setBusy(true);
      const r = await signIn(em, pw, np);
      setBusy(false);
      if (r.ok) return; // la session s'ouvre automatiquement
      if (r.error === "new_password_required") { setNewPass({ p1: "", p2: "" }); setErr(""); return; }
      setErr(authErrorText(r.error, lang));
      return;
    }
    if (!accountsReady) { setErr(fr ? "Connexion au serveur en cours, réessayez dans un instant." : "Connecting to server, please retry in a moment."); return; }
    setBusy(true);
    const acc = accounts.find(a => normEmail(a.email) === em);
    const ok = acc ? await checkPassword(acc, pw) : false;
    setBusy(false);
    if (!ok) { setErr(tr.wrongCredentials); return; }
    // Ancien mot de passe stocké en clair → converti en empreinte sécurisée
    const upgrade = acc.passHash ? {} : await passwordFields(pw);
    setAccounts(p => p.map(a => a.id === acc.id ? { ...a, ...upgrade, lastLoginAt: ts() } : a));
    onLogin(acc);
  };

  const features = [
    { icon: Icon.shield, text: tr.loginFeature1 },
    { icon: Icon.map,    text: tr.loginFeature2 },
    { icon: Icon.check,  text: tr.loginFeature3 },
    { icon: Icon.card,   text: tr.loginFeature4 },
    { icon: Icon.phone,  text: tr.loginFeature5 },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex" }}>
      <style>{CSS}</style>

      {/* ── Panneau gauche desktop ── */}
      {isDesktop && (
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          {/* Image de fond — remplacez l'URL par votre propre photo */}
          <img
            src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1400&q=80"
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
            onError={e => { e.target.style.display = "none"; }}
          />
          {/* Overlay dégradé sombre */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,10,10,.45) 0%, rgba(10,10,10,.65) 40%, rgba(10,10,10,.93) 100%)" }} />
          {/* Reflets dorés */}
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 20% 30%, rgba(201,160,48,.18) 0%, transparent 55%), radial-gradient(circle at 80% 70%, rgba(201,160,48,.12) 0%, transparent 50%)" }} />

          {/* Contenu superposé */}
          <div style={{ position: "relative", padding: "48px 52px", color: "#fff" }}>
            {/* Logo */}
            <div style={{ marginBottom: 36, textAlign: "center" }}>
              <LockrWordmark height={110} />
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginTop: 16 }}>{tr.appTagline}</div>
            </div>

            {/* Qui sommes-nous */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", color: "#c9a030", textTransform: "uppercase", marginBottom: 10 }}>{tr.loginWhoTitle}</div>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,.75)", margin: 0, maxWidth: 460 }}>{tr.loginWhoText}</p>
            </div>

            {/* Avantages */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", color: "#c9a030", textTransform: "uppercase", marginBottom: 14 }}>{tr.loginWhyTitle}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 18px" }}>
                {features.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, height: 30, background: "rgba(201,160,48,.14)", border: "1px solid rgba(201,160,48,.25)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {f.icon("#c9a030", 14)}
                    </div>
                    <span style={{ color: "rgba(255,255,255,.8)", fontSize: 13 }}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 0, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, overflow: "hidden" }}>
              {[
                { n: tr.loginStat1, l: tr.loginStat1Label },
                { n: tr.loginStat2, l: tr.loginStat2Label },
                { n: tr.loginStat3, l: tr.loginStat3Label },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center", padding: "14px 8px", borderRight: i < 2 ? "1px solid rgba(255,255,255,.08)" : "none" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#c9a030", letterSpacing: "-.5px" }}>{s.n}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 3 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Panneau droit : formulaire ── */}
      <div style={{ width: isDesktop ? 460 : "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: isDesktop ? "48px 44px" : 0, overflowY: "auto", background: T.bg }}>

        {/* Hero mobile avec image */}
        {!isDesktop && (
          <div style={{ position: "relative", padding: "52px 22px 36px", overflow: "hidden" }}>
            <img
              src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&q=75"
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
              onError={e => { e.target.style.display = "none"; }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,10,10,.5) 0%,rgba(10,10,10,.85) 70%,rgba(10,10,10,.98) 100%)" }} />
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                <LockrWordmark height={40} />
              </div>
              <p style={{ color: "rgba(255,255,255,.7)", fontSize: 13, lineHeight: 1.6, margin: "0 0 18px", maxWidth: 340 }}>{tr.loginWhoText}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {features.slice(0, 3).map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(201,160,48,.12)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 20, padding: "5px 10px" }}>
                    {f.icon("#c9a030", 12)}
                    <span style={{ color: "rgba(255,255,255,.85)", fontSize: 11, fontWeight: 500 }}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ width: "100%", maxWidth: 390, margin: "0 auto", padding: isDesktop ? 0 : "24px 20px 32px", animation: "fadeUp .45s ease" }}>
          {isDesktop && <div style={{ fontSize: 24, fontWeight: 800, color: T.textHi, marginBottom: 28, letterSpacing: "-.5px" }}>{tr.loginTitle}</div>}
          <div className="lk-card" style={{ borderRadius: 16, padding: "24px 20px", marginBottom: 14 }}>
            <form onSubmit={e => { e.preventDefault(); login(); }}>
              <div style={{ marginBottom: 16 }}>
                <label className="lk-label" htmlFor="lk-login-email">{tr.email}</label>
                <input id="lk-login-email" className="lk-input" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="email@exemple.fr" type="email" autoComplete="email" inputMode="email" />
              </div>
              <div style={{ marginBottom: err ? 12 : 8 }}>
                <label className="lk-label" htmlFor="lk-login-pass">{tr.password}</label>
                <input id="lk-login-pass" className="lk-input" type="password" value={pass} onChange={e => { setPass(e.target.value); setErr(""); }} placeholder="••••••••" autoComplete="current-password" />
              </div>
              {newPass && (
                <div style={{ background: "rgba(201,160,48,.07)", border: "1px solid rgba(201,160,48,.3)", borderRadius: 12, padding: "12px", marginBottom: 12 }}>
                  <div style={{ fontSize: 12.5, color: T.textMid, lineHeight: 1.5, marginBottom: 10 }}>{fr ? `Pour sécuriser votre compte, choisissez un nouveau mot de passe (${MIN_PASS} caractères minimum).` : `To secure your account, choose a new password (min. ${MIN_PASS} characters).`}</div>
                  <input className="lk-input" type="password" autoComplete="new-password" value={newPass.p1} onChange={e => { setNewPass(p => ({ ...p, p1: e.target.value })); setErr(""); }} placeholder={fr ? "Nouveau mot de passe" : "New password"} style={{ marginBottom: 8 }} />
                  <input className="lk-input" type="password" autoComplete="new-password" value={newPass.p2} onChange={e => { setNewPass(p => ({ ...p, p2: e.target.value })); setErr(""); }} placeholder={fr ? "Confirmer le nouveau mot de passe" : "Confirm new password"} />
                </div>
              )}
              {err && <div role="alert" style={{ color: T.danger, fontSize: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>{Icon.x(T.danger, 13)} {err}</div>}
              <div style={{ textAlign: "right", marginBottom: 14 }}>
                <button type="button" onClick={() => setForgot(true)} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "6px 0", fontFamily: "'Inter',sans-serif" }}>{tr.forgotPass}</button>
              </div>
              <button type="submit" disabled={busy} className="lk-btn">
                {busy ? (fr ? "Connexion…" : "Signing in…") : newPass ? (fr ? "Valider et me connecter" : "Save and sign in") : <>{tr.connectAs} {Icon.arrow("#fff", 15)}</>}
              </button>
            </form>
          </div>
          {/* Comptes de démonstration (version de démonstration uniquement) */}
          {IS_DEMO && <div style={{ textAlign: "center", marginBottom: 14 }}>
            <button onClick={() => setShowDemo(v => !v)} style={{ background: "none", border: "none", color: T.textLo, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", padding: "8px 6px" }}>
              {showDemo ? "▾" : "▸"} {fr ? "Essayer avec un compte de démonstration" : "Try with a demo account"}
            </button>
            {showDemo && (
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {demos.map(d => (
                  <button key={d.email} onClick={() => { setEmail(d.email); setPass("1234"); login(d.email, "1234"); }} style={{ flex: 1, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 10px", cursor: "pointer", color: T.textMid, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            {setLang && <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: T.textMid, fontFamily: "'Inter',sans-serif" }}>{tr.lang}</button>}
          </div>
          <div style={{ background: "#fff", border: "1.5px solid rgba(201,160,48,.15)", borderRadius: 14, padding: "16px 18px", textAlign: "center", boxShadow: "0 2px 10px rgba(201,160,48,.08)" }}>
            <div style={{ color: T.textMid, fontSize: 13, marginBottom: 10 }}>{tr.notMember}</div>
            <button onClick={onRegister} className="lk-ghost" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {tr.freeAccount} {Icon.arrow(T.accent, 14)}
            </button>
          </div>
          {/* Partenaires link */}
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button onClick={onRegister} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontFamily: "'Inter',sans-serif", padding: "12px 6px", minHeight: 44 }}>
              {lang === "en" ? "Become a LOCKR partner — Join us" : "Devenir partenaire LOCKR — Rejoignez-nous"}
            </button>
          </div>
          {forgot && createPortal(
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 9990, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => { setForgot(false); setResetState(null); }}>
              <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: "24px 22px", maxWidth: 400, width: "100%", fontFamily: "'Inter',sans-serif" }}>
                <div style={{ fontWeight: 800, fontSize: 17, color: T.textHi, marginBottom: 8 }}>{tr.forgotPass}</div>
                {live ? (
                  resetState === "sent" ? (
                    <div role="status" style={{ fontSize: 13, color: T.success, lineHeight: 1.6, marginBottom: 16 }}>
                      {fr ? "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé. Pensez à vérifier vos courriers indésirables." : "If an account exists for this address, a reset e-mail has just been sent. Check your spam folder too."}
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.6, marginBottom: 12 }}>
                        {fr ? "Indiquez l'adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe." : "Enter your account e-mail address: you will receive a link to choose a new password."}
                      </div>
                      <input className="lk-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemple.fr" style={{ marginBottom: 10 }} />
                      {resetState && resetState !== "busy" && <div role="alert" style={{ color: T.danger, fontSize: 12, marginBottom: 10 }}>{resetState}</div>}
                      <button disabled={resetState === "busy" || !EMAIL_RE.test(email.trim())} onClick={async () => {
                        setResetState("busy");
                        const r = await resetPassword(email);
                        setResetState(r.ok ? "sent" : authErrorText(r.error, lang));
                      }} className="lk-btn" style={{ marginBottom: 10 }}>{resetState === "busy" ? "…" : (fr ? "Recevoir le lien" : "Send me the link")}</button>
                    </>
                  )
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.6, marginBottom: 16 }}>
                      {fr ? "Version de démonstration : utilisez un des comptes de démonstration (mot de passe 1234)." : "Demo version: use one of the demo accounts (password 1234)."}
                    </div>
                  </>
                )}
                <button onClick={() => { setForgot(false); setResetState(null); }} className="lk-ghost" style={{ width: "100%" }}>{fr ? "Fermer" : "Close"}</button>
              </div>
            </div>, document.body
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── DEVIS MODAL (Feature 3) ─── */
function DevisModal({ artisan, probleme, montant, adresse, onAccept, onCancel, lang = "fr", fraisDep = FRAIS_DEPLACEMENT_DEFAULT }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [accepted, setAccepted] = useState(false);
  const [err, setErr] = useState("");
  const fr = lang !== "en";
  const prob = PROBLEMES.find(p => p.id === probleme);
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease" }}>
        <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          {Icon.file(T.accent, 20)}
          <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17 }}>{tr.devisTitle}</div>
        </div>
        <div style={{ background: "rgba(0,0,0,.02)", border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: T.textLo, fontSize: 13 }}>{tr.devisService}</span>
            <span style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pLabel(prob, lang) || probleme}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: T.textLo, fontSize: 13 }}>{tr.devisArtisan}</span>
            <span style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{artisan?.nom || "—"}</span>
          </div>
          {adresse && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
              <span style={{ color: T.textLo, fontSize: 13 }}>{lang === "en" ? "Address" : "Adresse"}</span>
              <span style={{ color: T.textHi, fontWeight: 600, fontSize: 13, textAlign: "right" }}>{adresse}</span>
            </div>
          )}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: T.textLo, fontSize: 13 }}>{tr.devisTotal}</span>
              <span style={{ color: T.textHi, fontWeight: 800, fontSize: 16 }}>{fmt(montant)}</span>
            </div>
            <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5, marginTop: 8 }}>
              💳 {fr
                ? "Rien n'est débité maintenant : ce montant est seulement réservé sur votre carte (empreinte bancaire). Après l'intervention, seul le montant final de la facture est prélevé. Annulation gratuite avant le départ de l'artisan."
                : "Nothing is charged now: this amount is only held on your card. After the intervention, only the final invoice amount is charged. Free cancellation before the craftsman leaves."}
              {fraisDep > 0 && <div style={{ marginTop: 6 }}>🚗 {fr
                ? `Si vous annulez une fois l'artisan en route, ou si vous êtes absent au rendez-vous, ${fmt(fraisDep)} de frais de déplacement sont dus.`
                : `If you cancel once the craftsman is on the way, or are not there at the appointment, a ${fmt(fraisDep)} travel fee applies.`}</div>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16, cursor: "pointer" }} onClick={() => { setAccepted(a => !a); setErr(""); }}>
          <div style={{ width: 20, height: 20, border: `2px solid ${accepted ? T.success : "rgba(0,0,0,.2)"}`, borderRadius: 5, background: accepted ? "rgba(30,158,107,.12)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
            {accepted && Icon.check(T.success, 12)}
          </div>
          <span style={{ color: T.textMid, fontSize: 13, lineHeight: 1.5 }}>{tr.devisAccept}</span>
        </div>
        {err && <div style={{ color: T.danger, fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <button onClick={() => { if (!accepted) return setErr(tr.devisAcceptRequired); onAccept(); }} className="lk-btn" style={{ marginBottom: 10 }}>
          {fr ? "Réserver avec ma carte" : "Book with my card"} {Icon.arrow("#fff", 14)}
        </button>
        <button onClick={onCancel} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
      </div>
    </div>,
    document.body
  );
}

/* ─── MONTHLY REPORT MODAL (Feature 10) ─── */
function MonthlyReportModal({ bookings, artisanId, lang = "fr", onClose }) {
  const tr = TRANS[lang] || TRANS.fr;
  const now = new Date();
  const thisMonth = bookings.filter(b => {
    if (b.artisanId !== artisanId || b.statut !== "terminée") return false;
    const d = new Date(b.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const subtotal = thisMonth.reduce((s, b) => s + bookingTotal(b), 0);
  const share = thisMonth.reduce((s, b) => s + proShare(b), 0);
  const MONTH_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const MONTH_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthName = (lang === "en" ? MONTH_EN : MONTH_FR)[now.getMonth()];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", maxHeight: "85vh", overflowY: "auto", animation: "slideUp .3s ease" }} id="monthly-report-print">
        <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 4 }}>{tr.monthlyReportTitle}</div>
        <div style={{ color: T.textLo, fontSize: 13, marginBottom: 20 }}>{monthName} {now.getFullYear()}</div>
        {thisMonth.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: T.textLo, fontSize: 14 }}>{tr.noCompletedMission}</div>
        ) : (
          <>
            {thisMonth.map(b => {
              const pr = PROBLEMES.find(p => p.id === b.probleme);
              return (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                  <div>
                    <div style={{ color: T.textHi, fontSize: 13, fontWeight: 600 }}>{pLabel(pr, lang) || b.probleme}</div>
                    <div style={{ color: T.textLo, fontSize: 11 }}>{fmtDate(b.createdAt)} · {b.clientNom}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{fmt(b.montantFinal || 0)}</div>
                    <div style={{ color: T.success, fontSize: 11 }}>{fmt(proShare(b))}</div>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 16, borderTop: `2px solid ${T.accent}`, paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: T.textMid, fontSize: 13 }}>{tr.subtotal}</span>
                <span style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{fmt(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: T.textMid, fontSize: 13 }}>{tr.yourShare40pct}</span>
                <span style={{ color: T.success, fontWeight: 800, fontSize: 16 }}>{fmt(share)}</span>
              </div>
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={() => window.print()} className="lk-btn" style={{ flex: 1 }}>{tr.printDownload}</button>
          <button onClick={onClose} className="lk-ghost" style={{ flex: 1 }}>{tr.close}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── CLOTURE MODAL ───
   1) photo de la facture + montant → la mission est clôturée et ENREGISTRÉE
   2) encaissement du reste à payer : carte sur le téléphone du pro (Stripe),
      lien de paiement envoyé au client, ou paiement depuis l'appli client.
   L'artisan ne peut plus se déclarer « payé » lui-même : seul Stripe (ou
   l'administrateur) confirme un paiement. */

function ClotureModal({ mission, onConfirm, onCancel, setBookings, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  const [montant, setMontant] = useState(String(mission?.montantFinal || mission?.montant || ""));
  const [factureImg, setFactureImg] = useState(mission?.factureImg || null);
  const [step, setStep] = useState("form"); // form | paiement
  const [err, setErr] = useState("");
  const [showSendLink, setShowSendLink] = useState(false);
  const [paying, setPaying] = useState(false);
  const fileRef = useRef(null);
  const prob = PROBLEMES.find(p => p.id === mission?.probleme);
  const montantNum = parseFloat(String(montant).replace(",", ".")) || 0;
  const closed = { ...mission, montantFinal: montantNum };
  const reste = resteAPayer(closed);
  const clientTel = mission?.clientTel || null;
  // Empreinte bancaire du client : débitée du montant final (dans la limite réservée)
  const hold = empreinteMontant(mission);
  const aDebiter = Math.min(reste, hold);
  const [captured, setCaptured] = useState(null);

  const handleFile = async e => {
    const data = await readImageInput(e, { maxSize: 1400, quality: 0.72 });
    if (data) { setFactureImg(data); setErr(""); }
  };
  const validate = () => {
    if (!(montantNum > 0)) return setErr(tr.invoiceInvalid);
    if (!factureImg) return setErr(tr.invoiceRequired);
    setErr("");
    onConfirm(montantNum, factureImg);
    setStep("paiement");
  };
  const capture = async () => {
    setPaying(true); setErr("");
    if (!live) {
      applyPayment({ setBookings }, { type: "capture", ref: mission.id, amount: aDebiter, demo: true });
      setCaptured(aDebiter); setPaying(false);
      return;
    }
    const r = await captureHold(mission.id);
    setPaying(false);
    if (r.ok) { setCaptured(r.captured); return; }
    setErr(r.error === "expired"
      ? (fr ? "La réservation sur la carte a expiré : envoyez un lien de paiement au client." : "The card hold expired: send the client a payment link.")
      : (fr ? "Débit impossible pour le moment. Réessayez dans un instant ou envoyez un lien de paiement." : "Charge not possible right now. Retry in a moment or send a payment link."));
  };
  const chargeNow = async () => {
    setPaying(true);
    const ok = await startStripeCheckout({ type: "prestation", ref: mission.id });
    if (!ok) { setPaying(false); setErr(fr ? "Paiement par carte indisponible pour le moment. Envoyez un lien de paiement ou laissez le client payer depuis son application." : "Card payment unavailable right now. Send a payment link or let the client pay from their app."); }
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", maxHeight: "90vh", overflowY: "auto", animation: "slideUp .3s ease", fontFamily: "'Inter',sans-serif" }}>
        <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
        {step === "form" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(62,207,142,.08)", border: "1px solid rgba(62,207,142,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.check(T.success, 20)}</div>
              <div>
                <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16 }}>{tr.closeMission}</div>
                <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{pLabel(prob, lang)} · {mission?.clientNom}</div>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="lk-label">{tr.invoicePhoto}</label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
              {!factureImg ? (
                <button onClick={() => fileRef.current?.click()} style={{ width: "100%", background: "rgba(0,0,0,.02)", border: "1.5px dashed rgba(28,28,28,.2)", borderRadius: 14, padding: "28px 20px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, fontFamily: "'Inter',sans-serif" }}>
                  {Icon.cam(T.accent, 30)}
                  <div style={{ color: T.accent, fontWeight: 600, fontSize: 13 }}>{tr.photographOrSelect}</div>
                </button>
              ) : (
                <div style={{ position: "relative", borderRadius: 13, overflow: "hidden", border: "1px solid rgba(62,207,142,.3)" }}>
                  <img src={factureImg} alt="Facture" style={{ width: "100%", maxHeight: 200, objectFit: "cover" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg,rgba(0,0,0,.45),transparent)", display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{Icon.check(T.success, 14)}<span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>{tr.invoiceAdded}</span></div>
                    <button onClick={() => setFactureImg(null)} style={{ background: "rgba(240,101,101,.85)", border: "none", borderRadius: 8, padding: "6px 10px", color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.removeFile}</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="lk-label">{tr.totalAmount}</label>
              <div style={{ position: "relative" }}>
                <input type="number" inputMode="decimal" value={montant} onChange={e => { setMontant(e.target.value); setErr(""); }} className="lk-input" style={{ paddingRight: 40, fontSize: 22, fontWeight: 800 }} placeholder="0" />
                <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.textLo, fontWeight: 700, fontSize: 18 }}>€</div>
              </div>
            </div>
            {montantNum > 0 && (
              <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(0,0,0,.06)", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: T.textLo }}>{fr ? `Votre part (${pctLabel(mission)})` : `Your share (${pctLabel(mission)})`}</span>
                  <span style={{ color: T.success, fontWeight: 700 }}>{fmt(proShare(closed))}</span>
                </div>
                {acomptePaid(mission) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: T.textLo }}>{fr ? "Acompte déjà payé par le client" : "Deposit already paid"}</span>
                    <span style={{ color: T.textMid, fontWeight: 700 }}>− {fmt(acomptePaid(mission))}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: T.textHi, fontWeight: 700 }}>{fr ? "Reste à payer par le client" : "Remaining to be paid"}</span>
                  <span style={{ color: T.accent, fontWeight: 800 }}>{fmt(reste)}</span>
                </div>
              </div>
            )}
            {err && <div role="alert" style={{ background: "rgba(240,101,101,.07)", border: "1px solid rgba(240,101,101,.2)", borderRadius: 10, padding: "10px 14px", color: T.danger, fontSize: 13, marginBottom: 14 }}>{err}</div>}
            <button onClick={validate} className="lk-btn" style={{ marginBottom: 10 }}>{fr ? "Clôturer la mission" : "Close the mission"} {Icon.arrow("#fff", 14)}</button>
            <button onClick={onCancel} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </>
        )}
        {step === "paiement" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ width: 64, height: 64, background: "rgba(62,207,142,.1)", border: "1.5px solid rgba(62,207,142,.3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>{Icon.check(T.success, 28)}</div>
              <div style={{ color: T.success, fontWeight: 800, fontSize: 17 }}>{fr ? "Mission clôturée" : "Mission closed"}</div>
              <div style={{ color: T.textMid, fontSize: 13, marginTop: 6 }}>
                {reste > 0 ? (fr ? <>Reste à encaisser : <b>{fmt(reste)}</b></> : <>Remaining to collect: <b>{fmt(reste)}</b></>) : (fr ? "Rien à encaisser : la prestation est déjà réglée." : "Nothing to collect: already paid.")}
              </div>
            </div>
            {captured != null && (
              <div role="status" style={{ background: "rgba(30,158,107,.07)", border: "1px solid rgba(30,158,107,.25)", borderRadius: 12, padding: "10px 12px", color: T.success, fontWeight: 700, fontSize: 13, textAlign: "center", marginBottom: 12 }}>
                {fr ? `Carte du client débitée de ${fmt(captured)} ✓` : `Client card charged ${fmt(captured)} ✓`}
              </div>
            )}
            {reste > 0 && hold > 0 && captured == null && (
              <>
                <div style={{ fontSize: 12, color: T.textMid, textAlign: "center", marginBottom: 10, lineHeight: 1.5 }}>
                  {fr ? `💳 Le client a enregistré sa carte (${fmt(hold)} réservés).` : `💳 The client registered a card (${fmt(hold)} held).`}
                </div>
                <button onClick={capture} disabled={paying} className="lk-btn" style={{ marginBottom: 10 }}>{paying ? "…" : (fr ? `Débiter la carte du client — ${fmt(aDebiter)}` : `Charge the client's card — ${fmt(aDebiter)}`)}</button>
                {reste > hold && <div style={{ fontSize: 11.5, color: T.warn, textAlign: "center", marginBottom: 10 }}>{fr ? `Le montant final dépasse la réservation : ${fmt(reste - hold)} resteront à régler par lien de paiement.` : `The final amount exceeds the hold: ${fmt(reste - hold)} will remain to be paid by link.`}</div>}
              </>
            )}
            {reste > 0 && hold === 0 && mission?.statutPaiement !== "payé" && (
              <>
                <button onClick={chargeNow} disabled={paying} className="lk-btn" style={{ marginBottom: 10 }}>{paying ? "…" : (fr ? "Faire payer le client maintenant (carte)" : "Charge the client now (card)")}</button>
                <button onClick={() => setShowSendLink(true)} className="lk-ghost" style={{ width: "100%", marginBottom: 10 }}>{fr ? "Envoyer un lien de paiement" : "Send a payment link"}</button>
                <div style={{ color: T.textLo, fontSize: 11, textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
                  {fr ? "Le client peut aussi payer depuis son application LOCKR. Tout règlement en espèces ou hors application est interdit (CGU art. 4 bis)." : "The client can also pay from their LOCKR app. Cash or off-platform payment is prohibited (Terms art. 4 bis)."}
                </div>
              </>
            )}
            {err && <div role="alert" style={{ color: T.danger, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{err}</div>}
            <button onClick={onCancel} className="lk-ghost" style={{ width: "100%" }}>{fr ? "Terminer" : "Done"}</button>
          </>
        )}
      </div>
      {showSendLink && (
        <SendPaymentLinkModal amount={reste} bookingId={mission?.id} clientNom={mission?.clientNom} clientTel={clientTel} onClose={() => setShowSendLink(false)} lang={lang} />
      )}
    </div>,
    document.body
  );
}

/* ─── CHAT REGIONAL ─── */
function ChatRegional({ account, chatMessages, setChatMessages, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [msg, setMsg] = useState("");
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoData, setPhotoData] = useState(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const region = account.ville || "Paris";
  const sameRegion = r => String(r || "").trim().toLowerCase() === region.trim().toLowerCase();
  const messages = visibleFor(account, chatMessages).filter(m => sameRegion(m.region));

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const handleFile = async e => {
    const data = await readImageInput(e, { maxSize: 1000, quality: 0.68 });
    if (data) { setPhotoPreview(data); setPhotoData(data); }
  };
  const sendMsg = () => {
    if (!msg.trim() && !photoData) return;
    const newMsg = { id: uid(), region, auteurId: account.id, auteurNom: account.nom, texte: msg.trim(), createdAt: ts(), photo: photoData };
    setChatMessages(p => [...p, newMsg]);
    setMsg(""); setPhotoPreview(null); setPhotoData(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        {Icon.chat(T.accent, 18)}
        <div>
          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{tr.chatProRegion} — {region}</div>
          <div style={{ color: T.textLo, fontSize: 11, marginTop: 1 }}>{tr.chatSubtitle}</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: T.textLo, fontSize: 14 }}>{tr.noMessage}</div>}
        {messages.map(m => {
          const isMe = m.auteurId === account.id;
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", gap: 10, alignItems: "flex-end" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: isMe ? "linear-gradient(135deg,#4d7fe8,#6b5ff4)" : "rgba(0,0,0,.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ color: isMe ? "#fff" : T.textMid, fontSize: 12, fontWeight: 700 }}>{initial(m.auteurNom)}</span>
              </div>
              <div style={{ maxWidth: "70%" }}>
                {!isMe && <div style={{ color: T.textLo, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>{m.auteurNom}</div>}
                {m.photo && <img src={m.photo} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: m.texte ? 6 : 0, display: "block" }} />}
                {m.texte && <div style={{ background: isMe ? "linear-gradient(135deg,#4d7fe8,#6b5ff4)" : T.card, borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "10px 14px", color: isMe ? "#fff" : T.textHi, fontSize: 14, lineHeight: 1.5 }}>{m.texte}</div>}
                <div style={{ color: T.textLo, fontSize: 10, marginTop: 4, textAlign: isMe ? "right" : "left" }}>{fmtTime(m.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {photoPreview && (
        <div style={{ padding: "8px 14px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <img src={photoPreview} alt="" style={{ height: 60, borderRadius: 8, objectFit: "cover" }} />
            <button onClick={() => { setPhotoPreview(null); setPhotoData(null); }} style={{ position: "absolute", top: -6, right: -6, background: T.danger, border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.x("#fff", 10)}</button>
          </div>
        </div>
      )}
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "center" }}>
        <input type="file" accept="image/*" ref={fileRef} onChange={handleFile} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} className="lk-ghost" style={{ padding: "10px 12px", flexShrink: 0 }}>{Icon.image(T.textMid, 16)}</button>
        <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMsg()} className="lk-input" placeholder={tr.yourMessage} style={{ flex: 1 }} />
        <button onClick={sendMsg} aria-label={lang === "en" ? "Send" : "Envoyer"} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "10px 14px", cursor: "pointer", flexShrink: 0 }}>{Icon.send("#fff", 16)}</button>
      </div>
    </div>
  );
}

/* ─── BONS DISPONIBLES ─── */
const metierOf = x => x?.metier || PROBLEMES.find(p => p.id === x?.probleme)?.metier || null;
const sameCity = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const proMetiers = acc => acc?.metiers?.length ? acc.metiers : (acc?.metier ? [acc.metier] : []);
/* Appel téléphonique réel (plus de faux appel simulé) */
function callPhone(tel) {
  const t = String(tel || "").replace(/[^\d+]/g, "");
  if (t.length >= 9) { window.location.href = `tel:${t}`; return true; }
  return false;
}

function BonsScreen({ account, bons, setBons, bookings, setBookings, lang = "fr", priorityOrder = [], autoOpenPost = false, onAutoOpenHandled = () => {} }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  // Tick de re-rendu pour faire défiler le dispatch prioritaire (fenêtres de 2 min)
  const [, setDispatchTick] = useState(0);
  useEffect(() => {
    if (!priorityOrder.length) return undefined;
    const iv = setInterval(() => setDispatchTick(t => t + 1), 5000);
    return () => clearInterval(iv);
  }, [priorityOrder.length]);
  const [postModal, setPostModal] = useState(false);
  useEffect(() => {
    if (autoOpenPost) { setPostModal(true); onAutoOpenHandled(); }
  }, [autoOpenPost]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rdvModal, setRdvModal] = useState(null);
  const emptyBon = { titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: 70 };
  const [newBon, setNewBon] = useState(emptyBon);
  const [postErr, setPostErr] = useState("");
  const [posting, setPosting] = useState(false);
  const [notif, setNotif] = useState(null);
  const [skipped, setSkipped] = useState({});
  const [allTrades, setAllTrades] = useState(false);
  const myRegion = account.ville || "Paris";
  const myTrades = proMetiers(account);

  const proScore = bookings.filter(b => b.artisanId === account.artisanId && b.statut === "terminée").length;
  const proPos0 = (account.lat && account.lng) ? { lat: account.lat, lng: account.lng } : (DEMO_ARTISANS.find(a => a.id === account.artisanId) || { lat: 48.8566, lng: 2.3522 });
  const bonsRegion = visibleFor(account, bons)
    .filter(b => sameCity(b.region, myRegion) && b.postedBy !== account.id && bonVisibleForPro(b, account.artisanId, priorityOrder))
    .filter(b => allTrades || !myTrades.length || !metierOf(b) || myTrades.includes(metierOf(b)))
    .slice().sort((a, b) => {
      // Urgences d'abord pour les pros expérimentés, puis par distance croissante
      if (proScore >= 5 && a.urgence !== b.urgence) return a.urgence ? -1 : 1;
      const da = a.lat && a.lng ? haversineKm(proPos0, a) : 999;
      const db = b.lat && b.lng ? haversineKm(proPos0, b) : 999;
      return da - db;
    });
  const hiddenOtherTrades = !allTrades && myTrades.length
    ? visibleFor(account, bons).filter(b => sameCity(b.region, myRegion) && b.postedBy !== account.id && bonVisibleForPro(b, account.artisanId, priorityOrder) && metierOf(b) && !myTrades.includes(metierOf(b))).length
    : 0;

  const tooLate = () => {
    setRdvModal(null);
    setNotif({ ok: false, text: fr ? "Trop tard : ce bon vient d'être pris par un autre professionnel." : "Too late: this job was just taken by another professional." });
    setTimeout(() => setNotif(null), 4000);
  };
  const confirmRdv = async (bon, rdvOpts) => {
    // Protection : un autre artisan a peut-être déjà pris ce bon
    if (!bons.some(b => b.id === bon.id)) { tooLate(); return; }
    const bk = {
      // Identifiant lié au bon : deux artisans ne peuvent pas prendre le même bon
      id: "bon_" + bon.id, artisanId: account.artisanId, artisanAccountId: account.id, artisanNom: account.nom, artisanTel: account.tel || "",
      // La demande du client lui reste rattachée : il voit son intervention en direct
      clientId: bon.clientId || "ext", clientNom: bon.clientNom || (fr ? "Client LOCKR" : "LOCKR client"), clientTel: bon.clientTel || "",
      adresse: bon.adresse, probleme: bon.probleme, metier: metierOf(bon),
      montant: bon.montantEstime, statut: "assignée", createdAt: ts(),
      bonType: bon.postedBy === "platform" ? "platform" : "partner",
      bonId: bon.id, techPct: Number(bon.techPct) || PCT_DEFAULT, postedBy: bon.postedBy, postedByNom: bon.postedByNom,
      ...(bon.postedBy && bon.postedBy !== "platform" ? { posterPct: posterPctFor(bon.techPct) } : {}),
      rdvDate: rdvOpts.rdvDate, paymentDate: rdvOpts.paymentDate,
      rdv2Date: rdvOpts.rdv2Date, urgence: !!bon.urgence, region: bon.region,
      ...(bon.fromBookingId ? { fromBookingId: bon.fromBookingId } : {}),
      ...(bon.lat && bon.lng ? { lat: bon.lat, lng: bon.lng, clientPos: [bon.lat, bon.lng] } : {}),
      ...(bon.isDemo ? { isDemo: true } : {}),
    };
    bk.participants = bookingParticipants(bk);
    if (live) {
      // Création de l'intervention + suppression du bon en une seule opération
      try {
        await runBatch([{ collection: "bookings", id: bk.id, data: bk }, { type: "delete", collection: "bons", id: bon.id }]);
      } catch (e) {
        console.error("[bon]", e);
        tooLate();
        return;
      }
    } else {
      setBookings(p => [...p, bk]);
      setBons(p => p.filter(b => b.id !== bon.id));
    }
    setRdvModal(null);
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    const suffix = rdvOpts.rdvDate ? ` — ${tr.rdvScheduled}` : "";
    setNotif({ ok: true, text: `${tr.bonusAccepted} ${bon.titre}${suffix}` });
    setTimeout(() => setNotif(null), 4000);
  };

  const poster = async () => {
    const montant = parseFloat(newBon.montantEstime);
    if (!newBon.titre.trim() || !newBon.adresse.trim() || !(montant > 0)) {
      setPostErr(fr ? "Titre, adresse et montant estimé sont obligatoires." : "Title, address and estimated amount are required.");
      return;
    }
    setPosting(true);
    const geo = await geocodeAddress(newBon.adresse);
    const b = {
      id: uid(), ...newBon, titre: newBon.titre.trim(), adresse: newBon.adresse.trim(), montantEstime: montant,
      techPct: Math.min(PCT_DEFAULT, Math.max(TECH_PCT_MIN, Number(newBon.techPct) || 70)), // part de l'apporteur plafonnée
      metier: metierOf(newBon), postedBy: account.id, postedByNom: account.nom, region: myRegion,
      ...(geo ? { lat: geo[0], lng: geo[1] } : {}), createdAt: ts(),
    };
    setBons(p => [...p, b]);
    setPosting(false);
    setPostModal(false);
    setPostErr("");
    setNewBon(emptyBon);
    setNotif({ ok: true, text: fr ? "Bon publié : il est visible par les artisans de votre région." : "Job posted: visible to craftsmen in your area." });
    setTimeout(() => setNotif(null), 4000);
  };
  const myPosted = visibleFor(account, bons).filter(b => b.postedBy === account.id);

  return (
    <div style={{ padding: "14px", overflowY: "auto", flex: 1 }}>
      {notif && <div role="status" style={{ background: notif.ok ? "rgba(62,207,142,.15)" : "rgba(220,38,38,.08)", border: `1px solid ${notif.ok ? "rgba(62,207,142,.3)" : "rgba(220,38,38,.25)"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>{notif.ok ? Icon.check(T.success, 16) : Icon.warning(T.danger, 16)}<span style={{ color: notif.ok ? T.success : T.danger, fontWeight: 600, fontSize: 13 }}>{notif.text}</span></div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16 }}>{tr.availableBonuses}</div>
          <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{tr.regionLabel} : {myRegion}</div>
        </div>
        <button onClick={() => setPostModal(true)} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "9px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{Icon.plus("#fff", 15)} {tr.post}</button>
      </div>
      {hiddenOtherTrades > 0 && (
        <button onClick={() => setAllTrades(true)} style={{ width: "100%", background: "rgba(0,0,0,.03)", border: `1px dashed ${T.border}`, borderRadius: 10, padding: "9px", marginBottom: 12, color: T.textMid, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
          {fr ? `+ ${hiddenOtherTrades} bon(s) d'autres métiers — afficher` : `+ ${hiddenOtherTrades} job(s) in other trades — show`}
        </button>
      )}
      {allTrades && myTrades.length > 0 && (
        <button onClick={() => setAllTrades(false)} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 10, padding: "6px 0", fontFamily: "'Inter',sans-serif" }}>{fr ? "← Uniquement mes métiers" : "← Only my trades"}</button>
      )}
      {bonsRegion.filter(b => !skipped[b.id]).length === 0 && <div style={{ textAlign: "center", padding: "48px 20px" }}>{Icon.list(T.textLo, 36)}<div style={{ color: T.textLo, fontSize: 14, marginTop: 12 }}>{tr.noBonusRegion}</div></div>}
      {bonsRegion.filter(b => !skipped[b.id]).map(bon => {
        const IC = PROB_ICONS[bon.probleme] || Icon.tool;
        const techEarn = (Number(bon.montantEstime) || 0) * proShareRate(bon);
        const isRecommended = proScore >= 5 && bon.urgence;
        const dist = bon.lat && bon.lng ? haversineKm(proPos0, bon) : null;
        const disp = dispatchState(bon, priorityOrder);
        return (
          <div key={bon.id} className="lk-card" style={{ padding: "14px", marginBottom: 10, border: isRecommended ? `1.5px solid ${T.gold}` : undefined }}>
            <div style={{ display: "flex", gap: 6, marginBottom: bon.urgence || isRecommended || bon.clientId ? 8 : 0, flexWrap: "wrap" }}>
              {bon.urgence && <div className="lk-tag-urgent" style={{ display: "inline-block" }}>URGENT</div>}
              {bon.clientId && <div style={{ background: "rgba(37,99,235,.08)", border: "1px solid rgba(37,99,235,.2)", color: "#2563eb", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>{fr ? "Demande client" : "Client request"}</div>}
              {isRecommended && <div style={{ display: "inline-block", background: "rgba(201,160,48,.1)", border: "1px solid rgba(201,160,48,.3)", color: T.gold, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, letterSpacing: ".3px" }}>{tr.recommendedForYou}</div>}
              {!disp.open && disp.current === account.artisanId && <div style={{ background: "rgba(220,38,38,.08)", color: T.danger, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>{fr ? `Réservé pour vous ${Math.ceil(disp.remaining / 1000)} s` : `Reserved for you ${Math.ceil(disp.remaining / 1000)}s`}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(201,160,48,.1)", border: "1px solid rgba(201,160,48,.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{IC(T.accent, 19)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{bon.titre}</div>
                  <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>📍 {maskAddress(bon.adresse)}{dist != null ? ` · ${dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}` : ""}</div>
                  <div style={{ color: T.textLo, fontSize: 11, marginTop: 2, opacity: .8 }}>{fr ? "Adresse exacte communiquée après acceptation" : "Exact address after acceptance"}</div>
                </div>
              </div>
              <div style={{ color: T.accent, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{fmtFrom(bon.montantEstime, lang)}</div>
            </div>
            <div style={{ background: "rgba(62,207,142,.06)", border: "1px solid rgba(62,207,142,.15)", borderRadius: 10, padding: "10px 12px", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.textLo, fontSize: 12 }}>{tr.yourSharePct} ({pctLabel(bon)})</span>
              <span style={{ color: T.success, fontWeight: 700, fontSize: 13 }}>{fmt(techEarn)}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setRdvModal(bon)} className="lk-btn" style={{ flex: 1, fontSize: 13, padding: "11px 16px" }}>{tr.acceptBon} {Icon.arrow("#fff", 13)}</button>
              <button onClick={() => setSkipped(p => ({ ...p, [bon.id]: true }))} className="lk-ghost" aria-label={fr ? "Masquer ce bon" : "Hide this job"} style={{ padding: "11px 14px", fontSize: 13 }}>✕</button>
            </div>
          </div>
        );
      })}

      {/* Mes bons publiés (pour d'autres artisans) */}
      {myPosted.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{fr ? "Mes bons publiés" : "My posted jobs"} ({myPosted.length})</div>
          {myPosted.map(b => (
            <div key={b.id} className="lk-card" style={{ padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{b.titre}</div>
                <div style={{ fontSize: 11, color: T.textLo }}>{b.adresse} · {fmtFrom(b.montantEstime, lang)} · {pctLabel(b)}</div>
              </div>
              <button onClick={() => { if (window.confirm(fr ? "Retirer ce bon ?" : "Remove this job?")) setBons(p => p.filter(x => x.id !== b.id)); }} style={{ background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 8, padding: "6px 10px", color: T.danger, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>{fr ? "Retirer" : "Remove"}</button>
            </div>
          ))}
        </div>
      )}

      {rdvModal && <RdvAcceptModal bon={rdvModal} onConfirm={(opts) => confirmRdv(rdvModal, opts)} onCancel={() => setRdvModal(null)} lang={lang} />}
      {postModal && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", maxHeight: "85vh", overflowY: "auto", animation: "slideUp .3s ease", fontFamily: "'Inter',sans-serif" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 17, marginBottom: 20 }}>{tr.postBonus}</div>
            <div style={{ marginBottom: 14 }}><label className="lk-label">{tr.titleLabel}</label><input className="lk-input" value={newBon.titre} onChange={e => setNewBon(p => ({ ...p, titre: e.target.value }))} placeholder={fr ? "Ex : Porte claquée urgence" : "E.g. Locked out, urgent"} /></div>
            <div style={{ marginBottom: 14 }}><label className="lk-label">{tr.clientAddress}</label><input className="lk-input" value={newBon.adresse} onChange={e => setNewBon(p => ({ ...p, adresse: e.target.value }))} placeholder="15 rue de la Paix, Paris" autoComplete="street-address" /></div>
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.interventionTypeLabel}</label>
              <select className="lk-input" value={newBon.probleme} onChange={e => setNewBon(p => ({ ...p, probleme: e.target.value }))} style={{ cursor: "pointer" }}>
                {METIERS.map(m => (
                  <optgroup key={m.id} label={pLabel(m, lang)}>
                    {PROBLEMES.filter(p => p.metier === m.id).map(p => <option key={p.id} value={p.id}>{pLabel(p, lang)}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}><label className="lk-label">{tr.estimatedAmount}</label><input type="number" inputMode="decimal" className="lk-input" value={newBon.montantEstime} onChange={e => setNewBon(p => ({ ...p, montantEstime: e.target.value }))} placeholder="150" /></div>
            <div style={{ marginBottom: 20 }}>
              <label className="lk-label">{tr.technicianShare} : {newBon.techPct}%</label>
              <input type="range" min={TECH_PCT_MIN} max={PCT_DEFAULT} step={5} value={newBon.techPct} onChange={e => setNewBon(p => ({ ...p, techPct: parseInt(e.target.value, 10) }))} style={{ width: "100%", accentColor: T.accent }} />
              <div style={{ fontSize: 11, color: T.textLo, marginTop: 4 }}>{fr ? `Vous recevez ${posterPctFor(newBon.techPct)} % comme apporteur (${APPORTEUR_MAX_PCT} % maximum) · LOCKR ${Math.round(LOCKR_COMMISSION * 100)} %` : `You receive ${posterPctFor(newBon.techPct)}% as referrer (max ${APPORTEUR_MAX_PCT}%) · LOCKR ${Math.round(LOCKR_COMMISSION * 100)}%`}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 20 }}>
              <input type="checkbox" id="urgence" checked={newBon.urgence} onChange={e => setNewBon(p => ({ ...p, urgence: e.target.checked }))} style={{ accentColor: T.danger }} />
              <label htmlFor="urgence" style={{ color: T.textMid, fontSize: 13, cursor: "pointer" }}>{tr.urgentIntervention}</label>
            </div>
            {postErr && <div role="alert" style={{ color: T.danger, fontSize: 12, marginBottom: 12 }}>{postErr}</div>}
            <button onClick={poster} disabled={posting} className="lk-btn" style={{ marginBottom: 10 }}>{posting ? "…" : tr.publishBonus}</button>
            <button onClick={() => { setPostModal(false); setPostErr(""); }} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── EARNINGS CHART ─── */
function EarningsChart({ bookings, artisanId, apports = [], lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const MONTH_LABELS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
  const done = bookings.filter(b => b.artisanId === artisanId && isBillable(b));
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: MONTH_LABELS[d.getMonth()] };
  });
  const data = months.map(m => {
    const bks = done.filter(b => { const d = new Date(b.createdAt); return d.getFullYear() === m.year && d.getMonth() === m.month; });
    const total = bks.reduce((s, b) => s + proShare(b), 0);
    return { ...m, value: total, count: bks.length, missions: bks };
  });
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const lastMonthIdx = data.length - 1;
  const [selIdx, setSelIdx] = useState(lastMonthIdx);
  const sel = data[selIdx];

  return (
    <div style={{ padding: "14px" }}>
      <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{tr.earnings}</div>
      {/* Selected month KPI */}
      <div style={{ background: selIdx === lastMonthIdx ? "rgba(62,207,142,.06)" : "rgba(201,160,48,.06)", border: `1px solid ${selIdx === lastMonthIdx ? "rgba(62,207,142,.2)" : "rgba(201,160,48,.2)"}`, borderRadius: 14, padding: "16px", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ color: selIdx === lastMonthIdx ? T.success : T.accent, fontWeight: 900, fontSize: 28 }}>{fmt(sel.value)}</div>
            <div style={{ color: T.textLo, fontSize: 12, marginTop: 4 }}>{sel.label} {sel.year}{selIdx === lastMonthIdx ? ` — ${tr.currentMonth}` : ""}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: T.textMid, fontSize: 13, fontWeight: 700 }}>{sel.count} {tr.missionsCount}</div>
            <div style={{ color: T.textLo, fontSize: 11, marginTop: 2 }}>{tr.earningsShare}</div>
          </div>
        </div>
        {/* Mission list for selected month */}
        {sel.missions.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {sel.missions.map(b => (
              <div key={b.id} style={{ background: "rgba(255,255,255,.6)", borderRadius: 8, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: T.textHi, fontSize: 12, fontWeight: 600 }}>{b.clientNom}</div>
                  <div style={{ color: T.textLo, fontSize: 10 }}>{new Date(b.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB")}</div>
                </div>
                <div style={{ color: selIdx === lastMonthIdx ? T.success : T.accent, fontWeight: 800, fontSize: 13 }}>{fmt(proShare(b))}</div>
              </div>
            ))}
          </div>
        )}
        {sel.missions.length === 0 && (
          <div style={{ color: T.textLo, fontSize: 12, marginTop: 8, textAlign: "center" }}>{tr.noMissionThisMonth}</div>
        )}
        {selIdx !== lastMonthIdx && sel.missions.length > 0 && (
          <button onClick={() => {
            const lines = [`RELEVÉ DE GAINS LOCKR — ${sel.label} ${sel.year}`, `Artisan : ${artisanId}`, `Édité le : ${new Date().toLocaleDateString("fr-FR")}`, `---`, ...sel.missions.map(b => `${fmtDate(b.createdAt)} | ${b.clientNom} | ${pLabel(PROBLEMES.find(p => p.id === b.probleme), "fr") || b.probleme} | Total : ${fmt(bookingTotal(b))} | Votre part (${pctLabel(b)}) : ${fmt(proShare(b))}`), `---`, `Total des prestations : ${fmt(sel.missions.reduce((s2, b) => s2 + bookingTotal(b), 0))}`, `Commission LOCKR : ${fmt(sel.missions.reduce((s2, b) => s2 + lockrShare(b), 0))}`, `TOTAL NET POUR VOUS : ${fmt(sel.value)}`].join("\n");
            const blob = new Blob([lines], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `releve_gains_lockr_${sel.label}_${sel.year}.txt`; a.click();
            URL.revokeObjectURL(url);
          }} style={{ marginTop: 12, width: "100%", background: T.grad, border: "none", borderRadius: 10, padding: "10px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
            {Icon.file("#fff", 13)} {tr.downloadInvoiceMonth} — {sel.label} {sel.year}
          </button>
        )}
      </div>
      {/* Bar chart — clickable */}
      <div style={{ color: T.textMid, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>{tr.clickMonthDetail}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, marginBottom: 6 }}>
        {data.map((d, i) => (
          <button key={i} onClick={() => setSelIdx(i)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'Inter',sans-serif" }}>
            <div style={{ color: T.textLo, fontSize: 9, fontWeight: 600 }}>{d.value > 0 ? fmt(d.value) : ""}</div>
            <div style={{ width: "100%", height: `${Math.max((d.value / maxVal) * 100, 4)}%`,
              background: selIdx === i ? (i === lastMonthIdx ? "linear-gradient(180deg,#3ecf8e,#2aaf77)" : T.grad) : (i === lastMonthIdx ? "rgba(62,207,142,.3)" : "rgba(201,160,48,.25)"),
              borderRadius: "6px 6px 0 0", border: selIdx === i ? `2px solid ${i === lastMonthIdx ? T.success : T.accent}` : "2px solid transparent", transition: "all .15s" }} />
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", color: selIdx === i ? (i === lastMonthIdx ? T.success : T.accent) : T.textLo, fontSize: 11, fontWeight: selIdx === i ? 700 : 400 }}>{d.label}</div>
        ))}
      </div>
      {/* Apports : bons transmis à d'autres professionnels */}
      {apports.length > 0 && (
        <div className="lk-card" style={{ padding: "14px", marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{lang === "en" ? "Referral earnings (jobs passed on)" : "Apports (bons transmis)"}</div>
            <div style={{ color: "#7c3aed", fontWeight: 800, fontSize: 15 }}>{fmt(apports.reduce((s, b) => s + posterShare(b), 0))}</div>
          </div>
          {apports.slice().reverse().map(b => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid rgba(0,0,0,.05)", fontSize: 12 }}>
              <span style={{ color: T.textMid }}>{fmtDate(b.termineeLe || b.createdAt)} · {b.artisanNom || "—"} · {fmt(bookingTotal(b))}</span>
              <span style={{ fontWeight: 700, color: b.posterPaid ? T.success : T.warn }}>{fmt(posterShare(b))} {b.posterPaid ? "✓" : (lang === "en" ? "(pending)" : "(à venir)")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── CALENDAR SCREEN ─── */
function CalendarScreen({ bookings, artisanId, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const now = new Date();
  const [curYear, setCurYear] = useState(now.getFullYear());
  const [curMonth, setCurMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  // RDV programmés + missions en attente/en cours (affichées le jour de leur création si pas de RDV)
  const myBk = bookings.filter(b => b.artisanId === artisanId && (b.rdvDate || b.rdv2Date || ["assignée", "en_route", "en_cours"].includes(b.statut)));

  const prevMonth = () => { if (curMonth === 0) { setCurYear(y => y - 1); setCurMonth(11); } else setCurMonth(m => m - 1); };
  const nextMonth = () => { if (curMonth === 11) { setCurYear(y => y + 1); setCurMonth(0); } else setCurMonth(m => m + 1); };

  const MONTH_NAMES_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const MONTH_NAMES_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAY_NAMES_FR = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  const DAY_NAMES_EN = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const monthNames = lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_FR;
  const dayNames = lang === "en" ? DAY_NAMES_EN : DAY_NAMES_FR;

  const firstDay = new Date(curYear, curMonth, 1);
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
  // Monday-based offset
  let startOffset = firstDay.getDay() - 1; if (startOffset < 0) startOffset = 6;
  const cells = Array(startOffset).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  while (cells.length % 7 !== 0) cells.push(null);

  const getRdvForDay = (day) => {
    if (!day) return [];
    const dateStr = `${curYear}-${String(curMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return myBk.filter(b => {
      const r1 = b.rdvDate ? b.rdvDate.slice(0, 10) : null;
      const r2 = b.rdv2Date ? b.rdv2Date.slice(0, 10) : null;
      // Mission en attente sans RDV → visible le jour de sa création
      const pending = !r1 && !r2 && ["assignée", "en_route", "en_cours"].includes(b.statut) ? (b.createdAt || "").slice(0, 10) : null;
      return r1 === dateStr || r2 === dateStr || pending === dateStr;
    });
  };

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isToday = (day) => day && `${curYear}-${String(curMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` === todayStr;

  const selBk = selectedDay ? getRdvForDay(selectedDay) : [];

  return (
    <div style={{ padding: "14px" }}>
      {/* Header mois */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={prevMonth} className="lk-ghost" style={{ padding: "8px 12px" }}>{Icon.back()}</button>
        <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, letterSpacing: "-.3px" }}>
          {monthNames[curMonth]} {curYear}
        </div>
        <button onClick={nextMonth} className="lk-ghost" style={{ padding: "8px 12px" }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Grille jours */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 14 }}>
        {dayNames.map(d => (
          <div key={d} style={{ textAlign: "center", color: T.textLo, fontSize: 11, fontWeight: 700, padding: "4px 0", textTransform: "uppercase", letterSpacing: ".5px" }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          const rdvs = getRdvForDay(day);
          const hasRdv = rdvs.length > 0;
          const isTd = isToday(day);
          return (
            <button key={i} onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
              style={{
                border: `1px solid ${selectedDay === day ? T.accent : isTd ? T.gold : "rgba(0,0,0,.07)"}`,
                borderRadius: 10, padding: "8px 4px", cursor: day ? "pointer" : "default",
                background: selectedDay === day ? "rgba(28,28,28,.06)" : isTd ? "rgba(201,160,48,.08)" : "transparent",
                minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                fontFamily: "'Inter',sans-serif", transition: "all .15s"
              }}>
              {day && <>
                <span style={{ color: isTd ? T.gold : T.textHi, fontWeight: isTd ? 800 : 500, fontSize: 14 }}>{day}</span>
                {hasRdv && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
                    {rdvs.slice(0, 2).map((b, j) => (
                      <div key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: b.urgence ? T.danger : T.gold }} />
                    ))}
                  </div>
                )}
                {rdvs.length > 2 && <span style={{ fontSize: 9, color: T.textLo }}>+{rdvs.length - 2}</span>}
              </>}
            </button>
          );
        })}
      </div>

      {/* Détail du jour sélectionné */}
      {selectedDay && (
        <div style={{ animation: "fadeUp .2s ease" }}>
          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
            {selectedDay} {monthNames[curMonth]} — {selBk.length > 0 ? `${selBk.length} RDV` : tr.noRdvDay}
          </div>
          {selBk.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px", color: T.textLo, fontSize: 13 }}>
              {Icon.calendar(T.textLo, 28)}
              <div style={{ marginTop: 8 }}>{tr.noRdvDay}</div>
            </div>
          )}
          {selBk.map(b => {
            const pr = PROBLEMES.find(p => p.id === b.probleme);
            const isRdv1 = b.rdvDate && b.rdvDate.slice(0, 10) === `${curYear}-${String(curMonth+1).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}`;
            return (
              <div key={b.id} className="lk-card" style={{ padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <div style={{ background: isRdv1 ? "rgba(201,160,48,.1)" : "rgba(30,158,107,.1)", borderRadius: 6, padding: "2px 7px" }}>
                        <span style={{ color: isRdv1 ? T.gold : T.success, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
                          {isRdv1 ? tr.rdvLabel : tr.rdv2Label}
                        </span>
                      </div>
                      {b.urgence && <div className="lk-tag-urgent">{tr.urgent}</div>}
                    </div>
                    <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{pLabel(pr, lang) || b.probleme}</div>
                    <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{b.clientNom} · {b.adresse}</div>
                  </div>
                  <div style={{ color: T.accent, fontWeight: 800, fontSize: 16 }}>{fmt(b.montant)}</div>
                </div>
                {b.rdvDate && isRdv1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    {Icon.clock(T.gold, 13)}
                    <span style={{ color: T.textMid, fontSize: 12 }}>{new Date(b.rdvDate).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                    {b.acompte > 0 && !b.acompteRecu && (
                      <span style={{ color: T.warn, fontSize: 11, fontWeight: 600, marginLeft: 8 }}>{tr.acompteNotif} {fmt(b.acompte)}</span>
                    )}
                    {b.acompte > 0 && b.acompteRecu && (
                      <span style={{ color: T.success, fontSize: 11, fontWeight: 600, marginLeft: 8 }}>{tr.acompteReceived}</span>
                    )}
                  </div>
                )}
                {b.rdv2Date && !isRdv1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    {Icon.clock(T.success, 13)}
                    <span style={{ color: T.textMid, fontSize: 12 }}>{new Date(b.rdv2Date).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
                {b.paymentDate && isRdv1 && (
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                    {Icon.euro(T.textLo, 12)}
                    <span style={{ color: T.textLo, fontSize: 11 }}>{tr.paymentDateLabel} : {new Date(b.paymentDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB")}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── RDV ACCEPT MODAL ─── (intervention immédiate ou rendez-vous) */
function RdvAcceptModal({ bon, onConfirm, onCancel, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  const [mode, setMode] = useState(bon.urgence ? "immediate" : "rdv");
  const [rdvDate, setRdvDate] = useState("");
  const [rdvTime, setRdvTime] = useState("09:00");
  const [hasRdv2, setHasRdv2] = useState(false);
  const [rdv2Date, setRdv2Date] = useState("");
  const [rdv2Time, setRdv2Time] = useState("14:00");
  const minDate = new Date().toISOString().slice(0, 10);
  const toIso = (d, t) => new Date(`${d}T${t}:00`).toISOString(); // heure locale → ISO (fuseau correct)

  const handleConfirm = () => {
    onConfirm({
      mode,
      rdvDate: mode === "rdv" && rdvDate ? toIso(rdvDate, rdvTime) : new Date().toISOString(),
      rdv2Date: mode === "rdv" && hasRdv2 && rdv2Date ? toIso(rdv2Date, rdv2Time) : null,
      paymentDate: null,
    });
  };
  const canConfirm = mode === "immediate" || (mode === "rdv" && rdvDate);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", maxHeight: "90vh", overflowY: "auto", animation: "slideUp .3s ease", fontFamily: "'Inter',sans-serif" }}>
        <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{bon.titre}</div>
        <div style={{ color: T.textLo, fontSize: 12, marginBottom: 20 }}>📍 {maskAddress(bon.adresse)} · {fmtFrom(bon.montantEstime, lang)}</div>
        <label className="lk-label">{tr.bonAcceptMode}</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[{ id: "immediate", ic: "⚡", l: tr.immediateIntervention }, { id: "rdv", ic: "📅", l: tr.scheduleRdv }].map(o => (
            <button key={o.id} onClick={() => setMode(o.id)} style={{ background: mode === o.id ? "rgba(201,160,48,.08)" : "transparent", border: `1.5px solid ${mode === o.id ? T.accent : "rgba(0,0,0,.1)"}`, borderRadius: 12, padding: "14px 10px", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{o.ic}</div>
              <div style={{ color: mode === o.id ? T.accent : T.textMid, fontWeight: 700, fontSize: 12 }}>{o.l}</div>
            </button>
          ))}
        </div>
        {mode === "rdv" && (
          <div style={{ animation: "fadeUp .2s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 10, marginBottom: 14 }}>
              <div><label className="lk-label">{tr.rdvDate}</label><input type="date" className="lk-input" value={rdvDate} min={minDate} onChange={e => setRdvDate(e.target.value)} /></div>
              <div><label className="lk-label">{fr ? "Heure" : "Time"}</label><input type="time" className="lk-input" value={rdvTime} onChange={e => setRdvTime(e.target.value)} /></div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: T.textMid, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              <input type="checkbox" checked={hasRdv2} onChange={e => setHasRdv2(e.target.checked)} style={{ accentColor: T.success, width: 16, height: 16 }} /> {tr.rdv2Label}
            </label>
            {hasRdv2 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 10, marginBottom: 14 }}>
                <div><label className="lk-label">{tr.rdv2Label}</label><input type="date" className="lk-input" value={rdv2Date} min={rdvDate || minDate} onChange={e => setRdv2Date(e.target.value)} /></div>
                <div><label className="lk-label">{fr ? "Heure" : "Time"}</label><input type="time" className="lk-input" value={rdv2Time} onChange={e => setRdv2Time(e.target.value)} /></div>
              </div>
            )}
          </div>
        )}
        <button onClick={handleConfirm} disabled={!canConfirm} className="lk-btn" style={{ marginBottom: 10, marginTop: 6 }}>
          {mode === "rdv" ? tr.confirmRdv : tr.acceptBonus} {Icon.check("#fff", 14)}
        </button>
        <button onClick={onCancel} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
      </div>
    </div>,
    document.body
  );
}

/* ─── CHAT INTERVENTION (pro ↔ client) ─── */
function ChatIntervention({ booking, account, interventionChats, setInterventionChats, otherNom, onClose, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const bookingId = booking?.id;
  const [msg, setMsg] = useState("");
  const bottomRef = useRef(null);
  // Messages partagés en temps réel entre le client et l'artisan (collection « messages »)
  const messages = (interventionChats || []).filter(m => m.bookingId === bookingId);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = () => {
    if (!msg.trim()) return;
    // Les participants de la mission sont copiés : eux seuls peuvent lire le message
    const participants = Array.isArray(booking?.participants) ? booking.participants : bookingParticipants(booking || {});
    const m = { id: uid(), bookingId, participants, auteurId: account.id, auteurNom: account.nom, texte: msg.trim(), createdAt: ts() };
    setInterventionChats(p => [...p, m]);
    setMsg("");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 900, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, height: "72vh", display: "flex", flexDirection: "column", animation: "slideUp .3s ease", boxShadow: "0 -8px 40px rgba(0,0,0,.15)" }}>
        {/* Header */}
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(201,160,48,.1)", border: "1.5px solid rgba(201,160,48,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: T.gold }}>{initial(otherNom)}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{otherNom}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.success }} />
              <span style={{ color: T.textLo, fontSize: 11 }}>{tr.interventionInProgress}</span>
            </div>
          </div>
          <button onClick={onClose} className="lk-ghost" style={{ padding: "7px 10px" }}>{Icon.x()}</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, background: "#fafaf8" }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 20px" }}>
              {Icon.chat(T.textLo, 32)}
              <div style={{ color: T.textLo, fontSize: 13, marginTop: 10 }}>{tr.chatStart}</div>
            </div>
          )}
          {messages.map(m => {
            const isMe = m.auteurId === account.id;
            return (
              <div key={m.id} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
                <div style={{ maxWidth: "75%" }}>
                  {!isMe && <div style={{ color: T.textLo, fontSize: 10, marginBottom: 3, fontWeight: 600 }}>{m.auteurNom}</div>}
                  <div style={{ background: isMe ? T.accent : "#fff", borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 14px", color: isMe ? "#fff" : T.textHi, fontSize: 14, lineHeight: 1.5, boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
                    {m.texte}
                  </div>
                  <div style={{ color: T.textLo, fontSize: 10, marginTop: 3, textAlign: isMe ? "right" : "left" }}>{fmtTime(m.createdAt)}</div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "center", background: T.surface }}>
          <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} className="lk-input" placeholder={tr.yourMessage} style={{ flex: 1 }} />
          <button onClick={send} disabled={!msg.trim()} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "11px 16px", cursor: "pointer", flexShrink: 0, opacity: msg.trim() ? 1 : .4 }}>
            {Icon.send("#fff", 16)}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Dossier en cours de vérification : le pro voit clairement pourquoi il ne
   reçoit pas encore de missions et ce qu'il doit faire. */
function PendingApprovalCard({ account, setAccounts, lang = "fr" }) {
  const fr = lang !== "en";
  const rejected = account.dossierStatus === "rejected";
  return (
    <>
    {!rejected && <EmailVerifyNotice lang={lang} account={account} setAccounts={setAccounts} required />}
    <div style={{ background: rejected ? "rgba(220,38,38,.06)" : "rgba(217,119,6,.07)", border: `1px solid ${rejected ? "rgba(220,38,38,.25)" : "rgba(217,119,6,.25)"}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: rejected ? T.danger : T.warn, marginBottom: 4 }}>
        {rejected ? (fr ? "Dossier refusé" : "Application rejected") : (fr ? "Dossier en cours de vérification" : "Application under review")}
      </div>
      <div style={{ fontSize: 12.5, color: T.textMid, lineHeight: 1.55 }}>
        {rejected
          ? <>{account.rejectReason ? <><b>{fr ? "Motif" : "Reason"} :</b> {account.rejectReason}<br /></> : null}{fr ? "Corrigez votre dossier puis écrivez à support@lockr.fr pour une nouvelle vérification." : "Fix your application then write to support@lockr.fr for a new review."}</>
          : (fr ? "Notre équipe vérifie vos documents (identité, SIRET, assurance) sous 48 h. Vous recevrez des missions dès la validation." : "Our team checks your documents (ID, SIRET, insurance) within 48h. You will receive jobs once approved.")}
      </div>
    </div>
    </>
  );
}

/* ─── CARTES DE PROFIL COMMUNES (tous les espaces) ─── */
/* Changement de mot de passe (mot de passe actuel exigé) */
function PasswordChangeCard({ account, setAccounts, lang = "fr" }) {
  const fr = lang !== "en";
  const [cur, setCur] = useState("");
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setMsg(null);
    if (n1.length < MIN_PASS) return setMsg({ ok: false, t: fr ? `${MIN_PASS} caractères minimum.` : `${MIN_PASS} characters minimum.` });
    if (n1 !== n2) return setMsg({ ok: false, t: fr ? "Les deux mots de passe ne correspondent pas." : "Passwords do not match." });
    setBusy(true);
    if (live) {
      // Firebase Authentication : vérifie le mot de passe actuel puis le remplace
      const r = await changePassword(cur, n1);
      setBusy(false);
      if (r.error) return setMsg({ ok: false, t: authErrorText(r.error, lang) });
    } else {
      if (!(await checkPassword(account, cur))) { setBusy(false); return setMsg({ ok: false, t: authErrorText("bad_current", lang) }); }
      const fields = await passwordFields(n1);
      setAccounts(p => p.map(a => a.id === account.id ? { ...a, ...fields, passChangedAt: ts() } : a));
      setBusy(false);
    }
    setCur(""); setN1(""); setN2("");
    setMsg({ ok: true, t: fr ? "Mot de passe modifié ✓" : "Password changed ✓" });
  };
  return (
    <div className="lk-card" style={{ padding: "16px 18px", marginTop: 16 }}>
      <EmailVerifyNotice lang={lang} account={account} setAccounts={setAccounts} required={["pro", "partenaire"].includes(account.role) && account.dossierStatus === "pending"} />
      <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>🔑 {fr ? "Changer mon mot de passe" : "Change my password"}</div>
      <input className="lk-input" type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} placeholder={fr ? "Mot de passe actuel" : "Current password"} style={{ marginBottom: 8 }} />
      <input className="lk-input" type="password" autoComplete="new-password" value={n1} onChange={e => setN1(e.target.value)} placeholder={fr ? `Nouveau mot de passe (${MIN_PASS} car. min.)` : `New password (${MIN_PASS}+ chars)`} style={{ marginBottom: 8 }} />
      <input className="lk-input" type="password" autoComplete="new-password" value={n2} onChange={e => setN2(e.target.value)} placeholder={fr ? "Confirmer le nouveau mot de passe" : "Confirm new password"} style={{ marginBottom: 10 }} />
      {msg && <div role="status" style={{ fontSize: 12, color: msg.ok ? T.success : T.danger, marginBottom: 10 }}>{msg.t}</div>}
      <button onClick={submit} disabled={busy || !cur || !n1} className="lk-ghost" style={{ width: "100%" }}>{busy ? "…" : (fr ? "Mettre à jour" : "Update")}</button>
    </div>
  );
}

/* Droits RGPD : export réel des données, suppression réelle du compte */
function RgpdCard({ account, setAccounts, bookings = [], openLegal, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  const exportData = () => {
    const { passHash, salt, pass, ...profil } = account; // eslint-disable-line no-unused-vars
    const mine = bookings.filter(b => b.clientId === account.id || (account.artisanId && b.artisanId === account.artisanId) || b.partenaireId === account.id);
    const blob = new Blob([JSON.stringify({ compte: profil, interventions: mine, exporteLe: ts() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `lockr-mes-donnees-${account.id}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const [delOpen, setDelOpen] = useState(false);
  const [delPass, setDelPass] = useState("");
  const [delErr, setDelErr] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const deleteAccount = async () => {
    const msg = fr ? "Supprimer définitivement votre compte ? Vos factures sont conservées 10 ans (obligation légale), le reste est effacé." : "Permanently delete your account? Invoices are kept for 10 years (legal obligation), everything else is erased.";
    if (!live) {
      if (!window.confirm(msg)) return;
      setAccounts(p => p.filter(a => a.id !== account.id)); // la déconnexion est automatique
      return;
    }
    // Production : mot de passe exigé avant une action irréversible
    if (!delOpen) { setDelOpen(true); return; }
    if (!delPass) return;
    setDelBusy(true); setDelErr("");
    const ok = await confirmPassword(delPass);
    if (ok.error) { setDelBusy(false); setDelErr(authErrorText(ok.error, lang)); return; }
    if (!window.confirm(msg)) { setDelBusy(false); return; }
    const r = await deleteOwnAccount();
    if (r.error) { setDelBusy(false); setDelErr(authErrorText(r.error, lang)); }
  };
  return (
    <div className="lk-card" style={{ padding: "18px 20px", marginTop: 16, borderLeft: "4px solid #2563eb" }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 10 }}>🛡️ {tr.rgpdTitle}</div>
      {[tr.rgpdAccess, tr.rgpdRectif, tr.rgpdErase, tr.rgpdPorta].map((r, i) => (
        <div key={i} style={{ fontSize: 12, color: T.textMid, marginBottom: 6, paddingLeft: 10, borderLeft: "2px solid rgba(37,99,235,.25)" }}>{r}</div>
      ))}
      <div style={{ fontSize: 11, color: T.textLo, marginTop: 8 }}>{tr.rgpdContact}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={exportData} className="lk-ghost" style={{ fontSize: 12, flex: "1 1 160px" }}>{fr ? "Télécharger mes données" : "Download my data"}</button>
        {openLegal && <button onClick={() => openLegal("privacy")} className="lk-ghost" style={{ fontSize: 12, flex: "1 1 160px" }}>{fr ? "Centre légal" : "Legal center"}</button>}
        <button onClick={deleteAccount} disabled={delBusy} className="lk-ghost" style={{ fontSize: 12, flex: "1 1 160px", color: T.danger, borderColor: "rgba(220,38,38,.3)" }}>{delBusy ? "…" : delOpen ? (fr ? "Confirmer la suppression" : "Confirm deletion") : (fr ? "Supprimer mon compte" : "Delete my account")}</button>
      </div>
      {delOpen && (
        <div style={{ marginTop: 10 }}>
          <input className="lk-input" type="password" autoComplete="current-password" value={delPass} onChange={e => { setDelPass(e.target.value); setDelErr(""); }} placeholder={fr ? "Votre mot de passe, pour confirmer" : "Your password, to confirm"} />
          {delErr && <div role="alert" style={{ color: T.danger, fontSize: 12, marginTop: 6 }}>{delErr}</div>}
        </div>
      )}
    </div>
  );
}

/* ─── PRO PROFILE TAB ─── */
function ProProfileTab({ account, setAccounts, bookings, lang = "fr", openLegal }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  const [ville, setVille] = useState(account.ville || "");
  const [tel, setTel] = useState(account.tel || "");
  const [tarif, setTarif] = useState(String(account.tarif || 85));
  const [metiers, setMetiers] = useState(proMetiers(account));
  const [transport, setTransport] = useState(account.transport || "voiture");
  const [iban, setIban] = useState(account.iban || "");
  const [radius, setRadius] = useState(account.radius || 10);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const DAYS_DEF = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false, start: "08:00", end: "19:00" };
  const [schedule, setSchedule] = useState(account.schedule || DAYS_DEF);
  const DAYS = [
    { id: "mon", l: tr.monday }, { id: "tue", l: tr.tuesday }, { id: "wed", l: tr.wednesday },
    { id: "thu", l: tr.thursday }, { id: "fri", l: tr.friday }, { id: "sat", l: tr.saturday },
    { id: "sun", l: tr.sunday },
  ];
  const myDone = bookings.filter(b => b.artisanId === account.artisanId && b.statut === "terminée");
  const ratings = myDone.filter(b => b.satisfactionNote);
  const avgNote = ratings.length ? (ratings.reduce((s, b) => s + b.satisfactionNote, 0) / ratings.length).toFixed(1) : null;
  const dossierStatus = account.dossierStatus || "approved";
  const statusColor = dossierStatus === "approved" ? T.success : dossierStatus === "rejected" ? T.danger : T.warn;
  const statusLabel = dossierStatus === "approved" ? tr.dossierApproved : dossierStatus === "rejected" ? tr.dossierRejected : tr.dossierPending;

  const save = async () => {
    setErr("");
    if (!ville.trim()) return setErr(fr ? "La ville est obligatoire." : "City is required.");
    if (!metiers.length) return setErr(fr ? "Choisissez au moins un métier." : "Choose at least one trade.");
    if (iban.trim() && !ibanValid(iban)) return setErr(fr ? "IBAN invalide." : "Invalid IBAN.");
    const t = parseFloat(tarif);
    if (!(t > 0)) return setErr(fr ? "Prix de départ invalide." : "Invalid starting price.");
    // Nouvelle ville → coordonnées recalculées (distance des bons, carte)
    const geo = ville.trim() !== (account.ville || "") ? await geocodeAddress(ville.trim()) : null;
    setAccounts(p => p.map(a => a.id === account.id ? {
      ...a, ville: ville.trim(), tel, tarif: t, metiers, metier: metiers[0], transport, iban: iban.replace(/\s/g, ""), radius, schedule,
      ...(geo ? { lat: geo[0], lng: geo[1] } : {}),
    } : a));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ padding: "14px", overflowY: "auto" }}>
      {saved && (
        <div role="status" style={{ background: "rgba(30,158,107,.1)", border: "1px solid rgba(30,158,107,.25)", borderRadius: 12, padding: "12px 14px", marginBottom: 14, color: T.success, fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8, animation: "fadeUp .2s ease" }}>
          {Icon.check(T.success, 14)} {fr ? "Profil enregistré" : "Profile saved"}
        </div>
      )}
      {/* Statut dossier */}
      <div className="lk-card" style={{ padding: "14px", marginBottom: 14 }}>
        <div style={{ color: T.textLo, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 8 }}>{tr.dossierStatus}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor }} />
          <span style={{ color: statusColor, fontWeight: 700, fontSize: 14 }}>{statusLabel}</span>
        </div>
        {dossierStatus === "rejected" && account.rejectReason && (
          <div style={{ color: T.textMid, fontSize: 12, marginTop: 8, background: "rgba(220,38,38,.05)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>{account.rejectReason}</div>
        )}
        {dossierStatus === "pending" && (
          <div style={{ color: T.textMid, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{fr ? "Notre équipe vérifie votre dossier sous 48 h." : "Our team reviews your application within 48h."}</div>
        )}
      </div>

      {/* Avis clients */}
      {ratings.length > 0 && (
        <div className="lk-card" style={{ padding: "14px", marginBottom: 14 }}>
          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.myRatings}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: T.gold }}>{avgNote}</div>
            <div style={{ color: T.textLo, fontSize: 12 }}>{ratings.length} {tr.reviews}</div>
          </div>
        </div>
      )}

      {/* Infos modifiables */}
      <div className="lk-card" style={{ padding: "14px", marginBottom: 14 }}>
        <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>{Icon.user(T.accent, 15)} {tr.editProfile}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label className="lk-label">{tr.city}</label><input className="lk-input" value={ville} onChange={e => setVille(e.target.value)} placeholder="Paris" /></div>
          <div><label className="lk-label">{tr.phone}</label><input className="lk-input" type="tel" value={tel} onChange={e => setTel(e.target.value)} placeholder="06 12 34 56 78" /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="lk-label">{fr ? "Prix de départ affiché aux clients (€)" : "Starting price shown to clients (€)"}</label>
          <input className="lk-input" type="number" inputMode="decimal" value={tarif} onChange={e => setTarif(e.target.value)} placeholder="85" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="lk-label">{fr ? "Mes métiers" : "My trades"}</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {METIERS.map(m => {
              const on = metiers.includes(m.id);
              return <button key={m.id} type="button" onClick={() => setMetiers(p => on ? p.filter(x => x !== m.id) : [...p, m.id])} style={{ background: on ? "rgba(201,160,48,.1)" : "#fff", border: `1.5px solid ${on ? T.accent : T.border}`, borderRadius: 20, padding: "7px 12px", fontSize: 12, fontWeight: 700, color: on ? T.accent : T.textMid, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{on ? "✓ " : ""}{pLabel(m, lang)}</button>;
            })}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="lk-label">{tr.transport}</label>
          <select className="lk-input" value={transport} onChange={e => setTransport(e.target.value)} style={{ cursor: "pointer" }}>
            <option value="voiture">{tr.car}</option>
            <option value="scooter">{tr.scooter}</option>
            <option value="moto">{tr.motorcycle}</option>
            <option value="velo">{tr.bicycle}</option>
            <option value="pied">{tr.onFoot}</option>
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="lk-label">{tr.ibanLabel}</label>
          <input className="lk-input" value={iban} onChange={e => setIban(e.target.value.toUpperCase())} placeholder="FR76 XXXX XXXX XXXX" />
        </div>
        <div style={{ marginBottom: 4 }}>
          <label className="lk-label">{tr.coverageRadius} : {radius} km</label>
          <input type="range" min={5} max={50} step={5} value={radius} onChange={e => setRadius(parseInt(e.target.value, 10))} style={{ width: "100%", accentColor: T.accent }} />
        </div>
      </div>

      {/* Planning */}
      <div className="lk-card" style={{ padding: "14px", marginBottom: 14 }}>
        <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>{Icon.calendar(T.accent, 15)} {tr.workSchedule}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {DAYS.map(d => (
            <button key={d.id} onClick={() => setSchedule(s => ({ ...s, [d.id]: !s[d.id] }))} style={{ background: schedule[d.id] ? T.grad : "rgba(0,0,0,.04)", border: `1px solid ${schedule[d.id] ? T.accent : "rgba(0,0,0,.1)"}`, borderRadius: 8, padding: "7px 11px", color: schedule[d.id] ? "#fff" : T.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
              {d.l}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label className="lk-label">{tr.startHour}</label><input type="time" className="lk-input" value={schedule.start} onChange={e => setSchedule(s => ({ ...s, start: e.target.value }))} /></div>
          <div><label className="lk-label">{tr.endHour}</label><input type="time" className="lk-input" value={schedule.end} onChange={e => setSchedule(s => ({ ...s, end: e.target.value }))} /></div>
        </div>
      </div>

      {err && <div role="alert" style={{ color: T.danger, fontSize: 12, marginBottom: 10 }}>{err}</div>}
      <button onClick={save} className="lk-btn">{Icon.check("#fff", 15)} {tr.saveProfile}</button>

      <StripeConnectCard lang={lang} account={account} />
      <PasswordChangeCard account={account} setAccounts={setAccounts} lang={lang} />
      <RgpdCard account={account} setAccounts={setAccounts} bookings={bookings} openLegal={openLegal} lang={lang} />
    </div>
  );
}

/* ─── MARKETPLACE PRO ─── */
const MARKET_CATS = ["Outils", "Pièces", "Équipements", "Matériaux"];
const MARKET_ETATS = ["Neuf", "Très bon état", "Occasion"];
const MARKET_METIERS = [
  { id: "all",          label: "Tous secteurs", labelEn: "All sectors",   color: "#6b7280", icon: Icon.tool },
  { id: "serrurier",    label: "Serrurerie",    labelEn: "Locksmithing",  color: "#1e3a8a", icon: Icon.key,     photo: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=70" },
  { id: "plombier",     label: "Plomberie",     labelEn: "Plumbing",      color: "#0ea5e9", icon: Icon.droplet, photo: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=600&q=70" },
  { id: "electricien",  label: "Électricité",   labelEn: "Electrical",    color: "#f59e0b", icon: Icon.bolt,    photo: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&q=70" },
  { id: "chauffagiste", label: "Chauffage",     labelEn: "Heating",       color: "#ef4444", icon: Icon.flame,   photo: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=70" },
  { id: "fermetures",   label: "Fermetures",    labelEn: "Closures",      color: "#6d28d9", icon: Icon.home,    photo: "https://5.imimg.com/data5/SELLER/Default/2024/2/387831320/WJ/FZ/OR/112702737/collapsible-shutter-gate-1000x1000.jpg" },
];
const mLabel = (m, lang) => (lang === "en" && m?.labelEn) ? m.labelEn : (m?.label || "");

/* ─── MARKETPLACE : MES ACHATS ET VENTES ───
   Le paiement de l'acheteur est conservé par LOCKR jusqu'à la réception de
   l'article, puis 85 % sont versés au vendeur (automatiquement après 14 jours
   sans problème signalé). */
function MarketplaceOrders({ account, sales = [], setSales, lang = "fr" }) {
  const fr = lang !== "en";
  const [problemFor, setProblemFor] = useState(null);
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const mine = visibleFor(account, sales)
    .filter(x => (x.acheteurId === account.id || x.vendeurId === account.id) && x.statut !== "en_attente_paiement")
    .sort((x, y) => String(y.payeLe || y.createdAt || "").localeCompare(String(x.payeLe || x.createdAt || "")))
    .slice(0, 20);
  if (!mine.length) return null;
  const releaseDate = x => x.liberationAuto || (x.payeLe ? new Date(new Date(x.payeLe).getTime() + MARKETPLACE_RELEASE_DAYS * 86400000).toISOString() : null);
  const act = async (x, action, text) => {
    setBusy(x.id + action); setMsg(null);
    if (live) {
      const r = await marketplaceAction(x.id, action, text);
      setBusy(null);
      if (!r.ok) { setMsg({ ok: false, t: fr ? "Action impossible pour le moment, réessayez." : "Not possible right now, please retry." }); return false; }
    } else {
      // Démonstration : même résultat, en local
      setSales(p => p.map(y => y.id !== x.id ? y : action === "recu"
        ? { ...y, statut: "terminée", recuLe: ts(), termineeLe: ts(), liberation: "recu", vendeurPaye: true, vendeurPayeLe: ts(), vendeurVerse: marketSellerNet(y) }
        : { ...y, statut: "litige", litige: { motif: text, ouvertLe: ts(), par: account.id } }));
      setBusy(null);
    }
    setMsg({ ok: true, t: action === "recu" ? (fr ? "Merci ! Le vendeur va être payé." : "Thanks! The seller will be paid.") : (fr ? "Problème signalé : l'équipe LOCKR vous recontacte. Le versement au vendeur est suspendu." : "Issue reported: the LOCKR team will contact you. The seller payout is on hold.") });
    return true;
  };
  return (
    <div className="lk-card" style={{ padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi, marginBottom: 8 }}>{fr ? "Mes achats et ventes" : "My purchases and sales"}</div>
      {msg && <div role="status" style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? T.success : T.danger, marginBottom: 8 }}>{msg.t}</div>}
      {mine.map(x => {
        const buyer = x.acheteurId === account.id;
        const net = marketSellerNet(x);
        const until = releaseDate(x);
        let line;
        if (x.statut === "payée") line = buyer
          ? (fr ? `Paiement conservé par LOCKR — versé au vendeur quand vous confirmez la réception${until ? ` (automatiquement le ${fmtDate(until)})` : ""}.` : `Payment held by LOCKR — released to the seller once you confirm receipt${until ? ` (automatically on ${fmtDate(until)})` : ""}.`)
          : (fr ? `Payé par l'acheteur. Expédiez l'article : ${fmt(net)} vous seront versés à la réception${until ? ` (au plus tard le ${fmtDate(until)})` : ""}.` : `Paid by the buyer. Ship the item: ${fmt(net)} will be paid to you on receipt${until ? ` (by ${fmtDate(until)} at the latest)` : ""}.`);
        else if (x.statut === "litige") line = buyer
          ? (fr ? "Problème signalé — l'équipe LOCKR vous recontacte." : "Issue reported — the LOCKR team will contact you.")
          : (fr ? `L'acheteur a signalé un problème${x.litige?.motif ? ` : « ${x.litige.motif} »` : ""}. L'équipe LOCKR vous contacte.` : `The buyer reported an issue${x.litige?.motif ? `: "${x.litige.motif}"` : ""}. The LOCKR team will contact you.`);
        else if (x.statut === "terminée") line = buyer
          ? (fr ? "Article reçu ✓" : "Item received ✓")
          : x.vendeurPaye ? (fr ? `Versé : ${fmt(x.vendeurVerse || net)} ✓` : `Paid out: ${fmt(x.vendeurVerse || net)} ✓`) : (fr ? `Versement de ${fmt(net)} en cours` : `Payout of ${fmt(net)} in progress`);
        else if (x.statut === "remboursée" || x.statut === "remboursement") line = buyer ? (fr ? "Remboursé ✓" : "Refunded ✓") : (fr ? "Vente annulée : l'acheteur a été remboursé." : "Sale cancelled: the buyer was refunded.");
        else if (x.statut === "declaree_vendeur") line = fr ? `Vente déclarée — commission LOCKR due : ${fmt(x.commission)}` : `Declared sale — LOCKR commission due: ${fmt(x.commission)}`;
        else line = x.statut;
        return (
          <div key={x.id} style={{ borderTop: `1px solid ${T.border}`, padding: "9px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: T.textHi, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buyer ? (fr ? "Achat" : "Purchase") : (fr ? "Vente" : "Sale")} · {x.titre}</div>
              <div style={{ fontWeight: 800, fontSize: 12.5, color: T.accent, flexShrink: 0 }}>{fmt(x.prix)}</div>
            </div>
            <div style={{ fontSize: 11.5, color: T.textMid, marginTop: 2, lineHeight: 1.45 }}>{line}</div>
            {!buyer && x.statut === "payée" && x.livraison && <div style={{ fontSize: 11, color: T.textLo, marginTop: 2 }}>{fr ? "Livraison" : "Delivery"} : {x.acheteurNom} · {x.livraison.adresse}, {x.livraison.zip} {x.livraison.ville}{x.acheteurTel ? ` · ${x.acheteurTel}` : ""}</div>}
            {buyer && x.statut === "payée" && problemFor !== x.id && (
              <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                <button disabled={!!busy} onClick={() => { if (window.confirm(fr ? `Confirmer la réception de « ${x.titre} » ? Le vendeur sera payé.` : `Confirm receipt of "${x.titre}"? The seller will be paid.`)) act(x, "recu"); }} className="lk-btn" style={{ flex: 2, padding: "8px 10px", fontSize: 12 }}>{busy === x.id + "recu" ? "…" : (fr ? "J'ai reçu l'article" : "I received the item")}</button>
                <button disabled={!!busy} onClick={() => { setProblemFor(x.id); setMotif(""); }} className="lk-ghost" style={{ flex: 1, padding: "8px 10px", fontSize: 12, color: T.danger }}>{fr ? "Signaler un problème" : "Report a problem"}</button>
              </div>
            )}
            {problemFor === x.id && (
              <div style={{ marginTop: 7 }}>
                <textarea className="lk-input" rows={3} value={motif} onChange={e => setMotif(e.target.value)} placeholder={fr ? "Décrivez le problème (article non reçu, abîmé, non conforme…)" : "Describe the problem (not received, damaged, not as described…)"} style={{ resize: "vertical", marginBottom: 6 }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button disabled={motif.trim().length < 5 || !!busy} onClick={async () => { if (await act(x, "probleme", motif.trim())) setProblemFor(null); }} className="lk-btn" style={{ flex: 2, padding: "8px 10px", fontSize: 12, background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}>{busy ? "…" : (fr ? "Envoyer" : "Send")}</button>
                  <button onClick={() => setProblemFor(null)} className="lk-ghost" style={{ flex: 1, padding: "8px 10px", fontSize: 12 }}>{fr ? "Annuler" : "Cancel"}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProMarketplace({ account, listings, setListings, sales = [], setSales, lang, isPartner = false }) {
  const tr = TRANS[lang] || TRANS.fr;
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [selMetier, setSelMetier] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [filterOwn, setFilterOwn] = useState(false);
  const [search, setSearch] = useState("");
  const [newModal, setNewModal] = useState(false);
  const [form, setForm] = useState({ titre: "", desc: "", prix: "", categorie: "Outils", etat: "Neuf", metier: account.metier || "serrurier", marque: "", modele: "" });
  const [posted, setPosted] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [buyStep, setBuyStep] = useState(0); // 0=aucun 1=adresse 2=paiement 3=confirmation
  const emptyBuy = { nom: account.nom || "", adresse: "", ville: account.ville || "", zip: "", tel: account.tel || "" };
  const [buyForm, setBuyForm] = useState(emptyBuy);
  const [buyError, setBuyError] = useState("");
  const [pendingSale, setPendingSale] = useState(null);
  const [proposePrice, setProposePrice] = useState("");
  const [proposeSent, setProposeSent] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const fr = lang !== "en";
  // Nouvelle annonce — photos obligatoires (min 3)
  const [newPhotos, setNewPhotos] = useState([]);
  const newPhotoRef = useRef(null);
  const [photoError, setPhotoError] = useState("");
  // Marque / Modèle
  const [brandSearch, setBrandSearch] = useState("");
  const BRANDS = ["Bosch","Makita","DeWalt","Milwaukee","Hilti","Stanley","Facom","Knipex","Legrand","Schneider","Grohe","Hansgrohe","Vaillant","Saunier Duval","Autres"];
  const [showBrandDrop, setShowBrandDrop] = useState(false);

  // Annonces de démo masquées aux vrais comptes ; plus récentes en premier
  const allListings = visibleFor(account, listings).slice().sort((x, y) => String(y.createdAt || "").localeCompare(String(x.createdAt || "")));
  const visible = allListings.filter(l => {
    if (filterOwn && l.proId !== account.id) return false;
    if (selMetier !== "all" && l.metier !== selMetier) return false;
    if (filterCat !== "all" && l.categorie !== filterCat) return false;
    if (search && !(l.titre || "").toLowerCase().includes(search.toLowerCase()) && !(l.desc || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const post = () => {
    if (!form.titre.trim() || !(Number(form.prix) > 0)) { setPhotoError(fr ? "Titre et prix obligatoires." : "Title and price required."); return; }
    if (newPhotos.length < 3) { setPhotoError(fr ? "3 photos minimum requises." : "At least 3 photos required."); return; }
    setPhotoError("");
    const nl = { id: uid(), proId: account.id, proNom: account.nom, metier: form.metier, titre: form.titre, desc: form.desc, prix: Number(form.prix), categorie: form.categorie, etat: form.etat, marque: form.marque, modele: form.modele, photos: newPhotos, photo: newPhotos[0] || null, tel: account.tel || "", createdAt: ts() };
    setListings(p => [nl, ...p]);
    setForm({ titre: "", desc: "", prix: "", categorie: "Outils", etat: "Neuf", metier: account.metier || "serrurier", marque: "", modele: "" });
    setNewPhotos([]);
    setPosted(true);
    setNewModal(false);
    setTimeout(() => setPosted(false), 3000);
  };
  // Photos compressées (≈ 80 Ko chacune) : 5 photos tiennent dans une annonce
  const handleNewPhoto = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files) {
      try {
        const data = await compressImage(f, { maxSize: 900, quality: 0.65 });
        setNewPhotos(p => p.length < 5 ? [...p, data] : p);
      } catch { setPhotoError(fr ? "Une image n'a pas pu être lue (format JPEG ou PNG conseillé)." : "An image could not be read (use JPEG or PNG)."); }
    }
  };

  const detail = detailId ? listings.find(l => l.id === detailId) : null;
  const metierColor = (mid) => MARKET_METIERS.find(m => m.id === mid)?.color || T.accent;
  const metierLabel = (mid) => MARKET_METIERS.find(m => m.id === mid)?.label || mid;
  const curMetier = MARKET_METIERS.find(m => m.id === selMetier);

  return (
    <div style={{ padding: "0" }}>
      {/* ── Hero banner image de fond ── */}
      <div style={{ position: "relative", height: 150, overflow: "hidden" }}>
        <img src="https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=900&q=80" alt=""
          onError={e => { e.target.style.display="none"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 60%" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(201,160,48,.88) 0%,rgba(168,120,32,.75) 60%,rgba(30,30,30,.6) 100%)" }} />
        <div style={{ position: "relative", height: "100%", padding: "0 18px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,.2)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Icon.card("#fff", 20)}
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 900, fontSize: 20, letterSpacing: "-.5px" }}>{tr.marketplace}</div>
              <div style={{ color: "rgba(255,255,255,.75)", fontSize: 12 }}>{isPartner ? (lang === "en" ? "Buy & sell equipment as a company" : "Achetez et vendez du matériel en tant qu'entreprise") : tr.marketplaceDesc}</div>
            </div>
          </div>
          {/* Badge commission */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <div style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 20, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6 }}>
              {Icon.percent("#fff", 12)}
              <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>{fr ? `${MARKET_COMMISSION * 100} % de commission LOCKR sur chaque vente` : `${MARKET_COMMISSION * 100}% LOCKR commission per sale`}</span>
            </div>
          </div>
        </div>
        {/* Bouton nouvelle annonce superposé */}
        <button onClick={() => setNewModal(true)} style={{ position: "absolute", top: 14, right: 14, background: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: T.accent, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 10px rgba(0,0,0,.2)", fontFamily: "'Inter',sans-serif" }}>
          {Icon.plus(T.accent, 13)} {tr.newListing}
        </button>
      </div>

      {/* ── Notification ── */}
      <div style={{ padding: "10px 14px 0" }}>
        {posted && <div style={{ background: "rgba(62,207,142,.1)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 10, color: T.success, fontWeight: 600, fontSize: 13 }}>{Icon.check(T.success, 14)} {tr.listingPosted}</div>}
        <MarketplaceOrders account={account} sales={sales} setSales={setSales} lang={lang} />
      </div>

      {/* ── Onglets secteurs avec photo de fond ── */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 14px 14px", scrollbarWidth: "none" }}>
        {MARKET_METIERS.map(m => {
          const isSelected = selMetier === m.id;
          const count = m.id === "all" ? allListings.length : allListings.filter(l => l.metier === m.id).length;
          return (
            <button key={m.id} onClick={() => { setSelMetier(m.id); setFilterCat("all"); }}
              style={{ position: "relative", flexShrink: 0, width: m.id === "all" ? 80 : 110, height: 72, borderRadius: 14, overflow: "hidden", cursor: "pointer", border: `2.5px solid ${isSelected ? m.color : "transparent"}`, fontFamily: "'Inter',sans-serif", boxShadow: isSelected ? `0 4px 14px ${m.color}50` : "0 2px 8px rgba(0,0,0,.12)", transition: "all .15s" }}>
              {m.photo && <img src={m.photo} alt="" onError={e => { e.target.style.display="none"; }}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
              <div style={{ position: "absolute", inset: 0, background: isSelected ? `${m.color}dd` : m.id === "all" ? "rgba(30,30,30,.75)" : "rgba(10,10,10,.55)" }} />
              <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                {m.icon("#fff", 18)}
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 10, textAlign: "center", lineHeight: 1.2 }}>{mLabel(m, lang)}</div>
                <div style={{ background: "rgba(255,255,255,.25)", borderRadius: 20, padding: "1px 6px", fontSize: 9, color: "#fff", fontWeight: 700 }}>{count}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Bandeau secteur sélectionné ── */}
      {selMetier !== "all" && curMetier && (
        <div style={{ position: "relative", margin: "0 14px 14px", borderRadius: 14, overflow: "hidden", height: 60, animation: "fadeUp .2s ease" }}>
          {curMetier.photo && <img src={curMetier.photo} alt="" onError={e => { e.target.style.display="none"; }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%" }} />}
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg,${curMetier.color}ee,${curMetier.color}88)` }} />
          <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
            {curMetier.icon("#fff", 22)}
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{mLabel(curMetier, lang)}</div>
              <div style={{ color: "rgba(255,255,255,.75)", fontSize: 11 }}>{visible.length} annonce{visible.length > 1 ? "s" : ""}</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "0 14px" }}>
        {/* ── Filtres secondaires ── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setFilterOwn(!filterOwn)} style={{ background: filterOwn ? T.accent : T.card, color: filterOwn ? "#fff" : T.textMid, border: `1px solid ${filterOwn ? T.accent : T.border}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.myListings}</button>
          {[{ id: "all", l: tr.filterAll }, ...MARKET_CATS.map(c => ({ id: c, l: c }))].map(c => (
            <button key={c.id} onClick={() => setFilterCat(c.id)} style={{ background: filterCat === c.id ? T.grad : T.card, color: filterCat === c.id ? "#fff" : T.textMid, border: `1px solid ${filterCat === c.id ? T.accent : T.border}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{c.l}</button>
          ))}
        </div>
        <input className="lk-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une annonce…" style={{ marginBottom: 14 }} />

        {/* ── Liste annonces ── */}
        {visible.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: T.textLo }}>{Icon.tool(T.textLo, 32)}<div style={{ marginTop: 10 }}>{tr.noListings}</div></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {visible.map(l => {
              const mc = metierColor(l.metier);
              const mPhoto = MARKET_METIERS.find(m => m.id === l.metier)?.photo;
              const isMine = l.proId === account.id;
              return (
                <div key={l.id} onClick={() => setDetailId(l.id)} style={{ background: "#fff", border: `1.5px solid ${T.border}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,.07)", transition: "transform .15s, box-shadow .15s" }}
                  onMouseEnter={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 6px 18px rgba(0,0,0,.12)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,.07)"; }}>
                  {/* Photo de fond du secteur */}
                  <div style={{ height: 76, position: "relative", overflow: "hidden" }}>
                    {(l.photo || mPhoto) && <img src={l.photo || mPhoto} alt="" onError={e => { e.target.style.display="none"; }}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: l.photo ? 1 : .45 }} />}
                    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg,${mc}30,${mc}10)` }} />
                    {!l.photo && <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 38, height: 38, borderRadius: 11, background: `${mc}25`, border: `1px solid ${mc}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {Icon.tool(mc, 19)}
                      </div>
                    </div>}
                    {l.sold && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>{fr ? "VENDU" : "SOLD"}</div>}
                    <div style={{ position: "absolute", top: 5, right: 5, background: l.etat === "Neuf" ? "rgba(62,207,142,.9)" : "rgba(201,160,48,.85)", borderRadius: 20, padding: "2px 6px", fontSize: 8, fontWeight: 700, color: "#fff" }}>{l.etat}</div>
                    {isMine && <div style={{ position: "absolute", top: 5, left: 5, background: "rgba(201,160,48,.85)", borderRadius: 20, padding: "2px 6px", fontSize: 8, fontWeight: 700, color: "#fff" }}>Moi</div>}
                    <div style={{ position: "absolute", bottom: 5, left: 6, background: `${mc}cc`, borderRadius: 8, padding: "1px 6px", fontSize: 8, color: "#fff", fontWeight: 700 }}>{metierLabel(l.metier)}</div>
                  </div>
                  <div style={{ padding: "9px 10px 11px" }}>
                    <div style={{ color: T.textHi, fontWeight: 700, fontSize: 11, lineHeight: 1.3, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{l.titre}</div>
                    <div style={{ color: mc, fontWeight: 800, fontSize: 14, marginBottom: 3 }}>{fmt(l.prix)}</div>
                    {(l.marque || l.modele) && <div style={{ color: T.textLo, fontSize: 9, marginBottom: 2 }}>{[l.marque, l.modele].filter(Boolean).join(" · ")}</div>}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ color: T.textLo, fontSize: 9 }}>{l.proNom}</div>
                      <div style={{ background: `${mc}12`, borderRadius: 7, padding: "1px 5px", fontSize: 8, color: mc, fontWeight: 600 }}>{l.categorie}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal nouvelle annonce */}
      {newModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "20px 20px 32px", animation: "slideUp .3s ease", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 18px" }} />
            <div style={{ color: T.textHi, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>{tr.newListing}</div>
            {/* Secteur d'activité */}
            <label className="lk-label">Secteur d'activité</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginBottom: 14 }}>
              {MARKET_METIERS.filter(m => m.id !== "all").map(m => (
                <button key={m.id} onClick={() => setForm(p => ({ ...p, metier: m.id }))}
                  style={{ position: "relative", height: 52, borderRadius: 11, overflow: "hidden", border: `2px solid ${form.metier === m.id ? m.color : "rgba(0,0,0,.1)"}`, cursor: "pointer", fontFamily: "'Inter',sans-serif", boxShadow: form.metier === m.id ? `0 2px 10px ${m.color}40` : "none" }}>
                  {m.photo && <img src={m.photo} alt="" onError={e => { e.target.style.display="none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: .4 }} />}
                  <div style={{ position: "absolute", inset: 0, background: form.metier === m.id ? `${m.color}cc` : "rgba(20,20,20,.45)" }} />
                  <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: "100%" }}>
                    {m.icon("#fff", 14)}
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 11 }}>{mLabel(m, lang)}</span>
                  </div>
                </button>
              ))}
            </div>
            <label className="lk-label">{tr.listingTitle}</label>
            <input className="lk-input" value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))} placeholder="Ex: Perceuse Bosch 18V…" style={{ marginBottom: 12 }} />
            <label className="lk-label">{tr.listingDesc}</label>
            <textarea className="lk-input" value={form.desc} onChange={e => setForm(p => ({ ...p, desc: e.target.value }))} placeholder="Décrivez le matériel, son état, les accessoires inclus…" rows={3} style={{ marginBottom: 12, resize: "none" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label className="lk-label">{tr.listingPrice}</label>
                <input className="lk-input" type="number" value={form.prix} onChange={e => setForm(p => ({ ...p, prix: e.target.value }))} placeholder="150" />
              </div>
              <div>
                <label className="lk-label">{tr.listingCondition}</label>
                <select className="lk-input" value={form.etat} onChange={e => setForm(p => ({ ...p, etat: e.target.value }))} style={{ cursor: "pointer" }}>
                  {MARKET_ETATS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
            <label className="lk-label">{tr.listingCategory}</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {MARKET_CATS.map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, categorie: c }))} style={{ background: form.categorie === c ? T.grad : T.card, color: form.categorie === c ? "#fff" : T.textMid, border: `1px solid ${form.categorie === c ? T.accent : T.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{c}</button>
              ))}
            </div>
            {/* Marque */}
            <label className="lk-label">Marque</label>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input className="lk-input" value={form.marque || brandSearch} onChange={e => { setBrandSearch(e.target.value); setForm(p => ({ ...p, marque: e.target.value })); setShowBrandDrop(true); }} placeholder="Bosch, Makita, DeWalt…" onFocus={() => setShowBrandDrop(true)} />
              {showBrandDrop && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid rgba(0,0,0,.1)", borderRadius: 10, zIndex: 999, maxHeight: 180, overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }}>
                  {BRANDS.filter(b => !brandSearch || b.toLowerCase().includes(brandSearch.toLowerCase())).map(b => (
                    <button key={b} type="button" onClick={() => { setForm(p => ({ ...p, marque: b })); setBrandSearch(b); setShowBrandDrop(false); }} style={{ width: "100%", background: "none", border: "none", padding: "9px 14px", cursor: "pointer", textAlign: "left", fontSize: 13, color: T.textHi, fontFamily: "'Inter',sans-serif" }}>{b}</button>
                  ))}
                </div>
              )}
            </div>
            {/* Modèle */}
            <div style={{ marginBottom: 18 }}>
              <label className="lk-label">Modèle</label>
              <input className="lk-input" value={form.modele || ""} onChange={e => setForm(p => ({ ...p, modele: e.target.value }))} placeholder="Ex: GSB 18V-55, M18, DCD771…" />
            </div>
            {/* Photos obligatoires (min 3) */}
            <div style={{ marginBottom: 18 }}>
              <label className="lk-label">Photos * (minimum 3)</label>
              <input ref={newPhotoRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleNewPhoto} />
              <button type="button" onClick={() => newPhotoRef.current?.click()} style={{ width: "100%", background: "rgba(0,0,0,.02)", border: "1.5px dashed rgba(28,28,28,.2)", borderRadius: 10, padding: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Inter',sans-serif", marginBottom: 10 }}>
                {Icon.cam(T.accent, 20)}
                <span style={{ color: T.accent, fontWeight: 600, fontSize: 13 }}>{fr ? `Ajouter des photos (${newPhotos.length}/5 — 3 minimum)` : `Add photos (${newPhotos.length}/5 — 3 minimum)`}</span>
              </button>
              {newPhotos.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {newPhotos.map((p, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={p} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(0,0,0,.1)" }} />
                      <button type="button" onClick={() => setNewPhotos(prev => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, background: T.danger, border: "none", borderRadius: "50%", width: 18, height: 18, color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {photoError && <div style={{ color: T.danger, fontSize: 12, marginTop: 6, fontWeight: 600 }}>{photoError}</div>}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setNewModal(false); setNewPhotos([]); setPhotoError(""); }} className="lk-ghost" style={{ flex: 1 }}>{tr.cancel}</button>
              <button onClick={post} className="lk-btn" style={{ flex: 2 }}>{tr.postListing}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal détail annonce — portal pour éviter tout problème de stacking context */}
      {detail && buyStep === 0 && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 9999, display: "flex", alignItems: isDesktop ? "center" : "flex-end", justifyContent: "center", padding: isDesktop ? "20px" : 0 }}>
          <div style={{ background: T.surface, borderRadius: isDesktop ? 20 : "20px 20px 0 0", width: "100%", maxWidth: isDesktop ? 560 : 480, padding: "20px 24px 32px", animation: isDesktop ? "fadeUp .2s ease" : "slideUp .3s ease", maxHeight: isDesktop ? "88vh" : "90vh", overflowY: "auto", boxShadow: isDesktop ? "0 24px 80px rgba(0,0,0,.25)" : "none" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 18px" }} />
            {/* Header with sector photo */}
            {(() => {
              const mc = metierColor(detail.metier);
              const mPhoto = MARKET_METIERS.find(m => m.id === detail.metier)?.photo;
              return (
                <div style={{ position: "relative", height: 90, borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
                  {mPhoto && <img src={mPhoto} alt="" onError={e => { e.target.style.display="none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg,${mc}dd,${mc}88)` }} />
                  <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 900, fontSize: 20 }}>{fmt(detail.prix)}</div>
                      <div style={{ color: "rgba(255,255,255,.8)", fontSize: 11 }}>Le vendeur reçoit {fmt(detail.prix * (1 - MARKET_COMMISSION))}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ background: "rgba(255,255,255,.2)", borderRadius: 20, padding: "3px 10px", fontSize: 10, color: "#fff", fontWeight: 700 }}>{detail.etat}</div>
                      <div style={{ color: "rgba(255,255,255,.7)", fontSize: 10, marginTop: 4 }}>{metierLabel(detail.metier)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, lineHeight: 1.3, marginBottom: 8 }}>{detail.titre}</div>
            {(detail.photos || []).length > 0 && (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 12, WebkitOverflowScrolling: "touch" }}>
                {detail.photos.map((ph, i) => <img key={i} src={ph} alt="" style={{ height: 110, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />)}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}>
              <span style={{ background: "rgba(201,160,48,.1)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 20, padding: "2px 8px", fontSize: 11, color: T.gold, fontWeight: 600 }}>{detail.categorie}</span>
              <span style={{ background: detail.etat === "Neuf" ? "rgba(62,207,142,.1)" : "rgba(201,160,48,.1)", border: `1px solid ${detail.etat === "Neuf" ? "rgba(62,207,142,.25)" : "rgba(201,160,48,.2)"}`, borderRadius: 20, padding: "2px 8px", fontSize: 11, color: detail.etat === "Neuf" ? T.success : T.gold, fontWeight: 600 }}>{detail.etat}</span>
            </div>
            <p style={{ color: T.textMid, fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>{detail.desc || "Aucune description."}</p>
            <button
              type="button"
              onClick={() => {
                const msg = lang === "en" ? "Report this listing to LOCKR moderation?" : "Signaler cette annonce à la modération LOCKR ?";
                if (window.confirm(msg)) window.location.href = `mailto:signalement@lockr.fr?subject=${encodeURIComponent("Signalement annonce — " + detail.titre)}&body=${encodeURIComponent("Annonce ID : " + detail.id)}`;
              }}
              style={{ background: "none", border: "none", color: T.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", padding: "12px 6px", margin: "-12px -6px 0", minHeight: 44, display: "flex", alignItems: "center", gap: 5 }}
            >
              ⚑ {lang === "en" ? "Report this listing" : "Signaler cette annonce"}
            </button>
            {/* Seller */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `${metierColor(detail.metier)}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: metierColor(detail.metier), fontWeight: 800, fontSize: 14 }}>{detail.proNom.charAt(0)}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{detail.proNom}</div>
                <div style={{ color: T.textLo, fontSize: 11 }}>{fmtDate(detail.createdAt)}</div>
              </div>
              {detail.sold && <span style={{ color: T.success, fontSize: 11, fontWeight: 700 }}>{tr.soldLabel}</span>}
            </div>
            {/* Commission info */}
            <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
              {Icon.percent(T.accent, 13)}
              <span style={{ color: T.textMid, fontSize: 12 }}>{fr ? `Commission LOCKR de ${MARKET_COMMISSION * 100} % incluse dans le prix affiché` : `${MARKET_COMMISSION * 100}% LOCKR commission included in the price`}</span>
            </div>
            {/* Proposer un prix */}
            {detail.proId !== account.id && !detail.sold && (
              <div style={{ marginBottom: 12 }}>
                {!proposeSent ? (
                  !showPropose ? (
                    <button onClick={() => setShowPropose(true)} style={{ width: "100%", background: "rgba(201,160,48,.08)", border: "1px solid rgba(201,160,48,.3)", borderRadius: 10, padding: "10px", color: T.accent, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Proposer un prix</button>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="lk-input" type="number" value={proposePrice} onChange={e => setProposePrice(e.target.value)} placeholder="Votre prix (€)" style={{ flex: 1 }} />
                      <button onClick={() => {
                        const v = Number(proposePrice);
                        if (!(v > 0)) return;
                        // L'offre est réellement transmise au vendeur (enregistrée sur l'annonce)
                        setListings(p => p.map(l => l.id === detail.id ? { ...l, offers: [...(l.offers || []).filter(o => o.buyerId !== account.id), { id: uid(), buyerId: account.id, buyerNom: account.nom, prix: v, createdAt: ts(), statut: "en_attente" }] } : l));
                        setProposeSent(true); setShowPropose(false);
                      }} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "10px 16px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{fr ? "Envoyer" : "Send"}</button>
                      <button onClick={() => setShowPropose(false)} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 10, padding: "10px", cursor: "pointer", fontFamily: "'Inter',sans-serif", color: T.textMid, fontSize: 13 }}>✕</button>
                    </div>
                  )
                ) : (
                  <div style={{ background: "rgba(62,207,142,.08)", border: "1px solid rgba(62,207,142,.25)", borderRadius: 10, padding: "10px 14px", color: T.success, fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                    {Icon.check(T.success, 14)} Proposition envoyée au vendeur ({proposePrice} €)
                  </div>
                )}
              </div>
            )}
            {/* Offres reçues — visibles par le vendeur */}
            {detail.proId === account.id && !detail.sold && (detail.offers || []).filter(o => o.statut === "en_attente").length > 0 && (
              <div style={{ background: "rgba(37,99,235,.05)", border: "1px solid rgba(37,99,235,.18)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 8 }}>{fr ? "Offres reçues" : "Offers received"}</div>
                {(detail.offers || []).filter(o => o.statut === "en_attente").map(o => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid rgba(0,0,0,.05)" }}>
                    <div style={{ flex: 1, fontSize: 12, color: T.textMid }}><b style={{ color: T.textHi }}>{fmt(o.prix)}</b> — {o.buyerNom} · {fmtDate(o.createdAt)}</div>
                    <button onClick={() => setListings(p => p.map(l => l.id === detail.id ? { ...l, prix: o.prix, offers: (l.offers || []).map(x => x.id === o.id ? { ...x, statut: "acceptée" } : x.statut === "en_attente" ? { ...x, statut: "refusée" } : x) } : l))} style={{ background: T.success, color: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{fr ? "Accepter" : "Accept"}</button>
                    <button onClick={() => setListings(p => p.map(l => l.id === detail.id ? { ...l, offers: (l.offers || []).map(x => x.id === o.id ? { ...x, statut: "refusée" } : x) } : l))} style={{ background: "none", color: T.danger, border: `1px solid ${T.danger}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{fr ? "Refuser" : "Decline"}</button>
                  </div>
                ))}
              </div>
            )}
            {/* Réponse à mon offre — visible par l'acheteur */}
            {detail.proId !== account.id && (() => {
              const mine = (detail.offers || []).find(o => o.buyerId === account.id);
              if (!mine || mine.statut === "en_attente") return null;
              return <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: mine.statut === "acceptée" ? T.success : T.danger }}>{mine.statut === "acceptée" ? (fr ? `✓ Votre offre de ${fmt(mine.prix)} a été acceptée — vous pouvez acheter.` : `✓ Your ${fmt(mine.prix)} offer was accepted — you can buy now.`) : (fr ? "Votre offre a été refusée." : "Your offer was declined.")}</div>;
            })()}
            {/* Marque / Modèle dans detail */}
            {(detail.marque || detail.modele) && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {detail.marque && <span style={{ background: "rgba(28,28,28,.06)", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: T.textMid, fontWeight: 600 }}>🏷 {detail.marque}</span>}
                {detail.modele && <span style={{ background: "rgba(28,28,28,.06)", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: T.textMid, fontWeight: 600 }}>📋 {detail.modele}</span>}
              </div>
            )}
            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setDetailId(null); setShowPropose(false); setProposeSent(false); setProposePrice(""); }} className="lk-ghost" style={{ flex: 1 }}>{tr.back}</button>
              {detail.proId !== account.id && !detail.sold && (
                <button onClick={() => setBuyStep(1)} style={{ flex: 2, background: T.grad, border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {Icon.card ? Icon.card("#fff", 16) : null} {tr.buyBtn}
                </button>
              )}
              {detail.sold && <div style={{ flex: 2, background: "rgba(62,207,142,.1)", border: "1px solid rgba(62,207,142,.3)", borderRadius: 12, padding: "12px", color: T.success, fontWeight: 700, fontSize: 13, textAlign: "center" }}>{tr.soldLabel}</div>}
              {detail.proId === account.id && !detail.sold && (
                <button onClick={() => {
                  if (!window.confirm(fr ? `Déclarer cet article vendu ? La commission LOCKR de ${MARKET_COMMISSION * 100} % (${fmt(detail.prix * MARKET_COMMISSION)}) sera due.` : `Mark as sold? The ${MARKET_COMMISSION * 100}% LOCKR commission (${fmt(detail.prix * MARKET_COMMISSION)}) will be due.`)) return;
                  const commission = marketCommission(detail.prix);
                  setSales && setSales(p => [...p, { id: uid(), listingId: detail.id, vendeurId: account.id, vendeurNom: account.nom, acheteurId: null, acheteurNom: "—", participants: [account.id], metier: detail.metier, titre: detail.titre, prix: detail.prix, commission, statut: "declaree_vendeur", createdAt: ts() }]);
                  setListings(p => p.map(l => l.id === detail.id ? { ...l, sold: true } : l));
                  setDetailId(null);
                }} style={{ flex: 2, background: "linear-gradient(135deg,#3ecf8e,#2aaf77)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {Icon.check("#fff", 15)} {tr.markSold}
                </button>
              )}
              {detail.proId === account.id && (
                <button aria-label={fr ? "Supprimer l'annonce" : "Delete listing"} onClick={() => { if (!window.confirm(fr ? "Supprimer définitivement cette annonce ?" : "Delete this listing permanently?")) return; setListings(p => p.filter(l => l.id !== detail.id)); setDetailId(null); }} style={{ background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 12, padding: "12px", color: T.danger, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                  {Icon.trash(T.danger, 15)}
                </button>
              )}
            </div>
          </div>
        </div>
      , document.body)}
      {/* Étape 2 — paiement sécurisé Stripe, affiché seul (au-dessus de tout) */}
      {detail && buyStep === 2 && pendingSale && (
        <PayModal
          amount={pendingSale.prix}
          label={`${fr ? "Achat" : "Purchase"} — ${detail.titre}`}
          type="marketplace"
          payRef={pendingSale.id}
          lang={lang}
          onSimulated={() => { applyPayment({ setSales, setListings }, { type: "marketplace", ref: pendingSale.id, demo: true }); setBuyStep(3); }}
          onClose={() => {
            // Paiement abandonné : la commande en attente est supprimée
            if (buyStep === 2) setSales(p => p.filter(x => !(x.id === pendingSale.id && x.statut === "en_attente_paiement")));
            setPendingSale(null); setBuyStep(0);
          }}
        />
      )}
      {/* ── Tunnel d'achat (adresse, confirmation) — portal ── */}
      {detail && (buyStep === 1 || buyStep === 3) && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 9999, display: "flex", alignItems: isDesktop ? "center" : "flex-end", justifyContent: "center", padding: isDesktop ? "20px" : 0 }}>
          <div style={{ background: T.surface, borderRadius: isDesktop ? 20 : "20px 20px 0 0", width: "100%", maxWidth: isDesktop ? 560 : 480, padding: "20px 24px 36px", animation: isDesktop ? "fadeUp .2s ease" : "slideUp .3s ease", maxHeight: isDesktop ? "90vh" : "92vh", overflowY: "auto", boxShadow: isDesktop ? "0 24px 80px rgba(0,0,0,.25)" : "none" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 16px" }} />
            {/* Stepper */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 22 }}>
              {[1,2,3].map((s, i) => (
                <div key={s} style={{ display: "contents" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: buyStep >= s ? T.accent : "#f1f5f9", border: `1.5px solid ${buyStep >= s ? T.accent : "rgba(0,0,0,.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {buyStep > s ? Icon.check("#fff", 12) : <span style={{ color: buyStep === s ? "#fff" : "#94a3b8", fontSize: 12, fontWeight: 700 }}>{s}</span>}
                  </div>
                  {i < 2 && <div style={{ flex: 1, height: 2, background: buyStep > s ? T.accent : "rgba(0,0,0,.08)", borderRadius: 2 }} />}
                </div>
              ))}
              <div style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginLeft: 4 }}>
                {buyStep === 1 ? tr.buyStep1Title : buyStep === 2 ? tr.buyStep2Title : tr.buyStep3Title}
              </div>
            </div>
            {/* Récap article */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13, flex: 1, marginRight: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.titre}</div>
              <div style={{ color: T.accent, fontWeight: 900, fontSize: 15, flexShrink: 0 }}>{fmt(detail.prix)}</div>
            </div>
            {/* STEP 1 — Adresse de livraison */}
            {buyStep === 1 && (
              <>
                <div style={{ color: T.textHi, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>{tr.buyStep1Title}</div>
                <div style={{ marginBottom: 12 }}>
                  <label className="lk-label">{tr.buyFullName}</label>
                  <input className="lk-input" value={buyForm.nom} onChange={e => setBuyForm(p => ({ ...p, nom: e.target.value }))} placeholder="Jean Dupont" />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label className="lk-label">{tr.buyAddress}</label>
                  <input className="lk-input" value={buyForm.adresse} onChange={e => setBuyForm(p => ({ ...p, adresse: e.target.value }))} placeholder="15 rue de la Paix" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <label className="lk-label">{tr.buyCity}</label>
                    <input className="lk-input" value={buyForm.ville} onChange={e => setBuyForm(p => ({ ...p, ville: e.target.value }))} placeholder="Paris" />
                  </div>
                  <div>
                    <label className="lk-label">{tr.buyZip}</label>
                    <input className="lk-input" value={buyForm.zip} onChange={e => setBuyForm(p => ({ ...p, zip: e.target.value }))} placeholder="75001" inputMode="numeric" />
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label className="lk-label">{tr.buyPhone}</label>
                  <input className="lk-input" value={buyForm.tel} onChange={e => setBuyForm(p => ({ ...p, tel: e.target.value }))} placeholder="06 12 34 56 78" inputMode="tel" />
                </div>
                {buyError && <div style={{ background: "rgba(240,101,101,.08)", border: "1px solid rgba(240,101,101,.2)", borderRadius: 10, padding: "10px 14px", color: T.danger, fontSize: 13, marginBottom: 14 }}>{buyError}</div>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => { setBuyStep(0); setBuyError(""); }} className="lk-ghost" style={{ flex: 1 }}>{tr.back}</button>
                  <button onClick={() => {
                    if (!buyForm.nom.trim() || !buyForm.adresse.trim() || !buyForm.ville.trim() || !/^\d{5}$/.test(buyForm.zip.trim()) || buyForm.tel.replace(/\D/g, "").length < 9) return setBuyError(fr ? "Veuillez remplir tous les champs (code postal à 5 chiffres, téléphone valide)." : "Please fill in all fields (5-digit postcode, valid phone).");
                    if (detail.sold) return setBuyError(fr ? "Cet article vient d'être vendu." : "This item has just been sold.");
                    setBuyError("");
                    // Commande enregistrée AVANT le paiement : rien n'est perdu pendant la redirection Stripe
                    const sale = { id: uid(), listingId: detail.id, vendeurId: detail.proId, vendeurNom: detail.proNom, acheteurId: account.id, participants: [account.id, detail.proId], acheteurNom: buyForm.nom.trim(), acheteurTel: buyForm.tel, livraison: { adresse: buyForm.adresse.trim(), ville: buyForm.ville.trim(), zip: buyForm.zip.trim() }, acheteurVille: buyForm.ville.trim(), metier: detail.metier, titre: detail.titre, prix: detail.prix, commission: marketCommission(detail.prix), statut: "en_attente_paiement", createdAt: ts() };
                    setSales(p => [...p, sale]);
                    setPendingSale(sale);
                    setBuyStep(2);
                  }} className="lk-btn" style={{ flex: 2 }}>{tr.buyNext}</button>
                </div>
              </>
            )}
            {/* STEP 3 — Confirmation */}
            {buyStep === 3 && (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ width: 80, height: 80, background: "rgba(62,207,142,.1)", border: "2px solid rgba(62,207,142,.3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", animation: "checkPop .4s ease" }}>
                  {Icon.check(T.success, 34)}
                </div>
                <div style={{ color: T.success, fontWeight: 900, fontSize: 20, marginBottom: 6 }}>{tr.buySuccess}</div>
                <div style={{ color: T.textMid, fontSize: 13, lineHeight: 1.6, marginBottom: 20, padding: "0 10px" }}>{tr.buySuccessDesc}</div>
                <button onClick={() => { setBuyStep(0); setPendingSale(null); setBuyForm(emptyBuy); setDetailId(null); }} className="lk-btn">{tr.close}</button>
              </div>
            )}
          </div>
        </div>
      , document.body)}
    </div>
  );
}

/* ─── HISTORY CARD (pro) ───
   Le pro peut corriger le montant final tant que la mission n'est pas payée
   et envoyer un lien de paiement ; il ne peut plus se déclarer « payé ». */
function HistoryCard({ b, isPaid, pr, tr, setBookings, lang }) {
  const fr = lang !== "en";
  const [totalInput, setTotalInput] = useState(String(b.montantFinal || b.montant || ""));
  const [showForm, setShowForm] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const total = parseFloat(totalInput) || 0;
  // Carte du client encore réservée : débit du montant final
  const hold = empreinteMontant(b);
  const aDebiter = Math.min(resteAPayer(b), hold);
  // Déplacement facturé (mission annulée) : montant fixe, pas de débit d'empreinte ici
  const fee = b.statut !== "terminée" && Number(b.fraisDeplacement) > 0;
  const capture = async () => {
    setBusy(true); setMsg("");
    if (!live) { applyPayment({ setBookings }, { type: "capture", ref: b.id, amount: aDebiter, demo: true }); setBusy(false); return; }
    const r = await captureHold(b.id);
    setBusy(false);
    if (!r.ok) setMsg(r.error === "expired" ? (fr ? "Réservation expirée : envoyez un lien de paiement." : "Hold expired: send a payment link.") : (fr ? "Débit impossible pour le moment." : "Charge not possible right now."));
  };
  return (
    <div className="lk-card" style={{ padding: "14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pLabel(pr, lang) || b.typeIntervention || b.probleme}</div>
          <div style={{ color: T.textLo, fontSize: 11 }}>{b.clientNom} · {fmtDate(b.createdAt)} · {fmt(bookingTotal(b))}</div>
          {fee && <div style={{ color: T.textMid, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{FRAIS_TXT(b, lang)}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: isPaid ? T.success : T.warn, fontWeight: 700, fontSize: 15 }}>{fmt(proShare(b))}</div>
          <div style={{ color: T.textLo, fontSize: 10 }}>{isPaid ? tr.paid : (fr ? `À encaisser : ${fmt(resteAPayer(b))}` : `To collect: ${fmt(resteAPayer(b))}`)}</div>
        </div>
      </div>
      {!isPaid && hold > 0 && !fee && (
        <button onClick={capture} disabled={busy} className="lk-btn" style={{ marginTop: 10, fontSize: 12 }}>{busy ? "…" : (fr ? `Débiter la carte du client — ${fmt(aDebiter)}` : `Charge the client's card — ${fmt(aDebiter)}`)}</button>
      )}
      {msg && <div role="alert" style={{ color: T.danger, fontSize: 12, marginTop: 6 }}>{msg}</div>}
      {!isPaid && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={() => setShowLink(true)} style={{ flex: 1, background: T.grad, border: "none", borderRadius: 10, padding: "9px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
            {fr ? "Envoyer un lien de paiement" : "Send payment link"}
          </button>
          {!fee && <button onClick={() => setShowForm(s => !s)} style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 10, padding: "9px 12px", color: T.accent, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
            {showForm ? (fr ? "Fermer" : "Close") : (fr ? "Corriger le montant" : "Edit amount")}
          </button>}
        </div>
      )}
      {!isPaid && showForm && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="lk-label">{fr ? "Montant total de la prestation (€)" : "Total amount (€)"}</label>
            <input className="lk-input" type="number" inputMode="decimal" value={totalInput} onChange={e => setTotalInput(e.target.value)} placeholder="150" />
          </div>
          <button disabled={!(total > 0)} onClick={() => { setBookings(p => p.map(x => x.id === b.id ? { ...x, montantFinal: total } : x)); setShowForm(false); }} className="lk-btn" style={{ width: "auto", padding: "12px 16px", fontSize: 13 }}>{fr ? "Valider" : "Save"}</button>
        </div>
      )}
      {showLink && <SendPaymentLinkModal amount={resteAPayer(b)} bookingId={b.id} clientNom={b.clientNom} clientTel={b.clientTel || ""} onClose={() => setShowLink(false)} lang={lang} />}
    </div>
  );
}

/* ─── PRO APP ─── */
/* ─── AUTO-ENTREPRENEUR TAB ─── */
function AutoEntrepriseTab({ account, setAccounts, bookings, artisanId, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const done = bookings.filter(b => b.artisanId === artisanId && isBillable(b));
  const now = new Date();
  // Chiffre d'affaires de l'artisan = sa part des missions (ce qu'il facture réellement)
  const caMonth = done.filter(b => { const d = new Date(b.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, b) => s + proShare(b), 0);
  const caYear = done.filter(b => new Date(b.createdAt).getFullYear() === now.getFullYear()).reduce((s, b) => s + proShare(b), 0);
  const ae = account.ae || {};
  const vl = !!ae.versementLiberatoire;
  const cotis = caMonth * AE.cotisations;
  const formation = caMonth * AE.formation;
  const impot = vl ? caMonth * AE.versementLiberatoire : 0;
  const net = caMonth - cotis - formation - impot;
  const tauxTotal = AE.cotisations + AE.formation + (vl ? AE.versementLiberatoire : 0);
  const pctFr = x => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  const nextDecl = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("fr-FR");

  // Frais, déclarations et mémo enregistrés sur le compte (plus de données fictives,
  // plus de perte au rechargement, accessibles depuis tous les appareils)
  const saveAe = patch => setAccounts(p => p.map(a => a.id === account.id ? { ...a, ae: { ...(a.ae || {}), ...patch } } : a));
  const frais = ae.frais || [];
  const setFrais = fn => saveAe({ frais: typeof fn === "function" ? fn(frais) : fn });
  const [fraisForm, setFraisForm] = useState({ label: "", montant: "", date: new Date().toISOString().slice(0, 10), cat: "Outillage" });
  const [showFraisForm, setShowFraisForm] = useState(false);
  const declarations = ae.declarations || [];
  const setDeclarations = fn => saveAe({ declarations: typeof fn === "function" ? fn(declarations) : fn });
  const [declModal, setDeclModal] = useState(false);
  const [declCa, setDeclCa] = useState("");
  const [memo, setMemo] = useState(ae.memo || "");
  const totalFrais = frais.reduce((s, f) => s + (Number(f.montant) || 0), 0);
  const fraisCats = (lang === "en" ? tr.aeFraisCats : tr.aeFraisCats).split(",");
  // Alertes : seuil majoré dépassé (TVA due immédiatement), seuil de base, plafond micro
  const overMajore = caYear > AE.seuilTvaMajore;
  const overSeuil = caYear > AE.seuilTva;
  const nearSeuil = caYear > AE.seuilTva * 0.8;
  const tvaMsg = overMajore
    ? (lang === "en" ? `VAT due since exceeding €${AE.seuilTvaMajore.toLocaleString("en-GB")} — invoice with VAT now and contact your accountant.` : `Seuil majoré de ${AE.seuilTvaMajore.toLocaleString("fr-FR")} € dépassé : la TVA est due dès maintenant — facturez avec TVA et contactez votre comptable.`)
    : overSeuil
      ? (lang === "en" ? `Over €${AE.seuilTva.toLocaleString("en-GB")}: VAT will be due from 1 January next year (immediately above €${AE.seuilTvaMajore.toLocaleString("en-GB")}).` : `Seuil de ${AE.seuilTva.toLocaleString("fr-FR")} € dépassé : TVA due au 1er janvier prochain (immédiatement au-delà de ${AE.seuilTvaMajore.toLocaleString("fr-FR")} €).`)
      : nearSeuil ? tr.aeSeuilAlert : tr.aeSeuilOk;

  return (
    <div style={{ padding: "14px 14px 80px" }}>
      <div style={{ fontWeight: 800, fontSize: 18, color: T.textHi, marginBottom: 4 }}>{tr.aeTitle}</div>
      <div style={{ fontSize: 12, color: T.textLo, marginBottom: 18 }}>{tr.aeRegimeMicro}</div>

      {/* KPI CA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[
          { label: tr.aeCaMois, val: `${Math.round(caMonth).toLocaleString("fr-FR")} €`, sub: `${lang === "en" ? "Micro cap" : "Plafond micro"} : ${AE.plafondMicro.toLocaleString("fr-FR")} €/an`, col: T.accent },
          { label: tr.aeCaAn, val: `${Math.round(caYear).toLocaleString("fr-FR")} €`, sub: tvaMsg, col: overSeuil ? T.danger : nearSeuil ? T.warn : T.success },
        ].map((k, i) => (
          <div key={i} className="lk-card" style={{ padding: "14px 16px" }}>
            <div style={{ fontWeight: 900, fontSize: 22, color: k.col }}>{k.val}</div>
            <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{k.label}</div>
            <div style={{ fontSize: 10, color: nearSeuil && i === 1 ? (overSeuil ? T.danger : T.warn) : T.textLo, marginTop: 4, fontWeight: nearSeuil && i === 1 ? 700 : 400 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Cotisations */}
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.aeCotisations}</div>
        {[
          [`${lang === "en" ? "Social contributions" : "Cotisations sociales"} (${pctFr(AE.cotisations)})`, `${Math.round(cotis)} €`],
          [`${tr.aeFormation} (${pctFr(AE.formation)})`, `${Math.round(formation)} €`],
          ...(vl ? [[`${lang === "en" ? "Income tax (flat-rate option)" : "Impôt — versement libératoire"} (${pctFr(AE.versementLiberatoire)})`, `${Math.round(impot)} €`]] : []),
          [tr.aeNetEstime, `${Math.round(net)} €`],
        ].map(([l, v], i, arr) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", paddingBottom: i < arr.length - 1 ? 8 : 0, borderBottom: i < arr.length - 1 ? "1px solid rgba(0,0,0,.05)" : "none", marginBottom: i < arr.length - 1 ? 8 : 0 }}>
            <span style={{ fontSize: 13, color: T.textMid }}>{l}</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: i === arr.length - 1 ? T.success : T.textHi }}>{v}</span>
          </div>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12.5, color: T.textMid, cursor: "pointer" }}>
          <input type="checkbox" checked={vl} onChange={e => saveAe({ versementLiberatoire: e.target.checked })} style={{ accentColor: T.accent }} />
          {lang === "en" ? `I opted for the flat-rate income tax (+${pctFr(AE.versementLiberatoire)})` : `J'ai opté pour le versement libératoire de l'impôt (+${pctFr(AE.versementLiberatoire)})`}
        </label>
        <div style={{ fontSize: 11, color: T.textLo, marginTop: 6 }}>{lang === "en" ? `Total rate: ${pctFr(tauxTotal)} of revenue. Indicative 2026 rates for craft services — check with Urssaf.` : `Taux total : ${pctFr(tauxTotal)} du chiffre d'affaires. Barème 2026 indicatif (prestations artisanales) — à vérifier sur urssaf.fr.`}</div>
        <div style={{ marginTop: 10, background: "rgba(201,160,48,.06)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: T.accent, fontWeight: 600 }}>
          ⏰ {tr.aeCotisAlert} {nextDecl}
        </div>
      </div>

      {/* Déclaration URSSAF */}
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{tr.aeDeclaration}</div>
          <button onClick={() => setDeclModal(true)} className="lk-btn" style={{ width: "auto", padding: "7px 14px", fontSize: 12 }}>{tr.aeDeclare}</button>
        </div>
        {declarations.length === 0 && <div style={{ color: T.textLo, fontSize: 12 }}>{lang === "en" ? "No declaration recorded yet." : "Aucune déclaration enregistrée pour l'instant."}</div>}
        {declarations.map(d => (
          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: T.textHi }}>{d.mois}</div>
              <div style={{ fontSize: 11, color: T.textLo }}>CA {d.ca.toLocaleString("fr-FR")} € · Cotis. {d.cotis.toLocaleString("fr-FR")} €</div>
            </div>
            <span className="lk-badge-ok" style={{ fontSize: 10 }}>{d.statut}</span>
          </div>
        ))}
      </div>

      {/* Frais professionnels */}
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{tr.aeFrais}</div>
            <div style={{ fontSize: 11, color: T.textLo, marginTop: 2 }}>Total : {totalFrais.toLocaleString("fr-FR")} €</div>
          </div>
          <button onClick={() => setShowFraisForm(p => !p)} className="lk-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>{Icon.plus(T.accent, 12)} {tr.aeAddFrais}</button>
        </div>
        {showFraisForm && (
          <div style={{ background: "rgba(0,0,0,.02)", borderRadius: 10, padding: "12px", marginBottom: 12 }}>
            <input className="lk-input" placeholder={tr.aeFraisLabel} value={fraisForm.label} onChange={e => setFraisForm(p => ({ ...p, label: e.target.value }))} style={{ marginBottom: 8 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <input type="number" className="lk-input" placeholder={tr.aeFraisMontant} value={fraisForm.montant} onChange={e => setFraisForm(p => ({ ...p, montant: e.target.value }))} />
              <input type="date" className="lk-input" value={fraisForm.date} onChange={e => setFraisForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <select className="lk-input" value={fraisForm.cat} onChange={e => setFraisForm(p => ({ ...p, cat: e.target.value }))} style={{ marginBottom: 8, cursor: "pointer" }}>
              {fraisCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => {
              if (!fraisForm.label || !fraisForm.montant) return;
              setFrais(p => [...p, { id: uid(), ...fraisForm, montant: parseFloat(fraisForm.montant) }]);
              setFraisForm({ label: "", montant: "", date: new Date().toISOString().slice(0, 10), cat: "Outillage" });
              setShowFraisForm(false);
            }} className="lk-btn" style={{ fontSize: 12 }}>Ajouter</button>
          </div>
        )}
        {frais.length === 0 && !showFraisForm && <div style={{ color: T.textLo, fontSize: 12 }}>{lang === "en" ? "No expense recorded." : "Aucun frais enregistré."}</div>}
        {frais.map(f => (
          <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(0,0,0,.04)" }}>
            <div>
              <div style={{ fontSize: 13, color: T.textHi }}>{f.label}</div>
              <div style={{ fontSize: 11, color: T.textLo }}>{f.cat} · {f.date}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: T.danger }}>-{f.montant} €</span>
              <button onClick={() => setFrais(p => p.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", cursor: "pointer", color: T.textLo, fontSize: 14, fontFamily: "'Inter',sans-serif", padding: 12, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* CFE & mémo */}
      <div className="lk-desktop-2col" style={{ marginBottom: 14 }}>
        <div className="lk-card" style={{ padding: "14px 16px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 6 }}>{tr.aeCFE}</div>
          <div style={{ fontSize: 12, color: T.textMid }}>{tr.aeRappelCFE}</div>
          <div style={{ fontSize: 11, color: T.textLo, marginTop: 4 }}>Exonération 1ère année d'activité.</div>
        </div>
        <div className="lk-card" style={{ padding: "14px 16px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 8 }}>{tr.aeTvaFranchise}</div>
          <div style={{ fontSize: 12, color: T.textMid }}>{lang === "en" ? "Threshold" : "Seuil"} : {AE.seuilTva.toLocaleString("fr-FR")} €/an · {lang === "en" ? "upper" : "majoré"} {AE.seuilTvaMajore.toLocaleString("fr-FR")} €</div>
          <div style={{ fontSize: 11, color: overSeuil ? T.danger : nearSeuil ? T.warn : T.success, marginTop: 4, fontWeight: 600 }}>{nearSeuil ? "⚠️ " + tvaMsg : "✓ " + tr.aeSeuilOk}</div>
          <div style={{ fontSize: 11, color: caYear > AE.plafondMicro * 0.9 ? T.warn : T.textLo, marginTop: 6 }}>{lang === "en" ? "Micro-enterprise cap" : "Plafond micro-entreprise"} : {Math.round(caYear).toLocaleString("fr-FR")} / {AE.plafondMicro.toLocaleString("fr-FR")} €</div>
        </div>
      </div>
      <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 8 }}>{tr.aeMemo}</div>
        <textarea className="lk-input" rows={4} value={memo} onChange={e => setMemo(e.target.value)} onBlur={() => { if (memo !== (ae.memo || "")) saveAe({ memo }); }} placeholder={tr.aeMemoPlaceholder} style={{ resize: "vertical" }} />
      </div>

      {/* Modal déclaration */}
      {declModal && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "20px 22px 36px", animation: "slideUp .3s ease" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ fontWeight: 700, fontSize: 17, color: T.textHi, marginBottom: 18 }}>{tr.aeDeclareTitle}</div>
            <label className="lk-label">{tr.aeCaSaisie}</label>
            <input type="number" className="lk-input" value={declCa} onChange={e => setDeclCa(e.target.value)} placeholder="3 200" style={{ marginBottom: 20 }} />
            <button onClick={() => {
              if (!declCa) return;
              const ca = parseFloat(declCa);
              const mois = now.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" });
              setDeclarations(p => [{ id: uid(), mois: mois.charAt(0).toUpperCase() + mois.slice(1), ca, cotis: Math.round(ca * tauxTotal), statut: "à payer", createdAt: ts() }, ...p]);
              setDeclModal(false); setDeclCa("");
            }} className="lk-btn" style={{ marginBottom: 10 }}>{tr.aeConfirmDecl}</button>
            <button onClick={() => setDeclModal(false)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>, document.body
      )}
    </div>
  );
}

/* ─── FACTURATION ÉLECTRONIQUE TAB ─── */
function FactuElecTab({ lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [checksDone, setChecksDone] = useState({});
  const [pdpRef, setPdpRef] = useState("");
  const calendarItems = tr.feCalendarItems.split("|");
  const pdpList = tr.fePDPList.split("|");
  const mentionsList = tr.feMentionsList.split("|");
  const formatsList = tr.feFormatsList.split("|");
  const checkItems = tr.feCheckItems.split("|");
  const allChecked = checkItems.every((_, i) => checksDone[i]);

  return (
    <div style={{ padding: "14px 14px 80px" }}>
      <div style={{ fontWeight: 800, fontSize: 18, color: T.textHi, marginBottom: 4 }}>{tr.feTitle}</div>
      <div style={{ fontSize: 12, color: T.textLo, marginBottom: 18, lineHeight: 1.5 }}>{tr.feIntro}</div>

      {/* Calendrier */}
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>📅 {tr.feCalendar}</div>
        {calendarItems.map((item, i) => {
          const [date, ...rest] = item.split(" — ");
          const past = i === 0 && new Date() > new Date("2026-09-01");
          return (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10, paddingBottom: 10, borderBottom: i < calendarItems.length - 1 ? "1px solid rgba(0,0,0,.05)" : "none" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: past ? "rgba(30,158,107,.1)" : "rgba(201,160,48,.1)", border: `1px solid ${past ? T.success : T.accent}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {past ? Icon.check(T.success, 14) : Icon.calendar(T.accent, 14)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: past ? T.success : T.accent }}>{date}</div>
                <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.4, marginTop: 2 }}>{rest.join(" — ")}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Statut AE */}
      <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 14, background: "rgba(201,160,48,.04)", border: "1px solid rgba(201,160,48,.2)" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: T.accent, marginBottom: 6 }}>⚡ {tr.feStatus}</div>
        <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>{tr.feStatusAE}</div>
      </div>

      {/* Checklist */}
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>✅ {tr.feChecklist}</div>
        {checkItems.map((item, i) => (
          <div key={i} onClick={() => setChecksDone(p => ({ ...p, [i]: !p[i] }))} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10, cursor: "pointer" }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${checksDone[i] ? T.success : "rgba(0,0,0,.15)"}`, background: checksDone[i] ? T.success : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
              {checksDone[i] && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <span style={{ fontSize: 13, color: checksDone[i] ? T.textLo : T.textMid, textDecoration: checksDone[i] ? "line-through" : "none", lineHeight: 1.4 }}>{item}</span>
          </div>
        ))}
        {allChecked && <div style={{ background: "rgba(30,158,107,.08)", borderRadius: 8, padding: "10px 12px", marginTop: 8, color: T.success, fontWeight: 700, fontSize: 13 }}>🎉 {tr.feReady}</div>}
      </div>

      {/* PDP */}
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 6 }}>🏦 {tr.fePDP}</div>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 12, lineHeight: 1.5 }}>{tr.fePDPDesc}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {pdpList.map((p, i) => (
            <span key={i} style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.15)", borderRadius: 20, padding: "4px 12px", fontSize: 11, color: T.accent, fontWeight: 600 }}>{p}</span>
          ))}
        </div>
        <label className="lk-label">{tr.feMyChorPro}</label>
        <input className="lk-input" value={pdpRef} onChange={e => setPdpRef(e.target.value)} placeholder={tr.feChorusPlaceholder} />
      </div>

      {/* Mentions obligatoires */}
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>📋 {tr.feMentions}</div>
        {mentionsList.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 7 }}>
            {Icon.check(T.success, 12)}
            <span style={{ fontSize: 12, color: T.textMid, lineHeight: 1.4 }}>{m}</span>
          </div>
        ))}
      </div>

      {/* Formats */}
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 10 }}>📄 {tr.feFormats}</div>
        {formatsList.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            {Icon.file(T.accent, 12)}
            <span style={{ fontSize: 12, color: T.textMid }}>{f}</span>
          </div>
        ))}
      </div>

      {/* Archivage */}
      <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 6 }}>🗄 {tr.feArchive}</div>
        <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>{tr.feArchiveDesc}</div>
      </div>

      {/* LCTI */}
      <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 6 }}>⚖️ {tr.feLcti}</div>
        <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>{tr.feLctiDesc}</div>
      </div>
    </div>
  );
}

/* ─── CARTE LIVE PRO — position du technicien, clients, km et temps de trajet ─── */
const haversineKm = (a, b) => {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function ProLiveMap({ account, bookings, bons, priorityOrder = [], lang = "fr", onSelect = () => {} }) {
  const fr = lang !== "en";
  const artisan = DEMO_ARTISANS.find(a => a.id === account.artisanId);
  const fallback = { lat: artisan?.lat || 48.8566, lng: artisan?.lng || 2.3522 };
  const [myPos, setMyPos] = useState(fallback);
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const meMarker = useRef(null);
  const targetLayer = useRef(null);
  const didFit = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Position réelle du technicien si le GPS est autorisé
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      p => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  // Cibles : missions en cours + bons disponibles (avec coordonnées)
  const active = bookings.filter(b => b.artisanId === account.artisanId && ["assignée", "en_route", "en_cours"].includes(b.statut));
  const myRegion = account.ville || "Paris";
  const bonsDispo = bons.filter(b => b.region === myRegion && bonVisibleForPro(b, account.artisanId, priorityOrder));
  const targets = [
    ...active.map((b, i) => ({ id: b.id, type: "mission", label: b.clientNom || "Client", adresse: b.adresse, lat: b.lat || 48.8566 + (i + 1) * 0.006, lng: b.lng || 2.3522 + (i + 1) * 0.006, urgence: false })),
    ...bonsDispo.filter(b => b.lat && b.lng).map(b => ({ id: b.id, type: "bon", label: b.titre, adresse: b.adresse, lat: b.lat, lng: b.lng, urgence: b.urgence, montant: b.montantEstime })),
  ].map(t => {
    const km = haversineKm(myPos, t);
    // Vitesse moyenne urbaine ~25 km/h → minutes de trajet estimées
    const mins = Math.max(2, Math.round(km / 25 * 60));
    return { ...t, km, mins };
  }).sort((a, b) => a.km - b.km);

  // Carte Leaflet — créée UNE SEULE FOIS (jamais recréée : le zoom de
  // l'utilisateur est conservé quand la position ou les cibles changent)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await loadLeaflet();
      if (!L || cancelled || !mapRef.current || mapObj.current) return;
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([fallback.lat, fallback.lng], 12);
      mapObj.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd" }).addTo(map);
      targetLayer.current = L.layerGroup().addTo(map);
    })();
    return () => { cancelled = true; if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; meMarker.current = null; targetLayer.current = null; didFit.current = false; } };
  }, []);

  // Mise à jour des marqueurs SANS toucher au zoom ni recréer la carte
  useEffect(() => {
    (async () => {
      const L = await loadLeaflet();
      const map = mapObj.current;
      if (!L || !map || !targetLayer.current) return;
      // Marqueur technicien (doré) — déplacé, pas recréé
      if (!meMarker.current) {
        meMarker.current = L.marker([myPos.lat, myPos.lng], { icon: L.divIcon({ className: "", html: `<div style="width:18px;height:18px;border-radius:50%;background:#c9a030;border:3px solid #fff;box-shadow:0 0 0 6px rgba(201,160,48,.25)"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map).bindPopup(fr ? "Vous êtes ici" : "You are here");
      } else {
        meMarker.current.setLatLng([myPos.lat, myPos.lng]);
      }
      // Marqueurs interventions — cliquables : popup avec bouton « Ouvrir »
      targetLayer.current.clearLayers();
      targets.forEach(t => {
        const color = t.type === "mission" ? "#2563eb" : t.urgence ? "#dc2626" : "#1e9e6b";
        const m = L.marker([t.lat, t.lng], { icon: L.divIcon({ className: "", html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);cursor:pointer"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(targetLayer.current);
        const btnId = `lkmap_${t.type}_${t.id}`;
        m.bindPopup(`<div style="font-family:Inter,sans-serif;min-width:150px"><b style="font-size:13px">${t.label}</b><br/><span style="font-size:11px;color:#666">${t.type === "mission" ? (t.adresse || "") : maskAddress(t.adresse)}</span><br/><span style="font-size:11px">${t.km.toFixed(1)} km · ~${t.mins} min${t.montant ? ` · <b>${fr ? "À partir de" : "From"} ${Math.round(t.montant)} €</b>` : ""}</span><br/><button id="${btnId}" style="margin-top:7px;width:100%;background:linear-gradient(135deg,#c9a030,#8a6b1a);color:#fff;border:none;border-radius:8px;padding:8px;font-weight:700;font-size:12px;cursor:pointer;font-family:Inter,sans-serif">${t.type === "mission" ? (fr ? "Ouvrir la mission" : "Open mission") : (fr ? "Voir le bon" : "View voucher")}</button></div>`);
        m.on("popupopen", () => {
          const btn = document.getElementById(btnId);
          if (btn) btn.onclick = () => { map.closePopup(); onSelectRef.current(t); };
        });
      });
      // Cadrage automatique UNE SEULE FOIS au premier affichage
      if (!didFit.current && targets.length) {
        const grp = L.featureGroup(targets.map(t => L.marker([t.lat, t.lng])).concat(L.marker([myPos.lat, myPos.lng])));
        map.fitBounds(grp.getBounds().pad(0.25));
        didFit.current = true;
      }
    })();
  }, [myPos.lat, myPos.lng, JSON.stringify(targets.map(t => t.type + t.id))]);

  return (
    <div style={{ padding: "14px" }}>
      <div style={{ fontWeight: 800, fontSize: 17, color: T.textHi, marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>{Icon.map(T.accent, 18)} {fr ? "Carte live" : "Live map"}</div>
      <div style={{ color: T.textLo, fontSize: 11.5, marginBottom: 12 }}>{fr ? "Votre position, vos clients, la distance et le temps de trajet estimé." : "Your position, your clients, distance and estimated travel time."}</div>
      <div ref={mapRef} style={{ height: 300, borderRadius: 16, overflow: "hidden", border: `1px solid ${T.border}`, marginBottom: 14 }} />
      {/* Légende */}
      <div style={{ display: "flex", gap: 14, marginBottom: 12, fontSize: 10.5, color: T.textMid, flexWrap: "wrap" }}>
        <span>🟡 {fr ? "Vous" : "You"}</span><span>🔵 {fr ? "Mission en cours" : "Ongoing mission"}</span><span>🟢 {fr ? "Bon disponible" : "Available voucher"}</span><span>🔴 {fr ? "Bon urgent" : "Urgent voucher"}</span>
      </div>
      {/* Liste triée par distance */}
      {targets.length === 0 && <div style={{ textAlign: "center", color: T.textLo, fontSize: 13, padding: "24px 0" }}>{fr ? "Aucun client ni bon à proximité." : "No client or voucher nearby."}</div>}
      {targets.map(t => (
        <div key={t.type + t.id} onClick={() => onSelect(t)} className="lk-card" style={{ padding: "12px 15px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, borderLeft: `4px solid ${t.type === "mission" ? "#2563eb" : t.urgence ? "#dc2626" : "#1e9e6b"}`, cursor: "pointer" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.urgence ? "🔴 " : ""}{t.label}</div>
            <div style={{ fontSize: 11, color: T.textLo, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.type === "mission" ? t.adresse : maskAddress(t.adresse)}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.accent }}>{t.km < 1 ? `${Math.round(t.km * 1000)} m` : `${t.km.toFixed(1)} km`}</div>
            <div style={{ fontSize: 11, color: T.textMid, fontWeight: 600 }}>⏱ ~{t.mins} min</div>
          </div>
          <div style={{ flexShrink: 0 }}>{Icon.arrow(T.textLo, 14)}</div>
        </div>
      ))}
    </div>
  );
}

function ProApp({ account, bookings, setBookings, accounts, setAccounts, bons, setBons, chatMessages, setChatMessages, interventionChats, setInterventionChats, listings, setListings, sales, setSales, onLogout, lang = "fr", setLang, priorityOrder = [], stripeRequired = false, openLegal, fraisDep = FRAIS_DEPLACEMENT_DEFAULT, setters }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [tab, setTab] = useState("accueil");
  const [activeMissionId, setActiveMissionId] = useState(null);
  const [recapMission, setRecapMission] = useState(null); // récap d'une mission terminée (depuis l'Accueil)
  const [histMonth, setHistMonth] = useState("all"); // filtre historique par mois
  // Disponibilité enregistrée sur le compte : les clients la voient en direct
  const dispo = account.dispo !== false;
  const setDispo = fn => setAccounts(p => p.map(a => a.id === account.id ? { ...a, dispo: typeof fn === "function" ? fn(a.dispo !== false) : fn } : a));
  const [clotureModal, setClotureModal] = useState(false);
  const [chatMission, setChatMission] = useState(null);
  const [monthlyModal, setMonthlyModal] = useState(false);
  // Photos et justificatifs de la mission en cours (compressés avant enregistrement)
  const photoAvantRef = useRef(null);
  const photoApresRef = useRef(null);
  const photoDevisRef = useRef(null);
  const matInvoiceRef = useRef(null);
  const [swipeTouchX, setSwipeTouchX] = useState(0);
  const approved = (account.dossierStatus || "approved") === "approved";
  const artisan = DEMO_ARTISANS.find(a => a.id === account.artisanId);
  const myM = visibleFor(account, bookings).filter(b => b.artisanId === account.artisanId);
  const active = myM.filter(b => ["assignée", "en_route", "en_cours"].includes(b.statut))
    .sort((x, y) => String(x.rdvDate || x.createdAt).localeCompare(String(y.rdvDate || y.createdAt)));
  // Missions terminées + déplacements facturés (annulation tardive, client absent)
  const done = myM.filter(isBillable);
  const activeMission = activeMissionId ? (myM.find(b => b.id === activeMissionId) || null) : null;
  const setActiveMission = b => setActiveMissionId(b ? b.id : null);
  const updateMission = (id, patch) => setBookings(p => p.map(x => x.id === id ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) } : x));
  const clientTelOf = b => b?.clientTel || (accounts || []).find(a => a.id === b?.clientId)?.tel || "";
  // Paiement en ligne actif : l'artisan doit avoir activé ses virements Stripe pour recevoir des missions
  const needsConnect = stripeRequired && !account.stripeOnboarded;
  const earnings = done.reduce((s, b) => s + proShare(b), 0);

  // Bons disponibles pour moi : ma ville, mes métiers, dispatch prioritaire respecté
  const myTrades = proMetiers(account);
  const bonsDispoList = approved ? visibleFor(account, bons).filter(b =>
    sameCity(b.region, account.ville || "Paris") && b.postedBy !== account.id &&
    bonVisibleForPro(b, account.artisanId, priorityOrder) &&
    (!myTrades.length || !metierOf(b) || myTrades.includes(metierOf(b)))) : [];
  const bonsDispoCount = bonsDispoList.length;
  // Mission actuellement démarrée (barre « Reprendre » persistante)
  const missionEnCours = active.find(b => b.statut === "en_cours" || b.statut === "en_route");
  // RDV du jour (résumé matinal sur l'accueil)
  const todayStr = new Date().toISOString().slice(0, 10);
  const rdvToday = myM.filter(b => (b.rdvDate || "").slice(0, 10) === todayStr && ["assignée", "en_route", "en_cours"].includes(b.statut))
    .sort((a, b) => new Date(a.rdvDate) - new Date(b.rdvDate));
  // Mode sombre (persisté)
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem("lk_dark") === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("lk_dark", darkMode ? "1" : "0"); } catch { /* ignore */ } }, [darkMode]);
  // Publier un bon pour un autre artisan (accès rapide depuis l'Accueil)
  const [autoOpenPostBon, setAutoOpenPostBon] = useState(false);
  const goPublierBon = () => { setAutoOpenPostBon(true); goView("bons"); };
  // Écran de bienvenue au premier lancement
  const [onboard, setOnboard] = useState(() => { try { return !localStorage.getItem("lk_pro_onboarded"); } catch { return false; } });
  const [onboardStep, setOnboardStep] = useState(0);
  // Pull-to-refresh (mobile)
  const [refreshing, setRefreshing] = useState(false);
  const pullStart = useRef(null);
  // Itinéraire GPS vers le client
  const openItineraire = (booking) => openGpsRoute(typeof booking === "string" ? { adresse: booking } : { lat: booking?.lat, lng: booking?.lng, adresse: booking?.adresse });

  // Feature 2: payment block check (unpaid > 7 days)
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  // (les frais de déplacement impayés sont recouvrés par LOCKR : ils ne bloquent pas l'artisan)
  const hasPaymentBlock = done.some(b => b.statut === "terminée" && b.statutPaiement !== "payé" && resteAPayer(b) > 0 && new Date(b.termineeLe || b.createdAt).getTime() < sevenDaysAgo);

  // ── ALERTE INTERVENTION < 25 KM : notification téléphone + vibration + jingle LOCKR ──
  const NOTIF_RADIUS_KM = 25;
  const proPos = useRef({ lat: account.lat || artisan?.lat || 48.8566, lng: account.lng || artisan?.lng || 2.3522 });
  const notifiedIds = useRef(new Set());
  const firstScan = useRef(true);

  // Permission de notification demandée dès la connexion + suivi de la position.
  // Pendant un trajet (mission « en route »), la position est partagée avec le
  // client toutes les ~20 s : c'est elle qu'il voit bouger sur sa carte.
  const enRouteIds = active.filter(b => b.statut === "en_route").map(b => b.id).join(",");
  const lastShare = useRef({ t: 0, lat: null, lng: null });
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch { /* navigateur sans notifications */ }
    }
    if (!navigator.geolocation) return undefined;
    const watch = navigator.geolocation.watchPosition(
      p => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        proPos.current = { lat, lng };
        if (!enRouteIds) return;
        const prev = lastShare.current;
        const movedKm = prev.lat == null ? 1 : haversineKm({ lat: prev.lat, lng: prev.lng }, { lat, lng });
        if (Date.now() - prev.t < 20000 && movedKm < 0.1) return;
        lastShare.current = { t: Date.now(), lat, lng };
        const ids = enRouteIds.split(",");
        setBookings(list => list.map(x => ids.includes(x.id) ? { ...x, artisanPos: [lat, lng], artisanPosAt: ts() } : x));
      },
      () => {}, { enableHighAccuracy: !!enRouteIds, maximumAge: enRouteIds ? 10000 : 60000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [enRouteIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jingle LOCKR reconnaissable : 5 notes montantes puis rappel grave
  const playLockrJingle = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (freq, start, dur, vol = 0.4) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq; o.type = "triangle";
        g.gain.setValueAtTime(0, ctx.currentTime + start);
        g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
        o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
      };
      // Signature sonore LOCKR : do-mi-sol-do aigu ×2 + note grave finale
      playTone(523, 0, 0.11); playTone(659, 0.12, 0.11); playTone(784, 0.24, 0.11); playTone(1046, 0.36, 0.22);
      playTone(523, 0.65, 0.11); playTone(659, 0.77, 0.11); playTone(784, 0.89, 0.11); playTone(1046, 1.01, 0.22);
      playTone(392, 1.35, 0.35, 0.3);
    } catch { /* Audio non disponible */ }
  };

  useEffect(() => {
    const trades = proMetiers(account);
    const proRegion = (account.ville || "").toLowerCase().trim();
    if (!dispo || !approved) { firstScan.current = false; return; }

    // Interventions candidates : nouvelles missions qui me sont attribuées + bons visibles de mes métiers
    const candidates = [
      ...myM.filter(b => b.statut === "assignée")
        .map(b => ({ id: "bk_" + b.id, label: pLabel(PROBLEMES.find(p => p.id === b.probleme), lang) || "Intervention", adresse: maskAddress(b.adresse), lat: b.lat, lng: b.lng, region: b.region })),
      ...visibleFor(account, bons).filter(b => b.postedBy !== account.id && bonVisibleForPro(b, account.artisanId, priorityOrder) && (!trades.length || !metierOf(b) || trades.includes(metierOf(b))))
        .map(b => ({ id: "bon_" + b.id, label: b.titre, adresse: maskAddress(b.adresse), lat: b.lat, lng: b.lng, region: b.region })),
    ];

    // Filtre distance : < 25 km si coordonnées connues, sinon même région
    const nearby = candidates.filter(c => {
      if (c.lat && c.lng) return haversineKm(proPos.current, c) <= NOTIF_RADIUS_KM;
      return !proRegion || !c.region || c.region.toLowerCase().includes(proRegion) || proRegion.includes(c.region.toLowerCase());
    });

    const fresh = nearby.filter(c => !notifiedIds.current.has(c.id));
    fresh.forEach(c => notifiedIds.current.add(c.id));

    // Pas d'alerte au premier chargement — uniquement pour les nouvelles interventions
    if (firstScan.current) { firstScan.current = false; return; }
    if (fresh.length === 0) return;

    const c = fresh[0];
    const km = c.lat && c.lng ? haversineKm(proPos.current, c) : null;
    const kmTxt = km != null ? (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`) : "";

    // 1. Jingle sonore reconnaissable
    playLockrJingle();
    // 2. Vibration longue et distinctive (motif LOCKR)
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 600]);
    // 3. Notification téléphone/navigateur
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("⚡ LOCKR — Intervention à proximité !", {
        body: `${c.label}${kmTxt ? ` · à ${kmTxt} de vous` : ""}${c.adresse ? `\n${c.adresse}` : ""}`,
        icon: "/apple-touch-icon.png",
        tag: c.id,
        vibrate: [300, 100, 300, 100, 600],
      });
    }
  }, [bookings, bons]);

  /* Étapes réelles de la mission (synchronisées avec le client) :
     assignée → « Je pars » (en_route) → « Je suis arrivé » (en_cours) → clôture */
  const departMission = b => {
    updateMission(b.id, { statut: "en_route", departAt: ts() });
    setActiveMission(b); setTab("active");
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => updateMission(b.id, { artisanPos: [p.coords.latitude, p.coords.longitude], artisanPosAt: ts() }), () => {});
  };
  const arriveMission = b => {
    updateMission(b.id, x => ({ statut: "en_cours", arriveAt: ts(), rdvDate: x.rdvDate || ts() }));
    setActiveMission(b); setTab("active");
  };
  const [absentMsg, setAbsentMsg] = useState(null);
  const clientAbsent = async b => {
    const r = await declareClientAbsent(b, { setBookings, setters, fraisDep, lang });
    if (!r) return;
    setAbsentMsg(r);
    if (r.ok) { setActiveMissionId(null); setTimeout(() => setAbsentMsg(null), 6000); }
  };
  const finishMission = (montantFinal, factureImg) => {
    if (!activeMission) return;
    updateMission(activeMission.id, { statut: "terminée", termineeLe: ts(), montantFinal, factureImg });
  };
  /* Refus : la mission est annulée pour ce pro (l'empreinte bancaire du
     client est libérée) et sa demande est republiée pour les autres artisans. */
  const refuseMission = async b => {
    if (!window.confirm(fr ? "Refuser cette mission ? Elle sera proposée à d'autres artisans." : "Decline this mission? It will be offered to other craftsmen.")) return;
    if (live && empreinteActive(b)) {
      const r = await releaseHold(b.id, "refus_pro");
      if (!r.ok) { alert(fr ? "Refus impossible pour le moment, réessayez dans un instant." : "Cannot decline right now, please retry in a moment."); return; }
    } else {
      updateMission(b.id, { statut: "annulée", annulationRaison: "refusée_pro", annuleeLe: ts() });
      if (empreinteActive(b)) applyPayment({ setBookings }, { type: "liberation", ref: b.id, demo: true });
    }
    if (b.clientId && b.clientId !== "ext") {
      setBons(p => [...p, {
        id: uid(), titre: `${pLabel(PROBLEMES.find(x => x.id === b.probleme), "fr") || "Intervention"} — ${b.clientNom}`,
        adresse: b.adresse, probleme: b.probleme, metier: metierOf(b), urgence: !!b.urgence,
        montantEstime: Number(b.montant) || 0, postedBy: "platform", postedByNom: "LOCKR",
        region: b.region || account.ville || "Paris", createdAt: ts(), techPct: b.techPct || PCT_DEFAULT,
        clientId: b.clientId, clientNom: b.clientNom, clientTel: b.clientTel || "", openPartner: true, fromBookingId: b.id,
        ...(b.lat && b.lng ? { lat: b.lat, lng: b.lng } : b.clientPos ? { lat: b.clientPos[0], lng: b.clientPos[1] } : {}),
        ...(b.isDemo ? { isDemo: true } : {}),
      }]);
    }
    if (activeMissionId === b.id) setActiveMissionId(null);
  };
  const savePhoto = (field, opts) => async e => {
    const data = await readImageInput(e, opts);
    if (data && activeMission) updateMission(activeMission.id, { [field]: data });
  };

  const bk = activeMission;
  const acomptesPending = []; // acomptes gérés par LOCKR — aucune action requise du pro

  /* Navigation ultra-simple : 3 sections. Tout le travail (bons, missions,
     carte, calendrier, historique) se pilote depuis l'Accueil ; chaque vue
     détaillée s'ouvre avec un bouton « ← Accueil » pour revenir. */
  const tabs = [
    { id: "accueil", icon: Icon.home || Icon.list, l: lang === "en" ? "Home" : "Accueil" },
    { id: "marketplace", icon: Icon.card, l: tr.marketplace },
    { id: "compte_group", icon: Icon.user, l: lang === "en" ? "My account" : "Mon compte" },
  ];
  // Vues de travail : accessibles uniquement depuis l'Accueil
  const workViews = {
    bons: tr.bonuses,
    active: tr.inProgress,
    carte: lang === "en" ? "Live map" : "Carte live",
    missions: tr.missions,
    calendar: tr.calendarTab,
    history: tr.history,
    chat: lang === "en" ? "Pros chat" : "Chat des pros",
  };
  const compteSubs = [
    { id: "profil", l: tr.proProfile },
    { id: "stats", l: tr.stats },
    { id: "auto", l: tr.autoTab },
    { id: "factu", l: tr.factuTab },
  ];
  const [compteSub, setCompteSub] = useState("profil");
  // Vue effective affichée
  const view = tab === "compte_group" ? compteSub : tab;
  const inWorkView = Object.keys(workViews).includes(tab);
  // Navigation directe vers une vue précise (depuis l'accueil)
  const goView = (id) => {
    if (compteSubs.some(s => s.id === id)) { setCompteSub(id); setTab("compte_group"); }
    else setTab(id);
  };

  return (
    <div className={darkMode ? "lk-dark" : ""} style={{ height: "100vh", overflow: "hidden", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex" }}>
      <style>{CSS}</style>

      {/* SIDEBAR DESKTOP */}
      {isDesktop && (
        <div style={{ width: 220, flexShrink: 0, height: "100vh", position: "sticky", top: 0, background: "#fff", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {/* Logo */}
          <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LockrWordmark height={20} light={false} />
            </div>
          </div>
          {/* Pro info */}
          <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(28,28,28,.06)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {account.photo ? <img src={account.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontWeight: 700, fontSize: 15, color: T.accent }}>{initial(account.nom)}</span>}
                </div>
                <input type="file" accept="image/*" style={{ display: "none" }} id="proPhotoInput" onChange={async e => { const data = await readImageInput(e, { maxSize: 400, quality: 0.75 }); if (data) setAccounts(p => p.map(a => a.id === account.id ? { ...a, photo: data } : a)); }} />
                <label htmlFor="proPhotoInput" title={tr.uploadProfilePhoto} style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: "50%", background: T.accent, border: "1.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 8 }}>📷</label>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artisan?.nom || account.nom}</div>
                <div style={{ color: T.textLo, fontSize: 11 }}>{artisan?.certif || tr.artisanPro}</div>
              </div>
            </div>
            <button onClick={() => setDispo(d => !d)} style={{ width: "100%", marginTop: 10, background: dispo ? "rgba(30,158,107,.08)" : "rgba(220,38,38,.08)", border: `1px solid ${dispo ? "rgba(30,158,107,.25)" : "rgba(220,38,38,.25)"}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: dispo ? T.success : T.danger, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: dispo ? T.success : T.danger }} />
              {dispo ? tr.available : tr.unavailable}
            </button>
          </div>
          {/* Stats rapides */}
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "rgba(28,28,28,.03)", borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ color: T.accent, fontWeight: 800, fontSize: 18 }}>{active.length}</div>
              <div style={{ color: T.textLo, fontSize: 10 }}>{tr.pending}</div>
            </div>
            <div style={{ background: "rgba(30,158,107,.06)", borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ color: T.success, fontWeight: 800, fontSize: 15 }}>{fmt(earnings)}</div>
              <div style={{ color: T.textLo, fontSize: 10 }}>{tr.gains}</div>
            </div>
          </div>
          {/* Navigation */}
          <nav style={{ flex: 1, padding: "8px 10px" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ width: "100%", border: "none", background: tab === t.id ? "rgba(28,28,28,.06)" : "transparent", borderRadius: 10, padding: "11px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 2, fontFamily: "'Inter',sans-serif", transition: "all .15s" }}>
                <div style={{ position: "relative" }}>
                  {t.icon(tab === t.id ? T.accent : T.textLo, 16)}
                  {t.id === "accueil" && acomptesPending.length > 0 && (
                    <div style={{ position: "absolute", top: -4, right: -5, width: 8, height: 8, borderRadius: "50%", background: T.warn, border: "1.5px solid #fff" }} />
                  )}
                </div>
                <span style={{ color: tab === t.id ? T.accent : T.textMid, fontWeight: tab === t.id ? 700 : 500, fontSize: 13 }}>{t.l}</span>
                {t.id === "accueil" && acomptesPending.length > 0 && (
                  <div style={{ marginLeft: "auto", background: T.warn, borderRadius: 10, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>
                    <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{acomptesPending.length}</span>
                  </div>
                )}
              </button>
            ))}
          </nav>
          {/* Logout */}
          <div style={{ padding: "12px 10px", borderTop: `1px solid ${T.border}` }}>
            <button onClick={onLogout} style={{ width: "100%", border: "none", background: "transparent", borderRadius: 10, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontFamily: "'Inter',sans-serif" }}>
              {Icon.sign(T.danger, 16)}
              <span style={{ color: T.danger, fontWeight: 600, fontSize: 13 }}>{tr.logout}</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100vh", overflow: "hidden" }}>
        {/* Header mobile uniquement */}
        {!isDesktop && (
          <div style={{ background: "#fff", padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(28,28,28,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {account.photo ? <img src={account.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : <span style={{ color: T.accent, fontWeight: 700, fontSize: 15 }}>{initial(account.nom)}</span>}
                </div>
                <div>
                  <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{artisan?.nom || account.nom}</div>
                  <div style={{ color: T.textLo, fontSize: 11 }}>{artisan?.certif || tr.artisanPro}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDispo(d => !d)} style={{ background: dispo ? "rgba(30,158,107,.08)" : "rgba(220,38,38,.08)", border: `1px solid ${dispo ? "rgba(30,158,107,.25)" : "rgba(220,38,38,.25)"}`, borderRadius: 20, padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: dispo ? T.success : T.danger, fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: dispo ? T.success : T.danger }} />{dispo ? tr.dispoShort : tr.indispoShort}
                </button>
                <button onClick={() => setDarkMode(d => !d)} aria-label={darkMode ? "Mode clair" : "Mode sombre"} title={darkMode ? "Mode clair" : "Mode sombre"} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 20, padding: "6px 10px", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{darkMode ? "☀️" : "🌙"}</button>
                <button onClick={onLogout} className="lk-ghost" aria-label={tr.logout} title={tr.logout} style={{ padding: "6px 10px" }}>{Icon.sign()}</button>
              </div>
            </div>
          </div>
        )}
        {/* Bannière hors ligne — visible tant que le pro est indisponible */}
        {!dispo && (
          <div style={{ background: "rgba(107,114,128,.95)", color: "#fff", padding: "9px 16px", fontSize: 12, fontWeight: 700, textAlign: "center", fontFamily: "'Inter',sans-serif" }}>
            ⏸ {lang === "en" ? "You are offline — you will not receive any missions" : "Vous êtes hors ligne — vous ne recevez pas de missions"}
          </div>
        )}
        {/* Barre persistante « Mission en cours » — visible partout sauf sur le suivi */}
        {missionEnCours && view !== "active" && (
          <button onClick={() => { setActiveMission(missionEnCours); setTab("active"); }} style={{ background: "linear-gradient(135deg,#2563eb,#1e40af)", color: "#fff", padding: "10px 16px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "'Inter',sans-serif", width: "100%" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{missionEnCours.statut === "en_route" ? "🚗" : "🔧"} {missionEnCours.statut === "en_route" ? (lang === "en" ? "On the way" : "En route") : (lang === "en" ? "Ongoing mission" : "Mission en cours")} — {missionEnCours.clientNom}</span>
            <span style={{ fontSize: 12, fontWeight: 800, background: "rgba(255,255,255,.2)", borderRadius: 8, padding: "4px 12px" }}>{lang === "en" ? "Resume →" : "Reprendre →"}</span>
          </button>
        )}
        {/* Stats bar mobile */}
        {!isDesktop && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: T.border }}>
            {[{ l: tr.pending, v: active.length, c: T.accent }, { l: tr.completedStat, v: done.filter(b => b.statut === "terminée").length, c: T.success }, { l: tr.netEarnings, v: fmt(earnings), c: T.success }].map(k => (
              <div key={k.l} style={{ background: T.bg, padding: "12px 8px", textAlign: "center" }}>
                <div style={{ color: k.c, fontWeight: 800, fontSize: k.l === "Gains net" ? 11 : 20 }}>{k.v}</div>
                <div style={{ color: T.textLo, fontSize: 9, marginTop: 2, textTransform: "uppercase" }}>{k.l}</div>
              </div>
            ))}
          </div>
        )}
        {/* Tabs mobile */}
        {!isDesktop && (
          <div style={{ display: "flex", background: T.bg, borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: "0 0 auto", border: "none", background: "none", padding: "12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, borderBottom: `2px solid ${tab === t.id ? T.accent : "transparent"}`, transition: "all .15s", fontFamily: "'Inter',sans-serif", position: "relative" }}>
                {t.icon(tab === t.id ? T.accent : T.textLo, 14)}
                {t.id === "accueil" && acomptesPending.length > 0 && (
                  <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: T.warn, border: "1.5px solid #f4f4f2" }} />
                )}
                <span style={{ color: tab === t.id ? T.accent : T.textLo, fontSize: 10, fontWeight: 600 }}>{t.l}</span>
              </button>
            ))}
          </div>
        )}
        {/* Desktop header avec titre du tab */}
        {isDesktop && (
          <div style={{ background: "#fff", padding: "18px 32px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ color: T.textHi, fontWeight: 800, fontSize: 20 }}>{tabs.find(t => t.id === tab)?.l || ""}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => setDarkMode(d => !d)} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 10px", fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{darkMode ? "☀️" : "🌙"}</button>
              {setLang && <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: T.textMid, fontFamily: "'Inter',sans-serif" }}>{tr.lang}</button>}
              <div style={{ color: T.success, fontWeight: 700, fontSize: 14 }}>{fmt(earnings)} {tr.earned}</div>
            </div>
          </div>
        )}
        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", maxWidth: isDesktop ? 900 : undefined, width: "100%", margin: isDesktop ? "0 auto" : undefined, paddingBottom: isDesktop ? 0 : 74 }}
          onTouchStart={e => {
            if (isDesktop) return;
            setSwipeTouchX(e.touches[0].clientX);
            // Pull-to-refresh : mémorise le départ si on est tout en haut
            pullStart.current = e.currentTarget.scrollTop <= 2 ? e.touches[0].clientY : null;
          }}
          onTouchEnd={e => {
            if (isDesktop) return;
            // Pull-to-refresh : tirer vers le bas depuis le haut de page
            if (pullStart.current != null && e.changedTouches[0].clientY - pullStart.current > 90 && !refreshing) {
              setRefreshing(true);
              if (navigator.vibrate) navigator.vibrate(40);
              setTimeout(() => setRefreshing(false), 900);
            }
            pullStart.current = null;
            // Pas de swipe d'onglet sur la carte (le glissement sert à se déplacer dessus)
            if (e.target.closest && e.target.closest(".leaflet-container")) return;
            const dx = e.changedTouches[0].clientX - swipeTouchX;
            if (Math.abs(dx) < 60) return;
            const ids = tabs.map(t => t.id);
            const cur = ids.indexOf(tab);
            if (dx < 0 && cur < ids.length - 1) setTab(ids[cur + 1]);
            if (dx > 0 && cur > 0) setTab(ids[cur - 1]);
          }}>
          {refreshing && (
            <div style={{ textAlign: "center", padding: "10px 0", color: T.accent, fontSize: 12, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>
              ⟳ {lang === "en" ? "Refreshing…" : "Actualisation…"}
            </div>
          )}
          {/* Sous-onglets Mon compte */}
          {tab === "compte_group" && (
            <div style={{ display: "flex", gap: 6, padding: "12px 14px 0", overflowX: "auto", WebkitOverflowScrolling: "touch", flexShrink: 0 }}>
              {compteSubs.map(s => {
                const activeSub = compteSub === s.id;
                return (
                  <button key={s.id} onClick={() => setCompteSub(s.id)} style={{ flexShrink: 0, background: activeSub ? T.grad : "#fff", color: activeSub ? "#fff" : T.textMid, border: activeSub ? "none" : `1px solid ${T.border}`, borderRadius: 20, padding: "8px 15px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                    {s.l}
                  </button>
                );
              })}
            </div>
          )}
          {/* Barre retour vers l'Accueil quand on est dans une vue de travail */}
          {inWorkView && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px 0", flexShrink: 0 }}>
              <button onClick={() => setTab("accueil")} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 20, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: T.textHi, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
                {Icon.back(T.textHi, 13)} {lang === "en" ? "Home" : "Accueil"}
              </button>
              <span style={{ fontWeight: 800, fontSize: 16, color: T.textHi }}>{workViews[tab]}</span>
            </div>
          )}
          {view === "accueil" && (() => {
            const fr = lang !== "en";
            const bonsDispo = bonsDispoList;
            const doneRecent = done.slice(-5).reverse();
            const Section = ({ color, title, count, children, goTab, goLabel }) => (
              <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14, borderLeft: `4px solid ${color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: T.textHi }}>{title} <span style={{ color, fontWeight: 900 }}>({count})</span></div>
                  {goTab && <button onClick={() => goView(goTab)} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", padding: "12px 6px", minHeight: 44 }}>{goLabel || (fr ? "Tout voir →" : "See all →")}</button>}
                </div>
                {children}
              </div>
            );
            return (
              <div style={{ padding: "14px" }}>
                {/* Salutation + dispo */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi }}>{fr ? "Bonjour" : "Hello"} {firstName(account.nom)} 👋</div>
                  <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>
                    {fr ? "Tout est là : vos bons, vos missions en cours et vos missions terminées." : "Everything is here: your vouchers, ongoing and completed missions."}
                  </div>
                </div>

                {!approved && <PendingApprovalCard account={account} setAccounts={setAccounts} lang={lang} />}
                {needsConnect && approved && (
                  <div style={{ background: "rgba(99,91,255,.07)", border: "1px solid rgba(99,91,255,.25)", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi, marginBottom: 4 }}>💶 {fr ? "Activez vos virements pour recevoir des missions" : "Enable payouts to receive jobs"}</div>
                    <div style={{ fontSize: 12.5, color: T.textMid, lineHeight: 1.5, marginBottom: 10 }}>{fr ? "Les clients paient par carte sur LOCKR : votre part (85 %) est versée directement sur votre compte bancaire. Tant que ce n'est pas activé, vous n'apparaissez pas aux clients." : "Clients pay by card on LOCKR: your share (85%) is paid directly to your bank account. Until this is enabled, clients cannot see you."}</div>
                    <StripeConnectCard lang={lang} account={account} compact />
                  </div>
                )}
                {/* Résumé du jour */}
                {rdvToday.length > 0 && (
                  <div onClick={() => goView("calendar")} style={{ background: "rgba(201,160,48,.07)", border: "1px solid rgba(201,160,48,.25)", borderRadius: 14, padding: "12px 16px", marginBottom: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                    {Icon.calendar(T.accent, 18)}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: T.textHi }}>
                        {fr ? `Aujourd'hui : ${rdvToday.length} RDV` : `Today: ${rdvToday.length} appointment${rdvToday.length > 1 ? "s" : ""}`}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.textMid, marginTop: 1 }}>
                        {fr ? "Prochain à" : "Next at"} {new Date(rdvToday[0].rdvDate).toLocaleTimeString(fr ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })} — {rdvToday[0].clientNom} · {rdvToday[0].adresse}
                      </div>
                    </div>
                    {Icon.arrow(T.accent, 14)}
                  </div>
                )}

                {/* Chiffres clés */}
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  {[
                    { n: fmt(earnings), l: fr ? "€ générés" : "€ earned", c: T.success, bg: "rgba(30,158,107,.07)" },
                    { n: fmt(active.reduce((s, b) => s + proShare(b), 0)), l: fr ? "€ à venir" : "€ upcoming", c: T.warn, bg: "rgba(217,119,6,.07)" },
                    { n: active.length, l: fr ? "missions en attente" : "pending missions", c: "#2563eb", bg: "rgba(37,99,235,.07)" },
                  ].map((s, i) => (
                    <div key={i} style={{ flex: 1, background: s.bg, borderRadius: 14, padding: "13px 10px", textAlign: "center" }}>
                      <div style={{ fontWeight: 900, fontSize: 17, color: s.c, letterSpacing: "-.5px" }}>{s.n}</div>
                      <div style={{ fontSize: 10, color: T.textMid, fontWeight: 600, marginTop: 2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Publier un bon pour un autre artisan — accès rapide mis en avant */}
                <button onClick={goPublierBon} style={{ width: "100%", background: T.grad, border: "none", borderRadius: 16, padding: "14px 18px", marginBottom: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "'Inter',sans-serif" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {Icon.plus("#fff", 18)}
                    <div style={{ textAlign: "left" }}>
                      <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{fr ? "Publier un bon pour un autre artisan" : "Post a voucher for another craftsman"}</div>
                      <div style={{ color: "rgba(255,255,255,.75)", fontSize: 11, marginTop: 1 }}>{fr ? "Intervention que vous ne pouvez pas faire — visible par tous, avec votre %" : "A job you can't take — visible to all, with your commission %"}</div>
                    </div>
                  </div>
                  {Icon.arrow("#fff", 16)}
                </button>

                {!isDesktop && (
                  <button onClick={() => goView("chat")} style={{ width: "100%", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, padding: "12px 16px", marginBottom: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontFamily: "'Inter',sans-serif" }}>
                    {Icon.chat(T.accent, 18)}
                    <span style={{ flex: 1, textAlign: "left", fontWeight: 700, fontSize: 13, color: T.textHi }}>{fr ? `Chat des pros — ${account.ville || "Paris"}` : `Pros chat — ${account.ville || "Paris"}`}</span>
                    {Icon.arrow(T.textLo, 14)}
                  </button>
                )}
                {/* Accès rapides — gros boutons SVG (desktop uniquement ; sur mobile ils sont dans la barre du bas) */}
                {isDesktop && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 16 }}>
                    {[
                      { id: "carte", ic: Icon.map, l: fr ? "Carte" : "Map" },
                      { id: "calendar", ic: Icon.calendar, l: fr ? "Calendrier" : "Calendar" },
                      { id: "missions", ic: Icon.list, l: fr ? "Missions" : "Missions" },
                      { id: "history", ic: Icon.hist, l: fr ? "Historique" : "History" },
                      { id: "chat", ic: Icon.chat, l: fr ? "Chat des pros" : "Pros chat" },
                    ].map(a => (
                      <button key={a.id} onClick={() => goView(a.id)} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, padding: "13px 4px", cursor: "pointer", fontFamily: "'Inter',sans-serif", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        {a.ic(T.accent, 20)}
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textMid }}>{a.l}</div>
                      </button>
                    ))}
                  </div>
                )}

                {/* 1. BONS À ACCEPTER */}
                <Section color={T.accent} title={fr ? "🎯 Bons à accepter" : "🎯 Vouchers to accept"} count={bonsDispo.length} goTab="bons" goLabel={fr ? "Accepter →" : "Accept →"}>
                  {bonsDispo.length === 0 && <div style={{ color: T.textLo, fontSize: 12 }}>{fr ? "Aucun bon disponible pour le moment." : "No voucher available right now."}</div>}
                  {bonsDispo.slice(0, 3).map(b => (
                    <div key={b.id} onClick={() => goView("bons")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid rgba(0,0,0,.04)", cursor: "pointer" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{b.urgence ? "🔴 " : ""}{b.titre}</div>
                        <div style={{ fontSize: 11, color: T.textLo }}>📍 {maskAddress(b.adresse)}</div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 12, color: T.accent, flexShrink: 0, marginLeft: 10 }}>{fmtFrom(b.montantEstime, lang)}</div>
                    </div>
                  ))}
                </Section>

                {/* 2. MISSIONS EN COURS — affichées tant que non validées/clôturées */}
                <Section color="#2563eb" title={fr ? "🔧 Missions en cours" : "🔧 Ongoing missions"} count={active.length} goTab="missions" goLabel={fr ? "Continuer →" : "Continue →"}>
                  {active.length === 0 && <div style={{ color: T.textLo, fontSize: 12 }}>{fr ? "Aucune mission en cours." : "No ongoing mission."}</div>}
                  {active.map(b => {
                    const days = Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 86400000);
                    return (
                      <div key={b.id} onClick={() => { setActiveMission(b); setTab(b.statut === "en_cours" ? "active" : "missions"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid rgba(0,0,0,.04)", cursor: "pointer" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{b.clientNom} — {(PROBLEMES.find(p => p.id === b.probleme) || {}).label || b.probleme}</div>
                          <div style={{ fontSize: 11, color: T.textLo }}>{b.adresse}</div>
                          {days >= 1 && <div style={{ fontSize: 10.5, color: T.warn, fontWeight: 700, marginTop: 2 }}>⏳ {fr ? `En attente depuis ${days} jour${days > 1 ? "s" : ""} — à clôturer` : `Pending for ${days} day${days > 1 ? "s" : ""} — to close`}</div>}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#2563eb", background: "rgba(37,99,235,.08)", borderRadius: 7, padding: "4px 8px", flexShrink: 0, marginLeft: 10 }}>{{ assignée: tr.statusAssigned, en_route: tr.statusEnRoute, en_cours: tr.statusInProgress }[b.statut] || b.statut}</span>
                      </div>
                    );
                  })}
                </Section>

                {/* 3. MISSIONS TERMINÉES */}
                <Section color={T.success} title={fr ? "✅ Missions terminées" : "✅ Completed missions"} count={done.length} goTab="history">
                  {done.length === 0 && <div style={{ color: T.textLo, fontSize: 12 }}>{fr ? "Aucune mission terminée." : "No completed mission."}</div>}
                  {doneRecent.map(b => (
                    <div key={b.id} onClick={() => setRecapMission(b)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,.04)", cursor: "pointer" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: T.textHi }}>{b.clientNom}</div>
                        <div style={{ fontSize: 11, color: T.textLo }}>{fmtDate(b.createdAt)}{b.statut !== "terminée" && b.fraisDeplacement > 0 ? (fr ? " · déplacement facturé" : " · travel fee") : ""}</div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: T.success }}>{fmt(proShare(b))}</div>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,.06)", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.textMid, fontWeight: 600 }}>{fr ? "Total gagné" : "Total earned"}</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: T.success }}>{fmt(earnings)}</span>
                  </div>
                </Section>
              </div>
            );
          })()}
          {view === "missions" && (
            <div style={{ padding: "14px" }}>
              {hasPaymentBlock && (
                <div style={{ background: "rgba(220,38,38,.07)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 14, padding: "16px 18px", marginBottom: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
                  {Icon.warning(T.danger, 20)}
                  <div>
                    <div style={{ color: T.danger, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{tr.paymentBlockTitle}</div>
                    <div style={{ color: T.danger, fontSize: 13, opacity: .8 }}>{tr.paymentBlockMsg}</div>
                  </div>
                </div>
              )}
              {active.length === 0 && <div style={{ textAlign: "center", padding: "52px 20px", color: T.textLo, fontSize: 14 }}>{tr.noMissionPending}</div>}
              {active.map(b => {
                const pr = PROBLEMES.find(p => p.id === b.probleme);
                const IC = PROB_ICONS[b.probleme] || Icon.tool;
                const tel = clientTelOf(b);
                const stLabel = { assignée: fr ? "À faire" : "To do", en_route: fr ? "En route" : "On the way", en_cours: fr ? "Sur place" : "On site" }[b.statut];
                return (
                  <div key={b.id} className="lk-card" style={{ padding: "14px", marginBottom: 10, borderLeft: `4px solid ${b.statut === "assignée" ? T.accent : "#2563eb"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, gap: 10 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(201,160,48,.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{IC(T.accent, 16)}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{pLabel(pr, lang) || b.probleme}</div>
                          <div style={{ color: T.textLo, fontSize: 12 }}>{b.clientNom} · {stLabel}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ color: T.accent, fontWeight: 800, fontSize: 16 }}>{fmt(b.montant)}</div>
                        <div style={{ color: T.success, fontSize: 11, fontWeight: 600 }}>{fr ? "Votre part" : "Your share"} {fmt(proShare(b))}</div>
                      </div>
                    </div>
                    <div style={{ background: T.bg, borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>{Icon.pin(T.textLo, 12)}<span style={{ color: T.textMid, fontSize: 12 }}>{b.adresse}</span></div>
                    {b.rdvDate && (
                      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                        <div style={{ background: "rgba(201,160,48,.07)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                          {Icon.calendar(T.gold, 12)}
                          <span style={{ color: T.gold, fontSize: 11, fontWeight: 600 }}>{new Date(b.rdvDate).toLocaleDateString(fr ? "fr-FR" : "en-GB")} {fmtTime(b.rdvDate)}</span>
                        </div>
                        {acomptePaid(b) > 0 && (
                          <div style={{ background: "rgba(30,158,107,.07)", border: "1px solid rgba(30,158,107,.15)", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: T.success, fontWeight: 600 }}>
                            {fr ? `Acompte client payé : ${fmt(acomptePaid(b))}` : `Client deposit paid: ${fmt(acomptePaid(b))}`}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Action principale selon l'étape — un seul gros bouton */}
                    {b.statut === "assignée" && <button onClick={() => departMission(b)} className="lk-btn" style={{ padding: "11px 0", fontSize: 13, marginBottom: 8 }}>🚗 {fr ? "Je pars chez le client" : "I'm leaving now"}</button>}
                    {b.statut === "en_route" && <button onClick={() => arriveMission(b)} className="lk-btn" style={{ padding: "11px 0", fontSize: 13, marginBottom: 8 }}>📍 {fr ? "Je suis arrivé" : "I've arrived"}</button>}
                    {b.statut === "en_cours" && <button onClick={() => { setActiveMission(b); setTab("active"); }} className="lk-btn" style={{ padding: "11px 0", fontSize: 13, marginBottom: 8 }}>{fr ? "Photos & clôture" : "Photos & close"} {Icon.arrow("#fff", 13)}</button>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => openItineraire(b)} style={{ flex: 1, padding: "9px 10px", background: "rgba(37,99,235,.08)", border: "1px solid rgba(37,99,235,.25)", borderRadius: 10, color: "#2563eb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{Icon.pin("#2563eb", 13)} GPS</button>
                      {tel && <button onClick={() => callPhone(tel)} style={{ flex: 1, padding: "9px 10px", background: "rgba(30,158,107,.08)", border: "1px solid rgba(30,158,107,.25)", borderRadius: 10, color: T.success, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{Icon.phone(T.success, 13)} {fr ? "Appeler" : "Call"}</button>}
                      {b.clientId && b.clientId !== "ext" && <button onClick={() => setChatMission(b)} style={{ flex: 1, padding: "9px 10px", background: "rgba(201,160,48,.08)", border: "1px solid rgba(201,160,48,.25)", borderRadius: 10, color: T.gold, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{Icon.chat(T.gold, 13)} Chat</button>}
                      {b.statut === "assignée" && <button onClick={() => refuseMission(b)} style={{ padding: "9px 12px", background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 10, color: T.danger, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{tr.refuse}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {view === "active" && (
            <div style={{ padding: "14px" }}>
              {absentMsg && <div role="status" style={{ background: absentMsg.ok ? "rgba(30,158,107,.08)" : "rgba(217,119,6,.08)", border: `1px solid ${absentMsg.ok ? "rgba(30,158,107,.25)" : "rgba(217,119,6,.25)"}`, borderRadius: 12, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, fontWeight: 600, color: absentMsg.ok ? T.success : T.warn }}>{absentMsg.msg}</div>}
              {!bk ? (
                <div style={{ textAlign: "center", padding: "52px 20px" }}>
                  <div style={{ color: T.textLo, fontSize: 14, marginBottom: 18 }}>{tr.noMissionActive}</div>
                  <button onClick={() => setTab("missions")} className="lk-btn">{tr.missions}</button>
                </div>
              ) : (() => {
                const pr = PROBLEMES.find(p => p.id === bk.probleme);
                const tel = clientTelOf(bk);
                const steps = [
                  { id: "assignée", l: fr ? "Acceptée" : "Accepted" },
                  { id: "en_route", l: fr ? "En route" : "On the way" },
                  { id: "en_cours", l: fr ? "Sur place" : "On site" },
                  { id: "terminée", l: fr ? "Clôturée" : "Closed" },
                ];
                const cur = steps.findIndex(x => x.id === bk.statut);
                const photoSlot = (field, label, inputRef, required = false) => (
                  <div key={field} className="lk-card" style={{ padding: "12px 14px", marginBottom: 10, border: required && !bk[field] ? `1.5px solid ${T.accent}` : undefined }}>
                    <div style={{ color: required && !bk[field] ? T.accent : T.textMid, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📷 {label}</div>
                    <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={savePhoto(field, { maxSize: 1200, quality: 0.7 })} />
                    {!bk[field] ? (
                      <button onClick={() => inputRef.current?.click()} style={{ width: "100%", background: "rgba(0,0,0,.02)", border: "1.5px dashed rgba(28,28,28,.2)", borderRadius: 10, padding: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Inter',sans-serif", color: T.textMid, fontWeight: 600, fontSize: 13 }}>
                        {Icon.cam(T.accent, 18)} {fr ? "Prendre ou choisir une photo" : "Take or choose a photo"}
                      </button>
                    ) : (
                      <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
                        <img src={bk[field]} alt="" style={{ width: "100%", maxHeight: 140, objectFit: "cover" }} />
                        <button onClick={() => updateMission(bk.id, { [field]: null })} aria-label={fr ? "Retirer la photo" : "Remove photo"} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,.6)", color: "#fff", border: "none", borderRadius: "50%", width: 26, height: 26, fontSize: 12, cursor: "pointer" }}>✕</button>
                      </div>
                    )}
                  </div>
                );
                return (
                  <>
                    <div className="lk-card" style={{ padding: "14px", marginBottom: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: T.textHi }}>{pLabel(pr, lang) || bk.probleme}</div>
                      <div style={{ color: T.textMid, fontSize: 12, marginTop: 2 }}>{bk.clientNom} · {bk.adresse}</div>
                      {/* Frise d'avancement — la même que celle vue par le client */}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 14 }}>
                        {steps.map((st, i) => (
                          <div key={st.id} style={{ flex: 1, textAlign: "center" }}>
                            <div style={{ height: 4, borderRadius: 2, background: i <= cur ? T.success : "rgba(0,0,0,.08)", marginBottom: 5 }} />
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: i <= cur ? T.success : T.textLo }}>{st.l}</span>
                          </div>
                        ))}
                      </div>
                      {bk.statut === "en_route" && <div style={{ marginTop: 10, fontSize: 11.5, color: "#2563eb", fontWeight: 600 }}>📡 {fr ? "Votre position est partagée avec le client pendant le trajet." : "Your location is shared with the client during the trip."}</div>}
                    </div>
                    {bk.statut === "assignée" && <button onClick={() => departMission(bk)} className="lk-btn" style={{ marginBottom: 10 }}>🚗 {fr ? "Je pars chez le client" : "I'm leaving now"}</button>}
                    {bk.statut === "en_route" && <button onClick={() => arriveMission(bk)} className="lk-btn" style={{ marginBottom: 10 }}>📍 {fr ? "Je suis arrivé" : "I've arrived"}</button>}
                    {bk.statut === "en_cours" && (
                      <>
                        {photoSlot("photoAvant", fr ? "Photo avant intervention (obligatoire)" : "Photo before work (required)", photoAvantRef, true)}
                        {photoSlot("photoApres", tr.photoApres, photoApresRef)}
                        {photoSlot("photoDevis", fr ? "Devis signé par le client" : "Quote signed by the client", photoDevisRef)}
                        <div className="lk-card" style={{ padding: "12px 14px", marginBottom: 10 }}>
                          <div style={{ color: T.textMid, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{fr ? "Coût du matériel (facultatif)" : "Material cost (optional)"}</div>
                          <input className="lk-input" type="number" inputMode="decimal" defaultValue={bk.matCost || ""} onBlur={e => updateMission(bk.id, { matCost: parseFloat(e.target.value) || 0 })} placeholder={fr ? "Montant matériel (€)" : "Material amount (€)"} style={{ marginBottom: 8 }} />
                          <input ref={matInvoiceRef} type="file" accept="image/*" style={{ display: "none" }} onChange={savePhoto("matInvoicePhoto", { maxSize: 1200, quality: 0.7 })} />
                          {!bk.matInvoicePhoto ? (
                            <button onClick={() => matInvoiceRef.current?.click()} style={{ width: "100%", background: "rgba(0,0,0,.02)", border: "1.5px dashed rgba(28,28,28,.15)", borderRadius: 10, padding: "10px", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.textMid, fontWeight: 600 }}>{fr ? "Ajouter la facture du matériel" : "Add material invoice"}</button>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><img src={bk.matInvoicePhoto} alt="" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8 }} /><span style={{ color: T.success, fontWeight: 600, fontSize: 12 }}>{Icon.check(T.success, 12)} {fr ? "Facture ajoutée" : "Invoice added"}</span></div>
                          )}
                        </div>
                      </>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button onClick={() => openItineraire(bk)} className="lk-ghost" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px", color: "#2563eb" }}>{Icon.pin("#2563eb", 15)} GPS</button>
                      {tel && <button onClick={() => callPhone(tel)} className="lk-ghost" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px" }}>{Icon.phone(T.success, 15)} {tr.callClient}</button>}
                      {bk.statut === "en_cours" && (
                        <button disabled={!bk.photoAvant} onClick={() => setClotureModal(true)} style={{ flex: 2, background: "linear-gradient(135deg,#2aaf77,#1d8f5f)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: bk.photoAvant ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif", opacity: bk.photoAvant ? 1 : .45 }}>
                          {Icon.check("#fff", 15)} {tr.closeAndInvoice}
                        </button>
                      )}
                    </div>
                    {bk.statut === "en_cours" && !bk.photoAvant && <div style={{ fontSize: 11, color: T.textLo, textAlign: "center", marginTop: 8 }}>{fr ? "Ajoutez la photo « avant » pour pouvoir clôturer." : "Add the \"before\" photo to be able to close."}</div>}
                    {bk.statut === "en_cours" && !bk.photoAvant && (
                      <button onClick={() => clientAbsent(bk)} className="lk-ghost" style={{ width: "100%", marginTop: 12, fontSize: 12.5, color: T.textMid }}>🚪 {fr ? "Client absent ?" : "Client not there?"}</button>
                    )}
                  </>
                );
              })()}
            </div>
          )}
          {view === "bons" && (hasPaymentBlock ? (
            <div style={{ padding: "14px" }}>
              <div style={{ background: "rgba(220,38,38,.07)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 14, padding: "20px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                {Icon.warning(T.danger, 22)}
                <div>
                  <div style={{ color: T.danger, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{tr.paymentBlockTitle}</div>
                  <div style={{ color: T.danger, fontSize: 13, opacity: .8, lineHeight: 1.5 }}>{tr.paymentBlockMsg}</div>
                </div>
              </div>
            </div>
          ) : !approved ? (
            <div style={{ padding: "14px" }}><PendingApprovalCard account={account} setAccounts={setAccounts} lang={lang} /></div>
          ) : needsConnect ? (
            <div style={{ padding: "14px" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: T.textHi, marginBottom: 6 }}>💶 {fr ? "Activez vos virements pour prendre des bons" : "Enable payouts to take jobs"}</div>
              <StripeConnectCard lang={lang} account={account} />
            </div>
          ) : <BonsScreen account={account} bons={bons} setBons={setBons} bookings={bookings} setBookings={setBookings} lang={lang} priorityOrder={priorityOrder} autoOpenPost={autoOpenPostBon} onAutoOpenHandled={() => setAutoOpenPostBon(false)} />)}
          {view === "chat" && <div style={{ height: "calc(100vh - 230px)", minHeight: 380, display: "flex", flexDirection: "column" }}><ChatRegional account={account} chatMessages={chatMessages} setChatMessages={setChatMessages} lang={lang} /></div>}
          {view === "auto" && <AutoEntrepriseTab account={account} setAccounts={setAccounts} bookings={myM} artisanId={account.artisanId} lang={lang} />}
          {view === "factu" && <FactuElecTab lang={lang} />}
          {view === "profil" && <ProProfileTab account={account} setAccounts={setAccounts} accounts={accounts} bookings={myM} lang={lang} openLegal={openLegal} />}
          {view === "marketplace" && <ProMarketplace account={account} listings={listings} setListings={setListings} sales={sales} setSales={setSales} lang={lang} />}
          {view === "carte" && <ProLiveMap account={account} bookings={myM} bons={approved ? visibleFor(account, bons) : []} priorityOrder={priorityOrder} lang={lang}
            onSelect={t => {
              if (t.type === "mission") {
                const b = bookings.find(x => x.id === t.id);
                if (b) { setActiveMission(b); setTab(b.statut === "en_cours" ? "active" : "missions"); }
              } else {
                setTab("bons");
              }
            }} />}
          {view === "calendar" && <CalendarScreen bookings={myM} artisanId={account.artisanId} lang={lang} />}
          {view === "stats" && <div style={{ overflowY: "auto" }}><EarningsChart bookings={myM} artisanId={account.artisanId} apports={visibleFor(account, bookings).filter(b => b.postedBy === account.id && b.statut === "terminée" && posterShare(b) > 0)} lang={lang} /></div>}
          {view === "history" && (() => {
            const months = [...new Set(done.map(b => (b.createdAt || "").slice(0, 7)))].sort().reverse();
            const shown = histMonth === "all" ? done : done.filter(b => (b.createdAt || "").slice(0, 7) === histMonth);
            const monthLabel = m => new Date(m + "-02").toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" });
            return (
            <div style={{ padding: "14px" }}>
              <button onClick={() => setMonthlyModal(true)} style={{ width: "100%", background: T.grad, border: "none", borderRadius: 12, padding: "12px 16px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12, fontFamily: "'Inter',sans-serif" }}>
                {Icon.file("#fff", 15)} {tr.downloadMonthlyReport}
              </button>
              {/* Filtre par mois */}
              {months.length > 1 && (
                <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, WebkitOverflowScrolling: "touch" }}>
                  <button onClick={() => setHistMonth("all")} style={{ flexShrink: 0, background: histMonth === "all" ? T.grad : "#fff", color: histMonth === "all" ? "#fff" : T.textMid, border: histMonth === "all" ? "none" : `1px solid ${T.border}`, borderRadius: 16, padding: "6px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{lang === "en" ? "All" : "Tout"}</button>
                  {months.map(m => (
                    <button key={m} onClick={() => setHistMonth(m)} style={{ flexShrink: 0, background: histMonth === m ? T.grad : "#fff", color: histMonth === m ? "#fff" : T.textMid, border: histMonth === m ? "none" : `1px solid ${T.border}`, borderRadius: 16, padding: "6px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", textTransform: "capitalize" }}>{monthLabel(m)}</button>
                  ))}
                </div>
              )}
              {shown.length === 0 && <div style={{ textAlign: "center", padding: "52px 20px", color: T.textLo, fontSize: 14 }}>{tr.noCompletedMission}</div>}
              {shown.map(b => {
                const isPaid = b.statutPaiement === "payé";
                const pr = PROBLEMES.find(p => p.id === b.probleme);
                return (
                  <HistoryCard key={b.id} b={b} isPaid={isPaid} pr={pr} tr={tr} setBookings={setBookings} lang={lang} />
                );
              })}
            </div>
            );
          })()}
        </div>
      </div>
      {/* Barre d'accès rapide mobile — SVG propres, fixée en bas de page */}
      {!isDesktop && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 300, background: "#fff", borderTop: `1px solid ${T.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -2px 12px rgba(0,0,0,.06)" }}>
          {[
            { id: "accueil", ic: Icon.home, l: lang === "en" ? "Home" : "Accueil" },
            { id: "carte", ic: Icon.map, l: lang === "en" ? "Map" : "Carte" },
            { id: "calendar", ic: Icon.calendar, l: lang === "en" ? "Calendar" : "Calendrier" },
            { id: "missions", ic: Icon.list, l: "Missions" },
            { id: "history", ic: Icon.hist, l: lang === "en" ? "History" : "Historique" },
          ].map(a => {
            const on = tab === a.id;
            return (
              <button key={a.id} onClick={() => goView(a.id)} style={{ flex: 1, background: "none", border: "none", padding: "10px 2px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: "'Inter',sans-serif", borderTop: `2.5px solid ${on ? T.accent : "transparent"}`, position: "relative" }}>
                {a.ic(on ? T.accent : T.textLo, 19)}
                {a.id === "accueil" && bonsDispoCount > 0 && (
                  <span style={{ position: "absolute", top: 5, right: "50%", marginRight: -18, background: T.danger, color: "#fff", borderRadius: 9, minWidth: 16, height: 16, fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "1.5px solid #fff" }}>{bonsDispoCount}</span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: on ? T.accent : T.textLo }}>{a.l}</span>
              </button>
            );
          })}
        </div>
      )}
      {clotureModal && activeMission && <ClotureModal mission={activeMission} setBookings={setBookings} onConfirm={finishMission} onCancel={() => { setClotureModal(false); if (activeMission?.statut === "terminée") { setActiveMissionId(null); setTab("accueil"); } }} lang={lang} />}
      {chatMission && <ChatIntervention booking={chatMission} account={account} interventionChats={interventionChats} setInterventionChats={setInterventionChats} otherNom={chatMission.clientNom} onClose={() => setChatMission(null)} lang={lang} />}
      {monthlyModal && <MonthlyReportModal bookings={myM} artisanId={account.artisanId} lang={lang} onClose={() => setMonthlyModal(false)} />}
      {recapMission && <MissionRecapModal mission={recapMission} lang={lang} onClose={() => setRecapMission(null)} />}
      {/* Écran de bienvenue — premier lancement uniquement */}
      {onboard && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 22, padding: "32px 26px 26px", maxWidth: 380, width: "100%", textAlign: "center", fontFamily: "'Inter',sans-serif" }}>
            {[
              { ic: Icon.percent, t: lang === "en" ? "Receive vouchers" : "Recevez des bons", d: lang === "en" ? "Interventions near you appear on your Home screen. Urgent ones ring and vibrate." : "Les interventions proches de vous arrivent sur votre Accueil. Les urgences sonnent et vibrent." },
              { ic: Icon.tool, t: lang === "en" ? "Intervene" : "Intervenez", d: lang === "en" ? "Accept, call the client, GPS route, before/after photos — everything is guided." : "Acceptez, appelez le client, itinéraire GPS, photos avant/après — tout est guidé." },
              { ic: Icon.euro, t: lang === "en" ? "Get paid automatically" : "Soyez payé automatiquement", d: lang === "en" ? "Your share is transferred directly to your bank account after each mission." : "Votre part est virée directement sur votre compte bancaire après chaque mission." },
            ].map((st, i) => i === onboardStep && (
              <div key={i}>
                <div style={{ width: 74, height: 74, borderRadius: 22, background: "rgba(201,160,48,.1)", border: "1.5px solid rgba(201,160,48,.3)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>{st.ic(T.accent, 32)}</div>
                <div style={{ fontWeight: 900, fontSize: 20, color: T.textHi, marginBottom: 8 }}>{st.t}</div>
                <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.6, marginBottom: 22 }}>{st.d}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: i === onboardStep ? 22 : 7, height: 7, borderRadius: 4, background: i === onboardStep ? T.accent : "rgba(0,0,0,.12)", transition: "all .25s" }} />)}
            </div>
            <button onClick={() => {
              if (onboardStep < 2) setOnboardStep(st => st + 1);
              else { localStorage.setItem("lk_pro_onboarded", "1"); setOnboard(false); }
            }} className="lk-btn" style={{ width: "100%" }}>
              {onboardStep < 2 ? (lang === "en" ? "Next" : "Suivant") : (lang === "en" ? "Let's go!" : "C'est parti !")}
            </button>
            {onboardStep < 2 && (
              <button onClick={() => { localStorage.setItem("lk_pro_onboarded", "1"); setOnboard(false); }} style={{ background: "none", border: "none", color: T.textLo, fontSize: 12, cursor: "pointer", marginTop: 12, fontFamily: "'Inter',sans-serif", padding: "12px 6px", minHeight: 44 }}>
                {lang === "en" ? "Skip" : "Passer"}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* Récap d'une mission terminée — ouvert depuis l'Accueil */
function MissionRecapModal({ mission: b, lang = "fr", onClose }) {
  const fr = lang !== "en";
  const pr = PROBLEMES.find(p => p.id === b.probleme);
  const isPaid = b.statutPaiement === "payé";
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 8500, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "22px 20px 30px", maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: T.textHi }}>{pLabel(pr, lang)}</div>
            <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{b.clientNom} · {fmtDate(b.createdAt)}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(0,0,0,.05)", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 14, color: T.textMid, fontFamily: "'Inter',sans-serif" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, background: T.bg, borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 6 }}>{Icon.pin(T.textLo, 13)}<span style={{ color: T.textMid, fontSize: 12 }}>{b.adresse}</span></div>
        </div>

        <div style={{ background: "rgba(30,158,107,.05)", border: "1px solid rgba(30,158,107,.18)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: T.textMid, fontSize: 12 }}>{fr ? "Montant total" : "Total amount"}</span>
            <span style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{fmt(b.montantFinal ?? b.montant)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: T.textMid, fontSize: 12 }}>{fr ? `Votre part (${pctLabel(b)})` : `Your share (${pctLabel(b)})`}</span>
            <span style={{ color: T.success, fontWeight: 800, fontSize: 15 }}>{fmt(proShare(b))}</span>
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(30,158,107,.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: T.textMid, fontSize: 12 }}>{fr ? "Statut paiement" : "Payment status"}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: isPaid ? T.success : T.warn, background: isPaid ? "rgba(30,158,107,.1)" : "rgba(217,119,6,.1)", borderRadius: 7, padding: "3px 9px" }}>{isPaid ? (fr ? "Payé" : "Paid") : (fr ? "En attente" : "Pending")}</span>
          </div>
        </div>

        {(b.photoAvant || b.photoApres) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {b.photoAvant && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: T.textLo, fontWeight: 700, marginBottom: 4 }}>{fr ? "AVANT" : "BEFORE"}</div>
                <img src={b.photoAvant} alt="avant" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 10 }} />
              </div>
            )}
            {b.photoApres && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: T.textLo, fontWeight: 700, marginBottom: 4 }}>{fr ? "APRÈS" : "AFTER"}</div>
                <img src={b.photoApres} alt="après" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 10 }} />
              </div>
            )}
          </div>
        )}

        {b.factureImg && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, color: T.textLo, fontWeight: 700, marginBottom: 4 }}>{fr ? "FACTURE" : "INVOICE"}</div>
            <img src={b.factureImg} alt="facture" style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 10 }} />
          </div>
        )}

        <button onClick={onClose} className="lk-ghost" style={{ width: "100%" }}>{fr ? "Fermer" : "Close"}</button>
      </div>
    </div>,
    document.body
  );
}

/* ─── CLIENT APP ───
   Parcours simplifié : 1) besoin  2) adresse + artisan  3) devis + carte (empreinte)
   → suivi en direct (position réelle partagée par l'artisan) → facture. */
const CLIENT_ST = {
  en_attente_paiement: { fr: "Carte à enregistrer", en: "Card required", c: T.warn },
  assignée: { fr: "Confirmée", en: "Confirmed", c: T.accent },
  en_route: { fr: "Artisan en route", en: "On the way", c: "#2563eb" },
  en_cours: { fr: "En cours", en: "In progress", c: "#2563eb" },
  terminée: { fr: "Terminée", en: "Completed", c: T.success },
  annulée: { fr: "Annulée", en: "Cancelled", c: T.danger },
  annulée_client: { fr: "Annulée", en: "Cancelled", c: T.danger },
};

function ClientApp({ account, bookings, setBookings, onLogout, pros = [], stripeRequired = false, fraisDep = FRAIS_DEPLACEMENT_DEFAULT, setAccounts = () => {}, interventionChats, setInterventionChats, lang = "fr", setLang, bons = [], setBons = () => {}, setters, openLegal }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const demoMode = IS_DEMO || isDemoAccount(account);
  const [screen, setScreen] = useState("home");
  const [selProb, setSelProb] = useState(null);
  const [selArt, setSelArt] = useState(null);
  const [selMetier, setSelMetier] = useState(null);
  const [trackingId, setTrackingId] = useState(null);
  const [adresse, setAdresse] = useState(account.adresse || "");
  const [adresseErr, setAdresseErr] = useState("");
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [devis, setDevis] = useState(null);       // { montant, adresse, lat, lng }
  const [payFor, setPayFor] = useState(null);     // { booking, kind: "empreinte" | "facture" }
  const [showChat, setShowChat] = useState(null); // booking
  const [litigeModal, setLitigeModal] = useState(null);
  const [litigeText, setLitigeText] = useState("");
  const [profileModal, setProfileModal] = useState(false);
  const [helpModal, setHelpModal] = useState(false);
  const [factureView, setFactureView] = useState(null);
  const [toast, setToast] = useState(null);
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem("lk_dark") === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("lk_dark", darkMode ? "1" : "0"); } catch { /* ignore */ } }, [darkMode]);
  const artisanListRef = useRef(null);
  const showToast = t => { setToast(t); setTimeout(() => setToast(null), 5000); };

  useEffect(() => {
    if (selProb && !isDesktop && artisanListRef.current) {
      setTimeout(() => artisanListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }, [selProb]); // eslint-disable-line react-hooks/exhaustive-deps

  const myBk = visibleFor(account, bookings).filter(b => b.clientId === account.id)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const myDemandes = visibleFor(account, bons).filter(b => b.clientId === account.id);
  const liveBk = myBk.find(b => ["assignée", "en_route", "en_cours"].includes(b.statut));

  /* Artisans proposés (profils publics) : uniquement des pros VALIDÉS par
     LOCKR, non bannis, de la ville du client et du bon métier — et, quand le
     paiement en ligne est actif, ayant activé leurs virements Stripe. Les
     artisans de démonstration ne sont montrés qu'en démonstration. */
  const proOf = id => (id ? pros.find(p => (p.artisanId || p.id) === id) : undefined);
  const artisanList = (() => {
    const region = (account.ville || "").trim().toLowerCase();
    const real = pros
      .filter(a => (a.dossierStatus || "approved") === "approved" && !a.banned && (demoMode || !isDemoAccount(a)) && (!stripeRequired || a.stripeReady))
      .filter(a => !region || sameCity(a.ville, region))
      .map(a => {
        const demo = DEMO_ARTISANS.find(d => d.id === a.artisanId);
        return {
          id: a.artisanId || a.id, accountId: a.id, nom: a.nom, tel: a.tel || demo?.tel || "",
          tarif: Number(a.tarif) || demo?.tarif || 85, dispo: a.dispo !== false && (demo ? demo.dispo : true),
          certif: demo?.certif || (a.certif && a.certif !== "aucune" ? String(a.certif).toUpperCase() : (fr ? "Pro vérifié LOCKR" : "LOCKR verified pro")),
          color: demo?.color || "#5b8def", ville: a.ville || "", photo: a.photo || null,
          lat: a.lat ?? demo?.lat, lng: a.lng ?? demo?.lng, metiers: proMetiers(a).length ? proMetiers(a) : (demo ? [demo.metier] : []),
        };
      });
    return real.filter(a => !selProb || !a.metiers.length || a.metiers.includes(selProb.metier));
  })();
  const artisanOf = b => {
    const acc = proOf(b?.artisanId);
    const demo = DEMO_ARTISANS.find(d => d.id === b?.artisanId);
    if (!acc && !demo) return b?.artisanNom ? { nom: b.artisanNom, tel: b.artisanTel || "", color: T.accent } : null;
    return { nom: acc?.nom || demo?.nom || b?.artisanNom, tel: acc?.tel || b?.artisanTel || demo?.tel || "", color: demo?.color || T.accent, certif: demo?.certif || (fr ? "Pro vérifié LOCKR" : "LOCKR verified pro"), photo: acc?.photo || null };
  };

  // Adresse : saisie (obligatoire) ou position GPS convertie en adresse
  const useMyPosition = () => {
    if (!navigator.geolocation) { setAdresseErr(fr ? "Géolocalisation indisponible : saisissez votre adresse." : "Location unavailable: type your address."); return; }
    setLocating(true); setAdresseErr("");
    navigator.geolocation.getCurrentPosition(async p => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${p.coords.latitude}&lon=${p.coords.longitude}`);
        const d = await r.json();
        const a = d.address || {};
        const line = [[a.house_number, a.road].filter(Boolean).join(" "), [a.postcode, a.city || a.town || a.village].filter(Boolean).join(" ")].filter(Boolean).join(", ");
        setAdresse(line || d.display_name || "");
      } catch { setAdresseErr(fr ? "Adresse introuvable : saisissez-la." : "Address not found: please type it."); }
      setLocating(false);
    }, () => { setLocating(false); setAdresseErr(fr ? "Position refusée : saisissez votre adresse." : "Location denied: type your address."); }, { enableHighAccuracy: true, timeout: 10000 });
  };
  const checkAdresse = async () => {
    const a = adresse.trim();
    if (a.length < 6 || !/\d/.test(a)) { setAdresseErr(fr ? "Indiquez l'adresse complète (numéro, rue, ville)." : "Enter the full address (number, street, city)."); return null; }
    const geo = await geocodeAddress(a);
    if (a !== account.adresse) setAccounts(p => p.map(x => x.id === account.id ? { ...x, adresse: a } : x));
    return { adresse: a, lat: geo?.[0] ?? null, lng: geo?.[1] ?? null };
  };

  const book = async () => {
    if (!selArt || !selProb) return;
    setBusy(true);
    const ad = await checkAdresse();
    setBusy(false);
    if (!ad) return;
    setDevis({ ...ad, montant: selArt.tarif + (selProb.urgence ? URGENCE_SUPPLEMENT : 0) });
  };

  /* Devis accepté : la réservation est enregistrée AVANT l'empreinte
     bancaire (rien n'est perdu pendant la redirection vers Stripe). */
  const confirmDevis = () => {
    if (!devis || !selArt || !selProb) return;
    const b = {
      id: uid(), clientId: account.id, clientNom: account.nom, clientTel: account.tel || "",
      artisanId: selArt.id, artisanAccountId: selArt.accountId, artisanNom: selArt.nom, artisanTel: selArt.tel || "",
      adresse: devis.adresse, probleme: selProb.id, metier: selProb.metier, urgence: !!selProb.urgence,
      montant: devis.montant, techPct: PCT_DEFAULT,
      statut: "en_attente_paiement", createdAt: ts(), rdvDate: ts(), region: account.ville || "Paris",
      ...(devis.lat != null ? { lat: devis.lat, lng: devis.lng, clientPos: [devis.lat, devis.lng] } : {}),
      bonType: "platform", ...(demoMode ? { isDemo: true } : {}),
    };
    b.participants = bookingParticipants(b);
    setBookings(p => [...p, b]);
    setDevis(null);
    setPayFor({ booking: b, kind: "empreinte" });
  };

  /* Aucun artisan disponible : la demande est publiée comme un « bon »
     visible par les artisans de la ville ET les entreprises partenaires. */
  const publierDemande = async () => {
    if (!selProb) return;
    setBusy(true);
    const ad = await checkAdresse();
    setBusy(false);
    if (!ad) return;
    const bon = {
      id: uid(), titre: `${pLabel(selProb, "fr")} — ${account.nom}`,
      adresse: ad.adresse, probleme: selProb.id, metier: selProb.metier,
      urgence: !!selProb.urgence, montantEstime: 90 + (selProb.urgence ? URGENCE_SUPPLEMENT : 0),
      postedBy: "platform", postedByNom: "LOCKR", region: account.ville || "Paris",
      ...(ad.lat != null ? { lat: ad.lat, lng: ad.lng } : {}),
      createdAt: ts(), techPct: PCT_DEFAULT,
      clientId: account.id, clientNom: account.nom, clientTel: account.tel || "", openPartner: true, ...(demoMode ? { isDemo: true } : {}),
    };
    setBons(p => [...p, bon]);
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    setSelProb(null); setSelArt(null); setScreen("home");
    showToast(fr ? "Demande publiée : vous serez prévenu dès qu'un professionnel accepte." : "Request published: you'll be notified as soon as a professional accepts.");
  };

  const cancelBooking = async b => {
    // Artisan déjà en route : annulation tardive, frais de déplacement
    if (b.statut === "en_route") {
      const card = empreinteActive(b);
      if (!window.confirm(fr
        ? `L'artisan est déjà en route.${fraisDep > 0 ? ` Annuler maintenant entraîne ${fmt(fraisDep)} de frais de déplacement${card ? ", débités de votre carte" : ""}.` : ""} Confirmer l'annulation ?`
        : `The craftsman is already on the way.${fraisDep > 0 ? ` Cancelling now incurs a ${fmt(fraisDep)} travel fee${card ? ", charged to your card" : ""}.` : ""} Confirm cancellation?`)) return;
      if (live) {
        const r = await releaseHold(b.id, "annulation_tardive");
        showToast(!r.ok
          ? (fr ? "Annulation impossible pour le moment : réessayez ou appelez l'artisan." : "Cannot cancel right now: retry or call the craftsman.")
          : r.frais > 0
            ? (fr ? `Intervention annulée — frais de déplacement : ${fmt(r.frais)}.` : `Booking cancelled — travel fee: ${fmt(r.frais)}.`)
            : (fr ? "Intervention annulée." : "Booking cancelled."));
        return;
      }
      setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "annulée_client", annulationRaison: "annulation_tardive", annuleeLe: ts(), ...(fraisDep > 0 ? { fraisDeplacement: fraisDep, montantFinal: fraisDep } : {}) } : x));
      if (card) applyPayment(setters || { setBookings }, fraisDep > 0 ? { type: "capture", ref: b.id, amount: Math.min(fraisDep, empreinteMontant(b)), demo: true } : { type: "liberation", ref: b.id, demo: true });
      showToast(fraisDep > 0 ? (fr ? `Intervention annulée — frais de déplacement : ${fmt(fraisDep)}.` : `Booking cancelled — travel fee: ${fmt(fraisDep)}.`) : (fr ? "Intervention annulée." : "Booking cancelled."));
      return;
    }
    if (!window.confirm(fr ? "Annuler cette intervention ?" : "Cancel this booking?")) return;
    // Empreinte bancaire : le serveur libère le montant réservé et annule la mission
    if (live && empreinteActive(b)) {
      const r = await releaseHold(b.id, "annulation_client");
      showToast(r.ok
        ? (fr ? "Intervention annulée — le montant réservé sur votre carte est libéré." : "Booking cancelled — the amount held on your card is released.")
        : (fr ? "Annulation impossible pour le moment, réessayez dans un instant." : "Cannot cancel right now, please retry in a moment."));
      return;
    }
    setBookings(p => p.map(x => x.id === b.id ? {
      ...x, statut: "annulée_client", annuleeLe: ts(),
      ...(x.acompteClientPaye ? { remboursementAcompte: "à_traiter" } : {}),
    } : x));
    if (!live && empreinteActive(b)) applyPayment(setters || { setBookings }, { type: "liberation", ref: b.id, demo: true });
    if (empreinteActive(b)) showToast(fr ? "Intervention annulée — le montant réservé sur votre carte est libéré." : "Booking cancelled — the amount held on your card is released.");
    else if (b.acompteClientPaye) showToast(fr ? "Intervention annulée. Votre acompte vous sera remboursé sous 5 jours ouvrés." : "Booking cancelled. Your deposit will be refunded within 5 business days.");
  };

  const rebook = b => {
    const pr = PROBLEMES.find(p => p.id === b.probleme);
    setSelMetier(pr?.metier || null); setSelProb(pr || null); setSelArt(null);
    setScreen("choose");
  };

  const submitLitige = () => {
    if (!litigeText.trim() || !litigeModal) return;
    // Le litige est enregistré sur l'intervention : l'équipe LOCKR le voit immédiatement
    setBookings(p => p.map(x => x.id === litigeModal.id ? { ...x, litige: { texte: litigeText.trim(), statut: "ouvert", ouvertLe: ts(), par: account.id } } : x));
    setLitigeModal(null); setLitigeText("");
    showToast(fr ? "Litige transmis à l'équipe LOCKR — réponse sous 48 h." : "Dispute sent to the LOCKR team — reply within 48h.");
  };

  const FAQ = fr ? [
    { q: "Combien ça coûte ?", a: "Le prix affiché est le tarif de départ. Sur place, l'artisan vous remet un devis FERME avant tout travaux — rien ne démarre sans votre accord." },
    { q: "Pourquoi enregistrer ma carte ?", a: "À la réservation, le montant du devis est seulement réservé sur votre carte (empreinte bancaire) : rien n'est débité. Après l'intervention, seul le montant final de la facture est prélevé. Si vous annulez avant le départ de l'artisan, la réservation est simplement libérée." },
    { q: "Puis-je annuler ?", a: "Oui, tant que l'artisan n'est pas en route, depuis « Mes interventions ». Pour un dépannage urgent déjà commencé, l'annulation n'est plus possible (art. L.221-28 du Code de la consommation)." },
    { q: "L'artisan est-il vérifié ?", a: "Oui — identité, SIRET, assurance RC Pro et qualifications sont contrôlés par LOCKR avant qu'un artisan puisse recevoir des missions." },
    { q: "Et s'il y a un problème ?", a: "Touchez « Signaler un problème » sur l'intervention. Notre équipe répond sous 48 h. Vous pouvez aussi saisir gratuitement le médiateur de la consommation." },
    { q: "Comment je paie ?", a: "En ligne, par carte, sur la page sécurisée de notre prestataire Stripe (3-D Secure). L'artisan ne manipule jamais votre carte. Vous recevez un reçu par e-mail." },
  ] : [
    { q: "How much does it cost?", a: "The displayed price is the starting price. On site, the craftsman gives you a FIRM quote before any work — nothing starts without your agreement." },
    { q: "Why register my card?", a: "When booking, the quote amount is only held on your card: nothing is charged. After the intervention, only the final invoice amount is charged. If you cancel before the craftsman leaves, the hold is simply released." },
    { q: "Can I cancel?", a: "Yes, as long as the craftsman is not on the way, from \"My bookings\". Urgent work already started cannot be cancelled (art. L.221-28 Consumer Code)." },
    { q: "Is the craftsman verified?", a: "Yes — identity, SIRET, professional insurance and qualifications are checked by LOCKR before a craftsman can receive jobs." },
    { q: "What if there is a problem?", a: "Tap \"Report a problem\" on the booking. Our team replies within 48h. You can also contact the consumer mediator free of charge." },
    { q: "How do I pay?", a: "Online by card, on our provider Stripe's secure page (3-D Secure). The craftsman never handles your card. You get a receipt by e-mail." },
  ];

  /* Carte d'une intervention (liste « Mes interventions ») */
  const bookingCard = b => {
    const a = artisanOf(b);
    const pr = PROBLEMES.find(p => p.id === b.probleme);
    const st = CLIENT_ST[b.statut] || { fr: b.statut, en: b.statut, c: T.textLo };
    const reste = resteAPayer(b);
    const unpaid = isBillable(b) && b.statutPaiement !== "payé" && reste > 0;
    const btn = (label, onClick, kind = "ghost") => (
      <button onClick={onClick} style={{ flex: 1, minWidth: 130, background: kind === "main" ? T.grad : kind === "danger" ? "rgba(220,38,38,.06)" : "rgba(201,160,48,.07)", border: kind === "main" ? "none" : `1px solid ${kind === "danger" ? "rgba(220,38,38,.2)" : "rgba(201,160,48,.25)"}`, borderRadius: 9, padding: "8px 10px", color: kind === "main" ? "#fff" : kind === "danger" ? T.danger : T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{label}</button>
    );
    return (
      <div key={b.id} style={{ background: "#fff", border: "1.5px solid rgba(201,160,48,.15)", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 10px rgba(201,160,48,.08)", textAlign: "left" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(201,160,48,.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(PROB_ICONS[b.probleme] || Icon.tool)(T.accent, 14)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pLabel(pr, lang) || b.typeIntervention || b.probleme}</div>
              <div style={{ color: T.textLo, fontSize: 11 }}>{a?.nom || (b.partenaireNom || "—")} · {fmtDate(b.createdAt)} · {fmt(bookingTotal(b))}</div>
            </div>
          </div>
          <span style={{ color: st.c, fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>{fr ? st.fr : st.en}</span>
        </div>
        {b.litige && <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: b.litige.statut === "résolu" ? T.success : T.warn }}>{b.litige.statut === "résolu" ? (fr ? `Litige résolu${b.litige.reponse ? ` — ${b.litige.reponse}` : ""}` : `Dispute resolved${b.litige.reponse ? ` — ${b.litige.reponse}` : ""}`) : (fr ? "Litige en cours de traitement" : "Dispute being handled")}</div>}
        {b.remboursementAcompte && <div style={{ marginTop: 6, fontSize: 11, color: T.textMid }}>{b.remboursementAcompte === "remboursé" ? (fr ? "Acompte remboursé ✓" : "Deposit refunded ✓") : (fr ? "Remboursement de l'acompte en cours" : "Deposit refund in progress")}</div>}
        {b.empreinte && <div style={{ marginTop: 6, fontSize: 11, color: T.textMid }}>{EMPREINTE_TXT(b, lang)}</div>}
        {b.fraisDeplacement > 0 && <div style={{ marginTop: 6, fontSize: 11, color: T.textMid }}>{FRAIS_TXT(b, lang)}{b.statutPaiement === "payé" ? (fr ? " — réglés ✓" : " — paid ✓") : ""}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {b.statut === "en_attente_paiement" && btn(fr ? "Confirmer avec ma carte" : "Confirm with my card", () => setPayFor({ booking: b, kind: "empreinte" }), "main")}
          {["assignée", "en_route", "en_cours"].includes(b.statut) && btn(fr ? "Suivre en direct" : "Live tracking", () => { setTrackingId(b.id); setScreen("tracking"); }, "main")}
          {unpaid && !empreinteActive(b) && btn(b.statut === "terminée" ? (fr ? `Régler la facture (${fmt(reste)})` : `Pay invoice (${fmt(reste)})`) : (fr ? `Régler les frais (${fmt(reste)})` : `Pay the fee (${fmt(reste)})`), () => setPayFor({ booking: b, kind: "facture" }), "main")}
          {b.statut === "terminée" && b.factureImg && btn(fr ? "Voir la facture" : "View invoice", () => setFactureView(b))}
          {["en_attente_paiement", "assignée"].includes(b.statut) && btn(tr.cancelBooking, () => cancelBooking(b), "danger")}
          {b.statut === "en_route" && btn(fraisDep > 0 ? (fr ? `Annuler (${fmt(fraisDep)} de frais)` : `Cancel (${fmt(fraisDep)} fee)`) : tr.cancelBooking, () => cancelBooking(b), "danger")}
          {b.statut === "terminée" && !b.litige && btn(fr ? "Signaler un problème" : "Report a problem", () => { setLitigeModal(b); setLitigeText(""); })}
          {["terminée", "annulée", "annulée_client"].includes(b.statut) && btn(fr ? "↻ Refaire une demande" : "↻ Book again", () => rebook(b))}
        </div>
      </div>
    );
  };

  const interventionsBlock = (
    <>
      {myDemandes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {myDemandes.map(d => (
            <div key={d.id} style={{ background: "rgba(37,99,235,.05)", border: "1px solid rgba(37,99,235,.18)", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>⏳ {pLabel(PROBLEMES.find(p => p.id === d.probleme), lang)}</div>
                <div style={{ fontSize: 11, color: T.textMid }}>{fr ? "Demande publiée — en attente d'un professionnel" : "Request published — waiting for a professional"}</div>
              </div>
              <button onClick={() => { if (window.confirm(fr ? "Retirer cette demande ?" : "Withdraw this request?")) setBons(p => p.filter(x => x.id !== d.id)); }} style={{ background: "none", border: "1px solid rgba(220,38,38,.25)", color: T.danger, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>{fr ? "Retirer" : "Withdraw"}</button>
            </div>
          ))}
        </div>
      )}
      {myBk.length === 0 && myDemandes.length === 0 && <div style={{ color: T.textLo, fontSize: 13, textAlign: "center", padding: "24px 0" }}>{tr.noIntervention}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{myBk.map(bookingCard)}</div>
    </>
  );

  const header = (back) => (
    <div style={{ background: "rgba(255,255,255,.95)", backdropFilter: "blur(20px)", padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {back && <button onClick={back} className="lk-ghost" aria-label={fr ? "Retour" : "Back"} style={{ padding: "8px 11px" }}>{Icon.back()}</button>}
        <LockrWordmark height={18} light={false} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setDarkMode(d => !d)} aria-label={fr ? "Mode sombre" : "Dark mode"} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 9px", fontSize: 12, cursor: "pointer" }}>{darkMode ? "☀️" : "🌙"}</button>
        {setLang && <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: T.textMid }}>{tr.lang}</button>}
        <button onClick={() => setProfileModal(true)} aria-label={tr.myProfile} style={{ background: "none", border: "1px solid rgba(201,160,48,.2)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", display: "flex", alignItems: "center" }}>{Icon.user(T.accent, 15)}</button>
        <button onClick={onLogout} className="lk-ghost" aria-label={tr.logout} style={{ padding: "6px 11px", fontSize: 12 }}>{Icon.sign()}</button>
      </div>
    </div>
  );

  const modals = (
    <>
      {toast && <div role="status" style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 9999, pointerEvents: "none", background: T.success, color: "#fff", borderRadius: 12, padding: "12px 18px", fontSize: 13, fontWeight: 700, maxWidth: "calc(100% - 24px)", boxShadow: "0 8px 24px rgba(0,0,0,.2)" }}>{toast}</div>}
      {!isDesktop && screen === "home" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 300, background: "#fff", borderTop: `1px solid ${T.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -2px 12px rgba(0,0,0,.06)" }}>
          {[
            { ic: Icon.home, l: fr ? "Accueil" : "Home", on: true, act: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
            { ic: Icon.list, l: fr ? "Interventions" : "Bookings", act: () => document.getElementById("lk-inter")?.scrollIntoView({ behavior: "smooth" }) },
            { ic: Icon.chat, l: fr ? "Aide" : "Help", act: () => setHelpModal(true) },
            { ic: Icon.user, l: fr ? "Profil" : "Profile", act: () => setProfileModal(true) },
          ].map((a, i) => (
            <button key={i} onClick={a.act} style={{ flex: 1, background: "none", border: "none", padding: "10px 2px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: "'Inter',sans-serif" }}>
              {a.ic(a.on ? T.accent : T.textLo, 19)}
              <span style={{ fontSize: 9, fontWeight: 700, color: a.on ? T.accent : T.textLo }}>{a.l}</span>
            </button>
          ))}
        </div>
      )}
      {helpModal && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setHelpModal(false)}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "22px 20px 30px", maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto", fontFamily: "'Inter',sans-serif" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: T.textHi }}>❓ {fr ? "Questions fréquentes" : "Frequently asked questions"}</div>
              <button onClick={() => setHelpModal(false)} aria-label={fr ? "Fermer" : "Close"} style={{ background: "rgba(0,0,0,.05)", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 14, color: T.textMid }}>✕</button>
            </div>
            {FAQ.map((f, i) => (
              <details key={i} style={{ marginBottom: 8, background: "rgba(0,0,0,.02)", borderRadius: 12, padding: "12px 14px" }}>
                <summary style={{ fontWeight: 700, fontSize: 13, color: T.textHi, cursor: "pointer" }}>{f.q}</summary>
                <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.6, marginTop: 8 }}>{f.a}</div>
              </details>
            ))}
            <div style={{ marginTop: 14, fontSize: 12, color: T.textLo, textAlign: "center" }}>
              {fr ? "Besoin d'aide supplémentaire ?" : "Still need help?"} <a href="mailto:support@lockr.fr" style={{ color: T.accent, fontWeight: 700 }}>support@lockr.fr</a>
            </div>
          </div>
        </div>,
        document.body
      )}
      {devis && selArt && selProb && (
        <DevisModal artisan={selArt} probleme={selProb.id} montant={devis.montant} adresse={devis.adresse} onAccept={confirmDevis} onCancel={() => setDevis(null)} lang={lang} fraisDep={fraisDep} />
      )}
      {payFor && (
        <PayModal
          amount={payFor.kind === "empreinte" ? bookingTotal(payFor.booking) : resteAPayer(payFor.booking)}
          label={payFor.kind === "empreinte"
            ? (fr ? `Réservation — ${pLabel(PROBLEMES.find(p => p.id === payFor.booking.probleme), lang)}` : `Booking — ${pLabel(PROBLEMES.find(p => p.id === payFor.booking.probleme), lang)}`)
            : (fr ? "Règlement de l'intervention" : "Intervention payment")}
          type={payFor.kind === "empreinte" ? "empreinte" : "prestation"}
          payRef={payFor.booking.id}
          lang={lang}
          onSimulated={() => {
            const kind = payFor.kind, id = payFor.booking.id;
            applyPayment(setters || { setBookings }, { type: kind === "empreinte" ? "empreinte" : "prestation", ref: id, demo: true });
            setPayFor(null);
            if (kind === "empreinte") { setTrackingId(id); setScreen("tracking"); showToast(fr ? "Réservation confirmée — carte enregistrée (démo)." : "Booking confirmed — card registered (demo)."); }
            else showToast(fr ? "Paiement enregistré — merci !" : "Payment recorded — thank you!");
          }}
          onUnavailable={payFor.kind === "empreinte" ? () => {
            // Paiement en ligne indisponible : réservation confirmée sans garantie bancaire
            setBookings(p => p.map(x => x.id === payFor.booking.id ? { ...x, statut: "assignée", garantie: "aucune" } : x));
            setPayFor(null); setTrackingId(payFor.booking.id); setScreen("tracking");
          } : null}
          onClose={() => setPayFor(null)}
        />
      )}
      {profileModal && createPortal(
        <ClientProfileModal account={account} setAccounts={setAccounts} bookings={bookings} lang={lang} openLegal={openLegal} onClose={() => setProfileModal(false)} />,
        document.body
      )}
      {litigeModal && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease", fontFamily: "'Inter',sans-serif" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 4 }}>{fr ? "Signaler un problème" : "Report a problem"}</div>
            <div style={{ color: T.textLo, fontSize: 13, marginBottom: 16 }}>{pLabel(PROBLEMES.find(p => p.id === litigeModal.probleme), lang)} · {fmtDate(litigeModal.createdAt)}</div>
            <label className="lk-label">{tr.litigeTitle}</label>
            <textarea className="lk-input" value={litigeText} onChange={e => setLitigeText(e.target.value)} placeholder={tr.litigePlaceholder} rows={4} style={{ resize: "none", marginBottom: 16 }} />
            <button onClick={submitLitige} disabled={!litigeText.trim()} className="lk-btn" style={{ marginBottom: 10 }}>{tr.litigeSubmit}</button>
            <button onClick={() => setLitigeModal(null)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>,
        document.body
      )}
      {factureView && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setFactureView(null)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 14, maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 15, color: T.textHi, marginBottom: 10 }}>{fr ? "Facture" : "Invoice"} — {fmt(bookingTotal(factureView))}</div>
            <img src={factureView.factureImg} alt={fr ? "Facture" : "Invoice"} style={{ width: "100%", borderRadius: 10 }} />
            <a href={factureView.factureImg} download={`facture-lockr-${factureView.id}.jpg`} className="lk-btn" style={{ marginTop: 12, textDecoration: "none" }}>{fr ? "Télécharger" : "Download"}</a>
          </div>
        </div>,
        document.body
      )}
      {showChat && <ChatIntervention booking={showChat} account={account} interventionChats={interventionChats} setInterventionChats={setInterventionChats} otherNom={artisanOf(showChat)?.nom || (fr ? "Artisan" : "Craftsman")} onClose={() => setShowChat(null)} lang={lang} />}
    </>
  );

  /* ── Accueil ── */
  if (screen === "home") return (
    <div className={darkMode ? "lk-dark" : ""} style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", paddingBottom: isDesktop ? 0 : 66 }}>
      <style>{CSS}</style>
      {header(null)}
      {liveBk && (
        <div onClick={() => { setTrackingId(liveBk.id); setScreen("tracking"); }} style={{ margin: isDesktop ? "20px auto 0" : "14px 14px 0", maxWidth: isDesktop ? 1100 : undefined, background: "rgba(37,99,235,.06)", border: "1px solid rgba(37,99,235,.2)", borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb", animation: "blink 1.2s infinite" }} />
            <div>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{fr ? (CLIENT_ST[liveBk.statut]?.fr) : (CLIENT_ST[liveBk.statut]?.en)}</div>
              <div style={{ color: T.textMid, fontSize: 12 }}>{artisanOf(liveBk)?.nom} · {tr.followLive}</div>
            </div>
          </div>
          {Icon.arrow("#2563eb", 14)}
        </div>
      )}
      <div style={{ padding: isDesktop ? "32px" : "18px 14px", maxWidth: isDesktop ? 1100 : undefined, margin: isDesktop ? "0 auto" : undefined, width: "100%" }}>
        <div style={{ display: isDesktop ? "grid" : "block", gridTemplateColumns: "1fr 380px", gap: 28 }}>
          <div>
            <button onClick={() => { setSelMetier("serrurier"); setSelProb(PROBLEMES.find(p => p.id === "ouverture") || null); setSelArt(null); setScreen("choose"); if (navigator.vibrate) navigator.vibrate(50); }}
              style={{ width: "100%", background: "linear-gradient(135deg,#dc2626,#991b1b)", border: "none", borderRadius: 18, padding: "18px 20px", marginBottom: 14, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 6px 20px rgba(220,38,38,.3)" }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 17 }}>🚨 {fr ? "Urgence — Dépannage immédiat" : "Emergency — immediate help"}</div>
                <div style={{ color: "rgba(255,255,255,.85)", fontSize: 11.5, marginTop: 3 }}>{fr ? "Porte claquée ? Les artisans les plus proches, tout de suite." : "Locked out? The closest craftsmen, right now."}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,.2)", borderRadius: 12, padding: "10px 12px", flexShrink: 0 }}>{Icon.arrow("#fff", 18)}</div>
            </button>
            <div style={{ background: "linear-gradient(135deg,rgba(201,160,48,.08),rgba(168,120,32,.05))", border: "1.5px solid rgba(201,160,48,.2)", borderRadius: 20, padding: "22px 20px", marginBottom: 14 }}>
              <div style={{ color: T.textMid, fontSize: 12, marginBottom: 8 }}>{tr.helloUser} {firstName(account.nom)} 👋</div>
              <div style={{ color: T.textHi, fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>{tr.whatNeed}</div>
              <button onClick={() => { setSelProb(null); setSelArt(null); setScreen("choose"); }} className="lk-btn">{tr.findCraftsman} {Icon.arrow("#fff", 14)}</button>
            </div>
            <div style={{ background: "#fff", border: "1.5px solid rgba(30,158,107,.25)", borderRadius: 18, padding: "16px 18px", marginBottom: 22 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>{Icon.shield(T.success, 16)} {fr ? "Prix transparent — comment ça marche" : "Transparent pricing — how it works"}</div>
              {(fr ? ["Le prix affiché est le tarif de départ de l'artisan.", "Sur place, l'artisan diagnostique et vous remet un devis FERME AVANT tout travaux.", "Rien ne démarre sans votre accord. Une fois accepté, le prix est bloqué — zéro surprise."]
                : ["The displayed price is the craftsman's starting price.", "On site, the craftsman diagnoses and gives you a FIRM quote BEFORE any work.", "Nothing starts without your agreement. Once accepted, the price is locked — no surprises."]).map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: i < 2 ? 8 : 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(30,158,107,.1)", color: T.success, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: 12, color: T.textMid, lineHeight: 1.55 }}>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.quickInterventions}</div>
              <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(5,1fr)" : "1fr 1fr", gap: 12 }}>
                {METIERS.map(m => (
                  <button key={m.id} onClick={() => { setSelMetier(m.id); setSelProb(null); setSelArt(null); setScreen("choose"); }} style={{ position: "relative", borderRadius: 18, overflow: "hidden", height: isDesktop ? 150 : 120, cursor: "pointer", border: "none", fontFamily: "'Inter',sans-serif", boxShadow: "0 4px 18px rgba(0,0,0,.18)" }}>
                    <img src={m.photo} alt="" onError={e => { e.target.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${m.color}cc 0%, ${m.color}99 100%)`, mixBlendMode: "multiply" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 30%,rgba(0,0,0,.55) 100%)" }} />
                    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "14px 14px 12px", textAlign: "left" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>{m.icon("#fff", 18)}</div>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{pLabel(m, lang)}</div>
                        <div style={{ color: "rgba(255,255,255,.75)", fontSize: 11, marginTop: 3 }}>{pDesc(m, lang)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {!isDesktop && (
              <>
                <div id="lk-inter" style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12, textAlign: "left" }}>{tr.myInterventions}</div>
                {interventionsBlock}
              </>
            )}
          </div>
          {isDesktop && (
            <div>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{tr.myInterventions}</div>
              {interventionsBlock}
            </div>
          )}
        </div>
      </div>
      {modals}
    </div>
  );

  /* ── Nouvelle demande ── */
  if (screen === "choose") {
    const dispoList = artisanList.filter(a => a.dispo);
    return (
      <div className={darkMode ? "lk-dark" : ""} style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", paddingBottom: 110 }}>
        <style>{CSS}</style>
        {header(() => { setSelProb(null); setSelMetier(null); setSelArt(null); setScreen("home"); })}
        <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          {[{ n: 1, l: fr ? "Besoin" : "Need", done: !!selProb }, { n: 2, l: fr ? "Artisan" : "Craftsman", done: !!selArt }, { n: 3, l: fr ? "Devis" : "Quote", done: false }].map((st, i) => {
            const current = (i === 0 && !selProb) || (i === 1 && selProb && !selArt) || (i === 2 && selProb && selArt);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: st.done ? T.success : current ? T.grad : "rgba(0,0,0,.08)", color: st.done || current ? "#fff" : T.textLo, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{st.done ? "✓" : st.n}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: st.done ? T.success : current ? T.textHi : T.textLo }}>{st.l}</span>
                {i < 2 && <div style={{ width: 22, height: 2, background: st.done ? T.success : "rgba(0,0,0,.08)", borderRadius: 1, margin: "0 3px" }} />}
              </div>
            );
          })}
        </div>
        <div style={{ padding: isDesktop ? "28px 32px" : "18px 14px", maxWidth: isDesktop ? 1100 : undefined, margin: isDesktop ? "0 auto" : undefined }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{tr.selectMetier}</div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {METIERS.map(m => (
                <button key={m.id} onClick={() => { setSelMetier(m.id === selMetier ? null : m.id); setSelProb(null); setSelArt(null); }} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 20, border: `1.5px solid ${selMetier === m.id ? m.color : T.border}`, background: selMetier === m.id ? `${m.color}14` : "#fff", color: selMetier === m.id ? m.color : T.textMid, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                  {m.icon(selMetier === m.id ? m.color : T.textLo, 15)} {pLabel(m, lang)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: isDesktop ? "grid" : "block", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <div>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.interventionType}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
                {PROBLEMES.filter(p => !selMetier || p.metier === selMetier).map(p => {
                  const IC = PROB_ICONS[p.id];
                  const mc = METIERS.find(m => m.id === p.metier)?.color || T.accent;
                  const isSel = selProb?.id === p.id;
                  return (
                    <button key={p.id} onClick={() => { setSelProb(p); setSelArt(null); }} style={{ background: isSel ? "linear-gradient(135deg,#f5f3ff,#fdf6dc)" : "#fff", border: `1.5px solid ${isSel ? mc : "rgba(0,0,0,.1)"}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left", fontFamily: "'Inter',sans-serif" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${mc}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{IC ? IC(mc, 18) : null}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: T.textHi, fontWeight: 600, fontSize: 14 }}>{pLabel(p, lang)}</div>
                        <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{pDesc(p, lang)}</div>
                      </div>
                      {p.urgence && <span className="lk-tag-urgent">URGENT</span>}
                      {isSel && Icon.check(mc, 16)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div ref={artisanListRef}>
              {selProb ? (
                <div style={{ animation: "fadeUp .25s ease" }}>
                  {/* Adresse d'intervention — obligatoire */}
                  <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 16 }}>
                    <label className="lk-label" htmlFor="lk-adresse">{fr ? "Adresse de l'intervention" : "Intervention address"}</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input id="lk-adresse" className="lk-input" value={adresse} onChange={e => { setAdresse(e.target.value); setAdresseErr(""); }} placeholder={fr ? "12 rue de la Paix, 75002 Paris" : "12 rue de la Paix, 75002 Paris"} autoComplete="street-address" style={{ flex: 1 }} />
                      <button onClick={useMyPosition} disabled={locating} className="lk-ghost" title={fr ? "Utiliser ma position" : "Use my location"} aria-label={fr ? "Utiliser ma position" : "Use my location"} style={{ padding: "10px 12px", flexShrink: 0 }}>{locating ? "…" : Icon.pin(T.accent, 16)}</button>
                    </div>
                    {adresseErr && <div role="alert" style={{ color: T.danger, fontSize: 11.5, marginTop: 6 }}>{adresseErr}</div>}
                    <div style={{ color: T.textLo, fontSize: 11, marginTop: 6 }}>{fr ? "Communiquée uniquement à l'artisan qui accepte votre demande." : "Only shared with the craftsman who accepts your request."}</div>
                  </div>
                  <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                    {tr.availableCraftsmen} {dispoList.length === 0 && <span style={{ color: T.textLo, fontWeight: 400, fontSize: 12, marginLeft: 6 }}>{tr.noAvailable}</span>}
                  </div>
                  {dispoList.length === 0 && (
                    <div style={{ background: "rgba(217,119,6,.06)", border: "1px solid rgba(217,119,6,.2)", borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
                      <div style={{ color: T.warn, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>⏳ {fr ? "Aucun artisan disponible immédiatement" : "No craftsman available right now"}</div>
                      <div style={{ color: T.textMid, fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>{fr ? "Publiez votre demande : elle est envoyée à tous les artisans et entreprises partenaires de votre ville. Vous êtes prévenu dès qu'un professionnel accepte." : "Publish your request: it is sent to every craftsman and partner company in your city. You are notified as soon as one accepts."}</div>
                      <button onClick={publierDemande} disabled={busy} className="lk-btn">{busy ? "…" : <>{fr ? "Publier ma demande" : "Publish my request"} {Icon.arrow("#fff", 14)}</>}</button>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {artisanList.map(a => (
                      <div key={a.id} role="button" tabIndex={a.dispo ? 0 : -1} onKeyDown={e => { if (e.key === "Enter" && a.dispo) setSelArt(a); }} onClick={() => a.dispo && setSelArt(a)} style={{ background: selArt?.id === a.id ? "linear-gradient(135deg,#f5f3ff,#fdf6dc)" : "#fff", border: `1.5px solid ${selArt?.id === a.id ? T.accent : "rgba(201,160,48,.18)"}`, borderRadius: 16, padding: "14px 16px", cursor: a.dispo ? "pointer" : "not-allowed", opacity: a.dispo ? 1 : .5 }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <div style={{ width: 46, height: 46, borderRadius: 12, background: `${a.color}15`, border: `1px solid ${a.color}30`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                            {a.photo ? <img src={a.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: a.color, fontWeight: 800, fontSize: 18 }}>{initial(a.nom)}</span>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div>
                                <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{a.nom}</div>
                                <div style={{ color: T.textLo, fontSize: 12 }}>{a.certif}</div>
                              </div>
                              <div style={{ color: T.accent, fontWeight: 800, fontSize: 14, textAlign: "right" }}>{fmtFrom(a.tarif + (selProb.urgence ? URGENCE_SUPPLEMENT : 0), lang)}</div>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ background: "rgba(62,207,142,.1)", border: "1px solid rgba(62,207,142,.2)", color: T.success, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>✓ {tr.verified}</span>
                              <span className={a.dispo ? "lk-badge-ok" : "lk-badge-off"}>{a.dispo ? tr.available : tr.unavailable}</span>
                              {a.ville && <span style={{ color: T.textLo, fontSize: 12 }}>📍 {a.ville}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : isDesktop && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: T.textLo, fontSize: 14, gap: 12 }}>
                  {Icon.key(T.textLo, 36)}
                  <span>{tr.selectInterventionType}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        {selArt && selProb && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "14px", background: "linear-gradient(0deg,rgba(255,255,255,1) 60%,rgba(255,255,255,0))", zIndex: 200 }}>
            <div style={{ maxWidth: 480, margin: "0 auto" }}>
              <button onClick={book} disabled={busy} className="lk-btn">{busy ? "…" : <>{tr.reserveBtn} {selArt.nom} — {fmtFrom(selArt.tarif + (selProb.urgence ? URGENCE_SUPPLEMENT : 0), lang)} {Icon.arrow("#fff", 14)}</>}</button>
            </div>
          </div>
        )}
        {modals}
      </div>
    );
  }

  /* ── Suivi en direct ── */
  if (screen === "tracking") {
    const bk = myBk.find(b => b.id === trackingId) || liveBk;
    const art = artisanOf(bk);
    const steps = [
      { id: "assignée", l: fr ? "Confirmée" : "Confirmed" },
      { id: "en_route", l: fr ? "En route" : "On the way" },
      { id: "en_cours", l: fr ? "Sur place" : "On site" },
      { id: "terminée", l: fr ? "Terminée" : "Done" },
    ];
    const cur = bk ? steps.findIndex(s => s.id === bk.statut) : -1;
    return (
      <div className={darkMode ? "lk-dark" : ""} style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column" }}>
        <style>{CSS}</style>
        {header(() => setScreen("home"))}
        {!bk ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: T.textLo }}>{fr ? "Aucune intervention en cours." : "No ongoing booking."}</div>
        ) : (
          <div style={{ display: isDesktop ? "grid" : "block", gridTemplateColumns: "55% 45%", flex: 1 }}>
            <div>
              {["assignée", "en_route", "en_cours"].includes(bk.statut) ? (
                <LiveMap clientPos={bk.clientPos || (bk.lat ? [bk.lat, bk.lng] : null)} artisanPos={bk.artisanPos || null} artisanColor={art?.color || T.accent} artisan={art} statut={bk.statut} lang={lang} />
              ) : (
                <div style={{ padding: "40px 20px", textAlign: "center", color: T.textMid }}>{bk.statut === "terminée" ? (fr ? "Intervention terminée ✓" : "Intervention completed ✓") : (fr ? (CLIENT_ST[bk.statut]?.fr || bk.statut) : (CLIENT_ST[bk.statut]?.en || bk.statut))}</div>
              )}
            </div>
            <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              {bk.garantie === "aucune" && !bk.empreinte && (
                <div style={{ background: "rgba(217,119,6,.07)", border: "1px solid rgba(217,119,6,.25)", borderRadius: 12, padding: "10px 12px", fontSize: 12, color: T.warn, fontWeight: 600 }}>{fr ? "Carte non enregistrée : vous réglerez l'intervention à la fin, par carte." : "Card not registered: you will pay by card at the end of the intervention."}</div>
              )}
              {bk.empreinte && <div style={{ background: "rgba(30,158,107,.06)", border: "1px solid rgba(30,158,107,.2)", borderRadius: 12, padding: "10px 12px", fontSize: 12, color: T.textMid, fontWeight: 600 }}>{EMPREINTE_TXT(bk, lang)}</div>}
              <div className="lk-card" style={{ padding: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {steps.map((st, i) => (
                    <div key={st.id} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ height: 4, borderRadius: 2, background: i <= cur ? T.success : "rgba(0,0,0,.08)", marginBottom: 5 }} />
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: i <= cur ? T.success : T.textLo }}>{st.l}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 12.5, color: T.textMid }}>
                  <b style={{ color: T.textHi }}>{pLabel(PROBLEMES.find(p => p.id === bk.probleme), lang)}</b> · {bk.adresse}
                </div>
              </div>
              {art && (
                <div className="lk-card" style={{ padding: "13px 14px", display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: `${art.color}15`, border: `1px solid ${art.color}30`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {art.photo ? <img src={art.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: art.color, fontWeight: 800, fontSize: 20 }}>{initial(art.nom)}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{art.nom}</div>
                    <div style={{ color: T.textLo, fontSize: 12 }}>{art.certif}</div>
                  </div>
                  {art.tel && <button onClick={() => callPhone(art.tel)} aria-label={fr ? "Appeler" : "Call"} style={{ background: "rgba(62,207,142,.08)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 10, padding: "10px 14px", cursor: "pointer" }}>{Icon.phone(T.success, 15)}</button>}
                  <button onClick={() => setShowChat(bk)} style={{ background: "rgba(201,160,48,.08)", border: "1px solid rgba(201,160,48,.25)", borderRadius: 10, padding: "10px 14px", color: T.gold, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{Icon.chat(T.gold, 15)} Chat</button>
                </div>
              )}
              {bk.statut === "terminée" && bk.statutPaiement !== "payé" && resteAPayer(bk) > 0 && (
                <button onClick={() => setPayFor({ booking: bk, kind: "facture" })} className="lk-btn">{Icon.card("#fff", 16)} {tr.payInvoiceBtn} — {fmt(resteAPayer(bk))}</button>
              )}
              {["assignée", "en_route"].includes(bk.statut) && <button onClick={() => cancelBooking(bk)} className="lk-ghost" style={{ color: T.danger, borderColor: "rgba(220,38,38,.3)" }}>{bk.statut === "en_route" && fraisDep > 0 ? (fr ? `Annuler (${fmt(fraisDep)} de frais de déplacement)` : `Cancel (${fmt(fraisDep)} travel fee)`) : tr.cancelBooking}</button>}
            </div>
          </div>
        )}
        {modals}
      </div>
    );
  }
  return null;
}

/* Profil client : modification réelle (nom, ville, téléphone, adresse),
   mot de passe, droits RGPD. */
function ClientProfileModal({ account, setAccounts, bookings, lang = "fr", openLegal, onClose }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  const [nom, setNom] = useState(account.nom || "");
  const [ville, setVille] = useState(account.ville || "");
  const [tel, setTel] = useState(account.tel || "");
  const [adresse, setAdresse] = useState(account.adresse || "");
  const [saved, setSaved] = useState(false);
  const save = () => {
    if (!nom.trim()) return;
    setAccounts(p => p.map(a => a.id === account.id ? { ...a, nom: nom.trim(), ville: ville.trim(), tel: tel.trim(), adresse: adresse.trim() } : a));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, padding: "16px 20px 32px", maxHeight: "90vh", overflowY: "auto", animation: "slideUp .3s ease", fontFamily: "'Inter',sans-serif" }}>
        <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17 }}>{tr.myProfile}</div>
          <button onClick={onClose} aria-label={fr ? "Fermer" : "Close"} style={{ background: "rgba(0,0,0,.05)", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ marginBottom: 12 }}><label className="lk-label">{fr ? "Nom complet" : "Full name"}</label><input className="lk-input" value={nom} onChange={e => setNom(e.target.value)} autoComplete="name" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label className="lk-label">{tr.city}</label><input className="lk-input" value={ville} onChange={e => setVille(e.target.value)} placeholder="Paris" /></div>
          <div><label className="lk-label">{tr.phone}</label><input className="lk-input" type="tel" value={tel} onChange={e => setTel(e.target.value)} autoComplete="tel" /></div>
        </div>
        <div style={{ marginBottom: 12 }}><label className="lk-label">{fr ? "Adresse habituelle" : "Usual address"}</label><input className="lk-input" value={adresse} onChange={e => setAdresse(e.target.value)} autoComplete="street-address" placeholder="12 rue de la Paix, 75002 Paris" /></div>
        <div style={{ background: "rgba(0,0,0,.03)", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ color: T.textLo, fontSize: 11 }}>{tr.email}</div>
          <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{account.email}</div>
        </div>
        <button onClick={save} className="lk-btn">{saved ? (fr ? "Enregistré ✓" : "Saved ✓") : tr.saveChanges}</button>
        <PasswordChangeCard account={account} setAccounts={setAccounts} lang={lang} />
        <RgpdCard account={account} setAccounts={setAccounts} bookings={bookings} openLegal={openLegal} lang={lang} />
      </div>
    </div>
  );
}

/* ─── ADMIN APP ───
   5 sections au lieu de 14 onglets : Tableau de bord · Interventions ·
   Utilisateurs · Finances · Conformité. Les données de démonstration sont
   exclues des chiffres par défaut (interrupteur « Inclure la démo »). */
function AdminBadge({ children, color = T.textMid, bg = "rgba(0,0,0,.05)" }) {
  return <span style={{ background: bg, color, fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{children}</span>;
}

/* Impression d'une facture / d'un devis (format A4, mentions obligatoires) */
function printInvoice(d, emitter = COMPANY) {
  const w = window.open("", "_blank");
  if (!w) { alert("Autorisez les fenêtres pop-up pour imprimer."); return; }
  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const eur = n => `${Number(n || 0).toFixed(2).replace(".", ",")} €`;
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.numero)}</title>
<style>body{font-family:Arial,sans-serif;color:#1c1c1c;padding:40px;max-width:780px;margin:auto}h1{font-size:22px;margin:0 0 4px}
table{width:100%;border-collapse:collapse;margin:24px 0}td,th{border-bottom:1px solid #ddd;padding:10px;text-align:left}th{background:#f6f2e6}
.r{text-align:right}.muted{color:#666;font-size:12px}.tot td{font-weight:bold}.grid{display:flex;justify-content:space-between;gap:24px}</style></head><body>
<div class="grid"><div><h1>${esc(emitter.nom)}</h1><div class="muted">${esc(emitter.adresse)}<br>${esc(emitter.siret)} — ${esc(emitter.tva)}<br>${esc(emitter.email)}</div></div>
<div class="r"><h1>${d.type === "devis" ? "DEVIS" : "FACTURE"}</h1><div>N° ${esc(d.numero)}</div><div class="muted">Date : ${esc(new Date(d.createdAt).toLocaleDateString("fr-FR"))}</div></div></div>
<p><b>Client :</b> ${esc(d.client)}${d.clientAdresse ? `<br>${esc(d.clientAdresse)}` : ""}</p>
<table><tr><th>Désignation</th><th class="r">Montant HT</th></tr><tr><td>${esc(d.service)}</td><td class="r">${eur(d.ht)}</td></tr>
<tr><td class="r">TVA 20 %</td><td class="r">${eur(d.tva)}</td></tr><tr class="tot"><td class="r">Total TTC</td><td class="r">${eur(d.ttc)}</td></tr></table>
${d.type === "devis" ? `<p class="muted">Devis valable 30 jours. Bon pour accord (date et signature) :</p>` : `<p class="muted">Paiement à réception. Pénalités de retard : 3 fois le taux d'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 € (art. L.441-10 du Code de commerce). Pas d'escompte pour paiement anticipé.</p>`}
<p class="muted">Médiateur de la consommation : voir conditions générales sur l'application LOCKR.</p>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

/* Réglage admin : forfait de frais de déplacement (annulation tardive, client absent) */
function FraisDeplacementCard({ value, onSave, lang = "fr" }) {
  const fr = lang !== "en";
  const [v, setV] = useState(String(value));
  const [saved, setSaved] = useState(false);
  const n = Number(String(v).replace(",", "."));
  const ok = Number.isFinite(n) && n >= 0 && n <= 150;
  return (
    <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 14, borderLeft: `4px solid ${T.accent}` }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi, marginBottom: 2 }}>🚗 {fr ? "Frais de déplacement" : "Travel fee"}</div>
      <div style={{ fontSize: 12, color: T.textLo, marginBottom: 10 }}>{fr ? `Facturés si le client annule alors que l'artisan est en route, ou s'il est absent (après ${CLIENT_ABSENT_WAIT_MIN} min d'attente). Partagés comme une intervention (artisan 85 % / LOCKR 15 %). 0 = désactivé.` : `Charged if the client cancels once the craftsman is on the way, or is absent (after ${CLIENT_ABSENT_WAIT_MIN} min). Split like a job (85% / 15%). 0 = disabled.`}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input className="lk-input" type="number" inputMode="decimal" min="0" max="150" value={v} onChange={e => { setV(e.target.value); setSaved(false); }} style={{ maxWidth: 120 }} aria-label={fr ? "Montant des frais de déplacement" : "Travel fee amount"} />
        <span style={{ fontSize: 13, color: T.textMid }}>€ TTC</span>
        <button disabled={!ok || n === value} onClick={() => { onSave(Math.round(n * 100) / 100); setSaved(true); }} className="lk-btn" style={{ width: "auto", padding: "10px 16px", fontSize: 13 }}>{fr ? "Enregistrer" : "Save"}</button>
        {saved && <span style={{ fontSize: 12, color: T.success, fontWeight: 700 }}>✓</span>}
      </div>
      {!ok && <div role="alert" style={{ fontSize: 11.5, color: T.danger, marginTop: 6 }}>{fr ? "Entre 0 et 150 €." : "Between €0 and €150."}</div>}
    </div>
  );
}

function AdminApp({ account, bookings, setBookings, accounts, setAccounts, bons, setBons, listings = [], sales = [], setSales = () => {}, onLogout, lang = "fr", setLang, bannedList = [], setBannedList, priorityOrder = [], setPriorityOrder = () => {}, factures = [], setFactures = () => {}, openLegal , demoTotal = 0, onCleanupDemo, fraisDep = FRAIS_DEPLACEMENT_DEFAULT, setFraisDep = () => {} }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [section, setSection] = useState("dashboard");
  const [sub, setSub] = useState({ interventions: "missions", utilisateurs: "validations", finances: "comptabilite" });
  // Version de démonstration : tout est fictif, tout est montré.
  // Production : d'éventuelles anciennes données de démo sont masquées (et supprimables).
  const showDemo = IS_DEMO;
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState("actives");
  const [detail, setDetail] = useState(null);
  const [banTarget, setBanTarget] = useState(null);
  const [banReason, setBanReason] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [litigeReply, setLitigeReply] = useState({});
  const [postModal, setPostModal] = useState(false);
  const emptyBon = { titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: PCT_DEFAULT, region: "Paris" };
  const [newBon, setNewBon] = useState(emptyBon);
  const [bonErr, setBonErr] = useState("");
  const [newDevis, setNewDevis] = useState({ client: "", clientAdresse: "", service: "", ht: "", type: "facture" });

  // Données prises en compte (démo exclue par défaut)
  const B = showDemo ? bookings : bookings.filter(b => !isDemoRecord(b));
  const A = showDemo ? accounts : accounts.filter(a => !isDemoAccount(a));
  const S = showDemo ? sales : sales.filter(x => !isDemoRecord(x));
  const BONS = showDemo ? bons : bons.filter(b => !isDemoRecord(b));
  const q = search.trim().toLowerCase();
  const match = (...vals) => !q || vals.some(v => String(v || "").toLowerCase().includes(q));
  const isBanned = a => a.banned === true || bannedList.some(b => (b.accountId && b.accountId === a.id) || (b.email && normEmail(b.email) === normEmail(a.email)));
  const setAccountBanned = (id, banned) => setAccounts(p => p.map(a => a.id === id ? { ...a, banned, ...(banned ? { bannedAt: ts() } : {}) } : a));
  const updateBooking = (id, patch) => setBookings(p => p.map(x => x.id === id ? { ...x, ...patch } : x));
  const accountByArtisan = id => (id ? accounts.find(a => a.role === "pro" && (a.artisanId || a.id) === id) : undefined);
  // Adresse e-mail confirmée (exigée pour valider un professionnel ; pas en démonstration)
  const emailOk = a => IS_DEMO || a.emailVerified === true;

  // Missions terminées + déplacements facturés (annulation tardive, client absent)
  const done = B.filter(isBillable);
  const caTotal = done.reduce((s2, b) => s2 + bookingTotal(b), 0);
  const revenuLockr = done.reduce((s2, b) => s2 + lockrShare(b), 0) + S.filter(x => !["en_attente_paiement", "remboursée", "remboursement"].includes(x.statut)).reduce((s2, x) => s2 + (Number(x.commission) || 0), 0);
  // Marketplace : problèmes signalés par un acheteur, vendeurs à payer à la main
  const saleDisputes = S.filter(x => x.statut === "litige");
  const sellersToPay = S.filter(x => x.statut === "terminée" && !x.vendeurPaye);
  const pendingValidations = A.filter(a => (a.role === "pro" || a.role === "partenaire") && a.dossierStatus === "pending");
  const openLitiges = B.filter(b => b.litige && b.litige.statut !== "résolu");
  const unpaid = done.filter(b => b.statutPaiement !== "payé" && resteAPayer(b) > 0);
  const refunds = B.filter(b => b.remboursementAcompte === "à_traiter");
  // Versements dus : part de l'intervenant et, pour un bon transmis, part de l'apporteur
  const payoutDue = b => (!b.proPaid && (b.artisanId || b.partenaireId) ? proOwed(b) : 0) + posterOwed(b);
  const payouts = done.filter(b => b.statutPaiement === "payé" && payoutDue(b) > 0);
  const byMonth = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - 5 + i, 1);
    const value = done.filter(b => { const bd = new Date(b.createdAt); return bd.getMonth() === d.getMonth() && bd.getFullYear() === d.getFullYear(); }).reduce((s2, b) => s2 + lockrShare(b), 0);
    return { label: d.toLocaleDateString(fr ? "fr-FR" : "en-GB", { month: "short" }), value };
  });
  const maxVal = Math.max(...byMonth.map(d => d.value), 1);

  const sections = [
    { id: "dashboard", l: fr ? "Tableau de bord" : "Dashboard", ic: Icon.chart },
    { id: "interventions", l: fr ? "Interventions" : "Jobs", ic: Icon.list, n: openLitiges.length },
    { id: "utilisateurs", l: fr ? "Utilisateurs" : "Users", ic: Icon.user, n: pendingValidations.length },
    { id: "finances", l: fr ? "Finances" : "Finance", ic: Icon.euro, n: refunds.length },
    { id: "conformite", l: fr ? "Conformité" : "Compliance", ic: Icon.shield },
  ];
  const subs = {
    interventions: [
      { id: "missions", l: fr ? "Missions" : "Missions" },
      { id: "bons", l: fr ? `Bons (${BONS.length})` : `Jobs (${BONS.length})` },
      { id: "litiges", l: fr ? `Litiges (${openLitiges.length})` : `Disputes (${openLitiges.length})` },
      { id: "priorites", l: fr ? `Priorités (${priorityOrder.length})` : `Priorities (${priorityOrder.length})` },
    ],
    utilisateurs: [
      { id: "validations", l: `${tr.validations} (${pendingValidations.length})` },
      { id: "pros", l: tr.craftsmen },
      { id: "clients", l: tr.allClients },
      { id: "entreprises", l: fr ? "Entreprises" : "Companies" },
      { id: "bannis", l: `${tr.bannissements} (${bannedList.length})` },
    ],
    finances: [
      { id: "comptabilite", l: fr ? "Comptabilité" : "Accounting" },
      { id: "facturation", l: fr ? "Facturation" : "Invoicing" },
      { id: "marketplace", l: `${tr.adminMarketplace} (${S.length})` },
    ],
  };
  const view = subs[section] ? sub[section] : section;
  const go = (sec, sb) => { setSection(sec); if (sb) setSub(p => ({ ...p, [sec]: sb })); setSearch(""); };

  const card = (children, extra = {}) => { const { key, ...style } = extra; return <div key={key} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10, ...style }}>{children}</div>; };
  const actionBtn = (label, onClick, color = T.accent) => (
    <button onClick={onClick} style={{ background: "#fff", border: `1px solid ${color}55`, color, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{label}</button>
  );
  const searchBox = <input className="lk-input" value={search} onChange={e => setSearch(e.target.value)} placeholder={tr.searchPlaceholder} style={{ marginBottom: 14 }} />;

  const posterBonAdmin = async () => {
    const montant = parseFloat(newBon.montantEstime);
    if (!newBon.adresse.trim() || !(montant > 0)) { setBonErr(fr ? "Adresse et montant estimé obligatoires." : "Address and estimated amount required."); return; }
    const geo = await geocodeAddress(`${newBon.adresse}, ${newBon.region}`);
    setBons(p => [...p, { id: uid(), titre: newBon.titre.trim() || pLabel(PROBLEMES.find(x => x.id === newBon.probleme), "fr"), adresse: newBon.adresse.trim(), probleme: newBon.probleme, metier: metierOf(newBon), urgence: newBon.urgence, montantEstime: montant, postedBy: "platform", postedByNom: "LOCKR", region: newBon.region, ...(geo ? { lat: geo[0], lng: geo[1] } : {}), createdAt: ts(), techPct: newBon.techPct, dispatchTs: ts() }]);
    setPostModal(false); setNewBon(emptyBon); setBonErr("");
  };

  const statusChip = b => {
    const st = CLIENT_ST[b.statut] || { fr: b.statut, en: b.statut, c: T.textLo };
    return <AdminBadge color={st.c} bg={`${st.c}14`}>{fr ? st.fr : st.en}</AdminBadge>;
  };

  /* ── Vues ── */
  const renderDashboard = () => (
    <>
      {demoTotal > 0 && onCleanupDemo && (
        <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 16, borderLeft: `4px solid ${T.warn}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi }}>{fr ? `${demoTotal} élément(s) de démonstration dans la base` : `${demoTotal} demo item(s) in the database`}</div>
            <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>{fr ? "Comptes, interventions et annonces d'exemple des premières versions. Ils sont masqués partout ; vous pouvez les supprimer définitivement." : "Sample accounts, bookings and listings from early versions. They are hidden everywhere; you can delete them permanently."}</div>
          </div>
          <button onClick={() => { if (window.confirm(fr ? "Supprimer définitivement toutes les données de démonstration ?" : "Permanently delete all demo data?")) onCleanupDemo(); }} className="lk-btn" style={{ width: "auto", padding: "10px 16px", background: "linear-gradient(135deg,#d97706,#b45309)" }}>{fr ? "Supprimer" : "Delete"}</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(4,1fr)" : "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {[
          { l: fr ? "Chiffre d'affaires (missions)" : "Revenue (missions)", v: fmt(caTotal), c: T.accent },
          { l: fr ? "Revenu LOCKR" : "LOCKR revenue", v: fmt(revenuLockr), c: T.success },
          { l: fr ? "Missions terminées" : "Completed missions", v: done.filter(b => b.statut === "terminée").length, c: "#2563eb" },
          { l: fr ? "Artisans validés" : "Approved craftsmen", v: A.filter(a => a.role === "pro" && (a.dossierStatus || "approved") === "approved").length, c: T.success },
        ].map(k => (
          <div key={k.l} className="lk-card" style={{ padding: "14px" }}>
            <div style={{ color: T.textLo, fontSize: 11, marginBottom: 6 }}>{k.l}</div>
            <div style={{ color: k.c, fontWeight: 800, fontSize: 19 }}>{k.v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontWeight: 800, fontSize: 15, color: T.textHi, marginBottom: 10 }}>{fr ? "À traiter" : "To do"}</div>
      {[
        { n: pendingValidations.length, l: fr ? "dossier(s) à valider" : "application(s) to review", go: () => go("utilisateurs", "validations"), c: T.warn },
        { n: openLitiges.length, l: fr ? "litige(s) ouvert(s)" : "open dispute(s)", go: () => go("interventions", "litiges"), c: T.danger },
        { n: unpaid.length, l: fr ? `mission(s) ou frais de déplacement non payé(s) — ${fmt(unpaid.reduce((s2, b) => s2 + resteAPayer(b), 0))}` : `unpaid mission(s) or travel fee(s) — ${fmt(unpaid.reduce((s2, b) => s2 + resteAPayer(b), 0))}`, go: () => { go("interventions", "missions"); setStatutFilter("impayees"); }, c: T.warn },
        { n: saleDisputes.length, l: fr ? "problème(s) signalé(s) sur la marketplace" : "marketplace issue(s) reported", go: () => go("finances", "marketplace"), c: T.danger },
        { n: sellersToPay.length, l: fr ? `vendeur(s) marketplace à payer — ${fmt(sellersToPay.reduce((s2, x) => s2 + marketSellerNet(x), 0))}` : `marketplace seller(s) to pay — ${fmt(sellersToPay.reduce((s2, x) => s2 + marketSellerNet(x), 0))}`, go: () => go("finances", "marketplace"), c: "#2563eb" },
        { n: refunds.length, l: fr ? "acompte(s) à rembourser" : "deposit(s) to refund", go: () => go("finances", "comptabilite"), c: T.danger },
        { n: payouts.length, l: fr ? `versement(s) à effectuer — ${fmt(payouts.reduce((s2, b) => s2 + payoutDue(b), 0))}` : `payout(s) to make — ${fmt(payouts.reduce((s2, b) => s2 + payoutDue(b), 0))}`, go: () => go("finances", "comptabilite"), c: "#2563eb" },
      ].map((t, i) => (
        <button key={i} onClick={t.go} disabled={!t.n} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${t.n ? `${t.c}40` : T.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: t.n ? "pointer" : "default", fontFamily: "'Inter',sans-serif", opacity: t.n ? 1 : .55, textAlign: "left" }}>
          <span style={{ minWidth: 30, height: 30, borderRadius: 15, background: t.n ? t.c : "rgba(0,0,0,.08)", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px" }}>{t.n}</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.textHi }}>{t.l}</span>
          {t.n > 0 && Icon.arrow(T.textLo, 14)}
        </button>
      ))}
      <div style={{ fontWeight: 800, fontSize: 15, color: T.textHi, margin: "20px 0 12px" }}>{tr.platformRevenue6m}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginBottom: 6 }}>
        {byMonth.map((d, i) => (
          <div key={i} title={fmt(d.value)} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 9, color: T.textLo }}>{d.value ? fmt(d.value) : ""}</span>
            <div style={{ width: "100%", height: `${Math.max((d.value / maxVal) * 100, 3)}%`, background: i === byMonth.length - 1 ? "linear-gradient(180deg,#3ecf8e,#2aaf77)" : "linear-gradient(180deg,rgba(201,160,48,.6),rgba(201,160,48,.3))", borderRadius: "6px 6px 0 0" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>{byMonth.map((d, i) => <div key={i} style={{ flex: 1, textAlign: "center", color: T.textLo, fontSize: 10 }}>{d.label}</div>)}</div>
    </>
  );

  const renderMissions = () => {
    const filters = [
      { id: "actives", l: fr ? "En cours" : "Active", f: b => ["en_attente_paiement", "assignée", "en_route", "en_cours", "en_attente"].includes(b.statut) },
      { id: "impayees", l: fr ? "Non payées" : "Unpaid", f: b => isBillable(b) && b.statutPaiement !== "payé" && resteAPayer(b) > 0 },
      { id: "terminees", l: fr ? "Terminées" : "Completed", f: b => b.statut === "terminée" },
      { id: "annulees", l: fr ? "Annulées" : "Cancelled", f: b => String(b.statut).startsWith("annulée") },
      { id: "toutes", l: fr ? "Toutes" : "All", f: () => true },
    ];
    const f = filters.find(x => x.id === statutFilter) || filters[0];
    const list = B.filter(f.f).filter(b => match(b.clientNom, b.artisanNom, b.adresse, b.partenaireNom, accountByArtisan(b.artisanId)?.nom))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return (
      <>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {filters.map(x => <button key={x.id} onClick={() => setStatutFilter(x.id)} style={{ background: statutFilter === x.id ? T.grad : "#fff", color: statutFilter === x.id ? "#fff" : T.textMid, border: statutFilter === x.id ? "none" : `1px solid ${T.border}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{x.l} ({B.filter(x.f).length})</button>)}
        </div>
        {searchBox}
        {list.length === 0 && <div style={{ textAlign: "center", color: T.textLo, padding: "30px 0", fontSize: 13 }}>{fr ? "Aucune mission." : "No mission."}</div>}
        {list.map(b => {
          const pr = PROBLEMES.find(p => p.id === b.probleme);
          const pro = accountByArtisan(b.artisanId);
          return card(
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{pLabel(pr, lang) || b.typeIntervention || b.probleme}</div>
                  <div style={{ fontSize: 11.5, color: T.textLo }}>{b.clientNom} → {pro?.nom || b.artisanNom || b.partenaireNom || "—"} · {fmtDate(b.createdAt)}</div>
                  <div style={{ fontSize: 11, color: T.textLo }}>{b.adresse}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi }}>{fmt(bookingTotal(b))}</div>
                  {statusChip(b)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {b.fraisDeplacement > 0 && <AdminBadge color={T.textMid} bg="rgba(0,0,0,.05)">{FRAIS_TXT(b, lang)}</AdminBadge>}
                {isBillable(b) && <AdminBadge color={b.statutPaiement === "payé" ? T.success : T.warn} bg={b.statutPaiement === "payé" ? "rgba(30,158,107,.1)" : "rgba(217,119,6,.1)"}>{b.statutPaiement === "payé" ? (b.paiementDemo ? (fr ? "Payé (démo)" : "Paid (demo)") : (fr ? "Payé" : "Paid")) : (fr ? `Reste ${fmt(resteAPayer(b))}` : `Due ${fmt(resteAPayer(b))}`)}</AdminBadge>}
                {acomptePaid(b) > 0 && <AdminBadge>{fr ? `Acompte ${fmt(acomptePaid(b))}` : `Deposit ${fmt(acomptePaid(b))}`}</AdminBadge>}
                <AdminBadge color={T.success} bg="rgba(30,158,107,.08)">{b.partenaireId ? (fr ? "Entreprise" : "Company") : (fr ? "Artisan" : "Craftsman")} {fmt(proShare(b))} ({pctLabel(b)})</AdminBadge>
                <AdminBadge color={T.accent} bg="rgba(201,160,48,.1)">LOCKR {fmt(lockrShare(b))}</AdminBadge>
                {b.proPaid && <AdminBadge color={T.success} bg="rgba(30,158,107,.08)">{fr ? "Artisan payé ✓" : "Craftsman paid ✓"}</AdminBadge>}
                {posterShare(b) > 0 && <AdminBadge color="#7c3aed" bg="rgba(124,58,237,.08)">{fr ? "Apporteur" : "Referrer"} {b.postedByNom || ""} {fmt(posterShare(b))}{b.posterPaid ? " ✓" : ""}</AdminBadge>}
                {proAutoPaid(b) > 0 && <AdminBadge color="#635bff" bg="rgba(99,91,255,.08)">{fr ? "Viré par Stripe" : "Paid by Stripe"} {fmt(proAutoPaid(b))}</AdminBadge>}
                {b.litige && <AdminBadge color={T.danger} bg="rgba(220,38,38,.08)">{fr ? "Litige" : "Dispute"}</AdminBadge>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {actionBtn(fr ? "Détails" : "Details", () => setDetail(b), T.textMid)}
                {isBillable(b) && b.statutPaiement !== "payé" && b.fraisDeplacement > 0 && b.statut !== "terminée" && !(montantEncaisse(b) > 0) && actionBtn(fr ? "Renoncer aux frais" : "Waive the fee", () => { if (window.confirm(fr ? `Renoncer aux ${fmt(b.fraisDeplacement)} de frais de déplacement ?` : `Waive the ${fmt(b.fraisDeplacement)} travel fee?`)) updateBooking(b.id, { fraisDeplacement: 0, montantFinal: 0, fraisAnnulesLe: ts(), fraisAnnulesPar: account.nom }); }, T.textMid)}
                {isBillable(b) && b.statutPaiement !== "payé" && actionBtn(fr ? "Paiement reçu" : "Payment received", () => { if (window.confirm(fr ? "Confirmer la réception du paiement (hors Stripe) ?" : "Confirm payment received (outside Stripe)?")) updateBooking(b.id, { statutPaiement: "payé", paiementVerifie: true, payeLe: ts(), validePar: account.nom }); }, T.success)}
                {isBillable(b) && b.statutPaiement === "payé" && !b.proPaid && proOwed(b) > 0 && actionBtn(fr ? "Artisan payé" : "Craftsman paid", () => updateBooking(b.id, { proPaid: true, proPaidAt: ts() }), "#2563eb")}
                {!["terminée", "annulée", "annulée_client"].includes(b.statut) && actionBtn(fr ? "Annuler" : "Cancel", async () => {
                  if (!window.confirm(fr ? "Annuler cette mission ? La carte éventuellement réservée du client sera libérée." : "Cancel this mission? Any card hold will be released.")) return;
                  // Empreinte bancaire : libérée par le serveur avant l'annulation
                  if (live && empreinteActive(b)) {
                    const r = await releaseHold(b.id, "admin");
                    if (!r.ok) { alert(fr ? "Libération de la carte impossible pour le moment, réessayez." : "Could not release the card hold, please retry."); return; }
                  } else if (empreinteActive(b)) applyPayment({ setBookings }, { type: "liberation", ref: b.id, demo: true });
                  updateBooking(b.id, { statut: "annulée", annuleeLe: ts(), annulationRaison: "admin", ...(b.acompteClientPaye ? { remboursementAcompte: "à_traiter" } : {}) });
                }, T.danger)}
              </div>
            </>,
            { key: b.id, borderLeft: `4px solid ${(CLIENT_ST[b.statut] || {}).c || T.border}` }
          );
        })}
      </>
    );
  };

  const renderBons = () => (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ color: T.textHi, fontWeight: 700, fontSize: 15 }}>{fr ? "Bons en attente d'un artisan" : "Jobs waiting for a craftsman"}</div>
        <button onClick={() => setPostModal(true)} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "9px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{Icon.plus("#fff", 15)} {tr.newBonus}</button>
      </div>
      {BONS.length === 0 && <div style={{ textAlign: "center", color: T.textLo, padding: "30px 0", fontSize: 13 }}>{fr ? "Aucun bon en attente." : "No pending job."}</div>}
      {BONS.slice().reverse().map(bon => card(
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: T.textHi }}>{bon.urgence ? "🔴 " : ""}{bon.titre}</div>
            <div style={{ fontSize: 11.5, color: T.textLo }}>{bon.adresse} · {bon.region} · {fmtFrom(bon.montantEstime, lang)} · {fr ? "publié par" : "by"} {bon.postedByNom} · {fmtDate(bon.createdAt)}</div>
            {bon.clientId && <AdminBadge color="#2563eb" bg="rgba(37,99,235,.08)">{fr ? "Demande client" : "Client request"}</AdminBadge>}
          </div>
          {actionBtn(tr.deleteBonus, () => { if (window.confirm(fr ? "Supprimer ce bon ?" : "Delete this job?")) setBons(p => p.filter(b => b.id !== bon.id)); }, T.danger)}
        </div>, { key: bon.id }
      ))}
    </>
  );

  const renderLitiges = () => {
    const list = B.filter(b => b.litige).sort((a, b) => (a.litige.statut === "résolu") - (b.litige.statut === "résolu"));
    return (
      <>
        {list.length === 0 && <div style={{ textAlign: "center", color: T.textLo, padding: "30px 0", fontSize: 13 }}>{fr ? "Aucun litige." : "No dispute."}</div>}
        {list.map(b => card(
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{b.clientNom} — {pLabel(PROBLEMES.find(p => p.id === b.probleme), lang)}</div>
              <AdminBadge color={b.litige.statut === "résolu" ? T.success : T.danger} bg={b.litige.statut === "résolu" ? "rgba(30,158,107,.1)" : "rgba(220,38,38,.08)"}>{b.litige.statut === "résolu" ? (fr ? "Résolu" : "Resolved") : (fr ? "Ouvert" : "Open")}</AdminBadge>
            </div>
            <div style={{ fontSize: 11.5, color: T.textLo, marginBottom: 6 }}>{fr ? "Artisan" : "Craftsman"} : {accountByArtisan(b.artisanId)?.nom || b.artisanNom || "—"} · {fmtDate(b.litige.ouvertLe)} · {fmt(bookingTotal(b))}</div>
            <div style={{ background: "rgba(0,0,0,.03)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: T.textMid, marginBottom: 8 }}>« {b.litige.texte} »</div>
            {b.litige.statut !== "résolu" ? (
              <div style={{ display: "flex", gap: 6 }}>
                <input className="lk-input" value={litigeReply[b.id] || ""} onChange={e => setLitigeReply(p => ({ ...p, [b.id]: e.target.value }))} placeholder={fr ? "Réponse / décision communiquée au client" : "Answer / decision for the client"} style={{ flex: 1, fontSize: 12 }} />
                <button onClick={() => updateBooking(b.id, { litige: { ...b.litige, statut: "résolu", reponse: (litigeReply[b.id] || "").trim(), resoluLe: ts(), resoluPar: account.nom } })} className="lk-btn" style={{ width: "auto", padding: "10px 14px", fontSize: 12 }}>{fr ? "Clore" : "Close"}</button>
              </div>
            ) : b.litige.reponse && <div style={{ fontSize: 12, color: T.success }}>{fr ? "Réponse" : "Answer"} : {b.litige.reponse}</div>}
          </>,
          { key: b.id, borderLeft: `4px solid ${b.litige.statut === "résolu" ? T.success : T.danger}` }
        ))}
      </>
    );
  };

  const renderValidations = () => (
    <>
      {pendingValidations.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>{Icon.check(T.success, 36)}<div style={{ color: T.success, fontWeight: 700, fontSize: 15, marginTop: 12 }}>{tr.noPendingPros}</div></div>
      )}
      {pendingValidations.map(a => card(
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14.5, color: T.textHi }}>{a.nom}</div>
              <div style={{ fontSize: 12, color: T.textLo }}>{a.email} · {a.tel || "—"} · {a.ville || "—"}</div>
              <div style={{ fontSize: 11.5, color: T.textMid, marginTop: 2 }}>{a.role === "pro" ? (fr ? "Artisan" : "Craftsman") : (fr ? "Entreprise" : "Company")} · {fr ? "inscrit le" : "registered"} {fmtDate(a.createdAt)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <AdminBadge color={T.warn} bg="rgba(217,119,6,.1)">{tr.dossierPending}</AdminBadge>
              {emailOk(a)
                ? <AdminBadge color={T.success} bg="rgba(30,158,107,.1)">{fr ? "E-mail confirmé ✓" : "E-mail confirmed ✓"}</AdminBadge>
                : <AdminBadge color={T.danger} bg="rgba(220,38,38,.08)">{fr ? "E-mail non confirmé" : "E-mail not confirmed"}</AdminBadge>}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 6, marginBottom: 10 }}>
            {[
              { l: "SIRET", v: a.siret || "—", ok: siretValid(a.siret) },
              ...(a.role === "pro" ? [
                { l: fr ? "Pièce d'identité" : "ID", v: a.docNames?.idCard || (a.hasIdCard ? "✓" : "✗"), ok: !!a.hasIdCard },
                { l: fr ? "Assurance RC Pro" : "Insurance", v: a.docNames?.insurance || (a.hasInsurance ? "✓" : "✗"), ok: !!a.hasInsurance },
                { l: "Kbis / INSEE", v: a.docNames?.kbis || (a.hasKbis ? "✓" : "✗"), ok: !!a.hasKbis },
                { l: fr ? "Métiers" : "Trades", v: proMetiers(a).join(", ") || "—", ok: proMetiers(a).length > 0 },
              ] : [
                { l: "Kbis", v: a.docNames?.kbis || "—", ok: !!a.docNames?.kbis },
                { l: "RC Pro", v: a.docNames?.rcPro || a.assurance || "—", ok: !!(a.docNames?.rcPro || a.assurance) },
                { l: "IBAN", v: a.iban ? `${String(a.iban).slice(0, 8)}…` : "—", ok: ibanValid(a.iban) },
                { l: fr ? "Secteurs" : "Sectors", v: (a.secteurs || []).join(", ") || "—", ok: (a.secteurs || []).length > 0 },
              ]),
            ].map(it => (
              <div key={it.l} style={{ background: it.ok ? "rgba(30,158,107,.06)" : "rgba(220,38,38,.05)", borderRadius: 8, padding: "7px 9px" }}>
                <div style={{ color: T.textLo, fontSize: 10 }}>{it.l}</div>
                <div style={{ color: it.ok ? T.success : T.danger, fontWeight: 700, fontSize: 11.5, wordBreak: "break-all" }}>{it.v}</div>
              </div>
            ))}
          </div>
          {!emailOk(a) && <div style={{ fontSize: 11.5, color: T.danger, marginBottom: 8 }}>{fr ? "Validation possible dès que le professionnel aura cliqué sur le lien de confirmation reçu par e-mail (il peut le renvoyer depuis son espace)." : "Approval possible once the professional has clicked the confirmation link sent by e-mail (they can resend it from their space)."}</div>}
          <div style={{ fontSize: 11, color: T.textLo, marginBottom: 10 }}>{fr ? "Vérifiez le SIRET sur annuaire-entreprises.data.gouv.fr et demandez les justificatifs par e-mail avant validation." : "Check the SIRET on annuaire-entreprises.data.gouv.fr and request documents by e-mail before approval."} <a href={`https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${encodeURIComponent(a.siret || a.nom)}`} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, fontWeight: 700 }}>{fr ? "Vérifier →" : "Check →"}</a></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button disabled={!emailOk(a)} title={emailOk(a) ? "" : (fr ? "Le professionnel doit d'abord confirmer son adresse e-mail" : "The professional must confirm their e-mail first")} onClick={() => setAccounts(p => p.map(x => x.id === a.id ? { ...x, dossierStatus: "approved", statut: "actif", valideLe: ts(), validePar: account.nom } : x))} style={{ background: "rgba(30,158,107,.1)", border: "1px solid rgba(30,158,107,.3)", borderRadius: 10, padding: "11px", color: T.success, fontWeight: 700, fontSize: 13, cursor: emailOk(a) ? "pointer" : "not-allowed", opacity: emailOk(a) ? 1 : .45 }}>{Icon.check(T.success, 14)} {tr.approveDossier}</button>
            <button onClick={() => { setRejectTarget(a); setRejectReason(""); }} style={{ background: "rgba(220,38,38,.07)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 10, padding: "11px", color: T.danger, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{Icon.x(T.danger, 14)} {tr.rejectDossier}</button>
          </div>
        </>, { key: a.id }
      ))}
    </>
  );

  const userRow = (a, extra) => {
    const banned = isBanned(a);
    return card(
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(201,160,48,.1)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
          {a.photo ? <img src={a.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: T.gold, fontWeight: 700, fontSize: 16 }}>{initial(a.nom)}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: T.textHi }}>{a.nom}</div>
          <div style={{ fontSize: 11.5, color: T.textLo, overflow: "hidden", textOverflow: "ellipsis" }}>{a.email} · {a.tel || "—"} · {a.ville || "—"}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
            {isDemoAccount(a) && <AdminBadge color={T.warn} bg="rgba(217,119,6,.08)">{tr.demoAccount}</AdminBadge>}
            {banned && <AdminBadge color={T.danger} bg="rgba(220,38,38,.08)">{fr ? "Banni" : "Banned"}</AdminBadge>}
            {a.dossierStatus === "rejected" && <AdminBadge color={T.danger} bg="rgba(220,38,38,.08)">{tr.dossierRejected}</AdminBadge>}
            {a.lastLoginAt && <AdminBadge>{fr ? "Vu le" : "Seen"} {fmtDate(a.lastLoginAt)}</AdminBadge>}
            {extra}
          </div>
        </div>
        {!banned
          ? actionBtn(tr.banUser, () => { setBanTarget(a); setBanReason(""); }, T.danger)
          : actionBtn(fr ? "Débannir" : "Unban", () => { setBannedList(p => p.filter(x => !((x.accountId && x.accountId === a.id) || (x.email && normEmail(x.email) === normEmail(a.email))))); setAccountBanned(a.id, false); }, T.success)}
      </div>, { key: a.id }
    );
  };

  const renderPros = () => (
    <>
      {searchBox}
      {A.filter(a => a.role === "pro" && match(a.nom, a.email, a.ville)).map(a => {
        const mine = B.filter(b => b.artisanId === a.artisanId && b.statut === "terminée");
        return userRow(a, <>
          <AdminBadge>{mine.length} missions · {fmt(mine.reduce((s2, b) => s2 + proShare(b), 0))}</AdminBadge>
          <AdminBadge color={a.dispo === false ? T.danger : T.success} bg={a.dispo === false ? "rgba(220,38,38,.06)" : "rgba(30,158,107,.08)"}>{a.dispo === false ? tr.unavailable : tr.available}</AdminBadge>
          {a.stripeOnboarded && <AdminBadge color="#635bff" bg="rgba(99,91,255,.08)">Stripe ✓</AdminBadge>}
        </>);
      })}
    </>
  );
  const renderClients = () => (
    <>
      {searchBox}
      {A.filter(a => a.role === "client" && match(a.nom, a.email, a.ville)).map(a => userRow(a, <AdminBadge>{B.filter(b => b.clientId === a.id).length} missions</AdminBadge>))}
    </>
  );
  const renderEntreprises = () => (
    <>
      {searchBox}
      {A.filter(a => a.role === "partenaire" && match(a.nom, a.email, a.ville)).map(a => {
        const subActive = a.internalAccess || (a.subscription?.until && new Date(a.subscription.until) > new Date());
        return userRow(a, <>
          <AdminBadge color={subActive ? T.success : T.textLo} bg={subActive ? "rgba(30,158,107,.08)" : "rgba(0,0,0,.05)"}>{a.internalAccess ? (fr ? "Interne" : "Internal") : subActive ? (fr ? `Abonné jusqu'au ${fmtDate(a.subscription.until)}` : `Subscribed until ${fmtDate(a.subscription.until)}`) : (fr ? "Sans abonnement" : "No subscription")}</AdminBadge>
          <AdminBadge>{B.filter(b => b.partenaireId === a.id).length} missions</AdminBadge>
        </>);
      })}
    </>
  );
  const renderBannis = () => (
    <>
      {bannedList.length === 0 && <div style={{ textAlign: "center", padding: "30px 20px", color: T.textLo, fontSize: 13 }}>{fr ? "Aucun bannissement." : "No ban."}</div>}
      {bannedList.map(b => card(
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: T.textHi }}>{b.nom}</div>
            <div style={{ fontSize: 11.5, color: T.textLo }}>{b.email} · {fmtDate(b.bannedAt)} · {fr ? "par" : "by"} {b.bannedBy || "—"}</div>
            {b.reason && <div style={{ fontSize: 12, color: T.textMid, fontStyle: "italic", marginTop: 3 }}>{b.reason}</div>}
          </div>
          {actionBtn(fr ? "Débannir" : "Unban", () => { setBannedList(p => p.filter(x => x.id !== b.id)); if (b.accountId) setAccountBanned(b.accountId, false); }, T.success)}
        </div>, { key: b.id }
      ))}
    </>
  );

  const renderCompta = () => {
    // Regroupement des versements dus par bénéficiaire (artisan ou entreprise)
    const owed = {};
    const add = (key, who, fallbackNom, amount, item) => {
      owed[key] = owed[key] || { nom: who?.nom || fallbackNom || key, iban: who?.iban || "", total: 0, items: [] };
      owed[key].total += amount; owed[key].items.push(item);
    };
    payouts.forEach(b => {
      if (!b.proPaid && (b.artisanId || b.partenaireId) && proOwed(b) > 0) {
        const who = b.partenaireId ? accounts.find(a => a.id === b.partenaireId) : accountByArtisan(b.artisanId);
        add(b.partenaireId || b.artisanId, who, b.artisanNom || b.partenaireNom, proOwed(b), { id: b.id, kind: "pro" });
      }
      if (posterOwed(b) > 0) {
        add(b.postedBy, accounts.find(a => a.id === b.postedBy), b.postedByNom, posterOwed(b), { id: b.id, kind: "apport" });
      }
    });
    return (
      <>
        <FraisDeplacementCard value={fraisDep} onSave={setFraisDep} lang={lang} />
        <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 14, borderLeft: `4px solid ${T.warn}` }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi, marginBottom: 2 }}>{fr ? "Encaissements en attente (clients)" : "Pending client payments"}</div>
          <div style={{ fontSize: 12, color: T.textLo, marginBottom: 10 }}>{fr ? "Missions terminées et frais de déplacement non réglés" : "Completed missions and travel fees not paid"}</div>
          {unpaid.length === 0 ? <div style={{ fontSize: 12.5, color: T.success }}>{fr ? "Tout est à jour ✓" : "All up to date ✓"}</div> : unpaid.map(b => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,.05)", fontSize: 12.5 }}>
              <span>{b.clientNom} · {fmtDate(b.termineeLe || b.annuleeLe || b.createdAt)}{b.fraisDeplacement > 0 && b.statut !== "terminée" ? (fr ? " · frais de déplacement" : " · travel fee") : ""}</span>
              <b style={{ color: T.warn }}>{fmt(resteAPayer(b))}</b>
            </div>
          ))}
        </div>
        <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 14, borderLeft: "4px solid #2563eb" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi, marginBottom: 2 }}>{fr ? "Versements à effectuer (artisans / entreprises)" : "Payouts to make (craftsmen / companies)"}</div>
          <div style={{ fontSize: 12, color: T.textLo, marginBottom: 10 }}>{fr ? "Parts des missions payées par le client, pas encore versées (hors virements automatiques Stripe)" : "Shares of client-paid missions not yet paid out (excluding automatic Stripe payouts)"}</div>
          {Object.keys(owed).length === 0 ? <div style={{ fontSize: 12.5, color: T.success }}>{fr ? "Aucun versement en attente ✓" : "No pending payout ✓"}</div> : Object.entries(owed).map(([k, o]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
              <div style={{ fontSize: 12.5 }}><b>{o.nom}</b> · {o.items.length} mission(s)<div style={{ fontSize: 11, color: T.textLo }}>{o.iban || (fr ? "IBAN non renseigné" : "No IBAN")}</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <b style={{ color: "#2563eb" }}>{fmt(o.total)}</b>
                {actionBtn(fr ? "Marquer versé" : "Mark paid", () => { if (window.confirm(fr ? `Confirmer le virement de ${fmt(o.total)} à ${o.nom} ?` : `Confirm transfer of ${fmt(o.total)} to ${o.nom}?`)) { const pro = o.items.filter(i => i.kind === "pro").map(i => i.id); const apport = o.items.filter(i => i.kind === "apport").map(i => i.id); setBookings(p => p.map(x => (pro.includes(x.id) || apport.includes(x.id) ? { ...x, ...(pro.includes(x.id) ? { proPaid: true, proPaidAt: ts() } : {}), ...(apport.includes(x.id) ? { posterPaid: true, posterPaidAt: ts() } : {}) } : x))); } }, "#2563eb")}
              </div>
            </div>
          ))}
        </div>
        <div className="lk-card" style={{ padding: "14px 16px", borderLeft: `4px solid ${T.danger}` }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi, marginBottom: 10 }}>{fr ? "Acomptes à rembourser" : "Deposits to refund"}</div>
          {refunds.length === 0 ? <div style={{ fontSize: 12.5, color: T.success }}>{fr ? "Aucun ✓" : "None ✓"}</div> : refunds.map(b => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,.05)", fontSize: 12.5 }}>
              <span>{b.clientNom} · {fmtDate(b.annuleeLe || b.createdAt)} · <b>{fmt(b.acompte)}</b></span>
              {actionBtn(fr ? "Remboursé" : "Refunded", () => updateBooking(b.id, { remboursementAcompte: "remboursé", rembourseLe: ts() }), T.success)}
            </div>
          ))}
          <div style={{ fontSize: 11, color: T.textLo, marginTop: 8 }}>{fr ? "Le remboursement s'effectue depuis le tableau de bord Stripe (Paiements → Rembourser)." : "Refunds are made from the Stripe dashboard (Payments → Refund)."}</div>
        </div>
      </>
    );
  };

  const renderFacturation = () => {
    const ht = parseFloat(newDevis.ht) || 0;
    const create = () => {
      if (!newDevis.client.trim() || !newDevis.service.trim() || !(ht > 0)) return;
      const year = new Date().getFullYear();
      const prefix = newDevis.type === "devis" ? "DV" : "FA";
      // Numérotation chronologique continue, sans trou (obligation légale)
      const count = factures.filter(f => f.type === newDevis.type && String(f.numero || "").startsWith(`${prefix}-${year}-`)).length;
      const numero = `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
      const item = { id: uid(), numero, ...newDevis, client: newDevis.client.trim(), service: newDevis.service.trim(), ht, tva: Math.round(ht * 20) / 100, ttc: Math.round(ht * 120) / 100, statut: newDevis.type === "devis" ? "envoyé" : "à_payer", createdAt: ts(), creePar: account.nom };
      setFactures(p => [...p, item]);
      setNewDevis({ client: "", clientAdresse: "", service: "", ht: "", type: newDevis.type });
    };
    return (
      <>
        <div className="lk-card" style={{ padding: "16px", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {["facture", "devis"].map(t => <button key={t} onClick={() => setNewDevis(p => ({ ...p, type: t }))} style={{ flex: 1, background: newDevis.type === t ? T.grad : "#fff", color: newDevis.type === t ? "#fff" : T.textMid, border: newDevis.type === t ? "none" : `1px solid ${T.border}`, borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{t === "devis" ? (fr ? "Devis" : "Quote") : (fr ? "Facture" : "Invoice")}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 10 }}>
            <input className="lk-input" value={newDevis.client} onChange={e => setNewDevis(p => ({ ...p, client: e.target.value }))} placeholder={fr ? "Client (nom ou société)" : "Client"} />
            <input className="lk-input" value={newDevis.clientAdresse} onChange={e => setNewDevis(p => ({ ...p, clientAdresse: e.target.value }))} placeholder={fr ? "Adresse du client" : "Client address"} />
          </div>
          <input className="lk-input" value={newDevis.service} onChange={e => setNewDevis(p => ({ ...p, service: e.target.value }))} placeholder={fr ? "Désignation de la prestation" : "Service description"} style={{ marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input className="lk-input" type="number" inputMode="decimal" value={newDevis.ht} onChange={e => setNewDevis(p => ({ ...p, ht: e.target.value }))} placeholder={fr ? "Montant HT (€)" : "Amount excl. VAT (€)"} style={{ flex: 1 }} />
            <div style={{ fontSize: 12.5, color: T.textMid, whiteSpace: "nowrap" }}>TTC : <b>{fmt(ht * 1.2)}</b></div>
          </div>
          <button onClick={create} disabled={!newDevis.client.trim() || !newDevis.service.trim() || !(ht > 0)} className="lk-btn" style={{ marginTop: 12 }}>{fr ? `Créer ${newDevis.type === "devis" ? "le devis" : "la facture"}` : "Create"}</button>
          <div style={{ fontSize: 11, color: T.textLo, marginTop: 8 }}>{fr ? "Numérotation automatique et continue. Complétez l'identité de la société (constante COMPANY) avant d'émettre de vraies factures." : "Automatic sequential numbering. Fill in the company identity (COMPANY constant) before issuing real invoices."}</div>
        </div>
        {factures.slice().reverse().map(d => card(
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{d.numero} — {d.client}</div>
                <div style={{ fontSize: 11.5, color: T.textLo }}>{d.service} · {fmtDate(d.createdAt)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, color: T.accent }}>{fmt(d.ttc)}</div>
                <AdminBadge color={d.statut === "payée" ? T.success : T.warn} bg={d.statut === "payée" ? "rgba(30,158,107,.1)" : "rgba(217,119,6,.1)"}>{d.statut}</AdminBadge>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {actionBtn(fr ? "Imprimer / PDF" : "Print / PDF", () => printInvoice(d))}
              {d.type === "facture" && d.statut !== "payée" && actionBtn(fr ? "Marquer payée" : "Mark paid", () => setFactures(p => p.map(x => x.id === d.id ? { ...x, statut: "payée", payeeLe: ts() } : x)), T.success)}
              {d.type === "devis" && actionBtn(fr ? "Supprimer" : "Delete", () => { if (window.confirm(fr ? "Supprimer ce devis ?" : "Delete this quote?")) setFactures(p => p.filter(x => x.id !== d.id)); }, T.danger)}
            </div>
          </>, { key: d.id }
        ))}
      </>
    );
  };

  const saleAction = async (x, action) => {
    const net = marketSellerNet(x);
    const q = action === "rembourser"
      ? (fr ? `Rembourser ${fmt(x.prix)} à ${x.acheteurNom} ?` : `Refund ${fmt(x.prix)} to ${x.acheteurNom}?`)
      : (fr ? `Verser ${fmt(net)} à ${x.vendeurNom} ?` : `Pay ${fmt(net)} to ${x.vendeurNom}?`);
    if (!window.confirm(q)) return;
    if (live) {
      const r = await marketplaceAction(x.id, action);
      if (!r.ok) { alert(fr ? "Action impossible pour le moment (paiement en ligne indisponible ?)." : "Action not possible right now (online payment unavailable?)."); return; }
      if (action === "liberer" && r.manual) alert(fr ? `Le vendeur n'a pas activé ses virements Stripe : faites-lui un virement de ${fmt(net)}, puis cliquez sur « Vendeur payé ».` : `The seller has not enabled Stripe payouts: send ${fmt(net)} by bank transfer, then click "Seller paid".`);
      return;
    }
    setSales(p => p.map(y => y.id !== x.id ? y : action === "rembourser"
      ? { ...y, statut: "remboursée", rembourseLe: ts() }
      : { ...y, statut: "terminée", termineeLe: ts(), liberation: "admin", vendeurPaye: true, vendeurPayeLe: ts(), vendeurVerse: net }));
  };
  const renderMarketplace = () => {
    const paid = S.filter(x => !["en_attente_paiement", "remboursée", "remboursement"].includes(x.statut));
    const stLabel = x => ({
      en_attente_paiement: fr ? "Paiement en attente" : "Awaiting payment",
      payée: fr ? "Payée — attente de réception" : "Paid — awaiting receipt",
      litige: fr ? "Problème signalé" : "Issue reported",
      terminée: fr ? "Reçue" : "Received",
      remboursement: fr ? "Remboursement…" : "Refunding…",
      remboursée: fr ? "Remboursée" : "Refunded",
      declaree_vendeur: fr ? "Déclarée par le vendeur" : "Declared by seller",
    })[x.statut] || x.statut;
    const smallBtn = (label, onClick, color) => <button onClick={onClick} style={{ marginTop: 4, background: `${color}14`, border: `1px solid ${color}40`, color, borderRadius: 8, padding: "4px 8px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>{label}</button>;
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { l: tr.totalSales, v: fmt(paid.reduce((s2, x) => s2 + (Number(x.prix) || 0), 0)), c: T.accent },
            { l: tr.totalCommission, v: fmt(paid.reduce((s2, x) => s2 + (Number(x.commission) || 0), 0)), c: T.success },
            { l: fr ? "Ventes" : "Sales", v: paid.length, c: "#2563eb" },
            { l: fr ? "Annonces actives" : "Active listings", v: (showDemo ? listings : listings.filter(l => !isDemoRecord(l))).filter(l => !l.sold).length, c: T.warn },
          ].map(k => <div key={k.l} className="lk-card" style={{ padding: "14px" }}><div style={{ color: T.textLo, fontSize: 11, marginBottom: 6 }}>{k.l}</div><div style={{ color: k.c, fontWeight: 800, fontSize: 18 }}>{k.v}</div></div>)}
        </div>
        <div style={{ fontSize: 12, color: T.textLo, marginBottom: 12, lineHeight: 1.5 }}>{fr ? `Le paiement de l'acheteur est conservé jusqu'à la réception de l'article, puis ${Math.round((1 - MARKET_COMMISSION) * 100)} % sont versés au vendeur (automatiquement après ${MARKETPLACE_RELEASE_DAYS} jours sans problème signalé). Vendeur sans virements Stripe : virement à faire par vous.` : `The buyer's payment is held until receipt, then ${Math.round((1 - MARKET_COMMISSION) * 100)}% is paid to the seller (automatically after ${MARKETPLACE_RELEASE_DAYS} days without a reported issue). Sellers without Stripe payouts: pay them by bank transfer.`}</div>
        {S.length === 0 && <div style={{ textAlign: "center", color: T.textLo, padding: "30px 0", fontSize: 13 }}>{tr.noSales}</div>}
        {S.slice().reverse().map(x => card(
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: T.textHi }}>{x.titre}</div>
              <div style={{ fontSize: 11, color: T.textLo }}>{x.vendeurNom} → {x.acheteurNom} · {fmtDate(x.createdAt)}{x.livraison ? ` · ${x.livraison.adresse}, ${x.livraison.zip} ${x.livraison.ville}` : ""}</div>
              {x.statut === "litige" && x.litige?.motif && <div style={{ fontSize: 11.5, color: T.danger, marginTop: 3 }}>⚠️ {x.litige.motif}</div>}
              {x.versementErreur && !x.vendeurPaye && <div style={{ fontSize: 11, color: T.warn, marginTop: 3 }}>{fr ? "Virement Stripe échoué : " : "Stripe transfer failed: "}{x.versementErreur}</div>}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(x.prix)}</div>
              <div style={{ fontSize: 11, color: ["en_attente_paiement", "payée"].includes(x.statut) ? T.warn : x.statut === "litige" ? T.danger : T.success, fontWeight: 600 }}>{stLabel(x)}</div>
              {!["en_attente_paiement", "remboursée", "remboursement"].includes(x.statut) && <div style={{ fontSize: 10.5, color: T.success }}>+{fmt(x.commission)} LOCKR</div>}
              {["payée", "litige"].includes(x.statut) && smallBtn(fr ? `Verser au vendeur (${fmt(marketSellerNet(x))})` : `Pay seller (${fmt(marketSellerNet(x))})`, () => saleAction(x, "liberer"), "#2563eb")}
              {["payée", "litige"].includes(x.statut) && smallBtn(fr ? "Rembourser l'acheteur" : "Refund buyer", () => saleAction(x, "rembourser"), T.danger)}
              {x.statut === "terminée" && (x.vendeurPaye
                ? <div style={{ fontSize: 10.5, color: T.success, fontWeight: 700, marginTop: 3 }}>{fr ? `Vendeur payé ${fmt(x.vendeurVerse || marketSellerNet(x))} ✓` : `Seller paid ${fmt(x.vendeurVerse || marketSellerNet(x))} ✓`}</div>
                : <>
                    {live && smallBtn(fr ? "Réessayer le virement Stripe" : "Retry Stripe transfer", () => saleAction(x, "liberer"), "#635bff")}
                    {smallBtn(fr ? `Vendeur payé (${fmt(marketSellerNet(x))})` : `Seller paid (${fmt(marketSellerNet(x))})`, () => { if (window.confirm(fr ? `Confirmer le virement de ${fmt(marketSellerNet(x))} à ${x.vendeurNom} ?` : `Confirm transfer of ${fmt(marketSellerNet(x))} to ${x.vendeurNom}?`)) setSales(p => p.map(y => y.id === x.id ? { ...y, vendeurPaye: true, vendeurPayeLe: ts(), vendeurVerse: marketSellerNet(x) } : y)); }, T.success)}
                  </>)}
            </div>
          </div>, { key: x.id }
        ))}
      </>
    );
  };

  const content = () => {
    switch (view) {
      case "dashboard": return renderDashboard();
      case "missions": return renderMissions();
      case "bons": return renderBons();
      case "litiges": return renderLitiges();
      case "priorites": return <AdminPrioritesTab lang={lang} accounts={accounts.filter(a => !isBanned(a))} bons={bons} priorityOrder={priorityOrder} setPriorityOrder={setPriorityOrder} />;
      case "validations": return renderValidations();
      case "pros": return renderPros();
      case "clients": return renderClients();
      case "entreprises": return renderEntreprises();
      case "bannis": return renderBannis();
      case "comptabilite": return renderCompta();
      case "facturation": return renderFacturation();
      case "marketplace": return renderMarketplace();
      case "conformite": return <AdminDigitalConformiteTab lang={lang} />;
      default: return null;
    }
  };

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex" }}>
      <style>{CSS}</style>
      {isDesktop && (
        <div style={{ width: 220, flexShrink: 0, height: "100vh", background: "#fff", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, background: T.grad, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.admin("#fff", 14)}</div>
            <div><div style={{ fontWeight: 800, fontSize: 14, color: T.textHi }}>Admin</div><div style={{ color: T.textLo, fontSize: 11 }}>{account.nom}</div></div>
          </div>
          <nav style={{ flex: 1, padding: "8px 10px" }}>
            {sections.map(t => (
              <button key={t.id} onClick={() => go(t.id)} style={{ width: "100%", border: "none", background: section === t.id ? "rgba(201,160,48,.1)" : "transparent", borderRadius: 10, padding: "11px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 2, fontFamily: "'Inter',sans-serif", textAlign: "left" }}>
                {t.ic(section === t.id ? T.accent : T.textLo, 16)}
                <span style={{ flex: 1, color: section === t.id ? T.accent : T.textMid, fontWeight: section === t.id ? 700 : 500, fontSize: 13 }}>{t.l}</span>
                {t.n > 0 && <span style={{ background: T.danger, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10.5, fontWeight: 800 }}>{t.n}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding: "10px", borderTop: `1px solid ${T.border}` }}>
            {openLegal && <button onClick={() => openLegal("mentions")} style={{ width: "100%", border: "none", background: "transparent", padding: "8px 6px", textAlign: "left", fontSize: 12, color: T.textMid, cursor: "pointer" }}>{fr ? "Centre légal" : "Legal center"}</button>}
            <button onClick={onLogout} style={{ width: "100%", border: "none", background: "transparent", borderRadius: 10, padding: "10px 6px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              {Icon.sign(T.danger, 16)}<span style={{ color: T.danger, fontWeight: 600, fontSize: 13 }}>{tr.logout}</span>
            </button>
          </div>
        </div>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100vh", overflow: "hidden" }}>
        <div style={{ background: "#fff", padding: isDesktop ? "16px 32px" : "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ color: T.textHi, fontWeight: 800, fontSize: isDesktop ? 20 : 16 }}>{sections.find(t => t.id === section)?.l}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {setLang && <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: T.textMid }}>{tr.lang}</button>}
            {!isDesktop && <button onClick={onLogout} className="lk-ghost" aria-label={tr.logout} style={{ padding: "6px 11px", fontSize: 12 }}>{Icon.sign()}</button>}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: isDesktop ? "20px 32px" : "14px 14px 84px" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            {subs[section] && (
              <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
                {subs[section].map(sb => (
                  <button key={sb.id} onClick={() => { setSub(p => ({ ...p, [section]: sb.id })); setSearch(""); }} style={{ flexShrink: 0, background: view === sb.id ? T.grad : "#fff", color: view === sb.id ? "#fff" : T.textMid, border: view === sb.id ? "none" : `1px solid ${T.border}`, borderRadius: 20, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{sb.l}</button>
                ))}
              </div>
            )}
            {content()}
          </div>
        </div>
        {!isDesktop && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: `1px solid ${T.border}`, display: "flex", zIndex: 300, paddingBottom: "env(safe-area-inset-bottom)" }}>
            {sections.map(t => (
              <button key={t.id} onClick={() => go(t.id)} style={{ flex: 1, background: "none", border: "none", padding: "9px 2px 7px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}>
                {t.ic(section === t.id ? T.accent : T.textLo, 18)}
                <span style={{ fontSize: 9, fontWeight: 700, color: section === t.id ? T.accent : T.textLo }}>{t.l}</span>
                {t.n > 0 && <span style={{ position: "absolute", top: 4, right: "50%", marginRight: -18, background: T.danger, color: "#fff", borderRadius: 9, minWidth: 16, height: 16, fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{t.n}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {detail && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 9000, display: "flex", alignItems: isDesktop ? "center" : "flex-end", justifyContent: "center" }} onClick={() => setDetail(null)}>
          {(() => {
            const b = bookings.find(x => x.id === detail.id) || detail;
            const photos = [["photoAvant", fr ? "Avant" : "Before"], ["photoApres", fr ? "Après" : "After"], ["photoDevis", fr ? "Devis" : "Quote"], ["factureImg", fr ? "Facture" : "Invoice"], ["matInvoicePhoto", fr ? "Facture matériel" : "Material invoice"]].filter(([k]) => b[k]);
            return (
              <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: isDesktop ? 18 : "18px 18px 0 0", padding: "20px", maxWidth: 620, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: T.textHi }}>{pLabel(PROBLEMES.find(p => p.id === b.probleme), lang) || b.probleme}</div>
                  <button onClick={() => setDetail(null)} aria-label={fr ? "Fermer" : "Close"} style={{ background: "rgba(0,0,0,.05)", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer" }}>✕</button>
                </div>
                {[
                  [fr ? "Client" : "Client", `${b.clientNom}${b.clientTel ? ` · ${b.clientTel}` : ""}`],
                  [fr ? "Artisan / entreprise" : "Craftsman / company", accountByArtisan(b.artisanId)?.nom || b.artisanNom || b.partenaireNom || "—"],
                  [fr ? "Adresse" : "Address", b.adresse],
                  [fr ? "Statut" : "Status", (CLIENT_ST[b.statut] || {})[fr ? "fr" : "en"] || b.statut],
                  [fr ? "Créée le" : "Created", `${fmtDate(b.createdAt)} ${fmtTime(b.createdAt)}`],
                  [fr ? "Montant" : "Amount", `${fmt(bookingTotal(b))} (${fr ? "artisan" : "craftsman"} ${fmt(proShare(b))} · LOCKR ${fmt(lockrShare(b))})`],
                  [fr ? "Acompte" : "Deposit", b.acompte ? `${fmt(b.acompte)} — ${b.acompteClientPaye ? (fr ? "payé" : "paid") : (fr ? "non payé" : "unpaid")}` : "—"],
                  [fr ? "Carte (empreinte)" : "Card hold", b.empreinte ? EMPREINTE_TXT(b, lang) : (b.garantie === "aucune" ? (fr ? "Non enregistrée" : "Not registered") : "—")],
                  [fr ? "Paiement" : "Payment", b.statutPaiement === "payé" ? `${fr ? "payé le" : "paid on"} ${fmtDate(b.payeLe)}${b.stripeSessionId ? " (Stripe)" : b.paiementDemo ? " (démo)" : b.validePar ? ` (${b.validePar})` : ""}` : "—"],
                  [fr ? "Matériel" : "Material", b.matCost ? fmt(b.matCost) : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(0,0,0,.05)", fontSize: 12.5 }}>
                    <span style={{ width: 150, flexShrink: 0, color: T.textLo }}>{k}</span><span style={{ color: T.textHi }}>{v}</span>
                  </div>
                ))}
                {photos.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 8, marginTop: 12 }}>
                    {photos.map(([k, l]) => <a key={k} href={b[k]} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}><div style={{ fontSize: 10.5, color: T.textLo, fontWeight: 700, marginBottom: 3 }}>{l}</div><img src={b[k]} alt={l} style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 8 }} /></a>)}
                  </div>
                )}
              </div>
            );
          })()}
        </div>,
        document.body
      )}

      {rejectTarget && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px" }}>
            <div style={{ color: T.danger, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{tr.rejectDossier}</div>
            <div style={{ color: T.textMid, fontSize: 13, marginBottom: 16 }}>{rejectTarget.nom} · {rejectTarget.email}</div>
            <label className="lk-label">{tr.rejectReason}</label>
            <textarea className="lk-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder={tr.rejectReasonPlaceholder} rows={3} style={{ resize: "none", marginBottom: 16 }} />
            <button onClick={() => { setAccounts(p => p.map(a => a.id === rejectTarget.id ? { ...a, dossierStatus: "rejected", rejectReason: rejectReason.trim() } : a)); setRejectTarget(null); }} className="lk-btn" style={{ marginBottom: 10, background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}>{tr.confirmReject}</button>
            <button onClick={() => setRejectTarget(null)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>,
        document.body
      )}
      {banTarget && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px" }}>
            <div style={{ color: T.danger, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{tr.banConfirmTitle}</div>
            <div style={{ color: T.textMid, fontSize: 13, marginBottom: 16 }}>{banTarget.nom} · {banTarget.email}</div>
            <label className="lk-label">{tr.banReason}</label>
            <textarea className="lk-input" value={banReason} onChange={e => setBanReason(e.target.value)} placeholder={tr.banReasonPlaceholder} rows={3} style={{ resize: "none", marginBottom: 16 }} />
            <button onClick={() => {
              // Le compte banni est déconnecté immédiatement sur tous ses appareils
              setBannedList(p => [...p, { id: uid(), accountId: banTarget.id, nom: banTarget.nom, email: normEmail(banTarget.email), phone: banTarget.tel || "", reason: banReason.trim(), bannedAt: ts(), bannedBy: account.nom, type: banTarget.role }]);
              setAccountBanned(banTarget.id, true);
              setBanTarget(null);
            }} className="lk-btn" style={{ marginBottom: 10, background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}>{tr.banConfirm}</button>
            <button onClick={() => setBanTarget(null)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>,
        document.body
      )}
      {postModal && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 36px", maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 17, marginBottom: 18 }}>{tr.newLockrBonus}</div>
            <div style={{ marginBottom: 12 }}><label className="lk-label">{tr.typeLabel}</label>
              <select className="lk-input" value={newBon.probleme} onChange={e => setNewBon(p => ({ ...p, probleme: e.target.value }))}>
                {METIERS.map(m => <optgroup key={m.id} label={pLabel(m, lang)}>{PROBLEMES.filter(p => p.metier === m.id).map(p => <option key={p.id} value={p.id}>{pLabel(p, lang)}</option>)}</optgroup>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}><label className="lk-label">{tr.titleLabel} ({fr ? "facultatif" : "optional"})</label><input className="lk-input" value={newBon.titre} onChange={e => setNewBon(p => ({ ...p, titre: e.target.value }))} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 12 }}>
              <div><label className="lk-label">{tr.addressLabel}</label><input className="lk-input" value={newBon.adresse} onChange={e => setNewBon(p => ({ ...p, adresse: e.target.value }))} placeholder="15 rue de la Paix" /></div>
              <div><label className="lk-label">{tr.regionSelectLabel}</label><input className="lk-input" value={newBon.region} onChange={e => setNewBon(p => ({ ...p, region: e.target.value }))} list="lk-villes" /><datalist id="lk-villes">{["Paris", "Lyon", "Marseille", "Bordeaux", "Toulouse", "Nantes", "Lille", "Strasbourg", "Nice", "Montpellier"].map(r => <option key={r} value={r} />)}</datalist></div>
            </div>
            <div style={{ marginBottom: 12 }}><label className="lk-label">{tr.estimatedAmountLabel}</label><input type="number" inputMode="decimal" className="lk-input" value={newBon.montantEstime} onChange={e => setNewBon(p => ({ ...p, montantEstime: e.target.value }))} placeholder="150" /></div>
            <div style={{ marginBottom: 12 }}><label className="lk-label">{tr.artisanShare} : {newBon.techPct}%</label><input type="range" min={5} max={95} step={5} value={newBon.techPct} onChange={e => setNewBon(p => ({ ...p, techPct: parseInt(e.target.value, 10) }))} style={{ width: "100%", accentColor: T.accent }} /></div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 16, color: T.textMid, fontSize: 13 }}><input type="checkbox" checked={newBon.urgence} onChange={e => setNewBon(p => ({ ...p, urgence: e.target.checked }))} style={{ accentColor: T.danger }} /> {tr.urgentLabel}</label>
            {bonErr && <div role="alert" style={{ color: T.danger, fontSize: 12, marginBottom: 10 }}>{bonErr}</div>}
            <button onClick={posterBonAdmin} className="lk-btn" style={{ marginBottom: 10 }}>{tr.publishBonus2}</button>
            <button onClick={() => { setPostModal(false); setBonErr(""); }} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── PARTNER DEMO DATA ─── */
const INIT_PARTNER_TECHS = [
  { id: "tech1", isDemo: true, partenaireId: "part1", nom: "Dupuis", prenom: "Laurent", metier: "serrurier", statut: "actif", tel: "0611223344", email: "l.dupuis@batipro.fr", certifications: ["Qualibat 8711"], createdAt: "2024-01-15T09:00:00.000Z" },
  { id: "tech2", isDemo: true, partenaireId: "part1", nom: "Kamoui", prenom: "Nabil", metier: "serrurier", statut: "en_mission", tel: "0622334455", email: "n.kamoui@batipro.fr", certifications: ["Qualibat 8711", "Mul-T-Lock Certifié"], createdAt: "2024-01-15T09:01:00.000Z" },
  { id: "tech3", isDemo: true, partenaireId: "part1", nom: "Ferrara", prenom: "Giuseppe", metier: "plombier", statut: "actif", tel: "0633445566", email: "g.ferrara@batipro.fr", certifications: ["Qualibat 5212"], createdAt: "2024-01-15T09:02:00.000Z" },
];

/* ─── PARTENAIRE APP ─── */
/* ─── PARTENAIRE — CONFORMITÉ LOIS FRANÇAISES ─── */
function PartenaireLoiTab({ lang = "fr", account }) {
  const fr = lang !== "en";

  const [checks, setChecks] = useState({});
  const [dpa, setDpa] = useState("");
  const [mediateur, setMediateur] = useState("");
  const [opco, setOpco] = useState("");

  const toggle = (key) => setChecks(p => ({ ...p, [key]: !p[key] }));

  const sections = [
    {
      icon: "🔒", title: fr ? "RGPD — Protection des données" : "GDPR — Data protection",
      desc: fr ? "En tant qu'entreprise traitant des données personnelles de clients et salariés, vous êtes soumis au RGPD (Règlement UE 2016/679) et à la loi Informatique et Libertés." : "As a company processing personal data of clients and employees, you are subject to the GDPR (EU Regulation 2016/679) and the French Data Protection Act.",
      items: fr ? [
        "Nommer un DPO (Délégué à la Protection des Données) si > 250 salariés ou traitement à grande échelle",
        "Tenir un registre des traitements (article 30 RGPD) — obligatoire pour toutes entreprises",
        "Obtenir le consentement explicite des clients pour le traitement de leurs données",
        "Mentionner la politique de confidentialité sur tous vos devis, contrats et site web",
        "Mettre en place une procédure de notification de violation de données (72h à la CNIL)",
        "Conclure un DPA (Data Processing Agreement) avec tous vos sous-traitants",
        "Respecter le droit à l'effacement et à la portabilité des données",
        "Former vos équipes au RGPD annuellement",
      ] : [
        "Appoint a DPO if > 250 employees or large-scale processing",
        "Maintain a processing register (Article 30 GDPR) — mandatory for all companies",
        "Obtain explicit consent from clients for data processing",
        "Mention privacy policy on all quotes, contracts and website",
        "Implement a data breach notification procedure (72h to CNIL)",
        "Sign a DPA with all sub-processors",
        "Respect the right to erasure and data portability",
        "Train teams on GDPR annually",
      ],
      field: { label: fr ? "Référence CNIL / n° de déclaration DPA" : "CNIL reference / DPA declaration number", val: dpa, set: setDpa, placeholder: fr ? "ex: FR-DP-2024-XXXXX" : "e.g. FR-DP-2024-XXXXX" },
      color: "#1e40af", bg: "rgba(30,64,175,.04)",
    },
    {
      icon: "⚖️", title: fr ? "Loi Sapin II — Anticorruption" : "Sapin II Law — Anti-corruption",
      desc: fr ? "Applicable aux entreprises de plus de 500 salariés ou 100 M€ de CA. Pour les PME, une conformité volontaire est recommandée." : "Applicable to companies with more than 500 employees or €100M revenue. For SMEs, voluntary compliance is recommended.",
      items: fr ? [
        "Adopter un code de conduite anticorruption et l'intégrer au règlement intérieur",
        "Mettre en place un dispositif d'alerte interne (lanceurs d'alerte — loi Waserman 2022)",
        "Cartographier les risques de corruption liés à votre activité",
        "Former les cadres et personnes exposées aux risques",
        "Effectuer des contrôles comptables et évaluer les tiers (fournisseurs, sous-traitants)",
        "Désigner un référent anticorruption",
      ] : [
        "Adopt an anti-corruption code of conduct integrated into internal rules",
        "Set up an internal whistleblowing system (Waserman Law 2022)",
        "Map corruption risks related to your business",
        "Train managers and at-risk employees",
        "Conduct accounting controls and assess third parties",
        "Designate an anti-corruption officer",
      ],
      color: "#6d28d9", bg: "rgba(109,40,217,.04)",
    },
    {
      icon: "👷", title: fr ? "Droit du travail — Obligations employeur" : "Labour law — Employer obligations",
      desc: fr ? "En tant qu'employeur, vous devez respecter le Code du travail, la convention collective applicable et les obligations sociales." : "As an employer, you must comply with the Labour Code, the applicable collective agreement and social obligations.",
      items: fr ? [
        "Établir un contrat de travail écrit pour chaque salarié (CDI, CDD, etc.)",
        "Déclarer chaque embauche à l'URSSAF (DPAE — Déclaration Préalable à l'Embauche)",
        "Tenir le registre du personnel (obligations légales entrées/sorties)",
        "Afficher les mentions obligatoires en entreprise (convention collective, médecine du travail, DUERP)",
        "Organiser la visite médicale d'embauche (service de santé au travail)",
        "Établir et mettre à jour le DUERP (Document Unique d'Évaluation des Risques Professionnels)",
        "Respecter les durées maximales de travail (10h/jour, 48h/semaine, 44h sur 12 semaines)",
        "Payer les cotisations patronales et salariales dans les délais URSSAF",
        "Souscrire à la mutuelle d'entreprise (obligatoire depuis 2016)",
        "Respecter la convention collective applicable (Bâtiment, Artisanat…)",
        "Mettre en place le CSE (Comité Social et Économique) si > 11 salariés",
      ] : [
        "Draw up a written employment contract for each employee",
        "Declare each hire to URSSAF (DPAE — Pre-employment Declaration)",
        "Maintain the employee register",
        "Post mandatory notices (collective agreement, occupational health, DUERP)",
        "Organise pre-employment medical check-up",
        "Establish and update the DUERP (risk assessment document)",
        "Comply with maximum working hours",
        "Pay employer and employee contributions on time",
        "Subscribe to company health insurance (mandatory since 2016)",
        "Comply with applicable collective agreement",
        "Set up the CSE (Works Council) if > 11 employees",
      ],
      field: { label: fr ? "Convention collective applicable" : "Applicable collective agreement", val: opco, set: setOpco, placeholder: fr ? "ex: Bâtiment — IDCC 1596" : "e.g. Building industry — IDCC 1596" },
      color: "#0f766e", bg: "rgba(15,118,110,.04)",
    },
    {
      icon: "📋", title: fr ? "Obligations légales d'affichage" : "Mandatory workplace postings",
      desc: fr ? "Le Code du travail impose des affichages obligatoires dans tout établissement employant des salariés." : "The Labour Code requires mandatory postings in all establishments employing staff.",
      items: fr ? [
        "Afficher l'intitulé et la référence de la convention collective applicable",
        "Afficher les coordonnées de l'inspection du travail",
        "Afficher les consignes de sécurité et incendie (plan d'évacuation)",
        "Afficher les horaires de travail collectifs",
        "Afficher les coordonnées du médecin du travail",
        "Afficher le texte complet de l'article L.3231-1 (SMIC)",
        "Afficher le règlement intérieur (si > 50 salariés ou obligatoire)",
        "Afficher les voies de recours contre le harcèlement moral et sexuel",
        "Afficher les coordonnées du Défenseur des droits",
      ] : [
        "Post collective agreement title and reference",
        "Post labour inspectorate contact details",
        "Post safety and fire instructions (evacuation plan)",
        "Post collective working hours",
        "Post occupational health doctor contact",
        "Post full text of Article L.3231-1 (minimum wage)",
        "Post internal rules (if > 50 employees or required)",
        "Post recourse against moral and sexual harassment",
        "Post Defender of Rights contact details",
      ],
      color: "#b45309", bg: "rgba(180,83,9,.04)",
    },
    {
      icon: "🏥", title: fr ? "Santé et sécurité au travail" : "Health and safety at work",
      desc: fr ? "L'employeur est tenu à une obligation générale de sécurité (L.4121-1 Code du travail). Le non-respect engage la responsabilité civile et pénale." : "The employer has a general safety obligation. Non-compliance triggers civil and criminal liability.",
      items: fr ? [
        "Mettre à jour le DUERP chaque année et à chaque changement significatif",
        "Adhérer à un service de santé au travail (SST) interentreprises",
        "Fournir les EPI (Équipements de Protection Individuelle) adaptés",
        "Former les salariés aux gestes de premiers secours (SST)",
        "Réaliser les vérifications périodiques obligatoires (électricité, ascenseurs, véhicules)",
        "Déclarer tout accident du travail à la CPAM dans les 48h",
        "Souscrire à l'assurance AT/MP (accidents du travail / maladies professionnelles)",
        "Tenir les registres de sécurité obligatoires",
      ] : [
        "Update the DUERP annually and at each significant change",
        "Join an occupational health service",
        "Provide appropriate PPE (Personal Protective Equipment)",
        "Train employees in first aid (SST)",
        "Carry out mandatory periodic inspections (electricity, lifts, vehicles)",
        "Report any workplace accident to CPAM within 48h",
        "Subscribe to AT/MP insurance",
        "Keep mandatory safety registers",
      ],
      color: "#dc2626", bg: "rgba(220,38,38,.04)",
    },
    {
      icon: "🎓", title: fr ? "Formation professionnelle — OPCO" : "Vocational training — OPCO",
      desc: fr ? "Les entreprises doivent contribuer à la formation professionnelle et adhérer à un OPCO (Opérateur de Compétences) selon leur secteur d'activité." : "Companies must contribute to vocational training and join an OPCO (Skills Operator) for their sector.",
      items: fr ? [
        "Identifier votre OPCO selon votre convention collective (ex: CONSTRUCTYS pour le bâtiment)",
        "Verser la contribution à la formation professionnelle (0,55% CA < 11 sal. / 1% ≥ 11 sal.)",
        "Établir un plan de développement des compétences pour vos salariés",
        "Informer vos salariés de leur CPF (Compte Personnel de Formation)",
        "Utiliser l'entretien professionnel tous les 2 ans (obligatoire)",
        "Verser la taxe d'apprentissage (0,68% de la masse salariale)",
      ] : [
        "Identify your OPCO based on your collective agreement",
        "Pay vocational training contribution (0.55% turnover < 11 employees / 1% ≥ 11)",
        "Establish a skills development plan for employees",
        "Inform employees of their CPF (Personal Training Account)",
        "Use the professional interview every 2 years (mandatory)",
        "Pay the apprenticeship tax (0.68% of payroll)",
      ],
      field: { label: fr ? "Votre OPCO" : "Your OPCO", val: opco, set: setOpco, placeholder: fr ? "ex: CONSTRUCTYS, OPCO 2i…" : "e.g. CONSTRUCTYS, OPCO 2i…" },
      color: "#0ea5e9", bg: "rgba(14,165,233,.04)",
    },
    {
      icon: "🛡", title: fr ? "Assurances obligatoires" : "Mandatory insurance",
      desc: fr ? "Plusieurs assurances sont obligatoires pour exercer une activité dans le BTP et les métiers de l'artisanat." : "Several insurances are mandatory for construction and craft trades.",
      items: fr ? [
        "Assurance Responsabilité Civile Professionnelle (RC Pro) — obligatoire",
        "Garantie décennale (obligatoire pour les travaux de construction — art. L.241-1 Code des assurances)",
        "Assurance dommages-ouvrage si vous êtes maître d'ouvrage",
        "Mutuelle collective d'entreprise (obligatoire depuis la loi ANI 2016)",
        "Assurance flotte véhicules professionnels",
        "Assurance local professionnel / matériel",
        "Prévoyance collective (fortement recommandée)",
      ] : [
        "Professional liability insurance (RC Pro) — mandatory",
        "10-year builders' liability (mandatory for construction — Art. L.241-1)",
        "Damage insurance if you are project owner",
        "Collective company health insurance (mandatory since ANI Law 2016)",
        "Professional vehicle fleet insurance",
        "Professional premises / equipment insurance",
        "Collective disability insurance (strongly recommended)",
      ],
      color: "#1e9e6b", bg: "rgba(30,158,107,.04)",
    },
    {
      icon: "💰", title: fr ? "Loi anti-fraude TVA & obligations fiscales" : "Anti-VAT fraud law & tax obligations",
      desc: fr ? "La loi anti-fraude TVA (2018) impose un logiciel de caisse certifié. D'autres obligations fiscales s'appliquent aux entreprises." : "The anti-VAT fraud law (2018) requires certified cash register software. Other tax obligations apply to companies.",
      items: fr ? [
        "Utiliser un logiciel de caisse ou comptabilité certifié NF 525 (loi anti-fraude 2018)",
        "Déclarer et payer la TVA dans les délais légaux (mensuel ou trimestriel)",
        "Tenir une comptabilité régulière et sincère (Plan Comptable Général)",
        "Classer et conserver les pièces comptables 10 ans",
        "Déclarer l'IS (Impôt sur les Sociétés) ou l'IR selon la forme juridique",
        "Payer la CVAE si CA > 500 000 € (cotisation sur valeur ajoutée)",
        "Déclarer la DSN (Déclaration Sociale Nominative) chaque mois",
        "Respecter les délais de paiement fournisseurs (60 jours — LME 2008)",
        "Mentionner le médiateur des entreprises sur vos conditions générales",
      ] : [
        "Use NF 525-certified cash register or accounting software (anti-fraud law 2018)",
        "Declare and pay VAT within legal deadlines",
        "Maintain regular and accurate accounts (General Chart of Accounts)",
        "File and keep accounting records for 10 years",
        "Declare corporate tax (IS or IR) based on legal structure",
        "Pay CVAE if turnover > €500,000",
        "Submit DSN (Nominative Social Declaration) monthly",
        "Respect supplier payment deadlines (60 days — LME 2008)",
        "Mention business mediator on general conditions",
      ],
      color: "#c9a030", bg: "rgba(201,160,48,.04)",
    },
    {
      icon: "📣", title: fr ? "Médiation de la consommation (Loi Hamon 2014)" : "Consumer mediation (Hamon Law 2014)",
      desc: fr ? "Toute entreprise vendant à des consommateurs doit proposer un médiateur de la consommation et l'indiquer sur ses documents commerciaux." : "Any company selling to consumers must offer a consumer mediator and indicate it on commercial documents.",
      items: fr ? [
        "Adhérer à un médiateur de la consommation référencé par la CECMC",
        "Mentionner le médiateur sur toutes vos factures, devis et CGV",
        "Mentionner le médiateur sur votre site web (lien vers la plateforme RLL)",
        "Informer les clients de ce droit avant tout litige",
        "Participer de bonne foi à toute procédure de médiation engagée",
        "Amende en cas de non-désignation : jusqu'à 15 000 € (personne morale)",
      ] : [
        "Join a consumer mediator registered with CECMC",
        "Mention the mediator on all invoices, quotes and T&Cs",
        "Mention the mediator on your website (link to RLL platform)",
        "Inform clients of this right before any dispute",
        "Participate in good faith in any mediation process",
        "Fine for non-designation: up to €15,000 (legal entity)",
      ],
      field: { label: fr ? "Nom de votre médiateur" : "Your mediator name", val: mediateur, set: setMediateur, placeholder: fr ? "ex: MEDIMME, CM2C, ANM…" : "e.g. MEDIMME, CM2C, ANM…" },
      color: "#7c3aed", bg: "rgba(124,58,237,.04)",
    },
  ];

  const totalItems = sections.reduce((s, sec) => s + sec.items.length, 0);
  const checkedItems = Object.values(checks).filter(Boolean).length;
  const pct = Math.round((checkedItems / totalItems) * 100);

  return (
    <div style={{ padding: "14px 14px 80px" }}>
      <div style={{ fontWeight: 800, fontSize: 18, color: T.textHi, marginBottom: 4 }}>
        {fr ? "Conformité — Lois françaises" : "Compliance — French law"}
      </div>
      <div style={{ fontSize: 12, color: T.textLo, marginBottom: 16 }}>
        {fr ? `${account?.nom || "Votre entreprise"} — vérification complète des obligations légales` : `${account?.nom || "Your company"} — full legal obligations check`}
      </div>

      {/* Score global */}
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{fr ? "Score de conformité" : "Compliance score"}</span>
          <span style={{ fontWeight: 900, fontSize: 22, color: pct >= 80 ? T.success : pct >= 50 ? T.warn : T.danger }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: "rgba(0,0,0,.06)", borderRadius: 4 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? T.success : pct >= 50 ? T.warn : T.danger, borderRadius: 4, transition: "width .5s" }} />
        </div>
        <div style={{ fontSize: 11, color: T.textLo, marginTop: 6 }}>{checkedItems} / {totalItems} {fr ? "obligations cochées" : "obligations checked"}</div>
      </div>

      {sections.map((sec, si) => {
        const secChecked = sec.items.filter((_, i) => checks[`${si}_${i}`]).length;
        return (
          <div key={si} className="lk-card" style={{ padding: "16px 18px", marginBottom: 14, borderLeft: `4px solid ${sec.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 4 }}>{sec.icon} {sec.title}</div>
                <div style={{ fontSize: 11, color: T.textLo, lineHeight: 1.5, marginBottom: 10 }}>{sec.desc}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: sec.color, whiteSpace: "nowrap", marginLeft: 12 }}>{secChecked}/{sec.items.length}</span>
            </div>
            {sec.items.map((item, ii) => (
              <div key={ii} onClick={() => toggle(`${si}_${ii}`)} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8, cursor: "pointer", padding: "4px 0" }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${checks[`${si}_${ii}`] ? sec.color : "rgba(0,0,0,.15)"}`, background: checks[`${si}_${ii}`] ? sec.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  {checks[`${si}_${ii}`] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span style={{ fontSize: 12, color: checks[`${si}_${ii}`] ? T.textLo : T.textMid, textDecoration: checks[`${si}_${ii}`] ? "line-through" : "none", lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
            {sec.field && (
              <div style={{ marginTop: 10 }}>
                <label className="lk-label" style={{ fontSize: 11 }}>{sec.field.label}</label>
                <input className="lk-input" value={sec.field.val} onChange={e => sec.field.set(e.target.value)} placeholder={sec.field.placeholder} style={{ fontSize: 12 }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PartenaireApp({ account, setAccounts, bookings, setBookings, bons, setBons, techs = [], setTechs = () => {}, onLogout, lang = "fr", setLang, listings = [], setListings = () => {}, sales = [], setSales = () => {}, setters, openLegal, fraisDep = FRAIS_DEPLACEMENT_DEFAULT }) {
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";
  const [tab, setTab] = useState("dashboard");
  const [addTechModal, setAddTechModal] = useState(false);
  const [newTech, setNewTech] = useState({ nom: "", prenom: "", email: "", tel: "", metier: "serrurier", certifications: "" });
  const [techErr, setTechErr] = useState("");
  const saveAccount = patch => setAccounts(p => p.map(a => a.id === account.id ? { ...a, ...(typeof patch === "function" ? patch(a) : patch) } : a));
  /* Documents, congés, primes et abonnement enregistrés sur le compte de
     l'entreprise : persistants et visibles sur tous ses appareils. */
  const DOCS_DEF = [
    { id: "rc_pro", label: "Assurance RC Pro" }, { id: "kbis", label: "Extrait Kbis" },
    { id: "urssaf", label: "Attestation Urssaf" }, { id: "qualibat", label: "Qualification (Qualibat, RGE…)" },
    { id: "vigilance", label: "Attestation de vigilance URSSAF" }, { id: "iban", label: "Relevé IBAN" },
    { id: "cni", label: "Pièce d'identité du dirigeant" }, { id: "contrat", label: "Contrat de partenariat LOCKR signé" },
  ];
  const docs = DOCS_DEF.map(d => ({ statut: "non_fourni", file: null, expiry: null, ...d, ...((account.partnerDocs || {})[d.id] || {}) }));
  const setDoc_ = (id, patch) => saveAccount(a => ({ partnerDocs: { ...(a.partnerDocs || {}), [id]: { ...((a.partnerDocs || {})[id] || {}), ...patch } } }));
  const leaves = account.rh?.leaves || [];
  const setLeaves = fn => saveAccount(a => ({ rh: { ...(a.rh || {}), leaves: typeof fn === "function" ? fn(a.rh?.leaves || []) : fn } }));
  const primes = account.rh?.primes || [];
  const setPrimes = fn => saveAccount(a => ({ rh: { ...(a.rh || {}), primes: typeof fn === "function" ? fn(a.rh?.primes || []) : fn } }));
  const [leaveForm, setLeaveForm] = useState({ techId: "", du: "", au: "", motif: "" });
  const [profileEdit, setProfileEdit] = useState({ ...account });
  const [profileSaved, setProfileSaved] = useState(false);
  const [bonModal, setBonModal] = useState(false);
  const [newBon, setNewBon] = useState({ titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: 70 });
  const [bonErr, setBonErr] = useState("");
  const [focusTech, setFocusTech] = useState(null);
  const [closeMission, setCloseMission] = useState(null);
  const [closeAmount, setCloseAmount] = useState("");
  const [linkMission, setLinkMission] = useState(null);
  const [subPay, setSubPay] = useState(null); // plan en cours de paiement
  /* Accès équipe LOCKR : les comptes internes (domaine @lockr.fr ou compte
     explicitement marqué internalAccess) ont accès à tout sans abonnement. */
  const isInternalTeam = account.internalAccess === true || /@lockr\.fr$/i.test(account.email || "");
  const subscription = account.subscription && account.subscription.until && new Date(account.subscription.until) > new Date() ? account.subscription : null;
  const hasPartnerAccess = !!subscription || isInternalTeam;
  const approved = (account.dossierStatus || "approved") === "approved";
  const [primeForm, setPrimeForm] = useState({ techId: "", montant: "", motif: "" });
  const [swipeTouchX, setSwipeTouchX] = useState(0);

  const myTechs = visibleFor(account, techs).filter(t => t.partenaireId === account.id);
  const myMissions = visibleFor(account, bookings).filter(m => m.partenaireId === account.id)
    .sort((x, y) => String(y.createdAt || "").localeCompare(String(x.createdAt || "")));
  const doneMissions = myMissions.filter(isBillable);
  const activeTechs = myTechs.filter(t => t.statut !== "inactif");
  const now = new Date();
  const doneThisMonth = doneMissions.filter(m => { const d = new Date(m.termineeLe || m.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const caMois = doneThisMonth.reduce((s2, m) => s2 + bookingTotal(m), 0);
  const commissionMois = doneThisMonth.reduce((s2, m) => s2 + lockrShare(m), 0);
  const conformeCount = docs.filter(d => d.statut === "validé").length;
  const techName = id => { const t = myTechs.find(x => x.id === id); return t ? `${t.prenom} ${t.nom}` : "—"; };
  const updateMission = (id, patch) => setBookings(p => p.map(x => x.id === id ? { ...x, ...patch } : x));
  const setTechStatut = (id, statut) => setTechs(p => p.map(t => t.id === id ? { ...t, statut } : t));

  /* Outil de gestion d'entreprise : 4 pôles clairs */
  const tabs = [
    { id: "dashboard", icon: Icon.home, l: tr.partnerDashboard },
    { id: "ops_group", icon: Icon.list, l: fr ? "Opérations" : "Operations" },
    { id: "gestion_group", icon: Icon.chart, l: fr ? "Gestion" : "Management" },
    { id: "admin_group", icon: Icon.settings, l: "Administration" },
  ];
  const opsSubs = [
    { id: "missions", l: tr.missions },
    { id: "bons", l: tr.partnerBonsTab },
    { id: "flotte", l: tr.fleetTab },
    { id: "marketplace_part", l: tr.marketplace },
  ];
  const gestionSubs = [
    { id: "techniciens", l: tr.partnerTechs },
    { id: "rh", l: tr.rhTab },
    { id: "facturation", l: tr.partnerFacturation },
    { id: "statistiques", l: tr.partnerStats },
    { id: "documents", l: tr.partnerDocuments },
  ];
  const adminSubs = [
    { id: "abonnement", l: tr.subTab },
    { id: "contrat", l: tr.partnerContrat },
    { id: "conformite", l: tr.partnerConformite },
    { id: "lois", l: fr ? "Lois FR" : "French Law" },
    { id: "fe_part", l: fr ? "Factu. Élec." : "E-Invoicing" },
    { id: "profil", l: tr.partnerProfil },
  ];
  const [opsSub, setOpsSub] = useState("missions");
  const [gestionSub, setGestionSub] = useState("techniciens");
  const [adminSub, setAdminSub] = useState("abonnement");
  const view = tab === "ops_group" ? opsSub : tab === "gestion_group" ? gestionSub : tab === "admin_group" ? adminSub : tab;
  const goView = (id) => {
    if (opsSubs.some(x => x.id === id)) { setOpsSub(id); setTab("ops_group"); }
    else if (gestionSubs.some(x => x.id === id)) { setGestionSub(id); setTab("gestion_group"); }
    else if (adminSubs.some(x => x.id === id)) { setAdminSub(id); setTab("admin_group"); }
    else setTab(id);
  };

  // Factures : numérotation continue dans l'ordre de clôture des missions
  const invoices = doneMissions.slice().sort((x, y) => String(x.termineeLe || x.createdAt).localeCompare(String(y.termineeLe || y.createdAt))).map((m, i) => ({
    ...m, numero: `${(account.nom || "P").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "PAR"}-${new Date(m.termineeLe || m.createdAt).getFullYear()}-${String(i + 1).padStart(4, "0")}`,
    type: "facture", client: m.clientNom, clientAdresse: m.adresse, service: m.typeIntervention || pLabel(PROBLEMES.find(p => p.id === m.probleme), "fr") || "Intervention",
    ttc: bookingTotal(m), ht: Math.round(bookingTotal(m) / 1.2 * 100) / 100, tva: Math.round((bookingTotal(m) - bookingTotal(m) / 1.2) * 100) / 100,
  }));
  const emitter = { nom: account.nom, adresse: account.adresse || account.ville || "", siret: `SIRET ${account.siret || "—"}`, tva: `TVA ${account.tva || "—"}`, email: account.email };
  const downloadInvoice = inv => printInvoice({ ...inv, createdAt: inv.termineeLe || inv.createdAt }, emitter);

  const downloadContrat = () => {
    const txt = [
      "══════════════════════════════════════════════════════════════════",
      "           CONTRAT DE PARTENARIAT COMMERCIAL — LOCKR",
      "══════════════════════════════════════════════════════════════════",
      "",
      "ARTICLE 1 — PARTIES",
      "• LOCKR SAS, plateforme de mise en relation d'artisans",
      `• ${account.nom} — SIRET ${account.siret} — RCS ${account.rcs}`,
      "",
      "ARTICLE 2 — OBJET",
      "Mise en relation, apport d'affaires qualifiés via la plateforme LOCKR.",
      "",
      "ARTICLE 3 — DURÉE",
      `Date de signature : ${account.dateContrat}`,
      "Durée : 1 an renouvelable tacitement. Préavis de résiliation : 3 mois.",
      "",
      "ARTICLE 4 — OBLIGATIONS DE LOCKR",
      "• Apporter des leads qualifiés géolocalisés",
      "• Gérer les paiements clients et reverser sous 30 jours",
      "• Assurer support 7j/7 pour les partenaires",
      "",
      "ARTICLE 5 — OBLIGATIONS DU PARTENAIRE",
      "• Maintenir une assurance RC Pro valide",
      "• Répondre aux demandes urgentes dans les 5 minutes",
      "• Respecter les devis validés avec le client",
      "• Former les techniciens aux standards LOCKR",
      "• Respecter le RGPD pour les données personnelles des clients",
      "• Clause d'exclusivité partielle : ne pas démarcher",
      "  directement les clients LOCKR en dehors de la plateforme",
      "",
      "ARTICLE 6 — RÉMUNÉRATION",
      "95% du montant HT après déduction de la commission LOCKR (5%).",
      "Le partenaire bénéficie du taux réduit de 5% dans le cadre de",
      "l'abonnement Entreprise LOCKR (mensuel ou annuel).",
      "",
      "ARTICLE 7 — MODALITÉS DE PAIEMENT",
      "Virement bancaire sur l'IBAN déclaré sous 30 jours après paiement client.",
      "",
      "ARTICLE 8 — CLAUSE DE NON-CONCURRENCE",
      "12 mois post-résiliation dans la zone d'intervention déclarée.",
      "",
      "ARTICLE 9 — DONNÉES PERSONNELLES (RGPD)",
      "Le Partenaire est sous-traitant au sens de l'article 28 du RGPD.",
      "Un DPA (Data Processing Agreement) est annexé au présent contrat.",
      "",
      "ARTICLE 10 — RÉSILIATION",
      "Faute grave, non-respect des obligations de conformité,",
      "ou préavis de 3 mois sans motif.",
      "",
      "ARTICLE 11 — LOI APPLICABLE",
      "Droit français. Tribunal compétent : Paris.",
      "",
      "ARTICLE 12 — LUTTE ANTI-CORRUPTION (Loi Sapin II)",
      "Les parties déclarent l'absence de tout conflit d'intérêts",
      "et s'engagent à respecter la loi n°2016-1691 du 9 décembre 2016.",
      "",
      "══════════════════════════════════════════════════════════════════",
      `Signé le ${account.dateContrat} — Lu et approuvé`,
      "══════════════════════════════════════════════════════════════════",
    ].join("\n");
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `contrat-lockr-${account.id}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const kpiCards = [
    { label: fr ? "Missions en cours" : "Ongoing missions", value: myMissions.filter(m => ["assignée", "en_route", "en_cours", "en_attente"].includes(m.statut)).length, color: T.accent },
    { label: tr.kpiCaMois, value: fmt(caMois), color: T.success },
    { label: `${tr.kpiCommission} (${PARTNER_COMMISSION * 100} %)`, value: fmt(commissionMois), color: T.warn },
    { label: tr.kpiTechs, value: activeTechs.length, color: "#5b8def" },
    { label: fr ? "Missions terminées" : "Completed missions", value: doneMissions.length, color: T.accent },
    { label: fr ? "À encaisser" : "To collect", value: fmt(doneMissions.filter(m => m.statutPaiement !== "payé").reduce((s2, m) => s2 + resteAPayer(m), 0)), color: T.danger },
  ];

  const renderDashboard = () => (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 4 }}>{tr.partnerDashboard}</div>
      <div style={{ color: T.textLo, fontSize: 12, marginBottom: 18 }}>{fr ? "Toute votre entreprise en un coup d'œil." : "Your entire business at a glance."}</div>
      {!approved && <PendingApprovalCard account={account} setAccounts={setAccounts} lang={lang} />}
      {approved && !hasPartnerAccess && (
        <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 16, border: "1px solid rgba(201,160,48,.35)", background: "rgba(201,160,48,.06)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi }}>{fr ? "Activez votre abonnement" : "Activate your subscription"}</div>
            <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>{fr ? "Missions, flotte, techniciens, RH et facturation sont accessibles dès l'abonnement souscrit." : "Missions, fleet, technicians, HR and invoicing are available once subscribed."}</div>
          </div>
          <button onClick={() => goView("abonnement")} className="lk-btn" style={{ width: "auto", padding: "10px 18px" }}>{fr ? "Voir les offres" : "See plans"}</button>
        </div>
      )}
      <div className="lk-desktop-3col" style={{ marginBottom: 20 }}>
        {kpiCards.map((k, i) => (
          <div key={i} className="lk-card" style={{ padding: "18px 20px", marginBottom: isDesktop ? 0 : 10 }}>
            <div style={{ color: k.color, fontWeight: 800, fontSize: 24 }}>{k.value}</div>
            <div style={{ color: T.textMid, fontSize: 12, marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(4,1fr)" : "repeat(2,1fr)", gap: 8, marginBottom: 22 }}>
        {[
          { id: "missions", ic: Icon.list, l: tr.missions },
          { id: "bons", ic: Icon.percent, l: tr.partnerBonsTab },
          { id: "flotte", ic: Icon.map, l: tr.fleetTab },
          { id: "techniciens", ic: Icon.user, l: tr.partnerTechs },
          { id: "rh", ic: Icon.calendar, l: tr.rhTab },
          { id: "facturation", ic: Icon.euro, l: tr.partnerFacturation },
          { id: "statistiques", ic: Icon.chart, l: tr.partnerStats },
          { id: "marketplace_part", ic: Icon.card, l: tr.marketplace },
        ].map(x => (
          <button key={x.id} onClick={() => goView(x.id)} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, padding: "13px 6px", cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {x.ic(T.accent, 19)}
            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.textMid }}>{x.l}</span>
          </button>
        ))}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi, marginBottom: 12 }}>{tr.lastMissions}</div>
      {myMissions.length === 0 && <div style={{ color: T.textLo, fontSize: 13, marginBottom: 12 }}>{fr ? "Aucune mission pour l'instant. Les demandes clients de votre ville apparaissent dans « Bons »." : "No mission yet. Client requests in your city appear in \"Jobs\"."}</div>}
      {myMissions.slice(0, 5).map(m => (
        <div key={m.id} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{m.clientNom}</div>
              <div style={{ color: T.textMid, fontSize: 12 }}>{m.typeIntervention || pLabel(PROBLEMES.find(p => p.id === m.probleme), lang)}</div>
              <div style={{ color: T.textLo, fontSize: 11, marginTop: 4 }}>{m.adresse}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, color: T.accent, fontSize: 15 }}>{fmt(bookingTotal(m))}</div>
              <div style={{ fontSize: 11, color: (CLIENT_ST[m.statut] || {}).c || T.textLo, fontWeight: 600, marginTop: 4 }}>{(CLIENT_ST[m.statut] || {})[fr ? "fr" : "en"] || tStatut(m.statut, tr)}</div>
            </div>
          </div>
        </div>
      ))}
      {docs.some(d => d.statut !== "validé") && (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi, marginBottom: 12, marginTop: 24 }}>{tr.conformiteAlerts}</div>
          {docs.filter(d => d.statut === "non_fourni" || d.statut === "en_attente").map(d => (
            <button key={d.id} onClick={() => goView("documents")} style={{ width: "100%", textAlign: "left", background: "rgba(217,119,6,.06)", border: "1px solid rgba(217,119,6,.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              {Icon.warning(T.warn, 16)}
              <span style={{ color: T.warn, fontSize: 13, fontWeight: 600 }}>{d.label} — {d.statut === "non_fourni" ? tr.documentMissing : tr.pendingValidationDoc}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );

  const missionStep = { en_attente: { next: "assignée", l: fr ? "Accepter" : "Accept" }, assignée: { next: "en_route", l: fr ? "Technicien en route" : "Technician on the way" }, en_route: { next: "en_cours", l: fr ? "Technicien sur place" : "Technician on site" } };
  const renderMissions = () => (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.missions}</div>
      {myMissions.length === 0 && <div style={{ color: T.textLo, fontSize: 13 }}>{fr ? "Aucune mission." : "No mission."}</div>}
      {myMissions.map(m => {
        const step = missionStep[m.statut];
        return (
          <div key={m.id} className="lk-card" style={{ padding: "16px 18px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi }}>{m.clientNom}</div>
                <div style={{ color: T.textMid, fontSize: 12 }}>{m.typeIntervention || pLabel(PROBLEMES.find(p => p.id === m.probleme), lang)}</div>
                <div style={{ color: T.textLo, fontSize: 11, marginTop: 2 }}>{m.adresse}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, color: T.accent, fontSize: 16 }}>{fmt(bookingTotal(m))}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: (CLIENT_ST[m.statut] || {}).c || T.textLo, marginTop: 4 }}>{(CLIENT_ST[m.statut] || {})[fr ? "fr" : "en"] || tStatut(m.statut, tr)}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12, padding: "10px", background: "rgba(0,0,0,.02)", borderRadius: 8 }}>
              <div><div style={{ color: T.textLo, fontSize: 10 }}>{tr.missionAmount}</div><div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(bookingTotal(m))}</div></div>
              <div><div style={{ color: T.textLo, fontSize: 10 }}>{tr.kpiCommission} ({Math.round((1 - proShareRate(m)) * 100)} %)</div><div style={{ fontWeight: 700, fontSize: 13, color: T.warn }}>{fmt(lockrShare(m))}</div></div>
              <div><div style={{ color: T.textLo, fontSize: 10 }}>{tr.netPartenaire}</div><div style={{ fontWeight: 700, fontSize: 13, color: T.success }}>{fmt(proShare(m))}</div></div>
            </div>
            {m.statut !== "terminée" && !String(m.statut).startsWith("annulée") && (
              <div style={{ marginBottom: 10 }}>
                <label className="lk-label">{tr.techAssigned}</label>
                <select className="lk-input" value={m.technicienId || ""} onChange={e => {
                  const id = e.target.value || null;
                  if (m.technicienId && m.technicienId !== id) setTechStatut(m.technicienId, "actif");
                  updateMission(m.id, { technicienId: id, technicienNom: id ? techName(id) : null });
                  if (id) setTechStatut(id, "en_mission");
                }} style={{ cursor: "pointer" }}>
                  <option value="">{tr.assignTech}</option>
                  {myTechs.filter(t => t.statut !== "inactif").map(t => <option key={t.id} value={t.id}>{t.prenom} {t.nom} ({t.metier})</option>)}
                </select>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {step && <button disabled={!approved || (step.next !== "assignée" && !m.technicienId)} onClick={() => updateMission(m.id, { statut: step.next, ...(step.next === "en_cours" ? { arriveAt: ts() } : step.next === "en_route" ? { departAt: ts() } : {}) })} className="lk-btn" style={{ flex: 1, padding: "9px 12px", fontSize: 12 }}>{step.l}</button>}
              {m.statut === "en_cours" && <button onClick={() => { setCloseMission(m); setCloseAmount(String(bookingTotal(m) || "")); }} className="lk-btn" style={{ flex: 1, padding: "9px 12px", fontSize: 12, background: "linear-gradient(135deg,#2aaf77,#1d8f5f)" }}>{fr ? "Clôturer la mission" : "Close mission"}</button>}
              {m.statut === "en_cours" && <button onClick={async () => { const r = await declareClientAbsent(m, { setBookings, setters, fraisDep, lang }); if (r) { if (r.ok && m.technicienId) setTechStatut(m.technicienId, "actif"); alert(r.msg); } }} className="lk-ghost" style={{ flex: 1, padding: "9px 12px", fontSize: 12 }}>{fr ? "Client absent" : "Client absent"}</button>}
              {m.fraisDeplacement > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: T.textMid, alignSelf: "center" }}>{FRAIS_TXT(m, lang)}</span>}
              {isBillable(m) && m.statutPaiement !== "payé" && resteAPayer(m) > 0 && <button onClick={() => setLinkMission(m)} className="lk-ghost" style={{ flex: 1, fontSize: 12 }}>{fr ? `Lien de paiement (${fmt(resteAPayer(m))})` : `Payment link (${fmt(resteAPayer(m))})`}</button>}
              {m.statut === "terminée" && <span style={{ fontSize: 12, fontWeight: 700, color: m.statutPaiement === "payé" ? T.success : T.warn, alignSelf: "center" }}>{m.statutPaiement === "payé" ? (fr ? "Payée ✓" : "Paid ✓") : (fr ? "En attente de paiement" : "Awaiting payment")}</span>}
            </div>
            {step && step.next !== "assignée" && !m.technicienId && <div style={{ fontSize: 11, color: T.textLo, marginTop: 6 }}>{fr ? "Assignez d'abord un technicien." : "Assign a technician first."}</div>}
          </div>
        );
      })}
      {closeMission && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 18, padding: "22px 20px", maxWidth: 400, width: "100%" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.textHi, marginBottom: 12 }}>{fr ? "Clôturer la mission" : "Close mission"} — {closeMission.clientNom}</div>
            <label className="lk-label">{fr ? "Montant total facturé (TTC)" : "Total amount (incl. VAT)"}</label>
            <input className="lk-input" type="number" inputMode="decimal" value={closeAmount} onChange={e => setCloseAmount(e.target.value)} style={{ marginBottom: 14 }} />
            <button disabled={!(parseFloat(closeAmount) > 0)} onClick={() => {
              // Le statut de paiement est tenu par le serveur (il ne change pas ici)
              updateMission(closeMission.id, { statut: "terminée", termineeLe: ts(), montantFinal: parseFloat(closeAmount) });
              if (closeMission.technicienId) setTechStatut(closeMission.technicienId, "actif");
              setCloseMission(null);
            }} className="lk-btn" style={{ marginBottom: 10 }}>{fr ? "Valider" : "Confirm"}</button>
            <button onClick={() => setCloseMission(null)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>, document.body
      )}
      {linkMission && <SendPaymentLinkModal amount={resteAPayer(linkMission)} bookingId={linkMission.id} clientNom={linkMission.clientNom} clientTel={linkMission.clientTel || ""} onClose={() => setLinkMission(null)} lang={lang} />}
    </div>
  );

  const renderTechniciens = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi }}>{tr.partnerTechs}</div>
        <button onClick={() => setAddTechModal(true)} className="lk-btn" style={{ width: "auto", padding: "9px 16px", fontSize: 13 }}>{Icon.plus("#fff", 14)} {tr.addTech}</button>
      </div>
      {myTechs.length === 0 && <div style={{ color: T.textLo, fontSize: 13 }}>{fr ? "Ajoutez vos techniciens pour leur assigner des missions." : "Add your technicians to assign them missions."}</div>}
      {myTechs.map(t => {
        const count = myMissions.filter(m => m.technicienId === t.id && m.statut === "terminée").length;
        return (
          <div key={t.id} className="lk-card" style={{ padding: "16px 18px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: T.grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 16 }}>{initial(t.prenom)}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi }}>{t.prenom} {t.nom}</div>
                  <div style={{ color: T.textMid, fontSize: 12 }}>{t.metier} · {t.email || "—"}</div>
                  <div style={{ color: T.textLo, fontSize: 11 }}>{t.tel}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.statut === "actif" ? T.success : t.statut === "en_mission" ? T.accent : T.danger }}>{tStatut(t.statut, tr)}</div>
                <div style={{ color: T.textLo, fontSize: 11, marginTop: 4 }}>{count} mission(s)</div>
              </div>
            </div>
            {(t.certifications || []).length > 0 && (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {t.certifications.map((c, i) => <span key={i} style={{ background: "rgba(201,160,48,.08)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: T.accent, fontWeight: 600 }}>{c}</span>)}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {t.statut !== "en_mission" && <button onClick={() => setTechStatut(t.id, t.statut === "inactif" ? "actif" : "inactif")} className="lk-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>{t.statut === "inactif" ? tr.activate : tr.deactivate}</button>}
              {t.tel && <button onClick={() => callPhone(t.tel)} className="lk-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>{Icon.phone(T.success, 12)} {fr ? "Appeler" : "Call"}</button>}
              <button onClick={() => { if (window.confirm(fr ? `Retirer ${t.prenom} ${t.nom} de vos techniciens ?` : `Remove ${t.prenom} ${t.nom}?`)) setTechs(p => p.filter(x => x.id !== t.id)); }} className="lk-ghost" style={{ fontSize: 12, padding: "6px 12px", color: T.danger, borderColor: "rgba(220,38,38,.3)" }}>{fr ? "Retirer" : "Remove"}</button>
            </div>
          </div>
        );
      })}
      {addTechModal && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "20px 22px 36px", animation: "slideUp .3s ease", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: T.textHi, marginBottom: 18 }}>{tr.addTechTitle}</div>
            {[["prenom", tr.firstname], ["nom", tr.lastname], ["email", tr.email], ["tel", tr.phone], ["certifications", fr ? "Certifications (séparées par des virgules)" : "Certifications (comma separated)"]].map(([k, l]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <label className="lk-label">{l}</label>
                <input className="lk-input" value={newTech[k]} onChange={e => setNewTech(p => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label className="lk-label">{tr.selectMetier}</label>
              <select className="lk-input" value={newTech.metier} onChange={e => setNewTech(p => ({ ...p, metier: e.target.value }))}>
                {METIERS.map(m => <option key={m.id} value={m.id}>{pLabel(m, lang)}</option>)}
              </select>
            </div>
            {techErr && <div role="alert" style={{ color: T.danger, fontSize: 12, marginBottom: 10 }}>{techErr}</div>}
            <button onClick={() => {
              if (!newTech.prenom.trim() || !newTech.nom.trim() || newTech.tel.replace(/\D/g, "").length < 9) { setTechErr(fr ? "Prénom, nom et téléphone valides obligatoires." : "First name, last name and valid phone required."); return; }
              setTechs(p => [...p, { id: uid(), partenaireId: account.id, ...newTech, prenom: newTech.prenom.trim(), nom: newTech.nom.trim(), certifications: newTech.certifications.split(",").map(c => c.trim()).filter(Boolean), statut: "actif", createdAt: ts() }]);
              setAddTechModal(false); setTechErr("");
              setNewTech({ nom: "", prenom: "", email: "", tel: "", metier: "serrurier", certifications: "" });
            }} className="lk-btn" style={{ marginBottom: 10 }}>{tr.addTech}</button>
            <button onClick={() => { setAddTechModal(false); setTechErr(""); }} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>, document.body
      )}
    </div>
  );

  const renderFacturation = () => (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.partnerFacturation}</div>
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.commissionReport} — {now.toLocaleDateString(fr ? "fr-FR" : "en-GB", { month: "long", year: "numeric" })}</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: T.textMid, fontSize: 13 }}>{tr.moisCa}</span><span style={{ fontWeight: 700 }}>{fmt(caMois)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: T.textMid, fontSize: 13 }}>{tr.kpiCommission}</span><span style={{ fontWeight: 700, color: T.warn }}>{fmt(commissionMois)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(0,0,0,.08)", paddingTop: 8 }}><span style={{ color: T.textHi, fontSize: 13, fontWeight: 700 }}>{tr.netReverse}</span><span style={{ fontWeight: 800, color: T.success }}>{fmt(caMois - commissionMois)}</span></div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi, marginBottom: 12 }}>{tr.invoicesEmitted}</div>
      {invoices.length === 0 && <div style={{ color: T.textMid, textAlign: "center", padding: 20 }}>{tr.noInvoice}</div>}
      {invoices.slice().reverse().map(inv => (
        <div key={inv.id} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{inv.numero} — {inv.clientNom}</div>
              <div style={{ color: T.textMid, fontSize: 12 }}>{fmtDate(inv.termineeLe || inv.createdAt)}</div>
              <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
                <span style={{ color: T.textLo, fontSize: 11 }}>HT : {fmt(inv.ht)}</span>
                <span style={{ color: T.textLo, fontSize: 11 }}>TVA : {fmt(inv.tva)}</span>
                <span style={{ fontWeight: 700, fontSize: 12, color: T.textHi }}>TTC : {fmt(inv.ttc)}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              <span className={inv.statutPaiement === "payé" ? "lk-badge-ok" : "lk-badge-off"} style={{ fontSize: 10 }}>{inv.statutPaiement === "payé" ? (fr ? "payée" : "paid") : (fr ? "à encaisser" : "unpaid")}</span>
              <button onClick={() => downloadInvoice(inv)} className="lk-ghost" style={{ fontSize: 11, padding: "5px 10px" }}>{fr ? "Imprimer / PDF" : "Print / PDF"}</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderContrat = () => (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.contractTitle}</div>
      <div className="lk-card" style={{ padding: "20px 22px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi }}>{tr.contractTitle} — {account.nom}</div>
            <div style={{ color: T.textMid, fontSize: 12 }}>{tr.contractSigned} {account.dateContrat}</div>
          </div>
          <span className="lk-badge-ok">{tr.contractActive}</span>
        </div>
        <button onClick={downloadContrat} className="lk-btn" style={{ padding: "10px 16px", fontSize: 13 }}>{tr.downloadContract}</button>
      </div>
      {[
        ["Art. 1 — Parties", `LOCKR SAS (plateforme) et ${account.nom} (SIRET ${account.siret})`],
        ["Art. 2 — Objet", "Mise en relation et apport d'affaires qualifiés via la plateforme LOCKR."],
        ["Art. 3 — Durée", `1 an à compter du ${account.dateContrat}, renouvelable tacitement. Préavis : 3 mois.`],
        ["Art. 4 — Obligations LOCKR", "Apport de leads qualifiés, gestion des paiements clients, support 7j/7."],
        ["Art. 5 — Obligations Partenaire", "RC Pro à jour, réponse < 5 min, respect des devis, formation RGPD, clause d'exclusivité partielle."],
        ["Art. 6 — Rémunération", "95% du montant HT après déduction de la commission LOCKR (5% — abonnement Entreprise)."],
        ["Art. 7 — Paiements", "Virement bancaire sous 30 jours après paiement client sur IBAN déclaré."],
        ["Art. 8 — Non-concurrence", "12 mois post-résiliation dans la zone d'intervention déclarée."],
        ["Art. 9 — RGPD", "Partenaire = sous-traitant au sens de l'article 28 RGPD. DPA annexé."],
        ["Art. 10 — Résiliation", "Faute grave, non-conformité, ou préavis de 3 mois."],
        ["Art. 11 — Loi applicable", "Droit français. Juridiction compétente : Paris."],
        ["Art. 12 — Loi Sapin II", "Conformité à la loi n°2016-1691 anti-corruption. Déclaration d'absence de conflit d'intérêts."],
      ].map(([title, body]) => (
        <div key={title} className="lk-card" style={{ padding: "14px 16px", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.accent, marginBottom: 4 }}>{title}</div>
          <div style={{ color: T.textMid, fontSize: 13, lineHeight: 1.5 }}>{body}</div>
        </div>
      ))}
    </div>
  );

  const renderConformite = () => {
    const score = `${conformeCount}/${docs.length}`;
    return (
      <div>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 12 }}>{tr.legalCompliance}</div>
        <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 20, background: conformeCount >= 8 ? "rgba(30,158,107,.04)" : "rgba(217,119,6,.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: T.textHi }}>{tr.complianceScore}</span>
            <span style={{ fontWeight: 800, fontSize: 22, color: conformeCount >= 8 ? T.success : T.warn }}>{score}</span>
          </div>
          <div style={{ marginTop: 8, height: 6, background: "rgba(0,0,0,.06)", borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${(conformeCount / docs.length) * 100}%`, background: conformeCount >= 8 ? T.success : T.warn, borderRadius: 3, transition: "width .5s" }} />
          </div>
        </div>
        {docs.map(d => (
          <div key={d.id} className="lk-card" style={{ padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>{d.statut === "validé" ? "✅" : d.statut === "en_attente" ? "⚠️" : "❌"}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: T.textHi }}>{d.label}</div>
                {d.expiry && <div style={{ color: T.textLo, fontSize: 11 }}>{tr.docExpiry}: {d.expiry}</div>}
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: d.statut === "validé" ? T.success : d.statut === "en_attente" ? T.warn : T.danger }}>{d.statut}</span>
          </div>
        ))}
        <div style={{ marginTop: 20, fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.legalObligations}</div>
        {["Affichage obligatoire TVA sur devis et factures","Délai de rétractation client si applicable","Médiateur de la consommation désigné","Garantie décennale pour travaux de bâtiment","Assurance dommages-ouvrage si applicable"].map((o, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
            {Icon.check(T.success, 14)}
            <span style={{ color: T.textMid, fontSize: 13 }}>{o}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderDocuments = () => (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.requiredDocs}</div>
      {docs.map(d => (
        <div key={d.id} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{d.label}</div>
              {d.file && <div style={{ color: T.success, fontSize: 11, marginTop: 2 }}>📎 {d.file}</div>}
              {d.expiry && <div style={{ color: T.textLo, fontSize: 11 }}>{tr.docExpiry} : {d.expiry}</div>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: d.statut === "validé" ? "rgba(30,158,107,.08)" : d.statut === "en_attente" ? "rgba(217,119,6,.08)" : "rgba(220,38,38,.07)", color: d.statut === "validé" ? T.success : d.statut === "en_attente" ? T.warn : T.danger }}>{d.statut}</span>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "rgba(0,0,0,.03)", border: "1px dashed rgba(0,0,0,.15)", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: T.textMid }}>
            {tr.uploadReplace}
            <input type="file" style={{ display: "none" }} onChange={e => {
              const f = e.target.files?.[0];
              if (f) setDoc_(d.id, { file: f.name, statut: "en_attente", deposeLe: ts() });
            }} />
          </label>
        </div>
      ))}
    </div>
  );

  const renderStatistiques = () => {
    // Statistiques calculées sur les vraies missions des 12 derniers mois
    const moisData = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const list = doneMissions.filter(m => { const md = new Date(m.termineeLe || m.createdAt); return md.getMonth() === d.getMonth() && md.getFullYear() === d.getFullYear(); });
      return { m: d.toLocaleDateString(fr ? "fr-FR" : "en-GB", { month: "short" }), count: list.length, ca: list.reduce((s2, x) => s2 + bookingTotal(x), 0) };
    });
    const maxCount = Math.max(...moisData.map(d => d.count), 1);
    const byMetier = METIERS.map(m => ({ l: pLabel(m, lang), c: m.color, n: doneMissions.filter(x => metierOf(x) === m.id).length })).filter(x => x.n > 0);
    const totalM = byMetier.reduce((s2, x) => s2 + x.n, 0) || 1;
    return (
      <div>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.partnerStats}</div>
        <div className="lk-card" style={{ padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 14 }}>{tr.statsMissionsMonth}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
            {moisData.map((d, i) => (
              <div key={i} title={`${d.count} mission(s) · ${fmt(d.ca)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 9, color: T.textLo }}>{d.count || ""}</div>
                <div style={{ width: "100%", background: d.count ? T.grad : "rgba(0,0,0,.06)", borderRadius: "4px 4px 0 0", height: `${Math.max((d.count / maxCount) * 80, 3)}px` }} />
                <div style={{ color: T.textLo, fontSize: 9 }}>{d.m}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="lk-desktop-2col">
          <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.statsTopTechs}</div>
            {myTechs.length === 0 && <div style={{ color: T.textLo, fontSize: 12 }}>—</div>}
            {myTechs.map(t => ({ t, n: doneMissions.filter(m => m.technicienId === t.id).length })).sort((x, y) => y.n - x.n).map(({ t, n }) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: T.textMid, fontSize: 13 }}>{t.prenom} {t.nom}</span>
                <span style={{ fontWeight: 700, color: T.accent }}>{n} mission(s)</span>
              </div>
            ))}
          </div>
          <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.statsIntervBreakdown}</div>
            {byMetier.length === 0 && <div style={{ color: T.textLo, fontSize: 12 }}>{fr ? "Pas encore de mission terminée." : "No completed mission yet."}</div>}
            {byMetier.map(x => (
              <div key={x.l} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: T.textMid, fontSize: 12 }}>{x.l}</span>
                  <span style={{ fontWeight: 700, fontSize: 12, color: x.c }}>{Math.round((x.n / totalM) * 100)} %</span>
                </div>
                <div style={{ height: 4, background: "rgba(0,0,0,.06)", borderRadius: 2 }}><div style={{ height: "100%", width: `${(x.n / totalM) * 100}%`, background: x.c, borderRadius: 2 }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderProfil = () => (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.companyProfile}</div>
      <div className="lk-card" style={{ padding: "20px 22px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, background: T.grad, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20 }}>{initial(account.nom)}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: T.textHi }}>{account.nom}</div>
            <div style={{ color: approved ? T.accent : T.warn, fontSize: 12, fontWeight: 600 }}>{approved ? tr.partnerCertified : (fr ? "Dossier en cours de validation" : "Application under review")}</div>
          </div>
        </div>
        {[
          [tr.legalName, profileEdit.nom, "nom"],
          ["SIRET", profileEdit.siret, "siret"],
          [tr.rcsNum, profileEdit.rcs, "rcs"],
          [tr.socialCapital, profileEdit.capital, "capital"],
          [tr.tvaNum, profileEdit.tva, "tva"],
          ["IBAN", profileEdit.iban, "iban"],
          [tr.rcProInsurance, profileEdit.assurance, "assurance"],
          [tr.phone, profileEdit.tel, "tel"],
          [tr.city, profileEdit.ville, "ville"],
          [fr ? "Adresse du siège" : "Head office address", profileEdit.adresse, "adresse"],
        ].map(([label, val, key]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label className="lk-label">{label}</label>
            <input className="lk-input" value={val || ""} onChange={e => setProfileEdit(p => ({ ...p, [key]: e.target.value }))} />
          </div>
        ))}
        <div style={{ marginBottom: 14 }}>
          <label className="lk-label">{tr.sectors}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {METIERS.map(m => {
              const on = (profileEdit.secteurs || []).includes(m.id);
              return (
                <button key={m.id} onClick={() => {
                  const sects = profileEdit.secteurs || [];
                  setProfileEdit(p => ({ ...p, secteurs: on ? sects.filter(x => x !== m.id) : [...sects, m.id] }));
                }} style={{ padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${on ? T.accent : "rgba(0,0,0,.12)"}`, background: on ? "rgba(201,160,48,.08)" : "transparent", color: on ? T.accent : T.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                  {on ? "✓ " : ""}{pLabel(m, lang)}
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={() => {
          const { id, role, email, passHash, salt, pass, ...editable } = profileEdit; // eslint-disable-line no-unused-vars
          setAccounts(p => p.map(a => a.id === account.id ? { ...a, ...editable } : a));
          setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2000);
        }} className="lk-btn">{profileSaved ? (fr ? "Enregistré ✓" : "Saved ✓") : tr.saveProfile}</button>
      </div>
      <PasswordChangeCard account={account} setAccounts={setAccounts} lang={lang} />
      <RgpdCard account={account} setAccounts={setAccounts} bookings={bookings} openLegal={openLegal} lang={lang} />
    </div>
  );

  const myRegion = account.ville || "Paris";
  const mySecteurs = account.secteurs || [];
  const myBons = visibleFor(account, bons || []).filter(b => b.postedBy === account.id);
  // Demandes clients (et bons LOCKR ouverts) de la ville, dans les secteurs de l'entreprise
  const openClientBons = visibleFor(account, bons || []).filter(b => b.postedBy === "platform" && b.openPartner && (!b.region || sameCity(b.region, myRegion)) && (!mySecteurs.length || !metierOf(b) || mySecteurs.includes(metierOf(b))));
  const takeClientBon = async (bon, techId) => {
    const taken = () => alert(fr ? "Cette demande vient d'être prise par un autre professionnel." : "This request was just taken by another professional.");
    if (!bons.some(b => b.id === bon.id)) { taken(); return; }
    const tech = myTechs.find(t => t.id === techId);
    // La mission devient une vraie intervention : le client la voit et la suit
    const bk = {
      id: "bon_" + bon.id, partenaireId: account.id, partenaireNom: account.nom, artisanNom: tech ? `${tech.prenom} ${tech.nom}` : account.nom,
      artisanTel: tech?.tel || account.tel || "",
      clientId: bon.clientId || "ext", clientNom: bon.clientNom || (fr ? "Client LOCKR" : "LOCKR client"), clientTel: bon.clientTel || "",
      adresse: bon.adresse, probleme: bon.probleme, metier: metierOf(bon), typeIntervention: bon.titre, urgence: !!bon.urgence,
      montant: bon.montantEstime, statut: "assignée", technicienId: tech?.id || null, technicienNom: tech ? `${tech.prenom} ${tech.nom}` : null,
      createdAt: ts(), rdvDate: ts(), bonId: bon.id, bonType: "partner", region: bon.region,
      techPct: Number(bon.techPct) || PCT_DEFAULT, postedBy: bon.postedBy || "platform",
      ...(bon.lat && bon.lng ? { lat: bon.lat, lng: bon.lng, clientPos: [bon.lat, bon.lng] } : {}),
      ...(bon.isDemo ? { isDemo: true } : {}),
    };
    bk.participants = bookingParticipants(bk);
    if (live) {
      try {
        await runBatch([{ collection: "bookings", id: bk.id, data: bk }, { type: "delete", collection: "bons", id: bon.id }]);
      } catch (e) {
        console.error("[demande]", e);
        taken();
        return;
      }
    } else {
      setBookings(p => [...p, bk]);
      setBons(p => p.filter(b => b.id !== bon.id));
    }
    if (tech) setTechStatut(tech.id, "en_mission");
  };
  const posterBon = async () => {
    const montant = parseFloat(newBon.montantEstime);
    if (!newBon.titre.trim() || !newBon.adresse.trim() || !(montant > 0)) { setBonErr(fr ? "Titre, adresse et montant obligatoires." : "Title, address and amount required."); return; }
    const geo = await geocodeAddress(newBon.adresse);
    setBons(p => [...p, { id: uid(), ...newBon, titre: newBon.titre.trim(), adresse: newBon.adresse.trim(), montantEstime: montant, techPct: Math.min(PCT_DEFAULT, Math.max(TECH_PCT_MIN, Number(newBon.techPct) || 70)), metier: metierOf(newBon), postedBy: account.id, postedByNom: account.nom, region: myRegion, ...(geo ? { lat: geo[0], lng: geo[1] } : {}), createdAt: ts(), openPlatform: true }]);
    setBonModal(false); setBonErr("");
    setNewBon({ titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: 70 });
  };
  const renderBons = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi }}>{tr.partnerBonsTab}</div>
          <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{tr.bonPostedAllCraftsmen}</div>
        </div>
        <button onClick={() => setBonModal(true)} className="lk-btn" style={{ width: "auto", padding: "9px 16px", fontSize: 13 }}>{Icon.plus("#fff", 14)} {tr.postBonAll}</button>
      </div>
      {/* Demandes clients sans artisan indépendant disponible — assignables à un technicien */}
      {openClientBons.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 4 }}>
            🆘 {lang === "en" ? "Client requests with no craftsman available" : "Demandes clients sans artisan disponible"} <span style={{ color: T.warn, fontWeight: 900 }}>({openClientBons.length})</span>
          </div>
          <div style={{ color: T.textLo, fontSize: 12, marginBottom: 12 }}>{lang === "en" ? "Assign one of your technicians to accept the intervention." : "Assignez l'un de vos techniciens pour accepter l'intervention."}</div>
          {openClientBons.map(bon => {
            const matching = myTechs.filter(t => t.statut === "actif" && (!metierOf(bon) || t.metier === metierOf(bon)));
            return (
              <div key={bon.id} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10, borderLeft: `4px solid ${T.warn}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{bon.titre}</div>
                    <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{maskAddress(bon.adresse)}</div>
                  </div>
                  <div style={{ color: T.accent, fontWeight: 800, fontSize: 15 }}>{fmtFrom(bon.montantEstime, lang)}</div>
                </div>
                {matching.length === 0 ? (
                  <div style={{ color: T.textLo, fontSize: 12 }}>{lang === "en" ? "No available technician for this trade." : "Aucun technicien disponible pour ce métier."}</div>
                ) : (
                  <select disabled={!approved} onChange={e => { const techId = e.target.value; if (techId) takeClientBon(bon, techId); }} className="lk-input" defaultValue="" style={{ width: "100%" }}>
                    <option value="" disabled>{lang === "en" ? "Assign to a technician…" : "Assigner à un technicien…"}</option>
                    {matching.map(t => <option key={t.id} value={t.id}>{t.prenom} {t.nom} — {t.metier}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
      {myBons.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          {Icon.percent(T.textLo, 36)}
          <div style={{ color: T.textLo, fontSize: 14, marginTop: 12 }}>{tr.noPartnerBons}</div>
          <div style={{ color: T.textLo, fontSize: 12, marginTop: 6 }}>{tr.bonPostedAllCraftsmen}</div>
        </div>
      )}
      {myBons.map(bon => {
        const IC = PROB_ICONS[bon.probleme] || Icon.tool;
        return (
          <div key={bon.id} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(201,160,48,.1)", border: "1px solid rgba(201,160,48,.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>{IC(T.accent, 19)}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{bon.titre}</div>
                  <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{bon.adresse}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {bon.urgence && <div className="lk-tag-urgent" style={{ display: "inline-block", marginBottom: 4 }}>URGENT</div>}
                <div style={{ color: T.accent, fontWeight: 700, fontSize: 13 }}>{fmtFrom(bon.montantEstime, lang)}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ background: "rgba(30,158,107,.06)", border: "1px solid rgba(30,158,107,.15)", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: T.success, fontWeight: 600 }}>{tr.bonOpenPlatform}</span>
              <span style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.15)", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: T.accent, fontWeight: 600 }}>{bon.techPct}% {tr.technicianShare}</span>
            </div>
            <button onClick={() => { if (window.confirm(fr ? "Retirer ce bon ?" : "Remove this job?")) setBons(p => p.filter(b => b.id !== bon.id)); }} className="lk-ghost" style={{ fontSize: 11, padding: "5px 10px", marginTop: 10, color: T.danger, borderColor: T.danger }}>{tr.deleteBonus}</button>
          </div>
        );
      })}
      {bonModal && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 36px", maxHeight: "85vh", overflowY: "auto", animation: "slideUp .3s ease" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ fontWeight: 700, fontSize: 17, color: T.textHi, marginBottom: 6 }}>{tr.postBonAll}</div>
            <div style={{ color: T.textLo, fontSize: 12, marginBottom: 18 }}>{tr.bonPostedAllCraftsmen}</div>
            <div style={{ marginBottom: 14 }}><label className="lk-label">{tr.titleLabel}</label><input className="lk-input" value={newBon.titre} onChange={e => setNewBon(p => ({ ...p, titre: e.target.value }))} placeholder="Ex: Porte claquée urgence" /></div>
            <div style={{ marginBottom: 14 }}><label className="lk-label">{tr.clientAddress}</label><input className="lk-input" value={newBon.adresse} onChange={e => setNewBon(p => ({ ...p, adresse: e.target.value }))} placeholder="15 rue de la Paix, Paris" /></div>
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.interventionTypeLabel}</label>
              <select className="lk-input" value={newBon.probleme} onChange={e => setNewBon(p => ({ ...p, probleme: e.target.value }))} style={{ cursor: "pointer" }}>
                {PROBLEMES.map(p => <option key={p.id} value={p.id}>{pLabel(p, lang)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}><label className="lk-label">{tr.estimatedAmount}</label><input type="number" className="lk-input" value={newBon.montantEstime} onChange={e => setNewBon(p => ({ ...p, montantEstime: e.target.value }))} placeholder="150" /></div>
            <div style={{ marginBottom: 20 }}>
              <label className="lk-label">{tr.technicianShare} : {newBon.techPct}%</label>
              <input type="range" min={TECH_PCT_MIN} max={PCT_DEFAULT} step={5} value={newBon.techPct} onChange={e => setNewBon(p => ({ ...p, techPct: parseInt(e.target.value, 10) }))} style={{ width: "100%", accentColor: T.accent }} />
              <div style={{ fontSize: 11, color: T.textLo, marginTop: 4 }}>{fr ? `Vous recevez ${posterPctFor(newBon.techPct)} % comme apporteur (${APPORTEUR_MAX_PCT} % maximum) · LOCKR ${Math.round(LOCKR_COMMISSION * 100)} %` : `You receive ${posterPctFor(newBon.techPct)}% as referrer (max ${APPORTEUR_MAX_PCT}%) · LOCKR ${Math.round(LOCKR_COMMISSION * 100)}%`}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 20 }}>
              <input type="checkbox" id="bon-urgence" checked={newBon.urgence} onChange={e => setNewBon(p => ({ ...p, urgence: e.target.checked }))} style={{ accentColor: T.danger }} />
              <label htmlFor="bon-urgence" style={{ color: T.textMid, fontSize: 13, cursor: "pointer" }}>{tr.urgentIntervention}</label>
            </div>
            {bonErr && <div role="alert" style={{ color: T.danger, fontSize: 12, marginBottom: 10 }}>{bonErr}</div>}
            <button onClick={posterBon} className="lk-btn" style={{ marginBottom: 10 }}>{tr.publishBonus}</button>
            <button onClick={() => { setBonModal(false); setBonErr(""); }} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>, document.body
      )}
    </div>
  );

  /* ── Flotte : position = adresse de la mission en cours de chaque technicien.
     (Le suivi GPS en temps réel des employés nécessite qu'ils aient leur propre
     accès à l'application — voir pistes d'amélioration.) ── */
  const renderFlotte = () => {
    const trackable = myTechs.map(t => {
      const m = myMissions.find(x => x.technicienId === t.id && ["assignée", "en_route", "en_cours"].includes(x.statut));
      return { ...t, mission: m, lat: m?.lat, lng: m?.lng };
    });
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi }}>{tr.fleetTitle}</div>
          <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{fr ? "Vos techniciens et le lieu de leur mission en cours." : "Your technicians and where their current mission is."}</div>
        </div>
        {trackable.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: T.textLo }}>{tr.fleetNoTech}</div>
        ) : (
          <>
            <FleetMap techs={trackable.filter(t => t.lat && t.lng)} tr={tr} focusId={focusTech} />
            <div style={{ marginTop: 16 }}>
              {trackable.map(t => {
                const col = t.statut === "en_mission" ? T.accent : t.statut === "actif" ? T.success : T.textLo;
                const statusLabel = t.statut === "en_mission" ? tr.fleetOnMission : t.statut === "actif" ? tr.fleetOnline : tr.fleetOffline;
                return (
                  <div key={t.id} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#fff", border: `3px solid ${col}`, display: "flex", alignItems: "center", justifyContent: "center", color: col, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{initial(t.prenom)}{initial(t.nom)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{t.prenom} {t.nom}</div>
                        <div style={{ fontSize: 12, color: col, fontWeight: 600 }}>{statusLabel}</div>
                        {t.mission && <div style={{ fontSize: 11, color: T.textLo, marginTop: 2 }}>{t.mission.clientNom} · {t.mission.adresse}</div>}
                      </div>
                    </div>
                    {t.lat && t.lng && <button onClick={() => { setFocusTech(null); setTimeout(() => setFocusTech(t.id), 0); }} className="lk-ghost" style={{ fontSize: 11, padding: "6px 12px", flexShrink: 0 }}>{Icon.pin(T.accent, 12)} {tr.fleetCenterOn}</button>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  /* ── Gestion RH : planning réel (missions de la semaine), congés, primes ── */
  const renderRH = () => {
    const days = fr ? ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const dayDate = d => { const x = new Date(monday); x.setDate(monday.getDate() + d); return x; };
    const onLeave = (t, date) => leaves.some(l => l.techId === t.id && l.statut === "acceptée" && l.du && l.au && date >= new Date(l.du) && date <= new Date(`${l.au}T23:59:59`));
    const missionsOf = (t, date) => myMissions.filter(m => m.technicienId === t.id && m.rdvDate && new Date(m.rdvDate).toDateString() === date.toDateString());
    const expiring = docs.filter(d => d.expiry && new Date(d.expiry) < new Date(Date.now() + 90 * 86400000));
    return (
      <div>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.rhTitle}</div>
        <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.rhPlanning} — {fr ? "semaine du" : "week of"} {monday.toLocaleDateString(fr ? "fr-FR" : "en-GB")}</div>
          {myTechs.length === 0 ? <div style={{ color: T.textLo, fontSize: 12 }}>—</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
                <thead><tr><th />{days.map((d, i) => <th key={d} style={{ fontSize: 11, color: T.textLo, padding: "4px 6px" }}>{d} {dayDate(i).getDate()}</th>)}</tr></thead>
                <tbody>
                  {myTechs.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontSize: 12, fontWeight: 700, color: T.textHi, padding: "5px 6px", whiteSpace: "nowrap" }}>{t.prenom}</td>
                      {days.map((_, d) => {
                        const date = dayDate(d);
                        const ms = missionsOf(t, date);
                        const leave = onLeave(t, date);
                        const cell = leave ? { l: fr ? "Congé" : "Leave", c: T.warn, bg: "rgba(217,119,6,.08)" } : ms.length ? { l: `${ms.length} mission${ms.length > 1 ? "s" : ""}`, c: T.accent, bg: "rgba(201,160,48,.1)" } : { l: "—", c: T.textLo, bg: "rgba(0,0,0,.03)" };
                        return <td key={d} style={{ padding: 3 }} title={ms.map(m => `${fmtTime(m.rdvDate)} ${m.clientNom}`).join("\n")}><div style={{ background: cell.bg, color: cell.c, fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>{cell.l}</div></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.rhLeaves}</div>
          {leaves.length === 0 && <div style={{ color: T.textLo, fontSize: 13, marginBottom: 10 }}>{tr.rhNoLeave}</div>}
          {leaves.slice().reverse().map(l => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid rgba(0,0,0,.05)", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{techName(l.techId)}</div>
                <div style={{ fontSize: 12, color: T.textMid }}>{l.du ? `${fmtDate(l.du)} → ${fmtDate(l.au)}` : l.dates} — {l.motif}</div>
              </div>
              {l.statut === "en_attente" ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setLeaves(p => p.map(x => x.id === l.id ? { ...x, statut: "acceptée" } : x))} className="lk-btn" style={{ width: "auto", padding: "6px 12px", fontSize: 11 }}>{tr.rhApprove}</button>
                  <button onClick={() => setLeaves(p => p.map(x => x.id === l.id ? { ...x, statut: "refusée" } : x))} className="lk-ghost" style={{ fontSize: 11, padding: "6px 12px", color: T.danger, borderColor: T.danger }}>{tr.rhReject}</button>
                </div>
              ) : <span style={{ fontSize: 11, fontWeight: 700, color: l.statut === "acceptée" ? T.success : T.danger }}>{l.statut}</span>}
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1.2fr 1fr 1fr 1.4fr auto" : "1fr 1fr", gap: 8, marginTop: 12 }}>
            <select className="lk-input" value={leaveForm.techId} onChange={e => setLeaveForm(p => ({ ...p, techId: e.target.value }))}><option value="">{fr ? "Technicien" : "Technician"}</option>{myTechs.map(t => <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>)}</select>
            <input className="lk-input" type="date" value={leaveForm.du} onChange={e => setLeaveForm(p => ({ ...p, du: e.target.value }))} aria-label={fr ? "Du" : "From"} />
            <input className="lk-input" type="date" value={leaveForm.au} min={leaveForm.du} onChange={e => setLeaveForm(p => ({ ...p, au: e.target.value }))} aria-label={fr ? "Au" : "To"} />
            <input className="lk-input" value={leaveForm.motif} onChange={e => setLeaveForm(p => ({ ...p, motif: e.target.value }))} placeholder={fr ? "Motif" : "Reason"} />
            <button disabled={!leaveForm.techId || !leaveForm.du || !leaveForm.au} onClick={() => { setLeaves(p => [...p, { id: uid(), ...leaveForm, statut: "acceptée", createdAt: ts() }]); setLeaveForm({ techId: "", du: "", au: "", motif: "" }); }} className="lk-btn" style={{ width: "auto", padding: "10px 14px", fontSize: 12 }}>{fr ? "Ajouter" : "Add"}</button>
          </div>
        </div>

        <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.rhBonuses}</div>
          {primes.length === 0 && <div style={{ color: T.textLo, fontSize: 12, marginBottom: 8 }}>—</div>}
          {primes.map(pr => (
            <div key={pr.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
              <span style={{ fontSize: 12, color: T.textMid }}>{techName(pr.techId)} — {pr.motif} · {pr.date}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.success }}>+{fmt(pr.montant)}</span>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1.2fr 1fr 1.6fr auto" : "1fr 1fr", gap: 8, marginTop: 12 }}>
            <select className="lk-input" value={primeForm.techId} onChange={e => setPrimeForm(p => ({ ...p, techId: e.target.value }))}><option value="">{fr ? "Technicien" : "Technician"}</option>{myTechs.map(t => <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>)}</select>
            <input type="number" inputMode="decimal" className="lk-input" placeholder={tr.rhBonusAmount} value={primeForm.montant} onChange={e => setPrimeForm(p => ({ ...p, montant: e.target.value }))} />
            <input className="lk-input" placeholder={tr.rhBonusReason} value={primeForm.motif} onChange={e => setPrimeForm(p => ({ ...p, motif: e.target.value }))} />
            <button disabled={!primeForm.techId || !(parseFloat(primeForm.montant) > 0)} onClick={() => { setPrimes(p => [...p, { id: uid(), techId: primeForm.techId, montant: parseFloat(primeForm.montant), motif: primeForm.motif, date: new Date().toLocaleDateString("fr-FR"), createdAt: ts() }]); setPrimeForm({ techId: "", montant: "", motif: "" }); }} className="lk-btn" style={{ width: "auto", padding: "10px 14px", fontSize: 12 }}>{tr.rhAddBonus}</button>
          </div>
        </div>

        <div className="lk-card" style={{ padding: "16px 18px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.rhAlerts}</div>
          {expiring.length === 0 && <div style={{ color: T.textLo, fontSize: 13 }}>—</div>}
          {expiring.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
              {Icon.warning(T.warn, 15)}<span style={{ fontSize: 13, color: T.warn, fontWeight: 600 }}>{d.label} — {tr.rhDocExpiring} ({fmtDate(d.expiry)})</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ── Abonnement Entreprise ── */
  const subBenefits = [tr.subBenefit1, tr.subBenefit2, tr.subBenefit3, tr.subBenefit4, tr.subBenefit5, tr.subBenefit6];
  // Abonnement prépayé (1 mois ou 1 an), payé via Stripe ; renouvelable depuis cet écran
  const subscribe = (plan) => setSubPay(plan);
  const renderOffers = () => (
    <div className="lk-desktop-2col" style={{ marginBottom: 20 }}>
      {[
        { plan: "mensuel", title: tr.subMonthly, price: "49,90 €", per: tr.subPerMonth, badge: null },
        { plan: "annuel", title: tr.subAnnual, price: "499 €", per: tr.subPerYear, badge: tr.subBestOffer },
      ].map(o => (
        <div key={o.plan} className="lk-card" style={{ padding: "22px 20px", border: o.badge ? `2px solid ${T.accent}` : undefined, position: "relative" }}>
          {o.badge && <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: T.accent, color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 20, padding: "4px 12px", whiteSpace: "nowrap" }}>{o.badge}</div>}
          <div style={{ fontWeight: 800, fontSize: 16, color: T.textHi, marginBottom: 6 }}>{o.title}</div>
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontWeight: 900, fontSize: 30, color: T.accent }}>{o.price}</span>
            <span style={{ color: T.textLo, fontSize: 13 }}> {o.per}</span>
          </div>
          {subBenefits.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 7 }}>
              {Icon.check(T.success, 13)}
              <span style={{ fontSize: 12, color: T.textMid, lineHeight: 1.4 }}>{b}</span>
            </div>
          ))}
          <button onClick={() => subscribe(o.plan)} className="lk-btn" style={{ marginTop: 12, fontSize: 13 }}>{tr.subPayNow}</button>
        </div>
      ))}
    </div>
  );
  const renderAbonnement = () => (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi }}>{tr.subTitle}</div>
        <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{tr.subSubtitle}</div>
      </div>
      {isInternalTeam ? (
        <div className="lk-card" style={{ padding: "20px 22px", marginBottom: 16, background: "rgba(201,160,48,.05)", border: `1px solid rgba(201,160,48,.25)` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: T.accent }}>{lang === "en" ? "LOCKR team access" : "Accès équipe LOCKR"}</span>
            <span style={{ background: T.grad, color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 20, padding: "3px 12px" }}>{lang === "en" ? "FREE" : "GRATUIT"}</span>
          </div>
          <div style={{ fontSize: 13, color: T.textMid }}>{lang === "en" ? "This account has unlimited free access to all partner features (internal LOCKR account)." : "Ce compte dispose d'un accès gratuit et illimité à toutes les fonctionnalités partenaire (compte interne LOCKR)."}</div>
        </div>
      ) : subscription ? (
        <div className="lk-card" style={{ padding: "20px 22px", marginBottom: 16, background: "rgba(30,158,107,.04)", border: "1px solid rgba(30,158,107,.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: T.success }}>{tr.subActive}</span>
            <span className="lk-badge-ok">{subscription.plan === "annuel" ? tr.subAnnual : tr.subMonthly}</span>
          </div>
          <div style={{ fontSize: 13, color: T.textMid }}>{tr.subUntil} {fmtDate(subscription.until)}{subscription.paiementDemo ? (fr ? " (démo)" : " (demo)") : ""}</div>
          <div style={{ fontSize: 12, color: T.textLo, marginTop: 6 }}>{fr ? "Prépayé, sans reconduction automatique : prolongez quand vous le souhaitez." : "Prepaid, no automatic renewal: extend whenever you want."}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={() => subscribe("mensuel")} className="lk-ghost" style={{ fontSize: 12 }}>{fr ? "Prolonger d'un mois" : "Extend 1 month"}</button>
            <button onClick={() => subscribe("annuel")} className="lk-ghost" style={{ fontSize: 12 }}>{fr ? "Prolonger d'un an" : "Extend 1 year"}</button>
          </div>
        </div>
      ) : renderOffers()}
    </div>
  );

  /* ── Paywall : section entreprise payante ── */
  const renderPaywall = () => (
    <div>
      <div style={{ textAlign: "center", padding: "28px 16px 8px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Logo height={36} /></div>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi }}>{tr.subPaywallTitle}</div>
        <div style={{ color: T.textMid, fontSize: 13, marginTop: 6, marginBottom: 24 }}>{tr.subPaywallText}</div>
      </div>
      {renderOffers()}
    </div>
  );

  const renderContent = () => {
    if (!approved && !["dashboard", "profil", "documents", "contrat", "lois", "conformite", "fe_part"].includes(view)) {
      return <PendingApprovalCard account={account} setAccounts={setAccounts} lang={lang} />;
    }
    if (!hasPartnerAccess && !["abonnement", "profil", "documents", "dashboard"].includes(view)) return renderPaywall();
    if (view === "dashboard") return renderDashboard();
    if (view === "flotte") return renderFlotte();
    if (view === "missions") return renderMissions();
    if (view === "bons") return renderBons();
    if (view === "techniciens") return renderTechniciens();
    if (view === "rh") return renderRH();
    if (view === "abonnement") return renderAbonnement();
    if (view === "facturation") return renderFacturation();
    if (view === "contrat") return renderContrat();
    if (view === "conformite") return renderConformite();
    if (view === "documents") return renderDocuments();
    if (view === "statistiques") return renderStatistiques();
    if (view === "profil") return renderProfil();
    if (view === "lois") return <PartenaireLoiTab lang={lang} account={account} />;
    if (view === "fe_part") return <FactuElecTab lang={lang} />;
    if (view === "marketplace_part") return <ProMarketplace account={{ ...account, artisanId: account.id, metier: (account.secteurs && account.secteurs[0]) || "serrurier" }} listings={listings} setListings={setListings} sales={sales} setSales={setSales} lang={lang} isPartner />;
    return null;
  };

  const mobileTabs = tabs;
  const currentSubs = tab === "ops_group" ? opsSubs : tab === "gestion_group" ? gestionSubs : tab === "admin_group" ? adminSubs : null;
  const currentSub = tab === "ops_group" ? opsSub : tab === "gestion_group" ? gestionSub : tab === "admin_group" ? adminSub : null;
  const setCurrentSub = tab === "ops_group" ? setOpsSub : tab === "gestion_group" ? setGestionSub : setAdminSub;

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex" }}>
      <style>{CSS}</style>

      {/* SIDEBAR DESKTOP */}
      {isDesktop && (
        <div style={{ width: 220, flexShrink: 0, height: "100vh", position: "sticky", top: 0, background: "#fff", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LockrWordmark height={20} light={false} />
            </div>
          </div>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 2 }}>{account.nom}</div>
            <div style={{ color: approved ? T.accent : T.warn, fontSize: 11, fontWeight: 600 }}>{approved ? tr.partnerCertified : (fr ? "Dossier en cours de validation" : "Application under review")}</div>
            <div style={{ color: T.textLo, fontSize: 10, marginTop: 2 }}>{account.ville}</div>
          </div>
          <div style={{ flex: 1, padding: "10px 10px" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 10, border: "none", background: tab === t.id ? "rgba(201,160,48,.08)" : "transparent", color: tab === t.id ? T.accent : T.textMid, fontWeight: tab === t.id ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", marginBottom: 2 }}>
                {t.icon(tab === t.id ? T.accent : T.textMid, 16)}
                {t.l}
              </button>
            ))}
          </div>
          <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}` }}>
            {setLang && <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} className="lk-ghost" style={{ width: "100%", fontSize: 12, marginBottom: 8 }}>{tr.lang}</button>}
            {openLegal && <button onClick={() => openLegal("mentions")} className="lk-ghost" style={{ width: "100%", fontSize: 12, marginBottom: 8 }}>{fr ? "Centre légal" : "Legal center"}</button>}
            <button onClick={onLogout} className="lk-ghost" style={{ width: "100%", fontSize: 12 }}>{tr.logout}</button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100vh", overflow: "hidden" }}>
        {!isDesktop && (
          <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LockrWordmark height={17} light={false} />
            </div>
            {setLang && <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "4px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer", color: T.textMid }}>{tr.lang}</button>}
            <button onClick={onLogout} style={{ background: "none", border: "none", color: T.textMid, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", padding: "12px 6px", minHeight: 44 }}>{tr.decoShort}</button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: isDesktop ? "28px 32px" : "16px 14px 80px" }}
          onTouchStart={e => !isDesktop && setSwipeTouchX(e.touches[0].clientX)}
          onTouchEnd={e => {
            if (isDesktop) return;
            // Pas de swipe d'onglet sur la carte (le glissement sert à naviguer dessus)
            if (e.target.closest && e.target.closest(".leaflet-container")) return;
            const dx = e.changedTouches[0].clientX - swipeTouchX;
            if (Math.abs(dx) < 60) return;
            const ids = tabs.map(t => t.id);
            const cur = ids.indexOf(tab);
            if (dx < 0 && cur < ids.length - 1) setTab(ids[cur + 1]);
            if (dx > 0 && cur > 0) setTab(ids[cur - 1]);
          }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            {/* Sous-onglets du pôle actif */}
            {currentSubs && (
              <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                {currentSubs.map(sb => (
                  <button key={sb.id} onClick={() => setCurrentSub(sb.id)} style={{ flexShrink: 0, background: currentSub === sb.id ? T.grad : "#fff", color: currentSub === sb.id ? "#fff" : T.textMid, border: currentSub === sb.id ? "none" : `1px solid ${T.border}`, borderRadius: 20, padding: "8px 15px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                    {sb.l}
                  </button>
                ))}
              </div>
            )}
            {renderContent()}
          </div>
        </div>
        {subPay && (
          <PayModal
            amount={SUB_PRICES[subPay]}
            label={subPay === "annuel" ? (fr ? "Abonnement Entreprise LOCKR — 1 an" : "LOCKR Business subscription — 1 year") : (fr ? "Abonnement Entreprise LOCKR — 1 mois" : "LOCKR Business subscription — 1 month")}
            type="abonnement"
            payRef={`sub:${account.id}:${subPay}`}
            plan={subPay}
            lang={lang}
            onSimulated={() => { applyPayment(setters || { setAccounts }, { type: "abonnement", ref: `sub:${account.id}:${subPay}`, demo: true }); }}
            onClose={() => setSubPay(null)}
          />
        )}
        {/* BOTTOM NAV MOBILE */}
        {!isDesktop && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: `1px solid ${T.border}`, display: "flex", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)" }}>
            {mobileTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 4px", border: "none", background: "none", cursor: "pointer", color: tab === t.id ? T.accent : T.textLo, fontFamily: "'Inter',sans-serif" }}>
                {t.icon(tab === t.id ? T.accent : T.textLo, 18)}
                <span style={{ fontSize: 9, fontWeight: tab === t.id ? 700 : 500 }}>{t.l}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── DOCUMENTS LÉGAUX (France métropolitaine / UE) ─── */
const LEGAL_DOCS = {
  fr: [
    {
      id: "mentions", tab: "Mentions légales", title: "Mentions légales",
      sub: "Article 6 de la loi n°2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN)",
      articles: [
        { h: "Éditeur du site", p: "LOCKR SAS — Société par actions simplifiée au capital de 10 000 €. Siège social : 12 rue de la Serrure, 75011 Paris, France. RCS Paris 923 456 789 — SIRET 923 456 789 00012 — TVA intracommunautaire : FR32 923456789. Directeur de la publication : Le Président de LOCKR SAS. Contact : contact@lockr.fr — 01 84 80 00 00." },
        { h: "Hébergement", p: "Le site est hébergé au sein de l'Union européenne par Netlify (représentation UE) et infrastructure conforme RGPD. Les données sont stockées dans des centres de données situés dans l'UE." },
        { h: "Activité", p: "Plateforme de mise en relation entre particuliers/professionnels et artisans certifiés (serrurerie, plomberie, électricité, chauffage) en France métropolitaine. LOCKR agit en qualité d'opérateur de plateforme en ligne au sens de l'article L.111-7 du Code de la consommation." },
        { h: "Assurance", p: "Responsabilité civile professionnelle souscrite auprès d'AXA France IARD, couvrant les activités de la plateforme sur le territoire de la France métropolitaine." },
        { h: "Propriété intellectuelle", p: "L'ensemble du site (structure, textes, logos, graphismes, code source) est protégé par le Code de la propriété intellectuelle. Toute reproduction totale ou partielle sans autorisation écrite est interdite (art. L.122-4 et L.335-2 CPI)." },
        { h: "Signalement de contenus (DSA)", p: "Conformément au Règlement (UE) 2022/2065 sur les services numériques, tout contenu illicite peut être signalé à : signalement@lockr.fr. Point de contact unique DSA : dsa@lockr.fr." },
      ],
    },
    {
      id: "cgu", tab: "CGU", title: "Conditions Générales d'Utilisation",
      sub: "En vigueur au 1er janvier 2026 — applicables à tout utilisateur de la plateforme",
      articles: [
        { h: "Article 1 — Objet", p: "Les présentes CGU régissent l'accès et l'utilisation de la plateforme LOCKR, qui met en relation des clients avec des artisans professionnels vérifiés. L'utilisation de la plateforme vaut acceptation pleine et entière des présentes CGU." },
        { h: "Article 2 — Inscription et compte", p: "L'inscription est ouverte à toute personne majeure disposant de la capacité juridique. L'utilisateur garantit l'exactitude des informations fournies. Les professionnels doivent justifier de leur immatriculation (SIRET), de leur assurance RC Pro et de leurs qualifications. Chaque compte est personnel et non cessible." },
        { h: "Article 3 — Rôle de la plateforme", p: "LOCKR est un intermédiaire technique au sens de l'article L.111-7 du Code de la consommation. Les contrats de prestation sont conclus directement entre le client et l'artisan. LOCKR fournit un classement loyal, clair et transparent des offres (loi n°2016-1321 pour une République numérique)." },
        { h: "Article 4 — Obligations de l'utilisateur", p: "L'utilisateur s'engage à ne pas publier de contenus illicites, à ne pas contourner la plateforme pour éviter les commissions, à respecter les artisans et à fournir des informations sincères. Tout manquement peut entraîner la suspension ou la suppression du compte après mise en demeure." },
        { h: "Article 4 bis — Paiement obligatoire via la plateforme", p: "Toute somme due au titre d'une prestation mise en relation par LOCKR (y compris avec un client non inscrit sur l'application) doit être réglée exclusivement via les moyens de paiement intégrés à la plateforme (paiement en application, lien de paiement sécurisé envoyé par SMS/email, ou QR code de paiement). Il est strictement interdit à l'artisan comme au client de convenir, solliciter ou accepter un règlement en espèces ou par tout autre moyen hors plateforme afin de contourner la commission LOCKR. Ce contournement constitue un manquement grave aux présentes CGU pouvant entraîner, après mise en demeure restée infructueuse : la suspension immédiate du compte, la résiliation définitive, le recouvrement des commissions éludées et, le cas échéant, des poursuites judiciaires. LOCKR se réserve le droit de vérifier la conformité des paiements déclarés clos sur la plateforme." },
        { h: "Article 4 ter — Marketplace entre professionnels", p: "Le prix d'un article acheté sur la marketplace est conservé par LOCKR, via son prestataire de paiement, jusqu'à ce que l'acheteur confirme la réception. Le vendeur reçoit alors le prix diminué de la commission LOCKR de 15 %. Sans confirmation ni signalement de l'acheteur dans les 14 jours suivant le paiement, le versement au vendeur est automatique. En cas de problème signalé (article non reçu, non conforme), LOCKR examine la situation avec les deux parties et décide du versement au vendeur ou du remboursement de l'acheteur." },
        { h: "Article 5 — Avis et notations", p: "Les avis publiés font l'objet d'un contrôle conformément à l'article L.111-7-2 du Code de la consommation et à la norme sur les avis en ligne. Seuls les clients ayant effectivement bénéficié d'une prestation peuvent déposer un avis." },
        { h: "Article 6 — Responsabilité de la plateforme", p: "LOCKR est un intermédiaire technique de mise en relation et n'est PAS partie au contrat de prestation conclu entre le client et l'artisan. LOCKR met en œuvre tous les moyens raisonnables pour assurer la disponibilité du service et la vérification des professionnels référencés (SIRET, assurance RC Pro, qualifications), sans obligation de résultat. La responsabilité de LOCKR ne saurait être engagée au titre de l'exécution, de l'inexécution, de la mauvaise exécution ou des dommages de toute nature résultant de la prestation réalisée par l'artisan, qui en assume seul l'entière responsabilité." },
        { h: "Article 7 — Responsabilité des artisans et recours", p: "L'artisan intervient en qualité de professionnel indépendant, sous sa seule responsabilité. Il est seul responsable de la qualité, de la conformité, des délais et des dommages éventuels liés à ses interventions, couverts par son assurance RC Pro obligatoire (et garantie décennale le cas échéant). Toute réclamation, demande d'indemnisation ou action relative à une prestation doit être dirigée exclusivement contre l'artisan intervenant et son assureur, dont les coordonnées figurent sur le devis et la facture. En acceptant les présentes CGU, l'artisan s'engage à garantir et relever indemne LOCKR de toute condamnation, réclamation ou frais liés à ses interventions. Cette clause ne prive pas le consommateur de ses droits légaux à l'égard du professionnel prestataire." },
        { h: "Article 8 — Droit applicable et litiges", p: "Les présentes CGU sont soumises au droit français. En cas de litige, une solution amiable sera recherchée avant toute action judiciaire. Le consommateur peut recourir gratuitement au médiateur de la consommation (art. L.612-1 C. conso) ou à la plateforme européenne de règlement en ligne des litiges : ec.europa.eu/consumers/odr. L'acceptation des CGU lors de l'inscription est horodatée et conservée à titre de preuve (art. 1366-1367 C. civ. — écrit et signature électroniques)." },
        { h: "Article 9 — Dispositif de sécurité et de qualité pendant l'intervention", p: "Afin de protéger la sécurité des clients et des artisans et de garantir la qualité des échanges, LOCKR peut activer, à l'arrivée de l'artisan sur le lieu d'intervention, un dispositif d'enregistrement audio et d'analyse automatisée (détection de propos inappropriés ou menaçants) associé à la mission en cours. Ce dispositif est signalé à l'écran aux deux parties dès son activation. Base légale : intérêt légitime de LOCKR et des utilisateurs à la sécurité des interventions (art. 6.1.f RGPD), en tenant compte de vos droits et libertés. Les enregistrements et transcriptions sont conservés de façon confidentielle, accessibles uniquement à l'équipe LOCKR habilitée, pour une durée strictement nécessaire au traitement d'un éventuel signalement, puis supprimés. Ils ne sont utilisés que pour l'examen de signalements de comportement inapproprié et jamais à des fins commerciales. Vous pouvez exercer vos droits d'accès, d'opposition ou d'effacement sur ces données auprès de dpo@lockr.fr, sous réserve des durées de conservation légales applicables en cas de procédure en cours." },
      ],
    },
    {
      id: "cgv", tab: "CGV", title: "Conditions Générales de Vente",
      sub: "Code de la consommation — articles L.111-1, L.221-5 et suivants",
      articles: [
        { h: "Article 1 — Prix", p: "Tous les prix affichés sont exprimés en euros toutes taxes comprises (TTC), TVA française applicable. Les prix « À partir de » constituent des tarifs indicatifs minimums ; un devis précis est communiqué avant toute intervention. Aucune intervention n'est facturée sans accord préalable du client sur le prix (arrêté du 24 janvier 2017 relatif aux dépannages)." },
        { h: "Article 2 — Devis obligatoire", p: "Conformément à l'arrêté du 24 janvier 2017, un devis détaillé est obligatoire avant toute prestation de dépannage, réparation et entretien dans le bâtiment : taux horaire, frais de déplacement, pièces, durée estimée. Le devis est gratuit sauf mention contraire expresse." },
        { h: "Article 3 — Paiement", p: "Le paiement s'effectue en ligne de manière sécurisée (prestataire conforme PCI-DSS et DSP2 avec authentification forte 3-D Secure). À la réservation, le montant du devis est réservé sur la carte du client (empreinte bancaire, aucun débit) ; seul le montant final de la facture est prélevé à l'issue de la prestation. La réservation est libérée sans frais en cas d'annulation avant le départ de l'artisan. Si le client annule alors que l'artisan est en route, ou s'il est absent au rendez-vous (après 10 minutes d'attente sur place), un forfait de frais de déplacement, dont le montant est indiqué sur le devis avant la réservation, est dû et prélevé sur la carte enregistrée." },
        { h: "Article 4 — Droit de rétractation", p: "Conformément à l'article L.221-18 du Code de la consommation, le client dispose d'un délai de 14 jours pour se rétracter d'une commande conclue à distance, sans motif ni pénalité. EXCEPTION : le droit de rétractation ne s'applique pas aux travaux d'entretien ou de réparation à réaliser en urgence au domicile du client et expressément sollicités par lui (art. L.221-28 8°), ni aux services pleinement exécutés avant la fin du délai avec accord exprès du client (art. L.221-28 1°). Formulaire de rétractation disponible sur demande à : retractation@lockr.fr." },
        { h: "Article 5 — Garanties légales", p: "Le client bénéficie de la garantie légale de conformité (art. L.217-3 et s. C. conso — 2 ans) et de la garantie des vices cachés (art. 1641 et s. C. civ.) sur les pièces et matériels fournis, ainsi que des garanties applicables aux travaux (parfait achèvement, biennale, décennale le cas échéant — art. 1792 C. civ.)." },
        { h: "Article 6 — Médiation de la consommation", p: "Conformément aux articles L.612-1 et s. du Code de la consommation, en cas de litige non résolu, le client peut saisir gratuitement le médiateur : CNPM Médiation Consommation — 27 avenue de la Libération, 42400 Saint-Chamond — cnpm-mediation-consommation.eu. Plateforme européenne RLL : ec.europa.eu/consumers/odr." },
        { h: "Article 7 — Facturation", p: "Une facture conforme est remise pour toute prestation (mentions obligatoires art. L.441-9 C. com.). Facturation électronique conforme à la réforme 2026 (factur-X / portail public de facturation) pour les transactions B2B." },
      ],
    },
    {
      id: "privacy", tab: "Confidentialité", title: "Politique de confidentialité",
      sub: "Règlement (UE) 2016/679 (RGPD) et loi Informatique et Libertés n°78-17 modifiée",
      articles: [
        { h: "1. Responsable de traitement", p: "LOCKR SAS, 12 rue de la Serrure, 75011 Paris. Délégué à la protection des données (DPO) : dpo@lockr.fr. Le DPO est déclaré auprès de la CNIL." },
        { h: "2. Données collectées et finalités", p: "• Compte et identité (nom, email, téléphone, ville) — exécution du contrat (art. 6.1.b RGPD). • Données de réservation et géolocalisation ponctuelle — exécution du service demandé. • Données de paiement (tokenisées, jamais stockées en clair) — exécution du contrat, obligation légale. • Documents professionnels des artisans (SIRET, Kbis, assurance) — obligation légale de vérification. • Données de navigation/cookies — consentement (art. 6.1.a). • Enregistrements liés à la sécurité des interventions — intérêt légitime, information préalable des personnes." },
        { h: "3. Durées de conservation", p: "Compte actif : durée de la relation + 3 ans après le dernier contact. Factures et pièces comptables : 10 ans (art. L.123-22 C. com.). Données de paiement : durée de la transaction (13 mois max pour la carte avec consentement). Cookies : 13 mois maximum. Logs de connexion : 12 mois (LCEN). À l'issue, les données sont supprimées ou anonymisées." },
        { h: "4. Destinataires", p: "Les données sont destinées aux services habilités de LOCKR, aux artisans concernés par une réservation (données strictement nécessaires), à notre prestataire de paiement agréé et à nos sous-traitants techniques liés par contrat conforme à l'article 28 RGPD. Aucune vente de données à des tiers. Aucun transfert hors UE sans garanties appropriées (clauses contractuelles types)." },
        { h: "5. Vos droits", p: "Vous disposez des droits d'accès, de rectification, d'effacement, de portabilité, de limitation, d'opposition et de retrait du consentement à tout moment (art. 15 à 21 RGPD), ainsi que du droit de définir des directives post-mortem (art. 85 loi I&L). Exercice : dpo@lockr.fr ou depuis votre profil (rubrique « Mes droits RGPD »). Réponse sous 1 mois. Réclamation possible auprès de la CNIL : cnil.fr — 3 place de Fontenoy, 75007 Paris." },
        { h: "6. Sécurité", p: "Chiffrement TLS en transit, chiffrement au repos, contrôle d'accès strict, journalisation, tests réguliers. Notification des violations de données à la CNIL sous 72 h et aux personnes concernées si risque élevé (art. 33-34 RGPD). Mesures alignées sur les référentiels CNIL et ANSSI (directive NIS2)." },
        { h: "7. Mineurs", p: "La plateforme est réservée aux personnes majeures. Aucune collecte volontaire de données de mineurs de moins de 15 ans sans accord parental (art. 45 loi I&L)." },
      ],
    },
    {
      id: "cookies", tab: "Cookies", title: "Politique cookies",
      sub: "Directive ePrivacy 2002/58/CE, art. 82 loi Informatique et Libertés, lignes directrices CNIL",
      articles: [
        { h: "1. Qu'est-ce qu'un cookie ?", p: "Un cookie est un petit fichier déposé sur votre terminal lors de la consultation du site. Certains sont strictement nécessaires au fonctionnement, d'autres nécessitent votre consentement préalable." },
        { h: "2. Cookies utilisés", p: "• Cookies essentiels (session, sécurité, consentement) — exemptés de consentement, durée de session à 13 mois max. • Cookies de mesure d'audience — déposés uniquement avec votre consentement. • Cookies marketing — déposés uniquement avec votre consentement. Aucun cookie tiers publicitaire n'est déposé sans accord explicite." },
        { h: "3. Votre consentement", p: "Votre choix (acceptation, refus, personnalisation) est conservé 6 mois. Refuser les cookies est aussi simple que les accepter (lignes directrices CNIL du 17 septembre 2020). Vous pouvez retirer votre consentement à tout moment via le bouton « Gérer mes cookies » ci-dessous." },
        { h: "4. Paramétrage navigateur", p: "Vous pouvez également configurer votre navigateur pour refuser les cookies. Le refus des cookies essentiels peut dégrader le fonctionnement du service." },
      ],
    },
    {
      id: "retract", tab: "Rétractation", title: "Droit de rétractation",
      sub: "Articles L.221-18 à L.221-28 du Code de la consommation",
      articles: [
        { h: "Délai de 14 jours", p: "Pour tout contrat conclu à distance, vous disposez de 14 jours à compter de la conclusion du contrat (services) ou de la réception (biens) pour vous rétracter sans motif. Le remboursement intervient sous 14 jours par le même moyen de paiement." },
        { h: "Exceptions légales", p: "Le droit de rétractation ne s'applique pas (art. L.221-28) : aux travaux urgents d'entretien ou de réparation réalisés à votre domicile à votre demande expresse (8°) ; aux services pleinement exécutés avant la fin du délai avec votre accord préalable exprès et renoncement exprès au droit de rétractation (1°) ; aux biens confectionnés sur mesure (3°)." },
        { h: "Formulaire type de rétractation", p: "À l'attention de LOCKR SAS, 12 rue de la Serrure, 75011 Paris — retractation@lockr.fr : « Je vous notifie par la présente ma rétractation du contrat portant sur la prestation ci-dessous : Commandé le : ____ / Nom : ____ / Adresse : ____ / Signature (si papier) / Date : ____ ». L'envoi par email suffit ; un accusé de réception vous sera adressé sans délai." },
      ],
    },
  ],
  en: [
    {
      id: "mentions", tab: "Legal notice", title: "Legal notice",
      sub: "Article 6 of French law no. 2004-575 of 21 June 2004 (LCEN)",
      articles: [
        { h: "Publisher", p: "LOCKR SAS — French simplified joint-stock company with capital of €10,000. Registered office: 12 rue de la Serrure, 75011 Paris, France. Paris Trade Register (RCS) 923 456 789 — VAT: FR32 923456789. Publishing director: the President of LOCKR SAS. Contact: contact@lockr.fr — +33 1 84 80 00 00." },
        { h: "Hosting", p: "The site is hosted within the European Union with GDPR-compliant infrastructure. Data is stored in EU-based data centres." },
        { h: "Activity", p: "Online platform connecting clients with certified craftsmen (locksmithing, plumbing, electricity, heating) in metropolitan France, operating as an online platform operator within the meaning of article L.111-7 of the French Consumer Code." },
        { h: "Insurance", p: "Professional liability insurance held with AXA France IARD, covering platform activities across metropolitan France." },
        { h: "Intellectual property", p: "The entire site (structure, texts, logos, graphics, source code) is protected by the French Intellectual Property Code. Any reproduction without prior written authorisation is prohibited." },
        { h: "Illegal content reporting (DSA)", p: "In accordance with Regulation (EU) 2022/2065 (Digital Services Act), illegal content may be reported to: signalement@lockr.fr. Single DSA contact point: dsa@lockr.fr." },
      ],
    },
    {
      id: "cgu", tab: "Terms of Use", title: "Terms of Use",
      sub: "Effective 1 January 2026 — applicable to all platform users",
      articles: [
        { h: "Article 1 — Purpose", p: "These Terms govern access to and use of the LOCKR platform, which connects clients with verified professional craftsmen. Using the platform constitutes full acceptance of these Terms." },
        { h: "Article 2 — Registration", p: "Registration is open to adults with legal capacity. Users guarantee the accuracy of the information provided. Professionals must prove their registration (SIRET), professional liability insurance and qualifications. Accounts are personal and non-transferable." },
        { h: "Article 3 — Role of the platform", p: "LOCKR is a technical intermediary within the meaning of article L.111-7 of the French Consumer Code. Service contracts are concluded directly between the client and the craftsman. LOCKR provides fair, clear and transparent ranking of offers." },
        { h: "Article 4 — User obligations", p: "Users undertake not to publish illegal content, not to bypass the platform to avoid commissions, to respect craftsmen and to provide truthful information. Any breach may lead to suspension or deletion of the account after formal notice." },
        { h: "Article 4 bis — Mandatory payment via the platform", p: "Any amount owed for a service arranged via LOCKR (including with a client not registered on the app) must be paid exclusively through the platform's integrated payment methods (in-app payment, secure payment link sent by SMS/email, or payment QR code). Craftsmen and clients are strictly prohibited from agreeing to, requesting, or accepting cash payment or any other off-platform method to bypass the LOCKR commission. Such circumvention is a serious breach of these Terms and may lead, after unsuccessful formal notice, to immediate account suspension, permanent termination, recovery of evaded commissions and, where applicable, legal action. LOCKR reserves the right to verify the compliance of payments declared as completed on the platform." },
        { h: "Article 4 ter — Marketplace between professionals", p: "The price of an item bought on the marketplace is held by LOCKR, through its payment provider, until the buyer confirms receipt. The seller then receives the price minus LOCKR's 15% commission. Without confirmation or report from the buyer within 14 days of payment, the seller is paid automatically. If a problem is reported (item not received or not as described), LOCKR reviews the case with both parties and decides whether to pay the seller or refund the buyer." },
        { h: "Article 5 — Reviews", p: "Published reviews are moderated in accordance with article L.111-7-2 of the French Consumer Code. Only clients who actually received a service may post a review." },
        { h: "Article 6 — Platform liability", p: "LOCKR is a technical connecting intermediary and is NOT a party to the service contract concluded between the client and the craftsman. LOCKR uses all reasonable means to ensure service availability and verification of listed professionals (SIRET, liability insurance, qualifications), without an obligation of result. LOCKR shall not be liable for the performance, non-performance, poor performance or any damage resulting from the service carried out by the craftsman, who bears sole and full responsibility." },
        { h: "Article 7 — Craftsmen's liability and recourse", p: "The craftsman acts as an independent professional under his sole responsibility. He is solely liable for the quality, compliance, deadlines and any damage related to his interventions, covered by his mandatory professional liability insurance (and 10-year guarantee where applicable). Any claim, compensation request or action relating to a service must be directed exclusively against the intervening craftsman and his insurer, whose details appear on the quote and invoice. By accepting these Terms, the craftsman undertakes to indemnify and hold LOCKR harmless against any judgment, claim or costs related to his interventions. This clause does not deprive consumers of their statutory rights against the service provider." },
        { h: "Article 8 — Governing law and disputes", p: "These Terms are governed by French law. Consumers may use the free consumer mediation service (art. L.612-1) or the EU online dispute resolution platform: ec.europa.eu/consumers/odr. Acceptance of the Terms at registration is time-stamped and stored as evidence (art. 1366-1367 French Civil Code — electronic writing and signature)." },
        { h: "Article 9 — Safety and quality monitoring during interventions", p: "To protect the safety of clients and craftsmen and to ensure quality of service, LOCKR may activate, when the craftsman arrives on site, an audio recording and automated analysis device (detection of inappropriate or threatening language) linked to the ongoing mission. This device is disclosed on screen to both parties as soon as it is activated. Legal basis: legitimate interest of LOCKR and its users in the safety of interventions (art. 6.1.f GDPR), balanced against your rights and freedoms. Recordings and transcripts are kept confidential, accessible only to authorised LOCKR staff, for the time strictly necessary to review any report, then deleted. They are used solely to review reports of inappropriate behaviour and never for commercial purposes. You may exercise your rights of access, objection or erasure over this data at dpo@lockr.fr, subject to legal retention periods applicable to ongoing proceedings." },
      ],
    },
    {
      id: "cgv", tab: "Terms of Sale", title: "Terms of Sale",
      sub: "French Consumer Code — articles L.111-1, L.221-5 et seq.",
      articles: [
        { h: "Article 1 — Prices", p: "All prices are in euros, all taxes included (TTC). \"From\" prices are indicative minimums; a precise quote is provided before any intervention. No work is invoiced without the client's prior agreement on price (Order of 24 January 2017 on repair services)." },
        { h: "Article 2 — Mandatory quote", p: "In accordance with the Order of 24 January 2017, a detailed quote is mandatory before any building repair or maintenance service: hourly rate, travel costs, parts, estimated duration. Quotes are free unless expressly stated otherwise." },
        { h: "Article 3 — Payment", p: "Payment is made securely online (PCI-DSS compliant provider, PSD2 strong customer authentication / 3-D Secure). At booking, the quote amount is held on the client's card (no charge); only the final invoice amount is charged after the service. The hold is released free of charge if the booking is cancelled before the craftsman leaves. If the client cancels while the craftsman is on the way, or is absent at the appointment (after 10 minutes of waiting on site), a fixed travel fee, shown on the quote before booking, is due and charged to the registered card." },
        { h: "Article 4 — Right of withdrawal", p: "Under article L.221-18 of the French Consumer Code, clients have 14 days to withdraw from a distance contract without reason or penalty. EXCEPTIONS: urgent repair or maintenance work at the client's home expressly requested by them (art. L.221-28 8°), and services fully performed before the end of the period with the client's express prior consent (art. L.221-28 1°). Withdrawal form available at: retractation@lockr.fr." },
        { h: "Article 5 — Legal guarantees", p: "Clients benefit from the legal guarantee of conformity (2 years) and the guarantee against hidden defects on supplied parts, as well as construction guarantees where applicable (perfect completion, 2-year, 10-year — art. 1792 French Civil Code)." },
        { h: "Article 6 — Consumer mediation", p: "In accordance with articles L.612-1 et seq., unresolved disputes may be submitted free of charge to the consumer mediator: CNPM Médiation Consommation — cnpm-mediation-consommation.eu. EU ODR platform: ec.europa.eu/consumers/odr." },
        { h: "Article 7 — Invoicing", p: "A compliant invoice is issued for every service. Electronic invoicing complies with the French 2026 reform (Factur-X / public invoicing portal) for B2B transactions." },
      ],
    },
    {
      id: "privacy", tab: "Privacy", title: "Privacy policy",
      sub: "Regulation (EU) 2016/679 (GDPR) and French Data Protection Act no. 78-17",
      articles: [
        { h: "1. Data controller", p: "LOCKR SAS, 12 rue de la Serrure, 75011 Paris. Data Protection Officer (DPO): dpo@lockr.fr, declared to the CNIL." },
        { h: "2. Data collected and purposes", p: "• Account and identity data — contract performance (art. 6.1.b GDPR). • Booking data and one-off geolocation — performance of the requested service. • Payment data (tokenised, never stored in clear text) — contract performance, legal obligation. • Craftsmen's professional documents — legal verification obligation. • Browsing data/cookies — consent (art. 6.1.a). • Intervention-safety recordings — legitimate interest, with prior information." },
        { h: "3. Retention periods", p: "Active account: relationship duration + 3 years after last contact. Invoices and accounting records: 10 years. Card data: transaction duration (13 months max with consent). Cookies: 13 months maximum. Connection logs: 12 months (LCEN). Data is then deleted or anonymised." },
        { h: "4. Recipients", p: "Data is shared only with authorised LOCKR staff, the craftsman concerned by a booking (strictly necessary data), our licensed payment provider and technical processors bound by art. 28 GDPR contracts. No data sales. No transfers outside the EU without appropriate safeguards." },
        { h: "5. Your rights", p: "You have the rights of access, rectification, erasure, portability, restriction, objection and withdrawal of consent at any time (art. 15–21 GDPR). Exercise via dpo@lockr.fr or your profile (\"My GDPR rights\"). Response within 1 month. Complaints: CNIL — cnil.fr." },
        { h: "6. Security", p: "TLS encryption in transit, encryption at rest, strict access control, logging, regular testing. Data-breach notification to the CNIL within 72 hours (art. 33-34 GDPR). Measures aligned with CNIL and ANSSI standards (NIS2 directive)." },
        { h: "7. Minors", p: "The platform is restricted to adults. No deliberate collection of data from children under 15 without parental consent." },
      ],
    },
    {
      id: "cookies", tab: "Cookies", title: "Cookie policy",
      sub: "ePrivacy Directive 2002/58/EC, art. 82 French Data Protection Act, CNIL guidelines",
      articles: [
        { h: "1. What is a cookie?", p: "A cookie is a small file stored on your device when browsing the site. Some are strictly necessary; others require your prior consent." },
        { h: "2. Cookies used", p: "• Essential cookies (session, security, consent) — exempt from consent, max 13 months. • Audience-measurement cookies — only with your consent. • Marketing cookies — only with your consent. No third-party advertising cookie is set without explicit agreement." },
        { h: "3. Your consent", p: "Your choice (accept, refuse, customise) is stored for 6 months. Refusing cookies is as easy as accepting them (CNIL guidelines of 17 September 2020). You may withdraw consent at any time via the \"Manage my cookies\" button below." },
        { h: "4. Browser settings", p: "You can also configure your browser to refuse cookies. Refusing essential cookies may degrade the service." },
      ],
    },
    {
      id: "retract", tab: "Withdrawal", title: "Right of withdrawal",
      sub: "Articles L.221-18 to L.221-28 of the French Consumer Code",
      articles: [
        { h: "14-day period", p: "For any distance contract, you have 14 days from the conclusion of the contract (services) or receipt (goods) to withdraw without giving any reason. Refunds are issued within 14 days using the same payment method." },
        { h: "Legal exceptions", p: "The right of withdrawal does not apply (art. L.221-28) to: urgent maintenance or repair work carried out at your home at your express request (8°); services fully performed before the end of the period with your express prior consent and waiver (1°); custom-made goods (3°)." },
        { h: "Model withdrawal form", p: "To LOCKR SAS, 12 rue de la Serrure, 75011 Paris — retractation@lockr.fr: \"I hereby notify my withdrawal from the contract for the service below: Ordered on: ____ / Name: ____ / Address: ____ / Signature (if paper) / Date: ____\". Email is sufficient; an acknowledgement will be sent without delay." },
      ],
    },
  ],
};

/* ─── COOKIE CONSENT ─── */
function CookieConsent({ lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [visible, setVisible] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("lk_cookie_consent") || "null");
      // Consentement valable 6 mois (recommandation CNIL), re-demandé ensuite
      if (!saved || !saved.ts || Date.now() - saved.ts > 182 * 24 * 3600 * 1000) return true;
      return false;
    } catch { return true; }
  });
  // Ré-ouverture depuis le Centre légal (« Gérer mes cookies » — retrait du consentement, art. 7.3 RGPD)
  useEffect(() => {
    const reopen = () => setVisible(true);
    window.addEventListener("lk-open-cookies", reopen);
    return () => window.removeEventListener("lk-open-cookies", reopen);
  }, []);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const save = (all) => {
    localStorage.setItem("lk_cookie_consent", JSON.stringify({ essential: true, analytics: all || analytics, marketing: all || marketing, ts: Date.now() }));
    setVisible(false);
  };

  if (!visible) return null;
  return createPortal(
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999, background: "rgba(0,0,0,.55)", backdropFilter: "blur(6px)", padding: "0 0 env(safe-area-inset-bottom)" }}>
      <div style={{ background: "#fff", borderRadius: "18px 18px 0 0", padding: "22px 20px 18px", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: T.textHi, marginBottom: 8 }}>{tr.cookieTitle}</div>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 16, lineHeight: 1.5 }}>{tr.cookieText}</div>
        {customize && (
          <div style={{ marginBottom: 16 }}>
            {[
              { key: "essential", label: tr.cookieEssential, desc: tr.cookieEssentialDesc, locked: true, val: true },
              { key: "analytics", label: tr.cookieAnalytics, desc: tr.cookieAnalyticsDesc, locked: false, val: analytics, set: setAnalytics },
              { key: "marketing", label: tr.cookieMarketing, desc: tr.cookieMarketingDesc, locked: false, val: marketing, set: setMarketing },
            ].map(c => (
              <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: T.textLo }}>{c.desc}</div>
                </div>
                <div onClick={() => !c.locked && c.set && c.set(v => !v)} style={{ width: 40, height: 22, borderRadius: 11, background: c.val ? T.success : "rgba(0,0,0,.15)", position: "relative", cursor: c.locked ? "default" : "pointer", flexShrink: 0, marginLeft: 12, transition: "background .2s" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: c.val ? 20 : 2, transition: "left .2s" }} />
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => save(true)} className="lk-btn" style={{ flex: "1 1 140px", fontSize: 12 }}>{tr.cookieAcceptAll}</button>
          {customize
            ? <button onClick={() => save(false)} className="lk-ghost" style={{ flex: "1 1 120px", fontSize: 12 }}>{tr.cookieSavePrefs}</button>
            : <button onClick={() => setCustomize(true)} className="lk-ghost" style={{ flex: "1 1 120px", fontSize: 12 }}>{tr.cookieCustomize}</button>
          }
          <button onClick={() => save(false)} style={{ background: "none", border: "none", color: T.textLo, fontSize: 11, cursor: "pointer", fontFamily: "'Inter',sans-serif", flex: "0 0 auto", alignSelf: "center", padding: "12px 6px", minHeight: 44 }}>{tr.cookieRejectAll}</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: T.textLo, textAlign: "center" }}>
          {tr.legalFooter}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── CENTRE LÉGAL — documents complets FR/UE ─── */
function LegalCenterModal({ lang = "fr", onClose, initialTab = "mentions" }) {
  const docs = LEGAL_DOCS[lang] || LEGAL_DOCS.fr;
  const [tab, setTab] = useState(initialTab);
  const doc = docs.find(d => d.id === tab) || docs[0];

  const manageCookies = () => {
    localStorage.removeItem("lk_cookie_consent");
    window.dispatchEvent(new Event("lk-open-cookies"));
    onClose();
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 8000, background: "rgba(0,0,0,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", maxWidth: 720, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* En-tête */}
        <div style={{ padding: "18px 20px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LockrLogo size={22} />
              <span style={{ fontWeight: 800, fontSize: 16, color: T.textHi }}>{lang === "en" ? "Legal center" : "Centre légal"}</span>
            </div>
            <button onClick={onClose} style={{ background: "rgba(0,0,0,.05)", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 14, color: T.textMid, fontFamily: "'Inter',sans-serif" }}>✕</button>
          </div>
          {/* Onglets */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, WebkitOverflowScrolling: "touch" }}>
            {docs.map(d => (
              <button key={d.id} onClick={() => setTab(d.id)} style={{ flexShrink: 0, background: tab === d.id ? T.grad : "rgba(0,0,0,.04)", color: tab === d.id ? "#fff" : T.textMid, border: "none", borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", transition: "all .15s" }}>
                {d.tab}
              </button>
            ))}
          </div>
        </div>
        {/* Contenu */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 28px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: T.textHi, marginBottom: 4 }}>{doc.title}</div>
          <div style={{ fontSize: 11, color: T.accent, fontWeight: 600, marginBottom: 18, lineHeight: 1.5 }}>{doc.sub}</div>
          {doc.articles.map((a, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 5, paddingLeft: 10, borderLeft: `3px solid ${T.accent}` }}>{a.h}</div>
              <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.7, textAlign: "justify" }}>{a.p}</div>
            </div>
          ))}
          {tab === "cookies" && (
            <button onClick={manageCookies} className="lk-btn" style={{ width: "100%", marginTop: 6, fontSize: 13 }}>
              {lang === "en" ? "Manage my cookies" : "Gérer mes cookies"}
            </button>
          )}
          <div style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${T.border}`, fontSize: 10.5, color: T.textLo, textAlign: "center", lineHeight: 1.6 }}>
            © {new Date().getFullYear()} LOCKR SAS — {lang === "en" ? "All rights reserved. Documents last updated on 01/01/2026." : "Tous droits réservés. Documents mis à jour le 01/01/2026."}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── ADMIN PRIORITÉS — ordre de dispatch des techniciens ─── */
function AdminPrioritesTab({ lang = "fr", accounts, bons, priorityOrder, setPriorityOrder }) {
  const fr = lang !== "en";
  const MAX = 15;
  // Techniciens disponibles (pros validés)
  const pros = accounts.filter(a => a.role === "pro" && (a.dossierStatus || "approved") === "approved");
  const byArtisanId = Object.fromEntries(pros.map(p => [p.artisanId, p]));
  const available = pros.filter(p => !priorityOrder.includes(p.artisanId));

  // Tick pour rafraîchir les comptes à rebours du suivi live
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const add = (artisanId) => {
    if (priorityOrder.length >= MAX) return;
    setPriorityOrder([...priorityOrder, artisanId]);
  };
  const remove = (artisanId) => setPriorityOrder(priorityOrder.filter(id => id !== artisanId));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= priorityOrder.length) return;
    const next = [...priorityOrder];
    [next[i], next[j]] = [next[j], next[i]];
    setPriorityOrder(next);
  };

  const fmtMs = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  // Bons plateforme en cours de dispatch
  const activeBons = bons.filter(b => b.postedBy === "platform" && !isDemoRecord(b));

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 4 }}>{fr ? "Ordre de priorité des techniciens" : "Technician priority order"}</div>
      <div style={{ color: T.textLo, fontSize: 12, marginBottom: 20 }}>
        {fr
          ? `Jusqu'à ${MAX} techniciens. Les interventions LOCKR sont réservées exclusivement aux artisans de cette liste : proposées au n°1 pendant 2 minutes, puis défilent au suivant. Après le tour complet, elles restent visibles par tous les artisans de la liste (jamais les autres).`
          : `Up to ${MAX} technicians. LOCKR interventions are reserved exclusively for artisans on this list: offered to #1 for 2 minutes, then moving to the next. After a full cycle, they remain visible to all listed artisans (never others).`}
      </div>

      {/* Liste ordonnée */}
      <div className="lk-card" style={{ padding: "18px 20px", marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>
          {fr ? "File de priorité" : "Priority queue"} ({priorityOrder.length}/{MAX})
        </div>
        {priorityOrder.length === 0 && (
          <div style={{ color: T.textLo, fontSize: 12, padding: "10px 0" }}>
            {fr ? "Aucun technicien prioritaire — les bons sont visibles par tous immédiatement." : "No priority technician — interventions are visible to everyone immediately."}
          </div>
        )}
        {priorityOrder.map((aid, i) => {
          const p = byArtisanId[aid];
          return (
            <div key={aid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < priorityOrder.length - 1 ? "1px solid rgba(0,0,0,.05)" : "none" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: i === 0 ? T.grad : "rgba(0,0,0,.06)", color: i === 0 ? "#fff" : T.textMid, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{p ? p.nom : aid}</div>
                <div style={{ fontSize: 11, color: T.textLo }}>{p ? `${p.ville || ""}` : (fr ? "Technicien introuvable" : "Technician not found")}</div>
              </div>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="lk-ghost" style={{ padding: "5px 9px", fontSize: 12, opacity: i === 0 ? 0.3 : 1 }}>▲</button>
              <button onClick={() => move(i, 1)} disabled={i === priorityOrder.length - 1} className="lk-ghost" style={{ padding: "5px 9px", fontSize: 12, opacity: i === priorityOrder.length - 1 ? 0.3 : 1 }}>▼</button>
              <button onClick={() => remove(aid)} style={{ background: "rgba(220,38,38,.08)", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: T.danger, fontSize: 11, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>{fr ? "Retirer" : "Remove"}</button>
            </div>
          );
        })}
      </div>

      {/* Ajouter un technicien */}
      <div className="lk-card" style={{ padding: "18px 20px", marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{fr ? "Ajouter un technicien" : "Add a technician"}</div>
        {available.length === 0 && <div style={{ color: T.textLo, fontSize: 12 }}>{fr ? "Tous les techniciens validés sont déjà dans la file." : "All approved technicians are already in the queue."}</div>}
        {available.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,.04)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: T.textHi }}>{p.nom}</div>
              <div style={{ fontSize: 11, color: T.textLo }}>{p.ville || ""}</div>
            </div>
            <button onClick={() => add(p.artisanId)} disabled={priorityOrder.length >= MAX}
              style={{ background: priorityOrder.length >= MAX ? "rgba(0,0,0,.06)" : "rgba(201,160,48,.1)", border: `1px solid ${priorityOrder.length >= MAX ? "transparent" : "rgba(201,160,48,.35)"}`, borderRadius: 8, padding: "6px 12px", cursor: priorityOrder.length >= MAX ? "default" : "pointer", color: priorityOrder.length >= MAX ? T.textLo : T.accent, fontSize: 11, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>
              + {fr ? "Ajouter" : "Add"}
            </button>
          </div>
        ))}
        {priorityOrder.length >= MAX && <div style={{ color: T.warn, fontSize: 11, marginTop: 8 }}>{fr ? `Limite de ${MAX} techniciens atteinte.` : `Limit of ${MAX} technicians reached.`}</div>}
      </div>

      {/* Suivi live du dispatch */}
      {priorityOrder.length > 0 && (
        <div className="lk-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{fr ? "Dispatch en cours" : "Live dispatch"}</div>
          {activeBons.length === 0 && <div style={{ color: T.textLo, fontSize: 12 }}>{fr ? "Aucune intervention en attente." : "No pending intervention."}</div>}
          {activeBons.map(b => {
            const st = dispatchState(b, priorityOrder);
            const cur = st.current ? byArtisanId[st.current] : null;
            return (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,.04)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: T.textHi }}>{b.titre}</div>
                  <div style={{ fontSize: 11, color: T.textLo }}>{b.region} · {fmt(b.montantEstime)}</div>
                </div>
                {st.open ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.textMid, background: "rgba(0,0,0,.05)", borderRadius: 8, padding: "5px 10px" }}>{fr ? "Visible par toute la liste" : "Visible to whole list"}</span>
                ) : (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>→ n°{st.idx + 1} {cur ? cur.nom : ""}</div>
                    <div style={{ fontSize: 11, color: T.textLo }}>{fr ? "défile dans" : "moves on in"} {fmtMs(st.remaining)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── ADMIN DIGITAL CONFORMITE TAB ─── */
function AdminDigitalConformiteTab({ lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const laws = tr.digitalLaws || [];
  const [checks, setChecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem("lk_admin_digital_checks") || "{}"); } catch { return {}; }
  });
  const toggle = (lawId, idx) => {
    setChecks(prev => {
      const key = `${lawId}_${idx}`;
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("lk_admin_digital_checks", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const totalItems = laws.reduce((s, l) => s + l.items.length, 0);
  const checkedCount = Object.values(checks).filter(Boolean).length;
  const score = totalItems ? Math.round((checkedCount / totalItems) * 100) : 0;
  const scoreColor = score >= 80 ? T.success : score >= 50 ? T.warn : T.danger;

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 4 }}>{tr.digitalConformiteTitle}</div>
      <div style={{ color: T.textLo, fontSize: 12, marginBottom: 20 }}>Suivi de conformité aux lois numériques françaises et européennes</div>

      {/* Score global */}
      <div className="lk-card" style={{ padding: "20px 22px", marginBottom: 20, background: score >= 80 ? "rgba(30,158,107,.04)" : score >= 50 ? "rgba(217,119,6,.04)" : "rgba(220,38,38,.04)", border: `1px solid ${scoreColor}30` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{tr.digitalConformiteScore}</span>
          <span style={{ fontWeight: 900, fontSize: 28, color: scoreColor }}>{score}%</span>
        </div>
        <div style={{ height: 8, background: "rgba(0,0,0,.06)", borderRadius: 4 }}>
          <div style={{ height: "100%", width: `${score}%`, background: scoreColor, borderRadius: 4, transition: "width .4s" }} />
        </div>
        <div style={{ fontSize: 11, color: T.textLo, marginTop: 6 }}>{checkedCount} / {totalItems} points couverts</div>
      </div>

      {/* Sections par loi */}
      {laws.map(law => {
        const lawChecked = law.items.filter((_, i) => checks[`${law.id}_${i}`]).length;
        const lawScore = Math.round((lawChecked / law.items.length) * 100);
        return (
          <div key={law.id} className="lk-card" style={{ padding: "18px 20px", marginBottom: 14, borderLeft: `4px solid ${law.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ flex: 1, paddingRight: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 3 }}>{law.label}</div>
                <div style={{ fontSize: 11, color: T.textMid, lineHeight: 1.5 }}>{law.desc}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: lawScore >= 80 ? T.success : lawScore >= 50 ? T.warn : T.danger }}>{lawScore}%</div>
                <div style={{ fontSize: 10, color: T.textLo }}>{lawChecked}/{law.items.length}</div>
              </div>
            </div>
            <div style={{ height: 4, background: "rgba(0,0,0,.06)", borderRadius: 2, marginBottom: 12 }}>
              <div style={{ height: "100%", width: `${lawScore}%`, background: law.color, borderRadius: 2, transition: "width .3s" }} />
            </div>
            {law.items.map((item, i) => (
              <div key={i} onClick={() => toggle(law.id, i)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < law.items.length - 1 ? "1px solid rgba(0,0,0,.04)" : "none", cursor: "pointer" }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${checks[`${law.id}_${i}`] ? law.color : "rgba(0,0,0,.18)"}`, background: checks[`${law.id}_${i}`] ? law.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                  {checks[`${law.id}_${i}`] && <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span style={{ fontSize: 12, color: checks[`${law.id}_${i}`] ? T.textMid : T.textHi, textDecoration: checks[`${law.id}_${i}`] ? "line-through" : "none", lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ─── PAIEMENTS EN DÉMONSTRATION ───
   En production, c'est le serveur (fonctions Netlify) qui enregistre les
   paiements après vérification auprès de Stripe. En démonstration, cette
   fonction reproduit localement le même résultat.
   Types : empreinte (carte enregistrée), capture (débit de l'empreinte),
   liberation (empreinte libérée), prestation (facture réglée), marketplace,
   abonnement. */
function applyPayment({ setBookings, setAccounts, setSales, setListings }, { type, ref, amount = 0, demo = true }) {
  if (!ref) return;
  const stamp = { payeLe: ts(), ...(demo ? { paiementDemo: true } : {}) };
  if (type === "abonnement" && setAccounts) {
    const [, accountId, plan] = String(ref).split(":");
    const days = plan === "annuel" ? 365 : 30;
    setAccounts(p => p.map(a => {
      if (a.id !== accountId) return a;
      const base = a.subscription?.until && new Date(a.subscription.until) > new Date() ? new Date(a.subscription.until) : new Date();
      return { ...a, subscription: { plan: plan || "mensuel", since: a.subscription?.since || ts(), until: new Date(base.getTime() + days * 86400000).toISOString(), ...stamp } };
    }));
    return;
  }
  if (type === "marketplace" && setSales) {
    let listingId = null;
    setSales(p => p.map(sv => {
      if (sv.id !== ref) return sv;
      listingId = sv.listingId;
      return sv.statut === "payée" ? sv : { ...sv, statut: "payée", ...stamp, liberationAuto: new Date(Date.now() + MARKETPLACE_RELEASE_DAYS * 86400000).toISOString() };
    }));
    // listingId est connu après l'exécution de la mise à jour ci-dessus
    setTimeout(() => { if (listingId && setListings) setListings(p => p.map(l => l.id === listingId ? { ...l, sold: true } : l)); }, 0);
    return;
  }
  if (!setBookings) return;
  setBookings(p => p.map(b => {
    if (b.id !== ref) return b;
    if (type === "empreinte") {
      return { ...b, statut: b.statut === "en_attente_paiement" ? "assignée" : b.statut, empreinte: { statut: "autorisée", montant: bookingTotal(b), autoriseeLe: ts(), demo: true } };
    }
    if (type === "liberation") {
      return b.empreinte ? { ...b, empreinte: { ...b.empreinte, statut: "libérée", libereeLe: ts() } } : b;
    }
    if (type === "capture") {
      const debit = Math.round((Number(amount) || 0) * 100) / 100;
      const encaisse = montantEncaisse(b) + debit;
      const nb = { ...b, montantEncaisse: encaisse, empreinte: { ...b.empreinte, statut: "débitée", debite: debit, debiteeLe: ts() } };
      return resteAPayer(nb) <= 0.009 ? { ...nb, statutPaiement: "payé", ...stamp } : nb;
    }
    // prestation / lien_client : règlement de la facture finale
    return { ...b, statutPaiement: "payé", ...stamp };
  }));
}

/* ─── MODALE DE PAIEMENT ───
   Aucune saisie de carte dans l'application (exigence PCI-DSS) : le client
   est redirigé vers la page sécurisée Stripe (3-D Secure). Le montant est
   recalculé par le serveur à partir de la base.
   • Démonstration → paiement simulé (clairement indiqué) ;
   • paiement en ligne indisponible → message clair (+ « continuer » si prévu). */
function PayModal({ amount, label, type = "prestation", payRef, plan, onSimulated, onUnavailable, onClose, lang = "fr" }) {
  const fr = lang !== "en";
  const demo = IS_DEMO;
  const isHold = type === "empreinte";
  const [step, setStep] = useState("summary"); // summary | loading | demo | unavailable | done
  const pay = async () => {
    setStep("loading");
    if (demo) { setStep("demo"); return; }
    const started = await startStripeCheckout({ type, ref: payRef, plan });
    if (started) return; // redirection vers Stripe en cours
    setStep("unavailable");
  };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 10010, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease", fontFamily: "'Inter',sans-serif" }}>
        <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: T.textHi, letterSpacing: "-1px" }}>{fmt(amount)}</div>
            <div style={{ color: T.textLo, fontSize: 13, marginTop: 3 }}>{label}</div>
          </div>
          {step !== "loading" && <button onClick={onClose} className="lk-ghost" style={{ padding: "7px 12px" }} aria-label={fr ? "Fermer" : "Close"}>{Icon.x()}</button>}
        </div>
        {step === "summary" && (
          <>
            <div style={{ background: "rgba(30,158,107,.06)", border: "1px solid rgba(30,158,107,.18)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
              {isHold && (
                <div style={{ width: "100%", fontSize: 12, color: T.textMid, lineHeight: 1.5, marginBottom: 4 }}>
                  {fr ? "Aucun débit maintenant : ce montant est seulement réservé sur votre carte. Seul le montant final de la facture sera prélevé après l'intervention." : "No charge now: this amount is only held on your card. Only the final invoice amount will be charged after the intervention."}
                </div>
              )}
              {(["empreinte", "prestation", "lien_client"].includes(type)
                ? (fr ? ["✓ Paiement sécurisé 3-D Secure", "✓ Devis avant travaux", "✓ Artisan vérifié et assuré", "✓ Reçu par e-mail"] : ["✓ 3-D Secure payment", "✓ Quote before work", "✓ Verified, insured craftsman", "✓ Receipt by e-mail"])
                : (fr ? ["✓ Paiement sécurisé 3-D Secure", "✓ Reçu par e-mail"] : ["✓ 3-D Secure payment", "✓ Receipt by e-mail"])).map((g, i) => (
                <span key={i} style={{ fontSize: 11, color: T.success, fontWeight: 700 }}>{g}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
              {["visa", "mastercard", "cb", "apple", "google"].map(id => <PayLogo key={id} id={id} size={38} />)}
            </div>
            <button onClick={pay} className="lk-btn" style={{ marginBottom: 10 }}>{Icon.card("#fff", 16)} {isHold ? (fr ? "Enregistrer ma carte" : "Register my card") : (fr ? `Payer ${fmt(amount)} par carte` : `Pay ${fmt(amount)} by card`)}</button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: T.textLo, fontSize: 11 }}>
              {Icon.shield(T.success, 12)} {fr ? "Vous êtes redirigé vers la page sécurisée de notre prestataire Stripe." : "You are redirected to our provider Stripe's secure page."}
            </div>
          </>
        )}
        {step === "loading" && (
          <div style={{ textAlign: "center", padding: "36px 0" }}>
            <div style={{ width: 48, height: 48, border: "3px solid rgba(0,0,0,.06)", borderTop: `3px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 14px" }} />
            <div style={{ color: T.textMid, fontSize: 14 }}>{fr ? "Ouverture du paiement sécurisé…" : "Opening secure payment…"}</div>
          </div>
        )}
        {step === "demo" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ background: "rgba(217,119,6,.07)", border: "1px solid rgba(217,119,6,.25)", borderRadius: 12, padding: "12px 14px", color: T.warn, fontSize: 12.5, lineHeight: 1.5, marginBottom: 16, textAlign: "left" }}>
              {fr ? "Mode démonstration : le paiement en ligne n'est pas activé. Aucun montant ne sera débité." : "Demo mode: online payment is not enabled. Nothing will be charged."}
            </div>
            <button onClick={() => { setStep("done"); onSimulated && onSimulated(); }} className="lk-btn" style={{ marginBottom: 10 }}>{isHold ? (fr ? "Simuler l'enregistrement de la carte" : "Simulate card registration") : (fr ? "Simuler le paiement" : "Simulate payment")}</button>
            <button onClick={onClose} className="lk-ghost" style={{ width: "100%" }}>{fr ? "Annuler" : "Cancel"}</button>
          </div>
        )}
        {step === "unavailable" && (
          <div>
            <div style={{ background: "rgba(220,38,38,.05)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 12, padding: "12px 14px", color: T.danger, fontSize: 12.5, lineHeight: 1.5, marginBottom: 16 }}>
              {isHold
                ? (fr ? "L'enregistrement de la carte est momentanément indisponible. Vous pouvez confirmer la réservation et régler l'intervention à la fin." : "Card registration is temporarily unavailable. You can confirm the booking and pay at the end of the intervention.")
                : (fr ? "Le paiement en ligne est momentanément indisponible. Vous pourrez régler plus tard depuis « Mes interventions » ou via le lien envoyé par l'artisan." : "Online payment is temporarily unavailable. You can pay later from \"My bookings\" or via the link sent by the craftsman.")}
            </div>
            {onUnavailable && <button onClick={() => { onUnavailable(); }} className="lk-btn" style={{ marginBottom: 10 }}>{isHold ? (fr ? "Confirmer sans enregistrer de carte" : "Confirm without a card") : (fr ? "Continuer et payer plus tard" : "Continue and pay later")}</button>}
            <button onClick={onClose} className="lk-ghost" style={{ width: "100%" }}>{fr ? "Fermer" : "Close"}</button>
          </div>
        )}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ width: 70, height: 70, background: "rgba(62,207,142,.1)", border: "1.5px solid rgba(62,207,142,.3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", animation: "checkPop .4s ease" }}>{Icon.check(T.success, 30)}</div>
            <div style={{ color: T.success, fontWeight: 800, fontSize: 18, marginBottom: 18 }}>{isHold ? (fr ? "Carte enregistrée" : "Card registered") : (fr ? "Paiement enregistré" : "Payment recorded")}</div>
            <button onClick={onClose} className="lk-btn">{fr ? "Fermer" : "Close"}</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* Bandeau d'erreur de synchronisation — plus aucune perte silencieuse */
function SyncBanner({ lang = "fr" }) {
  const { error } = useSyncStatus();
  if (!error) return null;
  return (
    <div role="alert" style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 10001, width: "calc(100% - 24px)", maxWidth: 560, background: "#7f1d1d", color: "#fff", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, fontFamily: "'Inter',sans-serif", display: "flex", gap: 10, alignItems: "center", boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
      {Icon.warning("#fff", 16)}
      <span style={{ flex: 1, lineHeight: 1.4 }}>{error.message}</span>
      <button onClick={clearSyncError} style={{ background: "rgba(255,255,255,.18)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{lang === "en" ? "OK" : "OK"}</button>
    </div>
  );
}

function LoadingScreen({ lang = "fr" }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, background: T.bg, fontFamily: "'Inter',sans-serif" }}>
      <style>{CSS}</style>
      <Logo height={40} />
      <div style={{ width: 36, height: 36, border: "3px solid rgba(0,0,0,.06)", borderTop: `3px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <div style={{ color: T.textLo, fontSize: 13 }}>{lang === "en" ? "Loading…" : "Chargement…"}</div>
    </div>
  );
}

/* Profil public d'un artisan : la seule partie de son compte visible par les
   clients (liste des artisans disponibles). */
function publicProfile(a) {
  const metiers = proMetiers(a);
  return cleanForFirestore({
    id: a.id, artisanId: a.artisanId || a.id, nom: a.nom || "", ville: a.ville || "",
    lat: a.lat ?? null, lng: a.lng ?? null, photo: a.photo || null,
    metiers, metier: a.metier || metiers[0] || "", tarif: Number(a.tarif) || null,
    dispo: a.dispo !== false, certif: a.certif || "", tel: a.tel || "",
    dossierStatus: a.dossierStatus || "approved", banned: !!a.banned, stripeReady: !!a.stripeOnboarded,
  });
}
const PROFILE_ADMIN_FIELDS = ["dossierStatus", "banned", "stripeReady"];
const sameProfile = (cur, p) => !!cur && Object.keys(p).every(k => JSON.stringify(cur[k] ?? null) === JSON.stringify(p[k] ?? null));

/* Messages d'erreur de connexion / inscription */
function authErrorText(code, lang) {
  const fr = lang !== "en";
  const m = {
    bad_credentials: fr ? "E-mail ou mot de passe incorrect." : "Wrong e-mail or password.",
    email_used: fr ? "Cette adresse e-mail est déjà utilisée." : "This e-mail address is already in use.",
    invalid_email: fr ? "Adresse e-mail invalide." : "Invalid e-mail address.",
    weak_password: fr ? `Mot de passe trop faible (${MIN_PASS} caractères minimum).` : `Password too weak (min. ${MIN_PASS} characters).`,
    too_many: fr ? "Trop de tentatives. Patientez quelques minutes ou utilisez « Mot de passe oublié »." : "Too many attempts. Wait a few minutes or use \"Forgot password\".",
    network: fr ? "Connexion impossible : vérifiez votre réseau." : "Cannot connect: check your network.",
    banned: fr ? "Cette adresse e-mail ne peut pas être utilisée sur LOCKR." : "This e-mail address cannot be used on LOCKR.",
    default_password: fr ? "Ce mot de passe par défaut n'est plus accepté. Utilisez « Mot de passe oublié » pour recevoir un lien de réinitialisation par e-mail." : "This default password is no longer accepted. Use \"Forgot password\" to receive a reset link by e-mail.",
    disabled: fr ? "Ce compte est désactivé." : "This account is disabled.",
    bad_current: fr ? "Mot de passe actuel incorrect." : "Current password is incorrect.",
  };
  return m[code] || (fr ? "Opération impossible pour le moment. Réessayez." : "Operation not possible right now. Please retry.");
}

/* Confirmation de l'adresse e-mail (production) — affichée dans le profil,
   jamais par-dessus l'application. Obligatoire pour les professionnels :
   l'admin ne peut valider leur dossier qu'une fois l'adresse confirmée. */
function EmailVerifyNotice({ lang = "fr", account, setAccounts, required = false }) {
  const fr = lang !== "en";
  const [user, setUser] = useState(() => currentUser());
  const [sent, setSent] = useState(false);
  const [notYet, setNotYet] = useState(false);
  if (!live || !user || user.emailVerified || account?.emailVerified) return null;
  const check = async () => {
    setNotYet(false);
    const ok = await refreshEmailVerified();
    if (!ok) { setNotYet(true); return; }
    if (account && setAccounts) setAccounts(p => p.map(a => a.id === account.id ? { ...a, emailVerified: true } : a));
    setUser({ email: user.email, emailVerified: true });
  };
  return (
    <div style={{ background: "rgba(37,99,235,.06)", border: "1px solid rgba(37,99,235,.2)", borderRadius: 12, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, color: T.textMid, lineHeight: 1.5 }}>
      {fr ? `Adresse e-mail non confirmée : un lien a été envoyé à ${user.email}.` : `E-mail not confirmed yet: a link was sent to ${user.email}.`}
      {required && <div style={{ fontWeight: 700, color: "#2563eb", marginTop: 4 }}>{fr ? "Obligatoire pour la validation de votre dossier." : "Required before your application can be approved."}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={async () => { if (await sendVerification()) setSent(true); }} disabled={sent} className="lk-ghost" style={{ flex: 1, fontSize: 12, padding: "7px 10px" }}>{sent ? (fr ? "Lien envoyé ✓" : "Link sent ✓") : (fr ? "Renvoyer le lien" : "Resend link")}</button>
        <button onClick={check} className="lk-ghost" style={{ flex: 1, fontSize: 12, padding: "7px 10px" }}>{fr ? "J'ai confirmé" : "I confirmed"}</button>
      </div>
      {notYet && <div role="status" style={{ fontSize: 11.5, color: T.warn, marginTop: 6 }}>{fr ? "Pas encore confirmée : ouvrez le lien reçu par e-mail (pensez aux courriers indésirables)." : "Not confirmed yet: open the link in the e-mail (check your spam folder)."}</div>}
    </div>
  );
}

/* Pastille : version de démonstration (un appui propose de tout réinitialiser) */
function DemoBanner({ lang = "fr" }) {
  const fr = lang !== "en";
  return (
    <button
      title={fr ? "Version de démonstration — données fictives enregistrées sur cet appareil. Appuyer pour réinitialiser." : "Demo version — sample data saved on this device. Tap to reset."}
      onClick={() => { if (!window.confirm(fr ? "Version de démonstration : les données sont fictives et enregistrées sur cet appareil.\n\nRemettre la démonstration à zéro ?" : "Demo version: data is fictitious and saved on this device.\n\nReset the demo?")) return; resetDemoData(); writeSessionId(null); window.location.reload(); }}
      style={{ position: "fixed", top: 3, left: "50%", transform: "translateX(-50%)", zIndex: 8500, background: "#c9a030", color: "#1c1c1c", border: "none", borderRadius: 20, padding: "2px 9px", fontSize: 9.5, fontWeight: 800, letterSpacing: ".5px", fontFamily: "'Inter',sans-serif", cursor: "pointer", opacity: .9 }}>
      {fr ? "DÉMO ↺" : "DEMO ↺"}
    </button>
  );
}

/* ─── ROOT ─── */
export default function App() {
  const [screen, setScreen] = useState("login");
  const [lang, setLangState] = useState(() => { try { return localStorage.getItem("lk_lang") === "en" ? "en" : "fr"; } catch { return "fr"; } });
  const setLang = l => { setLangState(l); try { localStorage.setItem("lk_lang", l); } catch { /* ignore */ } };
  const tr = TRANS[lang] || TRANS.fr;

  /* ── Identité ──
     Production : Firebase Authentication (l'identifiant du compte est celui
     de Firebase). Démonstration : session locale (identifiant seul). */
  const [authUser, setAuthUser] = useState(live ? undefined : null);
  useEffect(() => onAuthChange(u => setAuthUser(u || null)), []);
  const [demoSession, setDemoSession] = useState(() => (live ? null : readSessionId()));
  const userId = live ? (authUser ? authUser.uid : null) : demoSession;
  const [registering, setRegistering] = useState(false);

  // Le compte de l'utilisateur est lu en premier : son rôle décide de ce qui est chargé
  const [selfDocs, , selfReady] = useSyncedState("accounts", [], { sources: userId ? [{ doc: userId }] : [], demo: false });
  const me = live ? (selfDocs[0] || null) : null;
  const role = me?.role;
  const isAdm = role === "admin";
  const activePro = !!me && ["pro", "partenaire"].includes(role) && (me.dossierStatus || "approved") === "approved" && !me.banned;
  /* Ce que chaque rôle charge (le reste est refusé par firestore.rules) */
  const ALL = undefined;
  const NONE = [];
  const mine = field => [{ where: [field, "array-contains", userId] }];
  const S = !live ? {} : (!userId || !me || me.banned) ? {
    accounts: NONE, bookings: NONE, bons: NONE, chat: NONE, listings: NONE, sales: NONE, messages: NONE,
    banned: NONE, settings: NONE, techs: NONE, factures: NONE, profiles: NONE,
  } : {
    accounts: isAdm ? ALL : [{ doc: userId }],
    bookings: isAdm ? ALL : mine("participants"),
    bons: isAdm || activePro ? ALL : role === "client" ? [{ where: ["clientId", "==", userId] }] : NONE,
    chat: isAdm || activePro ? ALL : NONE,
    listings: isAdm || activePro ? ALL : NONE,
    sales: isAdm ? ALL : activePro ? mine("participants") : NONE,
    messages: isAdm ? ALL : mine("participants"),
    banned: isAdm ? ALL : NONE,
    settings: ALL,
    techs: isAdm ? ALL : role === "partenaire" ? [{ where: ["partenaireId", "==", userId] }] : NONE,
    factures: isAdm ? ALL : NONE,
    profiles: isAdm || role === "client" ? ALL : role === "pro" ? [{ doc: userId }] : NONE,
  };

  // Données : base partagée en production, locales en démonstration
  const [bookings, setBookings, bookingsReady] = useSyncedState("bookings", INIT_BOOKINGS, { sources: S.bookings });
  const [accounts, setAccounts, accountsReady] = useSyncedState("accounts", INIT_ACCOUNTS, { sources: S.accounts });
  const [bons, setBons] = useSyncedState("bons", INIT_BONS, { sources: S.bons });
  const [chatMessages, setChatMessages] = useSyncedState("chat", INIT_CHAT, { sources: S.chat });
  const [listings, setListings] = useSyncedState("listings", INIT_LISTINGS, { sources: S.listings });
  const [sales, setSales] = useSyncedState("sales", INIT_SALES, { sources: S.sales });
  const [interventionChats, setInterventionChats] = useSyncedState("messages", [], { sources: S.messages });
  const [bannedList, setBannedList] = useSyncedState("banned", [], { sources: S.banned });
  const [settings, setSettings] = useSyncedState("settings", [], { sources: S.settings });
  const [techs, setTechs] = useSyncedState("techs", INIT_PARTNER_TECHS, { sources: S.techs });
  const [factures, setFactures] = useSyncedState("factures", [], { sources: S.factures });
  const [profiles, setProfiles, profilesReady] = useSyncedState("profiles", [], { sources: S.profiles, demo: false });
  const setters = { setBookings, setAccounts, setSales, setListings };

  // Ordre de priorité des techniciens (défini par l'admin, partagé avec tous les pros)
  const priorityOrder = settings.find(x => x.id === "priorityOrder")?.order || [];
  // Forfait de frais de déplacement (annulation tardive, client absent), réglé par l'admin
  const tarifs = settings.find(x => x.id === "tarifs");
  const fraisDep = fraisDeplacementFrom(tarifs);
  const setFraisDep = v => setSettings(p => [...p.filter(x => x.id !== "tarifs"), { ...(tarifs || {}), id: "tarifs", fraisDeplacement: v, createdAt: tarifs?.createdAt || "2000-01-01T00:00:00.000Z" }]);
  const setPriorityOrder = order => setSettings(p => [...p.filter(x => x.id !== "priorityOrder"), { id: "priorityOrder", order: Array.isArray(order) ? order : [], createdAt: "2000-01-01T00:00:00.000Z" }]);

  /* Le compte affiché est TOUJOURS la version à jour de la base (validation
     admin, profil, abonnement…). */
  const storedAccount = userId ? (accounts.find(a => a.id === userId) || me) : null;
  // Ancien compte artisan sans artisanId : l'id du compte sert d'identifiant
  // (c'est aussi celui qu'utilisent les réservations des clients).
  const account = useMemo(() => (storedAccount && storedAccount.role === "pro" && !storedAccount.artisanId
    ? { ...storedAccount, artisanId: storedAccount.id } : storedAccount), [storedAccount]);
  const loginAs = acc => { setDemoSession(acc.id); writeSessionId(acc.id); };
  const logout = useCallback(() => {
    if (live) signOutUser();
    else { setDemoSession(null); writeSessionId(null); }
    setScreen("login");
  }, []);
  const isBannedLocal = useCallback(a => !!a && (a.banned === true || bannedList.some(b =>
    (b.accountId && b.accountId === a.id) || (b.email && a.email && normEmail(b.email) === normEmail(a.email))
  )), [bannedList]);

  // Compte supprimé ou banni pendant la session → déconnexion immédiate
  useEffect(() => {
    if (!userId) return;
    if (live) {
      if (!selfReady || registering) return;
      if (!me) {
        if (!globalThis.__lkLeaving) alert(lang === "en" ? "This account no longer exists." : "Ce compte n'existe plus ou a été supprimé.");
        logout();
        return;
      }
      if (me.banned) { alert(tr.accountBanned); logout(); }
      return;
    }
    if (!accountsReady) return;
    if (!account) { logout(); return; }
    if (isBannedLocal(account)) { alert(tr.accountBanned); logout(); }
  }, [userId, selfReady, registering, me, accountsReady, account, isBannedLocal, logout, tr.accountBanned, lang]);

  // Dernière connexion (une fois par session)
  const lastLoginDone = useRef(null);
  useEffect(() => {
    if (!account || !accountsReady || lastLoginDone.current === account.id) return;
    lastLoginDone.current = account.id;
    setAccounts(p => p.map(a => a.id === account.id ? { ...a, lastLoginAt: ts() } : a));
  }, [account?.id, accountsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  /* E-mail confirmé (production) : recopié sur le compte, car l'admin ne peut
     valider un professionnel qu'avec une adresse confirmée. Vérifié à la
     connexion et au retour dans l'application (après le clic sur le lien). */
  useEffect(() => {
    // On attend que la fiche du compte soit chargée (sinon la mise à jour n'aurait rien à modifier)
    if (!live || !account?.id || account.emailVerified || !accountsReady) return;
    let stop = false;
    const check = async () => {
      if (await refreshEmailVerified() && !stop) setAccounts(p => p.map(a => a.id === account.id && !a.emailVerified ? { ...a, emailVerified: true } : a));
    };
    check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop = true; document.removeEventListener("visibilitychange", onVisible); };
  }, [account?.id, account?.emailVerified, accountsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Langue préférée enregistrée sur le compte
  useEffect(() => { if (account?.lang && account.lang !== lang) setLangState(account.lang); }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Profils publics des artisans tenus à jour (production) : par l'artisan
     lui-même, et par l'admin pour tous (validation, bannissement…). */
  const profileTried = useRef(new Map());
  useEffect(() => {
    // On attend d'avoir lu les profils existants (sinon on recréerait une fiche périmée)
    if (!live || !me || registering || !profilesReady) return;
    const targets = role === "pro" && account ? [account] : isAdm && accountsReady ? accounts.filter(a => a.role === "pro") : [];
    const updates = [];
    targets.forEach(a => {
      const full = publicProfile(a);
      const cur = profiles.find(x => x.id === a.id);
      // L'artisan ne recopie que ses propres informations ; validation,
      // bannissement et Stripe sont tenus à jour par l'admin et le serveur.
      const p = cur && !isAdm ? { ...cur, ...Object.fromEntries(Object.entries(full).filter(([k]) => !PROFILE_ADMIN_FIELDS.includes(k))) } : full;
      if (sameProfile(cur, p)) return;
      const key = JSON.stringify(p);
      if (profileTried.current.get(a.id) === key) return; // déjà tenté (évite de boucler si refusé)
      profileTried.current.set(a.id, key);
      updates.push(p);
    });
    const orphans = isAdm && accountsReady && accounts.length ? profiles.filter(p => !accounts.some(a => a.id === p.id && a.role === "pro")).map(p => p.id) : [];
    if (updates.length || orphans.length) {
      setProfiles(prev => [...prev.filter(x => !orphans.includes(x.id) && !updates.some(u => u.id === x.id)), ...updates]);
    }
  }, [account, accounts, accountsReady, profiles, profilesReady, role, isAdm, me, registering]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Anciennes données (créées avant les comptes sécurisés) : l'admin complète
     automatiquement la liste des participants, sans laquelle client et
     artisan ne verraient plus leurs interventions. */
  const backfillTried = useRef(new Set());
  useEffect(() => {
    if (!live || !isAdm || !accountsReady || !bookingsReady) return;
    const fixBookings = [];
    bookings.forEach(b => {
      if (Array.isArray(b.participants) && (b.artisanAccountId || !b.artisanId)) return;
      if (backfillTried.current.has("b:" + b.id)) return;
      backfillTried.current.add("b:" + b.id);
      const acc = b.artisanId ? accounts.find(a => a.role === "pro" && (a.artisanId || a.id) === b.artisanId) : null;
      const nb = { ...b, ...(acc ? { artisanAccountId: acc.id } : {}) };
      fixBookings.push({ ...nb, participants: bookingParticipants(nb) });
    });
    if (fixBookings.length) setBookings(p => p.map(b => fixBookings.find(f => f.id === b.id) || b));
    const fixMsgs = interventionChats.filter(m => !Array.isArray(m.participants) && !backfillTried.current.has("m:" + m.id)).map(m => {
      backfillTried.current.add("m:" + m.id);
      const b = bookings.find(x => x.id === m.bookingId);
      return b ? { ...m, participants: Array.isArray(b.participants) ? b.participants : bookingParticipants(b) } : null;
    }).filter(Boolean);
    if (fixMsgs.length) setInterventionChats(p => p.map(m => fixMsgs.find(f => f.id === m.id) || m));
    const fixSales = sales.filter(x => !Array.isArray(x.participants) && !backfillTried.current.has("s:" + x.id)).map(x => {
      backfillTried.current.add("s:" + x.id);
      return { ...x, participants: [x.acheteurId, x.vendeurId].filter(Boolean) };
    });
    if (fixSales.length) setSales(p => p.map(x => fixSales.find(f => f.id === x.id) || x));
  }, [isAdm, accountsReady, bookingsReady, bookings, accounts, interventionChats, sales]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Suppression des données de démonstration présentes dans la base de
     production (anciennes données d'exemple). */
  const demoCounts = live && isAdm ? {
    accounts: accounts.filter(isDemoAccount).length, bookings: bookings.filter(isDemoRecord).length,
    bons: bons.filter(isDemoRecord).length, listings: listings.filter(isDemoRecord).length,
    sales: sales.filter(isDemoRecord).length, techs: techs.filter(isDemoRecord).length,
    chat: chatMessages.filter(isDemoRecord).length,
  } : null;
  const demoTotal = demoCounts ? Object.values(demoCounts).reduce((a, b) => a + b, 0) : 0;
  const cleanupDemo = () => {
    setBookings(p => p.filter(x => !isDemoRecord(x)));
    setBons(p => p.filter(x => !isDemoRecord(x)));
    setListings(p => p.filter(x => !isDemoRecord(x)));
    setSales(p => p.filter(x => !isDemoRecord(x)));
    setTechs(p => p.filter(x => !isDemoRecord(x)));
    setChatMessages(p => p.filter(x => !isDemoRecord(x)));
    setAccounts(p => p.filter(a => !isDemoAccount(a)));
  };

  // Stripe activé sur la plateforme ? (les artisans doivent alors activer leurs virements)
  const [platform, setPlatform] = useState({ stripe: false });
  useEffect(() => { if (live) getPlatformConfig().then(setPlatform); }, []);
  const stripeRequired = live && !!platform.stripe;

  // Annuaire des artisans proposés aux clients
  const proDirectory = live ? profiles : accounts.filter(a => a.role === "pro").map(a => ({ ...publicProfile(a), banned: isBannedLocal(a) }));

  /* Inscription : compte de connexion (Firebase) + fiche du compte */
  const registerAccount = async (fields, password) => {
    if (!live) {
      if (emailTaken(accounts, fields.email)) return { error: "email_used" };
      if (bannedList.some(b => b.email && normEmail(b.email) === normEmail(fields.email))) return { error: "banned" };
      const acc = await buildAccount({ ...fields, ...(fields.role === "pro" ? { artisanId: "a" + uid() } : {}) }, password);
      setAccounts(p => [...p, acc]);
      loginAs(acc);
      return { ok: true, acc };
    }
    setRegistering(true);
    const r = await signUp(fields.email, password);
    if (r.error) { setRegistering(false); return r; }
    if (await isEmailBanned(fields.email)) { await cancelSignUp(); setRegistering(false); return { error: "banned" }; }
    const acc = {
      ...fields, id: r.uid, email: normEmail(fields.email), createdAt: ts(),
      ...(fields.role === "pro" ? { artisanId: r.uid } : {}),
    };
    if (acc.role === "client") delete acc.dossierStatus;
    else acc.dossierStatus = "pending";
    try {
      await createAccountDoc(acc);
    } catch (e) {
      console.error("[inscription]", e);
      await cancelSignUp();
      setRegistering(false);
      return { error: "unknown" };
    }
    sendVerification();
    setRegistering(false);
    setPayNotice({ kind: "success", text: lang === "en" ? "Account created — a confirmation e-mail has been sent to you." : "Compte créé — un e-mail de confirmation vous a été envoyé." });
    return { ok: true, acc };
  };

  const [legalOpen, setLegalOpen] = useState(null);

  /* Retour de la page de paiement Stripe : le serveur vérifie la session
     auprès de Stripe et enregistre lui-même le paiement. */
  const [payReturn] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const st = q.get("paiement");
    return st ? { status: st, sessionId: q.get("session_id"), type: q.get("type"), ref: q.get("ref") } : null;
  });
  const [payNotice, setPayNotice] = useState(null);
  const payHandled = useRef(false);
  useEffect(() => {
    if (!payReturn || payHandled.current) return;
    if (window.location.search) window.history.replaceState({}, "", window.location.pathname);
    if (payReturn.status !== "succes") {
      payHandled.current = true;
      setPayNotice({ kind: "error", text: lang === "en" ? "Payment cancelled — nothing was charged." : "Paiement annulé — aucun montant n'a été débité." });
      return;
    }
    if (!live) { payHandled.current = true; return; }
    if (authUser === undefined) return; // on attend la session (jeton de connexion)
    payHandled.current = true;
    (async () => {
      const v = payReturn.sessionId ? await verifyCheckout(payReturn.sessionId) : null;
      if (!v) { setPayNotice({ kind: "info", text: lang === "en" ? "Payment received — being confirmed." : "Paiement reçu — confirmation en cours." }); return; }
      if (v.authorized) { setPayNotice({ kind: "success", text: lang === "en" ? "✓ Card registered — nothing is charged before the intervention." : "✓ Carte enregistrée — rien n'est débité avant l'intervention." }); return; }
      if (!v.paid) { setPayNotice({ kind: "error", text: lang === "en" ? "The payment was not confirmed by the bank." : "Le paiement n'a pas été confirmé par la banque." }); return; }
      setPayNotice({ kind: "success", text: lang === "en" ? "✓ Payment confirmed — thank you!" : "✓ Paiement confirmé — merci !" });
    })();
  }, [payReturn, authUser]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!payNotice) return undefined;
    const t = setTimeout(() => setPayNotice(null), 7000);
    return () => clearTimeout(t);
  }, [payNotice]);

  // Retour de l'inscription Stripe Connect : le serveur vérifie l'état du compte Stripe
  const [connectReturn] = useState(() => new URLSearchParams(window.location.search).get("stripe_onboard"));
  const connectHandled = useRef(false);
  useEffect(() => {
    if (!connectReturn || connectHandled.current || !account) return;
    connectHandled.current = true;
    if (window.location.search) window.history.replaceState({}, "", window.location.pathname);
    if (!live) return;
    refreshConnectStatus().then(r => {
      if (r?.onboarded) setPayNotice({ kind: "success", text: lang === "en" ? "✓ Automatic payouts enabled" : "✓ Virements automatiques activés" });
      else setPayNotice({ kind: "info", text: lang === "en" ? "Stripe registration not finished yet — you can resume it from your profile." : "Inscription Stripe pas encore terminée — vous pouvez la reprendre depuis votre profil." });
    });
  }, [connectReturn, account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const legalLinks = lang === "en"
    ? [{ id: "mentions", l: "Legal notice" }, { id: "cgu", l: "Terms" }, { id: "cgv", l: "Sales" }, { id: "privacy", l: "Privacy" }, { id: "cookies", l: "Cookies" }]
    : [{ id: "mentions", l: "Mentions légales" }, { id: "cgu", l: "CGU" }, { id: "cgv", l: "CGV" }, { id: "privacy", l: "Confidentialité" }, { id: "cookies", l: "Cookies" }];

  const wrapper = (children) => (
    <>
      {IS_DEMO && <DemoBanner lang={lang} />}
      {children}
      <SyncBanner lang={lang} />
      <CookieConsent lang={lang} />
      {payNotice && (
        <div role="status" style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 10000, pointerEvents: "none", background: payNotice.kind === "success" ? T.success : payNotice.kind === "info" ? "#2563eb" : T.danger, color: "#fff", borderRadius: 12, padding: "12px 20px", fontSize: 13, fontWeight: 700, fontFamily: "'Inter',sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,.2)", maxWidth: "calc(100% - 24px)" }}>
          {payNotice.text}
        </div>
      )}
      {legalOpen && <LegalCenterModal lang={lang} initialTab={legalOpen} onClose={() => setLegalOpen(null)} />}
      {/* Liens légaux sur les écrans de connexion/inscription (le Centre légal
          reste accessible depuis le profil une fois connecté) */}
      {!account && (
        <div style={{ position: "fixed", bottom: 4, right: 10, zIndex: 100, display: "flex", gap: 10, fontFamily: "'Inter',sans-serif" }}>
          {legalLinks.map(lk => (
            <button key={lk.id} onClick={() => setLegalOpen(lk.id)} style={{ fontSize: 10, color: "rgba(0,0,0,.4)", cursor: "pointer", background: "none", border: "none", padding: "6px 0" }}>{lk.l}</button>
          ))}
        </div>
      )}
    </>
  );

  // Session en cours de restauration
  if (live && (authUser === undefined || (userId && (!selfReady || (!me && registering))))) return wrapper(<LoadingScreen lang={lang} />);

  const common = { account, accounts, setAccounts, bookings, setBookings, bons, setBons, onLogout: logout, lang, setLang, setters, openLegal: setLegalOpen, fraisDep };
  if (account) {
    if (account.role === "client") return wrapper(<ClientApp {...common} pros={proDirectory} stripeRequired={stripeRequired} interventionChats={interventionChats} setInterventionChats={setInterventionChats} />);
    if (account.role === "pro") return wrapper(<ProApp {...common} stripeRequired={stripeRequired} chatMessages={chatMessages} setChatMessages={setChatMessages} interventionChats={interventionChats} setInterventionChats={setInterventionChats} listings={listings} setListings={setListings} sales={sales} setSales={setSales} priorityOrder={priorityOrder} />);
    if (account.role === "admin") return wrapper(<AdminApp {...common} listings={listings} setListings={setListings} sales={sales} setSales={setSales} bannedList={bannedList} setBannedList={setBannedList} priorityOrder={priorityOrder} setPriorityOrder={setPriorityOrder} factures={factures} setFactures={setFactures} techs={techs} demoTotal={demoTotal} onCleanupDemo={cleanupDemo} setFraisDep={setFraisDep} />);
    if (account.role === "partenaire") return wrapper(<PartenaireApp {...common} techs={techs} setTechs={setTechs} listings={listings} setListings={setListings} sales={sales} setSales={setSales} />);
  }
  const regProps = { onBack: () => setScreen("register-choice"), onRegister: registerAccount, lang, openLegal: setLegalOpen };
  if (screen === "register-choice") return wrapper(<RegisterChoiceScreen onChoice={type => setScreen(type === "pro" ? "register-pro" : type === "entreprise" ? "register-entreprise" : "register-client")} onBack={() => setScreen("login")} lang={lang} />);
  if (screen === "register-client") return wrapper(<RegisterClientScreen {...regProps} />);
  if (screen === "register-pro") return wrapper(<RegisterProScreen {...regProps} />);
  if (screen === "register-entreprise") return wrapper(<RegisterEntrepriseScreen {...regProps} />);
  return wrapper(<LoginScreen
    onLogin={acc => {
      if (isBannedLocal(acc)) { alert(tr.accountBanned); return; }
      loginAs(acc);
    }}
    onRegister={() => setScreen("register-choice")}
    accounts={accounts} setAccounts={setAccounts} accountsReady={accountsReady}
    lang={lang} setLang={setLang} />);
}
