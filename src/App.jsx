import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

/* ─── PROTECTION CODE SOURCE ─── */
(function protect() {
  if (typeof window === "undefined") return;

  // 1. Désactiver clic droit (desktop uniquement — pas de touchstart)
  document.addEventListener("contextmenu", e => {
    // Autoriser sur les inputs et textareas
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    e.preventDefault();
  }, true);

  // 2. Bloquer raccourcis clavier DevTools / view-source (desktop uniquement)
  document.addEventListener("keydown", e => {
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && ["I","i","J","j","C","c"].includes(e.key)) ||
      (e.ctrlKey && ["U","u"].includes(e.key)) ||
      (e.metaKey && e.altKey && ["I","i","J","j","C","c"].includes(e.key))
    ) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // 3. Bloquer copier hors champs de saisie (desktop uniquement)
  document.addEventListener("copy", e => {
    const tag = document.activeElement?.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && !document.activeElement?.isContentEditable) {
      e.preventDefault();
    }
  }, true);

  // NOTE: Pas de détection DevTools par dimensions — trop agressive sur mobile
  // (la barre d'adresse / clavier virtuel change les dimensions et bloque l'app)
})();

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = n => `${Math.round(Number(n))} €`;
const fmtFrom = (n, lang = "fr") => lang === "en" ? `From ${Math.round(Number(n))} €` : `À partir de ${Math.round(Number(n))} €`;
const fmtTime = d => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const fmtDate = d => new Date(d).toLocaleDateString("fr-FR");
const ts = () => new Date().toISOString();

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
    minChars: "6 caractères minimum", passMismatch: "Les mots de passe ne correspondent pas",
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
    aeCotisations: "Cotisations URSSAF", aeCotisRate: "Taux de cotisations (22%)",
    aeCotisCalc: "Cotisations estimées", aeCotisAlert: "Pensez à déclarer avant le",
    aeSeuilAlert: "Attention : seuil TVA approché ! (34 400 €)", aeSeuilOk: "Sous le seuil TVA",
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
    allMissionsLabel: "Toutes les missions", techShare: "Tech (40%)",
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
    yourShare40: "Votre part (40%)",
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
    buySuccess: "Commande confirmée !", buySuccessDesc: "Votre commande a été transmise au vendeur. Il vous contactera pour la livraison.",
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
    missionList: "Missions", subtotal: "Sous-total", yourShare40pct: "Votre part (40%)", totalLabel: "Total",
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
    commissionReport: "Relevé de commissions LOCKR", moisCa: "CA du mois (60%)", netReverse: "Net reversé",
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
    missionsCount: "mission(s)", earningsShare: "40% du CA",
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
    minChars: "6 characters minimum", passMismatch: "Passwords do not match",
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
    aeCotisations: "Social contributions", aeCotisRate: "Contribution rate (22%)",
    aeCotisCalc: "Estimated contributions", aeCotisAlert: "Remember to file before",
    aeSeuilAlert: "Warning: VAT threshold approaching! (€34,400)", aeSeuilOk: "Below VAT threshold",
    aeCharges: "Estimated social charges", aeDeclaration: "URSSAF declaration",
    aeDeclare: "File this month", aeDeclareTitle: "File monthly revenue",
    aeCaSaisie: "Revenue to declare (€)", aeConfirmDecl: "Confirm filing", aeDeclDone: "Filing recorded",
    aeFrais: "Business expenses", aeAddFrais: "Add expense",
    aeFraisLabel: "Description", aeFraisMontant: "Amount (€)", aeFraisDate: "Date", aeFraisCat: "Category",
    aeFraisCats: "Fuel,Tools,Training,Supplies,Travel,Phone,Insurance,Other",
    aeRecap: "Tax summary", aeNetEstime: "Estimated net income",
    aeTvaFranchise: "VAT exemption (franchise en base)", aeRegimeMicro: "Micro-entrepreneur scheme",
    aeFormation: "VTC (vocational training contribution)", aeFormationRate: "0.30% of revenue",
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
    allMissionsLabel: "All missions", techShare: "Tech (40%)",
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
    yourShare40: "Your share (40%)",
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
    buySuccess: "Order confirmed!", buySuccessDesc: "Your order has been sent to the seller. They will contact you for delivery.",
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
    missionList: "Missions", subtotal: "Subtotal", yourShare40pct: "Your share (40%)", totalLabel: "Total",
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
    commissionReport: "LOCKR commission report", moisCa: "Monthly revenue (60%)", netReverse: "Net paid out",
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
    missionsCount: "mission(s)", earningsShare: "40% of revenue",
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

const PLATFORM_CUT = 0.10;
const OUR_TECH_CUT = 0.40;
const PARTNER_TECH_CUT = 0.40;

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
  const [localNum, setLocalNum] = useState("");
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

const INIT_ACCOUNTS = [
  { id: "c1", role: "client", nom: "Martin Dupont", email: "client@demo.fr", pass: "1234", verified: true, isDemo: true },
  { id: "c2", role: "client", nom: "Sophie Bernard", email: "sophie@demo.fr", pass: "1234", verified: true, isDemo: true },
  { id: "p1", role: "pro", artisanId: "a1", nom: "Karim Benali", email: "karim@demo.fr", pass: "1234", verified: true, photo: null, ville: "Paris", lat: 48.8566, lng: 2.3522, isDemo: true, dossierStatus: "approved" },
  { id: "p2", role: "pro", artisanId: "a2", nom: "Youssef Mrani", email: "youssef@demo.fr", pass: "1234", verified: true, photo: null, ville: "Paris", lat: 48.860, lng: 2.340, isDemo: true, dossierStatus: "approved" },
  { id: "p3", role: "pro", artisanId: "a5", nom: "Marc Fontaine",    email: "marc@demo.fr",    pass: "1234", verified: true, photo: null, ville: "Paris", lat: 48.862, lng: 2.342, isDemo: true, dossierStatus: "approved" },
  { id: "p4", role: "pro", artisanId: "a6", nom: "Julien Moreau",    email: "julien@demo.fr",  pass: "1234", verified: true, photo: null, ville: "Paris", lat: 48.858, lng: 2.352, isDemo: true, dossierStatus: "approved" },
  { id: "p5", role: "pro", artisanId: "a7", nom: "Nicolas Laurent",  email: "nicolas@demo.fr", pass: "1234", verified: true, photo: null, ville: "Paris", lat: 48.868, lng: 2.335, isDemo: true, dossierStatus: "approved" },
  { id: "p6", role: "pro", artisanId: "a8", nom: "David Petit",      email: "david@demo.fr",   pass: "1234", verified: true, photo: null, ville: "Paris", lat: 48.855, lng: 2.358, isDemo: true, dossierStatus: "approved" },
  { id: "p7", role: "pro", artisanId: "a9", nom: "Pierre Rousseau",  email: "pierre@demo.fr",  pass: "1234", verified: true, photo: null, ville: "Paris", lat: 48.870, lng: 2.328, isDemo: true, dossierStatus: "approved" },
  { id: "p8", role: "pro", artisanId: "a10", nom: "Antoine Bernard", email: "antoine@demo.fr", pass: "1234", verified: true, photo: null, ville: "Lyon",  lat: 45.760, lng: 4.840, isDemo: true, dossierStatus: "approved" },
  { id: "admin1", role: "admin", nom: "Admin LOCKR", email: "admin@lockr.fr", pass: "admin2024", verified: true },
  { id: "admin2", role: "admin", nom: "Soze", email: "soze@lockr.fr", pass: "soze2024", verified: true },
  { id: "admin3", role: "admin", nom: "Emma", email: "emma@lockr.fr", pass: "emma2024", verified: true },
  { id: "admin4", role: "admin", nom: "Zakari", email: "zakari@lockr.fr", pass: "zakari2024", verified: true },
  { id: "part1", role: "partenaire", nom: "BâtiPro SARL", email: "contact@batipro.fr", pass: "1234", verified: true, siret: "12345678900012", rcs: "Paris B 123 456 789", capital: "50 000 €", assurance: "AXA Pro RC n°AX-2024-001", qualibat: "8711 — Serrurerie", tva: "FR12345678900", iban: "FR76 3000 6000 0112 3456 7890 189", secteurs: ["serrurier","plombier"], ville: "Paris", logo: null, statut: "actif", dateContrat: "2024-01-15" },
  { id: "part2", role: "partenaire", nom: "Électro Services SAS", email: "info@electroservices.fr", pass: "1234", verified: true, siret: "98765432100021", rcs: "Lyon B 987 654 321", capital: "100 000 €", assurance: "Generali Pro n°GEN-2023-445", qualibat: "RGE — QualiElec", tva: "FR98765432100", iban: "FR76 1027 8060 0001 2345 6789 010", secteurs: ["electricien","chauffagiste"], ville: "Lyon", logo: null, statut: "actif", dateContrat: "2023-11-01" },
  { id: "part_lockr", role: "partenaire", nom: "LOCKR — Équipe interne", email: "equipe@lockr.fr", pass: "lockr2024", verified: true, internalAccess: true, siret: "92345678900012", rcs: "Paris B 923 456 789", capital: "10 000 €", assurance: "AXA France IARD", qualibat: "—", tva: "FR32923456789", iban: "FR76 3000 6000 0112 3456 7890 189", secteurs: ["serrurier","plombier","electricien","chauffagiste"], ville: "Paris", logo: null, statut: "actif", dateContrat: "2024-01-01" },
];

const INIT_BOOKINGS = [
  { id: "b0", clientId: "c1", artisanId: "a1", clientNom: "Martin Dupont", adresse: "12 rue de la Paix, Paris", probleme: "ouverture", montant: 130, statut: "terminée", montantFinal: 130, statutPaiement: "payé", createdAt: new Date(Date.now() - 86400000 * 5).toISOString(), bonType: "platform", factureImg: null, factureClient: null },
  { id: "b1", clientId: "c1", artisanId: "a1", clientNom: "Martin Dupont", adresse: "12 rue de la Paix, Paris", probleme: "serrure", montant: 95, statut: "terminée", montantFinal: 95, statutPaiement: "en_attente", createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), bonType: "platform", factureImg: null, factureClient: null },
  { id: "b2", clientId: "c2", artisanId: "a2", clientNom: "Sophie Bernard", adresse: "8 avenue Montaigne, Paris", probleme: "blindage", montant: 350, statut: "terminée", montantFinal: 350, statutPaiement: "payé", createdAt: new Date(Date.now() - 86400000 * 10).toISOString(), bonType: "platform", factureImg: null, factureClient: null },
  { id: "b3", clientId: "c1", artisanId: "a5", clientNom: "Martin Dupont",  adresse: "12 rue de la Paix, Paris", probleme: "fuite_eau",  montant: 110, statut: "terminée", montantFinal: 110, statutPaiement: "payé", createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), bonType: "platform", factureImg: null, factureClient: null },
  { id: "b4", clientId: "c2", artisanId: "a7", clientNom: "Sophie Bernard", adresse: "8 avenue Montaigne, Paris", probleme: "panne_elec", montant: 130, statut: "terminée", montantFinal: 130, statutPaiement: "payé", createdAt: new Date(Date.now() - 86400000 * 7).toISOString(), bonType: "platform", factureImg: null, factureClient: null },
  { id: "b5", clientId: "c1", artisanId: "a9", clientNom: "Martin Dupont",  adresse: "12 rue de la Paix, Paris", probleme: "chaudiere",  montant: 150, statut: "assignée", montantFinal: null, statutPaiement: null, createdAt: new Date(Date.now() - 3600000).toISOString(), bonType: "platform", factureImg: null, factureClient: null },
];

const INIT_BONS = [
  { id: "bon1", titre: "Porte claquée urgence", adresse: "15 rue Lepic, Paris 18", probleme: "ouverture", urgence: true, montantEstime: 140, postedBy: "platform", postedByNom: "LOCKR", region: "Paris", lat: 48.884, lng: 2.337, createdAt: new Date(Date.now() - 3600000).toISOString(), techPct: 40 },
  { id: "bon2", titre: "Changement serrure 3 points", adresse: "42 bd Haussmann, Paris 9", probleme: "serrure", urgence: false, montantEstime: 190, postedBy: "p1", postedByNom: "Karim Benali", region: "Paris", lat: 48.874, lng: 2.330, createdAt: new Date(Date.now() - 7200000).toISOString(), techPct: 35 },
  { id: "bon3", titre: "Blindage porte appartement", adresse: "8 rue du Commerce, Lyon", probleme: "blindage", urgence: false, montantEstime: 420, postedBy: "platform", postedByNom: "LOCKR", region: "Lyon", lat: 45.750, lng: 4.830, createdAt: new Date(Date.now() - 14400000).toISOString(), techPct: 40 },
  { id: "bon4", titre: "Fuite sous évier urgent",         adresse: "22 rue Oberkampf, Paris 11", probleme: "fuite_eau",   urgence: true,  montantEstime: 120, postedBy: "platform", postedByNom: "LOCKR", region: "Paris", lat: 48.864, lng: 2.370, createdAt: new Date(Date.now() - 1800000).toISOString(),  techPct: 38 },
  { id: "bon5", titre: "Tableau électrique hors normes",  adresse: "3 rue de Rivoli, Paris 1",   probleme: "disjoncteur", urgence: false, montantEstime: 280, postedBy: "platform", postedByNom: "LOCKR", region: "Paris", lat: 48.856, lng: 2.348, createdAt: new Date(Date.now() - 5400000).toISOString(),  techPct: 35 },
  { id: "bon6", titre: "Chaudière Vaillant en panne",     adresse: "18 rue de la Croix, Lyon",   probleme: "chaudiere",   urgence: true,  montantEstime: 200, postedBy: "platform", postedByNom: "LOCKR", region: "Lyon",  lat: 45.755, lng: 4.845, createdAt: new Date(Date.now() - 9000000).toISOString(),  techPct: 40 },
  { id: "bon7", titre: "Installation pompe à chaleur",    adresse: "5 allée des Roses, Paris 14", probleme: "pac",         urgence: false, montantEstime: 600, postedBy: "platform", postedByNom: "LOCKR", region: "Paris", lat: 48.833, lng: 2.330, createdAt: new Date(Date.now() - 18000000).toISOString(), techPct: 35 },
];

const INIT_LISTINGS = [
  { id: "l1", proId: "p1", proNom: "Karim Benali", metier: "serrurier", titre: "Perceuse à percussion Bosch GSB 18V-55 — kit complet", desc: "Vendue avec 2 batteries, chargeur et mallette. Très peu utilisée, parfait état. Idéale pour pose de serrures.", prix: 180, categorie: "Outils", etat: "Très bon état", photo: null, tel: "0601020304", createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), sold: false },
  { id: "l2", proId: "p3", proNom: "Marc Fontaine",  metier: "plombier",  titre: "Lot de raccords à compression 15mm — 50 pièces neuves", desc: "Lot de raccords laiton 15mm, jamais utilisés, achetés en trop. Marque Giacomini.", prix: 45, categorie: "Pièces", etat: "Neuf", photo: null, tel: "0614151617", createdAt: new Date(Date.now() - 86400000 * 5).toISOString(), sold: false },
  { id: "l3", proId: "p5", proNom: "Nicolas Laurent", metier: "electricien", titre: "Tableau électrique Legrand 13 rangées — neuf sous blister", desc: "Tableau coffret 13 rangées 26 modules. Acheté en double commande, jamais ouvert.", prix: 120, categorie: "Équipements", etat: "Neuf", photo: null, tel: "0622232425", createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), sold: false },
  { id: "l4", proId: "p7", proNom: "Pierre Rousseau", metier: "chauffagiste", titre: "Chaudière Vaillant ecoTEC plus 24kW — révisée", desc: "Chaudière déposée lors d'un remplacement chez client. Révisée, garantie 6 mois pièces. Idéale dépannage.", prix: 550, categorie: "Équipements", etat: "Occasion", photo: null, tel: "0630313233", createdAt: new Date(Date.now() - 86400000 * 7).toISOString(), sold: false },
  { id: "l5", proId: "p4", proNom: "Julien Moreau",   metier: "plombier",  titre: "Robinets thermostatiques Danfoss — lot de 8", desc: "Robinets thermostatiques RAV-N + RA-N, déposés lors rénovation. Recondés, propres, fonctionnels.", prix: 60, categorie: "Pièces", etat: "Occasion", photo: null, tel: "0618192021", createdAt: new Date(Date.now() - 86400000 * 1).toISOString(), sold: false },
];

// Ventes demo déjà conclues (pour l'admin)
const INIT_SALES = [
  { id: "s1", listingId: "demo", vendeurId: "p2", vendeurNom: "Youssef Mrani", acheteurNom: "Karim Benali", metier: "serrurier", titre: "Mallette outils serrurier complète", prix: 220, commission: 33, createdAt: new Date(Date.now() - 86400000 * 12).toISOString() },
  { id: "s2", listingId: "demo", vendeurId: "p3", vendeurNom: "Marc Fontaine",  acheteurNom: "Julien Moreau", metier: "plombier", titre: "Pompe à vide refroidissement", prix: 150, commission: 22.5, createdAt: new Date(Date.now() - 86400000 * 8).toISOString() },
  { id: "s3", listingId: "demo", vendeurId: "p5", vendeurNom: "Nicolas Laurent", acheteurNom: "David Petit", metier: "electricien", titre: "Testeur de câble réseau Fluke", prix: 95, commission: 14.25, createdAt: new Date(Date.now() - 86400000 * 4).toISOString() },
];

const LOCKR_COMMISSION = 0.15; // 15%

const INIT_CHAT = {
  Paris: [
    { id: "m1", auteurId: "p1", auteurNom: "Karim Benali", texte: "Salut les gars, quelqu'un a une référence pour les cylindres Mul-T-Lock ?", createdAt: new Date(Date.now() - 3600000 * 2).toISOString(), photo: null },
    { id: "m2", auteurId: "p2", auteurNom: "Youssef Mrani", texte: "Oui je commande chez Pro-Serrurerie, livraison J+1 à Paris.", createdAt: new Date(Date.now() - 3600000).toISOString(), photo: null },
  ],
  Lyon: [
    { id: "m3", auteurId: "p2", auteurNom: "Youssef Mrani", texte: "Bonjour Lyon ! Quelqu'un disponible pour sous-traiter ce soir ?", createdAt: new Date(Date.now() - 7200000).toISOString(), photo: null },
  ],
};

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
function loadLeaflet() {
  return new Promise(resolve => {
    if (window.L) return resolve(window.L);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve(window.L);
    document.head.appendChild(s);

function loadEmailJS() {
  return new Promise(resolve => {
    if (window.emailjs) return resolve(window.emailjs);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    s.onload = () => {
      window.emailjs.init({ publicKey: "YOUR_EMAILJS_PUBLIC_KEY" });
      resolve(window.emailjs);
    };
    document.head.appendChild(s);
  });
}

  });
}

/* ─── Geocode une adresse via Nominatim ─── */
async function geocodeAddress(address) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, {
      headers: { "Accept-Language": "fr" }
    });
    const d = await r.json();
    if (d[0]) return [parseFloat(d[0].lat), parseFloat(d[0].lon)];
  } catch {}
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
  } catch {}
  // Fallback ligne droite
  return {
    coords: Array.from({ length: 31 }, (_, i) => {
      const t = i / 30;
      return [aLat + (cLat - aLat) * t, aLng + (cLng - aLng) * t];
    }),
    durationSec: 600,
    distanceM: 2000,
  };
}

function makeSvgIcon(L, isFull, color, size = 40, transport = "voiture", photoUrl = null) {
  let inner;
  if (isFull) {
    if (photoUrl) {
      inner = `<clipPath id="cp"><circle cx="20" cy="20" r="16"/></clipPath><image href="${photoUrl}" x="4" y="4" width="32" height="32" clip-path="url(#cp)"/><circle cx="20" cy="20" r="16" fill="none" stroke="${color}" stroke-width="2"/>`;
    } else if (transport === "scooter" || transport === "moto") {
      inner = `<circle cx="20" cy="24" r="5" fill="${color}"/><circle cx="8" cy="24" r="5" fill="${color}"/><path d="M8 24 Q10 14 18 14 L24 14 L28 20 L20 20 Q17 20 14 24" stroke="${color}" stroke-width="2" fill="none"/><circle cx="24" cy="18" r="3" fill="${color}"/>`;
    } else if (transport === "velo") {
      inner = `<circle cx="10" cy="26" r="6" fill="none" stroke="${color}" stroke-width="2"/><circle cx="30" cy="26" r="6" fill="none" stroke="${color}" stroke-width="2"/><path d="M10 26 L20 14 L30 26 M20 14 L20 20 M16 20 L24 20" stroke="${color}" stroke-width="2" fill="none"/>`;
    } else if (transport === "pied") {
      inner = `<circle cx="20" cy="10" r="5" fill="${color}"/><path d="M20 15 L18 26 L15 34 M20 15 L22 26 L25 34 M16 20 L24 20" stroke="${color}" stroke-width="2" fill="none"/>`;
    } else {
      // voiture (default)
      inner = `<rect x="6" y="16" width="28" height="14" rx="3" fill="${color}"/><rect x="10" y="10" width="20" height="10" rx="2" fill="${color}"/><circle cx="12" cy="30" r="4" fill="#555"/><circle cx="28" cy="30" r="4" fill="#555"/><rect x="11" y="12" width="6" height="6" rx="1" fill="rgba(255,255,255,0.5)"/><rect x="23" y="12" width="6" height="6" rx="1" fill="rgba(255,255,255,0.5)"/>`;
    }
  } else {
    inner = `<circle cx="20" cy="14" r="5" fill="${color}"/><path d="M12 26a8 8 0 0 1 16 0" fill="${color}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40">${inner}</svg>`;
  return L.divIcon({ html: `<div style="filter:drop-shadow(0 2px 10px ${color}99)">${svg}</div>`, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

/* ─── FLEET MAP — suivi GPS en direct de tous les employés ─── */
function FleetMap({ techs = [], tr, focusId = null }) {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const markers = useRef({});
  const positions = useRef({});
  const [tick, setTick] = useState(0);

  const statusColor = (s) => s === "en_mission" ? "#c9a030" : s === "actif" ? "#1e9e6b" : "#9ca3af";

  useEffect(() => {
    if (!mapRef.current) return;
    let dead = false;
    (async () => {
      const L = await loadLeaflet();
      if (dead || !mapRef.current) return;
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
      const map = L.map(mapRef.current, { center: [48.8666, 2.35], zoom: 13, zoomControl: false, attributionControl: false });
      mapObj.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd" }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      markers.current = {};
      techs.forEach((t, i) => {
        const base = positions.current[t.id] || [48.8566 + 0.02 * Math.sin(i * 2.1) + 0.008 * i, 2.3522 + 0.025 * Math.cos(i * 1.7) - 0.006 * i];
        positions.current[t.id] = base;
        const col = statusColor(t.statut);
        const icon = L.divIcon({
          html: `<div style="position:relative">
            ${t.statut !== "inactif" ? `<div style="position:absolute;inset:-8px;border-radius:50%;background:${col};opacity:.18;animation:uberPulse 1.8s ease-out infinite"></div>` : ""}
            <div style="background:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.25);border:3px solid ${col};font-weight:800;font-size:14px;color:${col};font-family:Inter,sans-serif">${(t.prenom || "?").charAt(0)}${(t.nom || "").charAt(0)}</div>
          </div>`,
          className: "", iconSize: [40, 40], iconAnchor: [20, 20]
        });
        const mk = L.marker(base, { icon, zIndexOffset: 20 }).addTo(map);
        mk.bindPopup(`<b>${t.prenom} ${t.nom}</b><br/>${t.metier}<br/>${t.tel}`);
        markers.current[t.id] = mk;
      });
      if (techs.length) {
        map.fitBounds(L.latLngBounds(Object.values(positions.current)), { padding: [50, 50] });
      }
    })();
    return () => { dead = true; };
  }, [techs.map(t => t.id).join(",")]);

  // Mouvement live : positions mises à jour toutes les 2s
  useEffect(() => {
    const iv = setInterval(() => {
      techs.forEach(t => {
        if (t.statut === "inactif") return;
        const p = positions.current[t.id];
        if (!p) return;
        const speed = t.statut === "en_mission" ? 0.0012 : 0.0004;
        positions.current[t.id] = [p[0] + (Math.random() - 0.5) * speed * 2, p[1] + (Math.random() - 0.5) * speed * 2];
        markers.current[t.id]?.setLatLng(positions.current[t.id]);
      });
      setTick(x => x + 1);
    }, 2000);
    return () => clearInterval(iv);
  }, [techs.map(t => t.id).join(",")]);

  // Centrage sur un employé demandé
  useEffect(() => {
    if (focusId && positions.current[focusId] && mapObj.current) {
      mapObj.current.flyTo(positions.current[focusId], 15, { duration: 0.8 });
      markers.current[focusId]?.openPopup();
    }
  }, [focusId]);

  return (
    <div style={{ position: "relative", height: 380, background: "#e8eaf0", overflow: "hidden", borderRadius: 16 }}>
      <style>{`@keyframes uberPulse{0%{transform:scale(1);opacity:.25}70%{transform:scale(2.6);opacity:0}100%{transform:scale(2.6);opacity:0}}`}</style>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 500, background: "#fff", borderRadius: 20, padding: "6px 14px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 2px 10px rgba(0,0,0,.15)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", animation: "uberPulse 1.4s ease-out infinite", display: "inline-block" }} />
        <span style={{ fontWeight: 800, fontSize: 11, color: "#111", letterSpacing: ".5px" }}>{tr.fleetLiveBadge}</span>
      </div>
    </div>
  );
}

/* ─── LIVE MAP ─── */
function LiveMap({ progress = 0, artisanColor = "#5b8def", compact = false, clientPos = null, artisanPos = null, onRouteReady = null, artisan = null }) {
  const mapRef = useRef(null);
  const L_ = useRef(null);
  const mapObj = useRef(null);
  const artMk = useRef(null);
  const donePoly = useRef(null);
  const routeCoords = useRef(null);
  const routeInfoRef = useRef(null);
  const [eta, setEta] = useState(null);
  const [distKm, setDistKm] = useState(null);
  const arrived = progress >= 0.97;
  const H = compact ? 220 : 340;

  useEffect(() => {
    if (!mapRef.current) return;
    let dead = false;
    (async () => {
      const L = await loadLeaflet();
      if (dead || !mapRef.current) return;
      L_.current = L;
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }

      const cLat = clientPos?.[0] ?? 48.8566;
      const cLng = clientPos?.[1] ?? 2.3522;
      const aLat = artisanPos?.[0] ?? (cLat + 0.015);
      const aLng = artisanPos?.[1] ?? (cLng + 0.015);

      // Tuiles CartoDB Voyager — style propre, neutre, proche Uber
      const map = L.map(mapRef.current, { center: [cLat, cLng], zoom: 14, zoomControl: false, attributionControl: false });
      mapObj.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd" }).addTo(map);

      // Zoom en bas à droite (Uber style)
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Marqueur client — point bleu pulsant style Uber
      const clientIcon = L.divIcon({
        html: `<div style="position:relative;width:22px;height:22px">
          <div style="position:absolute;inset:0;border-radius:50%;background:#1a56db;opacity:.2;animation:uberPulse 1.8s ease-out infinite"></div>
          <div style="position:absolute;inset:4px;border-radius:50%;background:#1a56db;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(26,86,219,.5)"></div>
        </div>`,
        className: "", iconSize: [22, 22], iconAnchor: [11, 11]
      });
      L.marker([cLat, cLng], { icon: clientIcon, zIndexOffset: 10 }).addTo(map);

      // Marqueur artisan — bulle blanche avec icône voiture (style Uber)
      const artColor = artisanColor;
      const artIcon = L.divIcon({
        html: `<div style="background:#fff;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.22);border:2.5px solid ${artColor}">
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none"><rect x="6" y="16" width="28" height="14" rx="4" fill="${artColor}"/><rect x="10" y="10" width="20" height="10" rx="3" fill="${artColor}"/><circle cx="12" cy="30" r="4" fill="#333"/><circle cx="28" cy="30" r="4" fill="#333"/><rect x="11" y="12" width="6" height="6" rx="1" fill="rgba(255,255,255,0.55)"/><rect x="23" y="12" width="6" height="6" rx="1" fill="rgba(255,255,255,0.55)"/></svg>
        </div>`,
        className: "", iconSize: [44, 44], iconAnchor: [22, 22]
      });
      artMk.current = L.marker([aLat, aLng], { icon: artIcon, zIndexOffset: 20 }).addTo(map);

      const route = await fetchRoute(aLat, aLng, cLat, cLng);
      if (dead) return;
      routeCoords.current = route.coords;
      routeInfoRef.current = route;
      if (onRouteReady) onRouteReady(route);
      setEta(Math.round(route.durationSec / 60));
      setDistKm((route.distanceM / 1000).toFixed(1));

      // Trait pointillé gris (route restante)
      L.polyline(route.coords, { color: "#d1d5db", weight: 5, dashArray: "6 5", lineCap: "round" }).addTo(map);
      // Trait plein coloré (déjà parcouru)
      donePoly.current = L.polyline([], { color: artColor, weight: 5, lineCap: "round" }).addTo(map);

      map.fitBounds(L.latLngBounds([[aLat, aLng], [cLat, cLng]]), { padding: [60, 60] });
    })();
    return () => { dead = true; };
  }, [clientPos?.[0], clientPos?.[1], artisanPos?.[0], artisanPos?.[1]]);

  useEffect(() => {
    const c = routeCoords.current;
    if (!c || !artMk.current) return;
    const idx = Math.min(Math.floor(progress * (c.length - 1)), c.length - 1);
    const pos = c[idx];
    if (!pos) return;
    artMk.current.setLatLng(pos);
    donePoly.current?.setLatLngs(c.slice(0, idx + 1));
    if (routeInfoRef.current) {
      setEta(Math.max(0, Math.round((1 - progress) * routeInfoRef.current.durationSec / 60)));
      setDistKm(((1 - progress) * routeInfoRef.current.distanceM / 1000).toFixed(1));
    }
    // Carte suit l'artisan doucement
    if (mapObj.current && progress > 0.05) {
      mapObj.current.panTo(pos, { animate: true, duration: 0.6 });
    }
  }, [progress]);

  const etaDisplay = eta !== null ? eta : Math.max(0, Math.round((1 - progress) * 12));

  return (
    <div style={{ position: "relative", height: H, background: "#e8eaf0", overflow: "hidden", borderRadius: compact ? 16 : 0 }}>
      {/* CSS keyframe pour la pulsation */}
      <style>{`@keyframes uberPulse{0%{transform:scale(1);opacity:.25}70%{transform:scale(2.6);opacity:0}100%{transform:scale(2.6);opacity:0}}`}</style>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

      {/* Dégradé bas pour la bande flottante */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 110, background: "linear-gradient(0deg, rgba(255,255,255,1) 40%, transparent)", pointerEvents: "none" }} />

      {/* Bande inférieure flottante style Uber Eats */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 16px 14px" }}>
        {arrived ? (
          <div style={{ background: "#fff", borderRadius: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 -2px 20px rgba(0,0,0,.1)" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#111" }}>Artisan arrivé !</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Votre artisan est devant chez vous</div>
            </div>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 18, padding: "12px 16px", boxShadow: "0 -2px 20px rgba(0,0,0,.1)", display: "flex", alignItems: "center", gap: 12 }}>
            {/* Avatar artisan */}
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: `${artisanColor}18`, border: `2px solid ${artisanColor}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: artisanColor, fontWeight: 800, fontSize: 18 }}>{artisan?.nom?.charAt(0) ?? "A"}</span>
            </div>
            {/* Infos */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 20, color: "#111", lineHeight: 1 }}>{etaDisplay}</span>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>min</span>
                {distKm && <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 4 }}>· {distKm} km</span>}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {artisan?.nom ?? "Artisan"} · en route
              </div>
              {/* Barre de progression fine */}
              <div style={{ marginTop: 7, height: 3, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress * 100}%`, background: artisanColor, borderRadius: 4, transition: "width .4s ease" }} />
              </div>
            </div>
            {/* Badge LIVE */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
              <div style={{ background: "#fee2e2", borderRadius: 20, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", animation: "blink 1.2s infinite" }} />
                <span style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, letterSpacing: ".5px" }}>LIVE</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function useGeoloc() {
  const [pos, setPos] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      p => { setPos([p.coords.latitude, p.coords.longitude]); setLoading(false); },
      () => setLoading(false)
    );
  }, []);
  return { pos, loading };
}

/* ─── NOTIFICATION BANNER ─── */
function NotifBanner({ notifs }) {
  if (!notifs.length) return null;
  const n = notifs[0];
  return (
    <div className="notif-banner" style={{ padding: "12px 16px", background: "linear-gradient(135deg,rgba(28,28,28,.97),rgba(46,46,46,.97))", borderRadius: "0 0 16px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 32px rgba(0,0,0,.25)" }}>
      {Icon.bell("#fff", 20)}
      <div style={{ flex: 1 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{n.titre}</div>
        <div style={{ color: "rgba(255,255,255,.8)", fontSize: 12, marginTop: 2 }}>{n.adresse}</div>
      </div>
      <div style={{ background: "rgba(255,255,255,.2)", borderRadius: 8, padding: "4px 10px" }}>
        <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{n.montantEstime}€</span>
      </div>
    </div>
  );
}

/* ─── PAY MODAL ─── */
const PAY_METHODS = [
  { id: "visa",       label: "Visa",             type: "card",   color: "#1a1f71" },
  { id: "mastercard", label: "Mastercard",        type: "card",   color: "#eb001b" },
  { id: "cb",         label: "Carte Bancaire",    type: "card",   color: "#0052cc" },
  { id: "paypal",     label: "PayPal",            type: "wallet", color: "#003087" },
  { id: "apple",      label: "Apple Pay",         type: "wallet", color: "#000000" },
  { id: "google",     label: "Google Pay",        type: "wallet", color: "#4285f4" },
  { id: "virement",   label: "Virement bancaire", type: "bank",   color: "#059669" },
];
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
const fmtCard = v => v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
const fmtExp = v => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d; };

/* Monogramme LOCKR (le "O" cerclé, coupé) — utilisé comme icône compacte
   partout où le mot complet ne rentre pas (favicon, badges carrés, avatars). */
/* Logo unique LOCKR — un seul fichier (public/logolockr.png), utilisé à la
   fois comme logo dans toute l'app (via ce composant) et comme favicon
   (référencé directement dans index.html). Ratio 1088x320 (≈3.4:1). */
const LOGO_RATIO = 874 / 217;
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

/* ─── PLATFORM CALL MODAL ─── */
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

function PlatformCallModal({ name, onClose, onConnected, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [phase, setPhase] = useState("calling"); // calling → connected → ended
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (phase === "calling") {
      const t = setTimeout(() => setPhase("connected"), 3000);
      return () => clearTimeout(t);
    }
    if (phase === "connected") {
      if (onConnected) onConnected();
      const t = setInterval(() => setSecs(s => s + 1), 1000);
      return () => clearInterval(t);
    }
  }, [phase]);

  const fmt2 = n => String(Math.floor(n / 60)).padStart(2,"0") + ":" + String(n % 60).padStart(2,"0");

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#1c1c1e", borderRadius: 24, width: "90%", maxWidth: 340, padding: "36px 24px 28px", textAlign: "center", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(201,160,48,.15)", border: "2px solid rgba(201,160,48,.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", animation: phase === "calling" ? "pulse 1.2s infinite" : "none" }}>
          {Icon.phone("#c9a030", 28)}
        </div>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{name}</div>
        {phase === "calling" && <div style={{ color: "rgba(255,255,255,.5)", fontSize: 13 }}>{tr.callInProgress}</div>}
        {phase === "connected" && <div style={{ color: "#3ecf8e", fontSize: 13, fontWeight: 600 }}>{tr.callConnected} · {fmt2(secs)}</div>}
        <div style={{ color: "rgba(255,255,255,.35)", fontSize: 11, marginTop: 6 }}>{tr.callSecure}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28 }}>
          {phase === "connected" && (
            <button onClick={() => { setPhase("ended"); setTimeout(onClose, 800); }}
              style={{ width: 56, height: 56, borderRadius: "50%", background: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Icon.phone("#fff", 22)}
            </button>
          )}
          {phase === "calling" && (
            <button onClick={onClose}
              style={{ width: 56, height: 56, borderRadius: "50%", background: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Icon.x("#fff", 20)}
            </button>
          )}
        </div>
      </div>
    </div>
  , document.body);
}

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

/* Virements automatiques (Stripe Connect Express) — l'artisan connecte son IBAN,
   ensuite chaque paiement client est splitté automatiquement : part artisan versée
   directement, commission LOCKR retenue. Aucun reversement manuel. */
function StripeConnectCard({ lang = "fr", email, nom }) {
  const [acct, setAcct] = useState(() => localStorage.getItem("lk_stripe_acct") || null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const fr = lang !== "en";

  const activate = async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/.netlify/functions/connect-onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nom, accountId: acct }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.accountId) localStorage.setItem("lk_stripe_acct", data.accountId);
      if (data.url) { window.location.href = data.url; return; }
      throw new Error();
    } catch {
      setErr(fr ? "Paiements non configurés sur la plateforme (mode démo)." : "Payments not configured on the platform (demo mode).");
    }
    setLoading(false);
  };

  const done = acct && localStorage.getItem("lk_stripe_onboard_done") === "1";
  return (
    <div className="lk-card" style={{ padding: "18px 20px", marginTop: 20, borderLeft: `4px solid ${done ? T.success : T.accent}` }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 6 }}>💶 {fr ? "Virements automatiques" : "Automatic payouts"}</div>
      <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.6, marginBottom: 12 }}>
        {done
          ? (fr ? "Vos virements automatiques sont activés ✓ — votre part de chaque intervention est versée directement sur votre compte bancaire (sous 48 h après validation client)." : "Automatic payouts enabled ✓ — your share of each intervention is paid directly to your bank account (within 48h after client validation).")
          : (fr ? "Connectez votre IBAN de façon sécurisée (Stripe) pour recevoir automatiquement votre part de chaque intervention, sans délai de reversement manuel." : "Securely connect your IBAN (Stripe) to automatically receive your share of each intervention, with no manual transfer delay.")}
      </div>
      {!done && (
        <button onClick={activate} disabled={loading} className="lk-btn" style={{ fontSize: 12, opacity: loading ? 0.6 : 1 }}>
          {loading ? (fr ? "Ouverture…" : "Opening…") : (fr ? "Activer les virements automatiques" : "Enable automatic payouts")}
        </button>
      )}
      {err && <div style={{ color: T.warn, fontSize: 11, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

/* Paiement réel via Stripe Checkout (fonction serverless /.netlify/functions/create-checkout).
   Si Stripe n'est pas configuré (clé absente, dev local), bascule automatique en mode démo. */
async function startStripeCheckout({ amount, label, type, bookingId, email, artisanStripeId }) {
  try {
    const res = await fetch("/.netlify/functions/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, label, type, bookingId, email, artisanStripeId }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data && data.url) { window.location.href = data.url; return true; }
    return false;
  } catch { return false; }
}

function PayModal({ amount, onClose, onDone, lang = "fr", payLabel, payType, bookingId, payerEmail, artisanStripeId }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [step, setStep] = useState("method");
  const [method, setMethod] = useState(null);
  const [card, setCard] = useState({ num: "", exp: "", cvv: "", nom: "" });
  const [err, setErr] = useState("");

  const pick = m => {
    setMethod(m);
    if (m.type === "card") setStep("card");
    else if (m.type === "bank") setStep("bank");
    else setStep("confirm");
  };
  // Tente le paiement réel Stripe ; si indisponible, simulation (démo)
  const process_ = async (delay) => {
    setStep("processing");
    const real = await startStripeCheckout({ amount, label: payLabel || tr.settlementLabel, type: payType, bookingId, email: payerEmail, artisanStripeId });
    if (real) return; // redirection vers la page Stripe sécurisée
    setTimeout(() => setStep("done"), delay);
  };
  const payCard = () => {
    if (card.num.replace(/\s/g, "").length < 16) return setErr(tr.cardInvalid);
    if (card.exp.length < 5) return setErr(tr.expInvalid);
    if (card.cvv.length < 3) return setErr(tr.cvvInvalid);
    if (!card.nom) return setErr(tr.holderRequired);
    setErr(""); process_(2000);
  };
  const payNow = () => { process_(1600); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease" }}>
        <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: T.textHi, letterSpacing: "-1px" }}>{fmt(amount)}</div>
            <div style={{ color: T.textLo, fontSize: 13, marginTop: 3 }}>{tr.settlementLabel}</div>
          </div>
          <button onClick={onClose} className="lk-ghost" style={{ padding: "7px 12px" }}>{Icon.x()}</button>
        </div>
        {step === "method" && (
          <>
            {/* Rappel des garanties — lève la peur au moment de payer */}
            <div style={{ background: "rgba(30,158,107,.06)", border: "1px solid rgba(30,158,107,.18)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
              {[tr.payGuarantee1 || "✓ Paiement sécurisé", tr.payGuarantee2 || "✓ Devis avant travaux", tr.payGuarantee3 || "✓ Artisan vérifié et assuré", tr.payGuarantee4 || "✓ Recours possible"].map((g, i) => (
                <span key={i} style={{ fontSize: 10.5, color: "#1e9e6b", fontWeight: 700 }}>{g}</span>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {PAY_METHODS.map(m => (
                <button key={m.id} onClick={() => pick(m)} style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 14, padding: "12px", cursor: "pointer", textAlign: "left", transition: "all .15s", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 10 }}>
                  <PayLogo id={m.id} size={40} />
                  <span style={{ color: T.textHi, fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{m.label}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(62,207,142,.06)", border: "1px solid rgba(62,207,142,.15)", borderRadius: 10, padding: "10px 14px" }}>
              {Icon.shield(T.success, 14)}
              <span style={{ color: T.success, fontSize: 12, fontWeight: 500 }}>{tr.paymentEncrypted}</span>
            </div>
          </>
        )}
        {step === "card" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <button onClick={() => setStep("method")} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>{Icon.back(T.accent, 14)} {tr.back}</button>
              {method && <PayLogo id={method.id} size={32} />}
              <span style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{method?.label}</span>
            </div>
            <div style={{ marginBottom: 12 }}><label className="lk-label">{tr.cardNumber}</label><input className="lk-input" value={card.num} onChange={e => setCard(p => ({ ...p, num: fmtCard(e.target.value) }))} placeholder="1234 5678 9012 3456" inputMode="numeric" /></div>
            <div style={{ marginBottom: 12 }}><label className="lk-label">{tr.cardHolder}</label><input className="lk-input" value={card.nom} onChange={e => setCard(p => ({ ...p, nom: e.target.value }))} placeholder="Jean Dupont" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div><label className="lk-label">{tr.expiry}</label><input className="lk-input" value={card.exp} onChange={e => setCard(p => ({ ...p, exp: fmtExp(e.target.value) }))} placeholder="MM/AA" inputMode="numeric" /></div>
              <div><label className="lk-label">{tr.cvv}</label><input className="lk-input" type="password" value={card.cvv} onChange={e => setCard(p => ({ ...p, cvv: e.target.value.slice(0, 4) }))} placeholder="123" inputMode="numeric" /></div>
            </div>
            {err && <div style={{ background: "rgba(240,101,101,.08)", border: "1px solid rgba(240,101,101,.2)", borderRadius: 10, padding: "10px 14px", color: T.danger, fontSize: 13, marginBottom: 14 }}>{err}</div>}
            <button onClick={payCard} className="lk-btn">{tr.pay} {fmt(amount)}</button>
          </>
        )}
        {step === "bank" && (
          <>
            <button onClick={() => setStep("method")} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>{Icon.back(T.accent, 14)} {tr.back}</button>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px", marginBottom: 16 }}>
              <div style={{ color: T.textLo, fontSize: 11, marginBottom: 4 }}>IBAN</div>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13, fontFamily: "monospace", letterSpacing: ".5px", marginBottom: 12 }}>FR76 3000 6000 0112 3456 7890 189</div>
              <div style={{ color: T.textLo, fontSize: 11, marginBottom: 4 }}>BIC / SWIFT</div>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13, fontFamily: "monospace", marginBottom: 12 }}>BNPAFRPPXXX</div>
              <div style={{ color: T.textLo, fontSize: 11, marginBottom: 4 }}>Référence</div>
              <div style={{ color: T.accent, fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>LOCKR-{uid().slice(0, 8).toUpperCase()}</div>
            </div>
            <div style={{ color: T.textMid, fontSize: 12, lineHeight: 1.6, marginBottom: 20 }}>Effectuez le virement de <strong>{fmt(amount)}</strong> avec la référence ci-dessus. Votre paiement sera confirmé sous 1–2 jours ouvrés.</div>
            <button onClick={payNow} className="lk-btn">{tr.confirmPayment}</button>
          </>
        )}
        {step === "confirm" && method && (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <PayLogo id={method.id} size={72} />
            </div>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{tr.confirmWith} {method.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.accent, letterSpacing: "-1px", marginBottom: 20 }}>{fmt(amount)}</div>
            <button onClick={payNow} className="lk-btn" style={{ marginBottom: 10 }}>{tr.confirmPayment}</button>
            <button onClick={() => setStep("method")} className="lk-ghost" style={{ width: "100%" }}>{tr.changeMethod}</button>
          </div>
        )}
        {step === "processing" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ width: 52, height: 52, border: "3px solid rgba(0,0,0,.06)", borderTop: `3px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ color: T.textMid, fontSize: 14, fontWeight: 500 }}>{tr.processing}</div>
          </div>
        )}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ width: 76, height: 76, background: "rgba(62,207,142,.1)", border: "1.5px solid rgba(62,207,142,.3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", animation: "checkPop .4s ease" }}>
              {Icon.check(T.success, 30)}
            </div>
            <div style={{ color: T.success, fontWeight: 800, fontSize: 20, marginBottom: 6 }}>{tr.paymentConfirmed}</div>
            <div style={{ color: T.textLo, fontSize: 13, marginBottom: 28 }}>{fmt(amount)} {tr.debited}</div>
            <button onClick={onDone} style={{ width: "100%", background: "linear-gradient(135deg,#2aaf77,#1d8f5f)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.close}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── EMAIL CONFIRM MODAL ─── */
/* ─── EMAIL CONFIRM MODAL ─── */
function EmailConfirmModal({ account, onVerified, onClose }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [step, setStep] = useState("sending");
  const [realCode] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const refs = useRef([]);

  useEffect(() => {
    // Mode démo : affichage direct du code — à remplacer par EmailJS en production
    setStep("input");
  }, []);

  const setDigit = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const n = [...digits]; n[i] = val; setDigits(n);
    if (val && i < 5) refs.current[i + 1]?.focus();
    if (!val && i > 0) refs.current[i - 1]?.focus();
  };
  const onKD = (i, e) => { if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus(); };
  const onPaste = e => {
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (p.length === 6) setDigits(p.split(""));
  };
  const verify = () => {
    if (digits.join("").length < 6) return;
    setStep("verifying");
    setTimeout(() => {
      if (digits.join("") === realCode) setStep("success");
      else { setDigits(["", "", "", "", "", ""]); setStep("error"); refs.current[0]?.focus(); }
    }, 1200);
  };
  const dStyle = i => ({
    width: 44, height: 54,
    background: digits[i] ? "rgba(0,0,0,.06)" : "rgba(0,0,0,.03)",
    border: `1.5px solid ${digits[i] ? "rgba(28,28,28,.5)" : "rgba(0,0,0,.08)"}`,
    borderRadius: 12, color: T.textHi, fontSize: 22, fontWeight: 700,
    textAlign: "center", outline: "none", caretColor: T.accent,
    fontFamily: "monospace", transition: "all .15s"
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{CSS}</style>
      <div style={{ background: T.surface, borderRadius: 20, width: "100%", maxWidth: 420, padding: "28px 24px", animation: "fadeUp .3s ease", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        {step === "sending" && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ width: 48, height: 48, border: "2.5px solid rgba(0,0,0,.06)", borderTop: `2.5px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ color: T.textMid, fontSize: 14 }}>Envoi de l'email en cours…</div>
          </div>
        )}
        {(step === "input" || step === "error") && (
          <>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ width: 64, height: 64, background: "rgba(201,160,48,.1)", border: "1.5px solid rgba(201,160,48,.25)", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                {Icon.mail(T.gold, 28)}
              </div>
              <div style={{ color: T.textHi, fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Vérification du compte</div>
              <div style={{ color: T.textMid, fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
                Votre code de vérification pour<br />
                <strong style={{ color: T.accent }}>{account.email}</strong>
              </div>
              <div style={{ background: "linear-gradient(135deg,#1c1c1c,#2e2e2e)", borderRadius: 14, padding: "18px 20px", marginBottom: 4 }}>
                <div style={{ color: "rgba(255,255,255,.5)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 8 }}>Votre code</div>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 34, letterSpacing: "10px", fontFamily: "monospace" }}>{realCode}</div>
              </div>
              <div style={{ fontSize: 11, color: T.textLo, marginBottom: 4 }}>⚠️ Mode démo — sera envoyé par email en production</div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: T.textLo, fontSize: 12, textAlign: "center", marginBottom: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>
                Saisissez le code à 6 chiffres
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }} onPaste={onPaste}>
                {digits.map((d, i) => (
                  <input key={i} ref={el => refs.current[i] = el} value={d}
                    onChange={e => setDigit(i, e.target.value)}
                    onKeyDown={e => onKD(i, e)}
                    style={dStyle(i)} inputMode="numeric" maxLength={1} />
                ))}
              </div>
            </div>
            {step === "error" && (
              <div style={{ background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.18)", borderRadius: 10, padding: "10px 14px", color: T.danger, fontSize: 13, textAlign: "center", marginBottom: 14 }}>
                Code incorrect — réessayez
              </div>
            )}
            <button onClick={verify} disabled={digits.join("").length < 6} className="lk-btn" style={{ marginBottom: 10 }}>
              Vérifier le code
            </button>
            <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: T.textLo, fontSize: 13, cursor: "pointer", padding: "6px", fontFamily: "'Inter',sans-serif" }}>
              Annuler
            </button>
          </>
        )}
        {step === "verifying" && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ width: 48, height: 48, border: "2.5px solid rgba(0,0,0,.06)", borderTop: `2.5px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ color: T.textMid, fontSize: 14 }}>Vérification…</div>
          </div>
        )}
        {step === "success" && (
          <div style={{ textAlign: "center", padding: "20px 10px" }}>
            <div style={{ width: 80, height: 80, background: "rgba(30,158,107,.08)", border: "1.5px solid rgba(30,158,107,.25)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", animation: "checkPop .4s ease" }}>
              {Icon.check(T.success, 32)}
            </div>
            <div style={{ color: T.success, fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Compte vérifié !</div>
            <div style={{ color: T.textLo, fontSize: 13, marginBottom: 28 }}>Bienvenue, <strong style={{ color: T.textHi }}>{account.nom}</strong> 👋</div>
            <button onClick={onVerified} className="lk-btn">Accéder à l'application</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── FIELD (hors composant pour éviter le re-mount à chaque frappe) ─── */
function Field({ label, value, onChange, placeholder, type = "text", err }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="lk-label">{label}</label>
      <input
        type={type}
        className="lk-input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={onChange}
        style={{ background: err ? "rgba(240,101,101,.06)" : "", borderColor: err ? "rgba(240,101,101,.4)" : "" }}
      />
      {err && <div style={{ color: T.danger, fontSize: 11, marginTop: 5 }}>{err}</div>}
    </div>
  );
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
function RegisterClientScreen({ onBack, onSuccess, accounts, setAccounts, lang = "fr" }) {
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
  const [modal, setModal] = useState(false);
  const [pending, setPending] = useState(null);
  const [cguOk, setCguOk] = useState(false);
  const [liabOk, setLiabOk] = useState(false);

  const clr = k => setErrs(p => { const e = { ...p }; delete e[k]; return e; });

  const validate = () => {
    const e = {};
    if (!prenom.trim()) e.prenom = tr.firstnameRequired;
    if (!nom.trim()) e.nom = tr.lastnameRequired;
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = tr.invalidEmail;
    if (accounts.some(a => a.email === email)) e.email = tr.emailUsed;
    if (!tel || tel.replace(/\D/g, "").length < 6) e.tel = tr.invalidPhone;
    if (pass.length < 6) e.pass = tr.minChars;
    if (pass !== confirm) e.confirm = tr.passMismatch;
    if (!cguOk) e.cgu = tr.cguRequired;
    if (!liabOk) e.liab = tr.liabRequired;
    return e;
  };

  const submit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrs(e); return; }
    const acc = { id: uid(), role: "client", nom: prenom + " " + nom, email, pass, verified: false, photo: null, ville, tel, cguAcceptedAt: ts(), liabAcceptedAt: ts() };
    setPending(acc);
    setModal(true);
  };

  const onVerified = () => {
    setAccounts(p => [...p, { ...pending, verified: true }]);
    setModal(false);
    onSuccess({ ...pending, verified: true });
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
          <Field label={tr.email} value={email} onChange={e => { setEmail(e.target.value); clr("email"); }} placeholder="jean@email.fr" type="email" err={errs.email} />
          <div style={{ marginBottom: 14 }}>
            <label className="lk-label">{tr.phone}</label>
            <PhoneInput value={tel} onChange={v => { setTel(v); clr("tel"); }} />
            {errs.tel && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.tel}</div>}
          </div>
          <Field label={tr.city} value={ville} onChange={e => setVille(e.target.value)} placeholder="Paris" err={errs.ville} />
          <div style={{ borderTop: "1px solid rgba(0,0,0,.06)", paddingTop: 18, marginBottom: 8 }}>
            <Field label={tr.password} value={pass} onChange={e => { setPass(e.target.value); clr("pass"); }} placeholder={tr.minChars} type="password" err={errs.pass} />
            <Field label={tr.confirmPassword} value={confirm} onChange={e => { setConfirm(e.target.value); clr("confirm"); }} placeholder={tr.repeatPassword} type="password" err={errs.confirm} />
          </div>
          {/* CGU */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={cguOk} onChange={e => { setCguOk(e.target.checked); clr("cgu"); }} style={{ marginTop: 3, accentColor: T.accent }} />
              <span style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>
                {tr.cguAccept} — <span style={{ color: T.accent, textDecoration: "underline" }}>{tr.cguLink}</span>
              </span>
            </label>
            {errs.cgu && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.cgu}</div>}
          </div>
          {/* Clause de responsabilité — recours contre l'artisan uniquement */}
          <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(201,160,48,.05)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 12 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={liabOk} onChange={e => { setLiabOk(e.target.checked); clr("liab"); }} style={{ marginTop: 3, accentColor: T.accent }} />
              <span style={{ fontSize: 11, color: T.textMid, lineHeight: 1.55 }}>{tr.liabClientAccept}</span>
            </label>
            {errs.liab && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.liab}</div>}
          </div>
          <button onClick={submit} className="lk-btn">{tr.createMyAccount} {Icon.arrow("#fff", 14)}</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <span style={{ color: T.textLo, fontSize: 13 }}>{tr.alreadyMember} </span>
          <button onClick={onBack} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{tr.connectAs}</button>
        </div>
      </div>
      </div>
      {modal && pending && <EmailConfirmModal account={pending} onVerified={onVerified} onClose={() => setModal(false)} lang={lang} />}
    </div>
  );
}

/* ─── REGISTER PRO ─── */
function RegisterProScreen({ onBack, onSuccess, accounts, setAccounts, lang = "fr" }) {
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
  const [modal, setModal] = useState(false);
  const [pending, setPending] = useState(null);
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

  /* Vérification SIRET : 14 chiffres + clé de Luhn (algorithme officiel INSEE) */
  const siretValid = (v) => {
    const d = v.replace(/\s/g, "");
    if (!/^\d{14}$/.test(d)) return false;
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      let n = Number(d[i]);
      if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    return sum % 10 === 0;
  };

  const validateStep1 = () => {
    const e = {};
    if (!prenom.trim()) e.prenom = tr.firstnameRequired;
    if (!nom.trim()) e.nom = tr.lastnameRequired;
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = tr.invalidEmail;
    if (accounts.some(a => a.email === email)) e.email = tr.emailUsed;
    if (!tel || tel.replace(/\D/g, "").length < 6) e.tel = tr.invalidPhone;
    if (pass.length < 6) e.pass = tr.minChars;
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
    if (!cguOk) e.cgu = tr.cguRequired;
    if (!liabOk) e.liab = tr.liabRequired;
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const goStep2 = () => { if (validateStep1()) setStep(2); };

  const submit = () => {
    if (!validateStep2()) return;
    const acc = {
      id: uid(), role: "pro", artisanId: "a" + uid(),
      nom: prenom + " " + nom, email, pass, verified: false,
      photo: null, ville, tel, transport, metier: metiers[0], metiers, siret, iban, certif,
      hasIdCard: !!idCardFile, hasInsurance: !!insuranceFile, hasKbis: !!kbisFile, dossierStatus: "pending",
      cguAcceptedAt: ts(), liabAcceptedAt: ts(),
    };
    setPending(acc);
    setModal(true);
  };

  const onVerified = () => {
    setAccounts(p => [...p, { ...pending, verified: true }]);
    setModal(false);
    onSuccess({ ...pending, verified: true });
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
            <Field label={tr.email} value={email} onChange={e => { setEmail(e.target.value); clr("email"); }} placeholder="pro@email.fr" type="email" err={errs.email} />
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.phone}</label>
              <PhoneInput value={tel} onChange={v => { setTel(v); clr("tel"); }} />
              {errs.tel && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.tel}</div>}
            </div>
            <Field label={tr.city} value={ville} onChange={e => setVille(e.target.value)} placeholder="Paris" err={errs.ville} />
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
              <Field label={tr.password} value={pass} onChange={e => { setPass(e.target.value); clr("pass"); }} placeholder={tr.minChars} type="password" err={errs.pass} />
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
              <input className="lk-input" value={iban} onChange={e => setIban(e.target.value.toUpperCase())} placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
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

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={cguOk} onChange={e => { setCguOk(e.target.checked); clr("cgu"); }} style={{ marginTop: 3, accentColor: T.accent }} />
                <span style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>{tr.cguAccept} — <span style={{ color: T.accent, textDecoration: "underline" }}>{tr.cguLink}</span></span>
              </label>
              {errs.cgu && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.cgu}</div>}
            </div>
            {/* Clause de responsabilité professionnelle — engagement d'indemnisation */}
            <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(201,160,48,.05)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 12 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={liabOk} onChange={e => { setLiabOk(e.target.checked); clr("liab"); }} style={{ marginTop: 3, accentColor: T.accent }} />
                <span style={{ fontSize: 11, color: T.textMid, lineHeight: 1.55 }}>{tr.liabProAccept}</span>
              </label>
              {errs.liab && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.liab}</div>}
            </div>
            <button onClick={submit} className="lk-btn">{tr.submitDossier} {Icon.check("#fff", 14)}</button>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <span style={{ color: T.textLo, fontSize: 13 }}>{tr.alreadyMember} </span>
          <button onClick={onBack} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{tr.connectAs}</button>
        </div>
      </div>
      </div>
      {modal && pending && <EmailConfirmModal account={pending} onVerified={onVerified} onClose={() => setModal(false)} lang={lang} />}
    </div>
  );
}

/* ─── REGISTER ENTREPRISE ─── */
function RegisterEntrepriseScreen({ onBack, onSuccess, accounts, setAccounts, lang = "fr" }) {
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
  const [ibanFile, setIbanFile] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [iban, setIban] = useState("");
  const [cguOk, setCguOk] = useState(false);
  const [liabOk, setLiabOk] = useState(false);
  const [errs, setErrs] = useState({});
  const [modal, setModal] = useState(false);
  const [pending, setPending] = useState(null);
  const kbisRef = useRef(null);
  const rcRef = useRef(null);
  const ibanRef = useRef(null);
  const logoRef = useRef(null);

  const clr = k => setErrs(p => { const e = { ...p }; delete e[k]; return e; });
  const formeOptions = (tr.formeOptions || "SAS,SARL,SA,EURL,SNC,EI,Auto-entrepreneur,Autre").split(",");
  const secteurOptions = (tr.entSecteurs || "Serrurerie,Plomberie,Électricité,Chauffage,Fermetures,Multi-métiers").split(",");

  const toggleSecteur = (s) => setSecteurs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const validateStep1 = () => {
    const e = {};
    if (!raisonSociale.trim()) e.rs = lang === "en" ? "Company name required" : "Raison sociale requise";
    if (!siret.replace(/\s/g, "").match(/^\d{14}$/)) e.siret = tr.siretInvalid;
    if (accounts.some(a => a.email === email)) e.email = tr.emailUsed;
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = tr.invalidEmail;
    if (!tel || tel.replace(/\D/g, "").length < 6) e.tel = tr.invalidPhone;
    if (pass.length < 6) e.pass = tr.minChars;
    if (pass !== confirm) e.confirm = tr.passMismatch;
    if (secteurs.length === 0) e.secteurs = lang === "en" ? "Select at least one sector" : "Sélectionnez au moins un secteur";
    setErrs(e); return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e = {};
    if (!kbisFile) e.kbis = lang === "en" ? "Kbis required" : "Extrait Kbis requis";
    if (!rcProFile) e.rc = lang === "en" ? "RC Pro required" : "Attestation RC Pro requise";
    if (!iban.trim()) e.iban = lang === "en" ? "IBAN required" : "IBAN requis";
    if (!cguOk) e.cgu = tr.cguRequired;
    if (!liabOk) e.liab = tr.liabRequired;
    setErrs(e); return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validateStep2()) return;
    const acc = {
      id: uid(), role: "partenaire",
      nom: raisonSociale, email, pass, verified: false,
      forme, siret, capital, rcs, tva, iban, ville, tel,
      secteurs: secteurs.map(s => s.toLowerCase()),
      assurance: rcProFile ? "RC Pro fournie" : "",
      qualibat: "", logo: logoFile || null,
      statut: "en_attente", dateContrat: new Date().toLocaleDateString("fr-FR"),
      dossierStatus: "pending",
      cguAcceptedAt: ts(), liabAcceptedAt: ts(),
    };
    setPending(acc);
    setModal(true);
  };

  const onVerified = () => {
    setAccounts(p => [...p, { ...pending, verified: true }]);
    setModal(false);
    onSuccess({ ...pending, verified: true });
  };

  const handleFile = (ref, setter) => {
    ref.current?.click();
    ref.current && (ref.current.onchange = e => {
      const f = e.target.files?.[0];
      if (f) setter(f.name);
    });
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
            {[lang === "en" ? "5% commission on all missions" : "Commission à 5% sur toutes les missions",
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
            <Field label={tr.email} value={email} onChange={e => { setEmail(e.target.value); clr("email"); }} placeholder="contact@entreprise.fr" type="email" err={errs.email} />
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.phone}</label>
              <PhoneInput value={tel} onChange={v => { setTel(v); clr("tel"); }} />
              {errs.tel && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.tel}</div>}
            </div>
            <Field label={tr.city} value={ville} onChange={e => setVille(e.target.value)} placeholder="Paris" />
            {/* Secteurs */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.secteurActivite}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {secteurOptions.map(s => (
                  <button key={s} type="button" onClick={() => { toggleSecteur(s); clr("secteurs"); }} style={{ border: `1.5px solid ${secteurs.includes(s) ? T.accent : T.border}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", background: secteurs.includes(s) ? "rgba(201,160,48,.1)" : T.surface, color: secteurs.includes(s) ? T.accent : T.textMid }}>{s}</button>
                ))}
              </div>
              {errs.secteurs && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.secteurs}</div>}
            </div>
            <div style={{ borderTop: "1px solid rgba(0,0,0,.06)", paddingTop: 18, marginBottom: 8 }}>
              <Field label={tr.password} value={pass} onChange={e => { setPass(e.target.value); clr("pass"); }} placeholder={tr.minChars} type="password" err={errs.pass} />
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

            {/* CGU */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={cguOk} onChange={e => { setCguOk(e.target.checked); clr("cgu"); }} style={{ marginTop: 3, accentColor: T.accent }} />
                <span style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>{tr.cguAccept} — <span style={{ color: T.accent, textDecoration: "underline" }}>{tr.cguLink}</span></span>
              </label>
              {errs.cgu && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.cgu}</div>}
            </div>

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
              <div style={{ marginTop: 4 }}>{secteurs.join(", ")}</div>
            </div>

            <div style={{ background: "rgba(30,158,107,.05)", border: "1px solid rgba(30,158,107,.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: T.textMid }}>{tr.entPending}</div>
            <button onClick={submit} className="lk-btn">{tr.entSubmit} {Icon.check("#fff", 14)}</button>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <span style={{ color: T.textLo, fontSize: 13 }}>{tr.alreadyMember} </span>
          <button onClick={onBack} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{tr.connectAs}</button>
        </div>
      </div>
      </div>
      {modal && pending && <EmailConfirmModal account={pending} onVerified={onVerified} onClose={() => setModal(false)} lang={lang} />}
    </div>
  );
}

/* ─── LOGIN ─── */
function LoginScreen({ onLogin, onRegister, accounts, lang = "fr", setLang }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [tab, setTab] = useState("client");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const w = useWindowSize();
  const isDesktop = w >= BP;

  const demos = tab === "client"
    ? [{ email: "client@demo.fr", label: "Martin D." }, { email: "sophie@demo.fr", label: "Sophie B." }]
    : tab === "pro"
    ? [{ email: "karim@demo.fr", label: "Karim B." }, { email: "youssef@demo.fr", label: "Youssef M." }]
    : [{ email: "contact@batipro.fr", label: "BâtiPro" }, { email: "info@electroservices.fr", label: "Électro Svc" }];

  const login = () => {
    const adminAcc = accounts.find(a => a.email === email && a.pass === pass && a.role === "admin");
    if (adminAcc) return onLogin(adminAcc);
    const role = tab === "entreprise" ? "partenaire" : tab;
    const acc = accounts.find(a => a.email === email && a.pass === pass && a.role === role);
    if (!acc) return setErr(tr.wrongCredentials);
    if (!acc.verified) return setErr(tr.notVerified);
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
          <div style={{ display: "flex", background: "rgba(0,0,0,.04)", borderRadius: 11, padding: 4, marginBottom: 22 }}>
            {[{ id: "client", label: tr.individual }, { id: "pro", label: tr.craftsman }, { id: "entreprise", label: tr.partnerTab }].map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setEmail(""); setPass(""); setErr(""); }} style={{ flex: 1, border: "none", borderRadius: 9, padding: "10px 6px", cursor: "pointer", background: tab === t.id ? T.grad : "transparent", color: tab === t.id ? "#fff" : T.textLo, fontWeight: 600, fontSize: 11, transition: "all .2s", fontFamily: "'Inter',sans-serif" }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="lk-card" style={{ borderRadius: 16, padding: "24px 20px", marginBottom: 18 }}>
            {tab === "entreprise" && (
              <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                {Icon.shield(T.accent, 16)}
                <span style={{ color: T.accent, fontSize: 12, fontWeight: 600 }}>{tr.partnerBanner} LOCKR</span>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label className="lk-label">{tr.email}</label>
              <input className="lk-input" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="email@exemple.fr" type="email" autoComplete="email" />
            </div>
            <div style={{ marginBottom: err ? 12 : 20 }}>
              <label className="lk-label">{tr.password}</label>
              <input className="lk-input" type="password" value={pass} onChange={e => { setPass(e.target.value); setErr(""); }} placeholder="••••••••" autoComplete="current-password" onKeyDown={e => e.key === "Enter" && login()} />
            </div>
            {err && <div style={{ color: T.danger, fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>{Icon.x(T.danger, 13)} {err}</div>}
            <button onClick={login} className="lk-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {tab === "client" ? tr.findCraftsman : tab === "entreprise" ? tr.partnerLogin : tr.myMissions} {Icon.arrow("#fff", 15)}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {demos.map(d => (
              <button key={d.email} onClick={() => { setEmail(d.email); setPass("1234"); }} style={{ flex: 1, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 14px", cursor: "pointer", color: T.textMid, fontSize: 12, fontWeight: 500, fontFamily: "'Inter',sans-serif" }}>
                {d.label}
              </button>
            ))}
          </div>
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
            <button onClick={onRegister} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontFamily: "'Inter',sans-serif" }}>
              {lang === "en" ? "Become a LOCKR partner — Join us" : "Devenir partenaire LOCKR — Rejoignez-nous"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── DEVIS MODAL (Feature 3) ─── */
function DevisModal({ artisan, probleme, montant, onAccept, onCancel, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [accepted, setAccepted] = useState(false);
  const [err, setErr] = useState("");
  const acompte = montant * 0.5;
  const prob = PROBLEMES.find(p => p.id === probleme);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
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
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: T.textLo, fontSize: 13 }}>{tr.devisTotal}</span>
              <span style={{ color: T.textHi, fontWeight: 800, fontSize: 16 }}>{fmt(montant)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.textMid, fontSize: 13 }}>{tr.devisDeposit}</span>
              <span style={{ color: T.accent2, fontWeight: 700, fontSize: 14 }}>{fmt(acompte)}</span>
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
          {tr.depositPayment} — {fmt(acompte)} {Icon.arrow("#fff", 14)}
        </button>
        <button onClick={onCancel} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
      </div>
    </div>
  );
}

/* ─── SATISFACTION MODAL (Feature 6) ─── */
function SatisfactionModal({ booking, onSubmit, onClose, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [note, setNote] = useState(0);
  const [comment, setComment] = useState("");
  const prob = PROBLEMES.find(p => p.id === booking?.probleme);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease" }}>
        <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{tr.satisfactionTitle}</div>
          <div style={{ color: T.textLo, fontSize: 13 }}>{pLabel(prob, lang)}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 20 }}>
          {[1, 2, 3, 4, 5].map(s => (
            <button key={s} onClick={() => setNote(s)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              {Icon.star(note >= s ? T.gold : "rgba(0,0,0,.15)", 32)}
            </button>
          ))}
        </div>
        <textarea
          className="lk-input"
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder={tr.satisfactionComment}
          rows={3}
          style={{ resize: "none", marginBottom: 16 }}
        />
        <button onClick={() => { if (note > 0) onSubmit(note, comment); }} disabled={note === 0} className="lk-btn" style={{ marginBottom: 10 }}>
          {tr.satisfactionSubmit} {Icon.check("#fff", 14)}
        </button>
        <button onClick={onClose} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
      </div>
    </div>
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
  const subtotal = thisMonth.reduce((s, b) => s + (b.montantFinal || 0), 0);
  const share = subtotal * 0.40;
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
                    <div style={{ color: T.success, fontSize: 11 }}>{fmt((b.montantFinal || 0) * 0.40)}</div>
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

/* ─── CLOTURE MODAL ─── */
function ClotureModal({ mission, artisan, onConfirm, onCancel, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [montant, setMontant] = useState(String(mission?.montant || ""));
  const [factureImg, setFactureImg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [statut, setStatut] = useState("payé");
  const [step, setStep] = useState("form");
  const [err, setErr] = useState("");
  const [acompte, setAcompte] = useState("");
  const fileRef = useRef(null);
  const prob = PROBLEMES.find(p => p.id === mission?.probleme);

  const handleFile = e => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!f.type.startsWith("image/")) return setErr(tr.selectImage);
    setErr(""); const r = new FileReader();
    r.onload = ev => { setFactureImg(ev.target.result); setPreview(ev.target.result); };
    r.readAsDataURL(f);
  };
  const validate = () => {
    const m = parseFloat(montant.replace(",", "."));
    if (isNaN(m) || m <= 0) return setErr(tr.invoiceInvalid);
    if (!factureImg) return setErr(tr.invoiceRequired);
    setErr(""); setStep("confirm");
  };
  const isPaid = statut === "payé";
  const montantNum = parseFloat(montant.replace(",", ".")) || 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", maxHeight: "90vh", overflowY: "auto", animation: "slideUp .3s ease" }}>
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
              {!preview ? (
                <button onClick={() => fileRef.current?.click()} style={{ width: "100%", background: "rgba(0,0,0,.02)", border: "1.5px dashed rgba(28,28,28,.2)", borderRadius: 14, padding: "28px 20px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, fontFamily: "'Inter',sans-serif" }}>
                  {Icon.cam(T.accent, 30)}
                  <div style={{ color: T.accent, fontWeight: 600, fontSize: 13 }}>{tr.photographOrSelect}</div>
                </button>
              ) : (
                <div style={{ position: "relative", borderRadius: 13, overflow: "hidden", border: "1px solid rgba(62,207,142,.3)" }}>
                  <img src={preview} alt="Facture" style={{ width: "100%", maxHeight: 200, objectFit: "cover" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg,rgba(0,0,0,.45),transparent)", display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{Icon.check(T.success, 14)}<span style={{ color: T.success, fontSize: 12, fontWeight: 600 }}>{tr.invoiceAdded}</span></div>
                    <button onClick={() => { setFactureImg(null); setPreview(null); }} style={{ background: "rgba(240,101,101,.2)", border: "1px solid rgba(240,101,101,.3)", borderRadius: 8, padding: "4px 10px", color: T.danger, fontSize: 11, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.removeFile}</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="lk-label">{tr.totalAmount}</label>
              <div style={{ position: "relative" }}>
                <input type="number" value={montant} onChange={e => { setMontant(e.target.value); setErr(""); }} className="lk-input" style={{ paddingRight: 40, fontSize: 22, fontWeight: 800 }} placeholder="0" />
                <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.textLo, fontWeight: 700, fontSize: 18 }}>€</div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {[50, 80, 90, 120, 150, 200].map(v => (
                  <button key={v} onClick={() => setMontant(String(v))} style={{ flex: 1, background: parseFloat(montant) === v ? "rgba(0,0,0,.06)" : "rgba(0,0,0,.03)", border: `1px solid ${parseFloat(montant) === v ? "rgba(28,28,28,.4)" : "rgba(0,0,0,.06)"}`, borderRadius: 8, padding: "6px 0", color: parseFloat(montant) === v ? T.accent : T.textLo, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{v}€</button>
                ))}
              </div>
            </div>
            {montantNum > 0 && (
              <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(0,0,0,.06)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: T.textLo, fontSize: 13 }}>{tr.yourShare40}</span>
                  <span style={{ color: T.success, fontWeight: 700, fontSize: 13 }}>{fmt(montantNum * 0.40)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: T.textLo, fontSize: 13 }}>LOCKR (60%)</span>
                  <span style={{ color: T.textMid, fontWeight: 700, fontSize: 13 }}>{fmt(montantNum * 0.60)}</span>
                </div>
              </div>
            )}
            <div style={{ marginBottom: 20 }}>
              <label className="lk-label">{tr.paymentStatus}</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button onClick={() => setStatut("payé")} style={{ background: isPaid ? "rgba(62,207,142,.08)" : "rgba(255,255,255,.02)", border: `1px solid ${isPaid ? "rgba(62,207,142,.3)" : "rgba(0,0,0,.06)"}`, borderRadius: 12, padding: "14px 12px", cursor: "pointer", textAlign: "left", fontFamily: "'Inter',sans-serif" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${isPaid ? T.success : "rgba(0,0,0,.1)"}`, background: isPaid ? "rgba(62,207,142,.2)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isPaid && Icon.check(T.success, 11)}
                    </div>
                    <span style={{ color: isPaid ? T.success : T.textMid, fontWeight: 700, fontSize: 13 }}>{tr.paid}</span>
                  </div>
                </button>
                <button onClick={() => setStatut("en_attente")} style={{ background: !isPaid ? "rgba(245,166,35,.07)" : "rgba(255,255,255,.02)", border: `1px solid ${!isPaid ? "rgba(245,166,35,.3)" : "rgba(0,0,0,.06)"}`, borderRadius: 12, padding: "14px 12px", cursor: "pointer", textAlign: "left", fontFamily: "'Inter',sans-serif" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${!isPaid ? T.warn : "rgba(0,0,0,.1)"}`, background: !isPaid ? "rgba(245,166,35,.2)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {!isPaid && <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.warn }} />}
                    </div>
                    <span style={{ color: !isPaid ? T.warn : T.textMid, fontWeight: 700, fontSize: 13 }}>{tr.pending}</span>
                  </div>
                </button>
              </div>
            </div>
            {err && <div style={{ background: "rgba(240,101,101,.07)", border: "1px solid rgba(240,101,101,.2)", borderRadius: 10, padding: "10px 14px", color: T.danger, fontSize: 13, marginBottom: 14 }}>{err}</div>}
            <button onClick={validate} className="lk-btn" style={{ marginBottom: 10 }}>{tr.next} {Icon.arrow("#fff", 14)}</button>
            <button onClick={onCancel} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </>
        )}
        {step === "confirm" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{tr.summary}</div>
            </div>
            {preview && <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 16 }}><img src={preview} alt="Facture" style={{ width: "100%", height: 130, objectFit: "cover" }} /></div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <div style={{ background: "rgba(62,207,142,.07)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ color: T.textLo, fontSize: 11, marginBottom: 4 }}>{tr.amountLabel}</div>
                <div style={{ color: isPaid ? T.success : T.warn, fontWeight: 800, fontSize: 22 }}>{fmt(montantNum)}</div>
              </div>
              <div style={{ background: "rgba(62,207,142,.07)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ color: T.textLo, fontSize: 11, marginBottom: 4 }}>{tr.yourShare}</div>
                <div style={{ color: T.success, fontWeight: 800, fontSize: 22 }}>{fmt(montantNum * 0.40)}</div>
              </div>
            </div>
            <button onClick={() => onConfirm(montantNum, factureImg, statut, parseFloat(acompte) || 0)} style={{ width: "100%", background: isPaid ? "linear-gradient(135deg,#2aaf77,#1d8f5f)" : "linear-gradient(135deg,#c87d1a,#a86010)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10, fontFamily: "'Inter',sans-serif" }}>
              {isPaid ? tr.confirmPaid : tr.confirmPending}
            </button>
            <button onClick={() => setStep("form")} className="lk-ghost" style={{ width: "100%" }}>{tr.edit}</button>
          </>
        )}
      </div>
    </div>
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
  const messages = chatMessages[region] || [];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleFile = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { setPhotoPreview(ev.target.result); setPhotoData(ev.target.result); };
    r.readAsDataURL(f);
  };
  const sendMsg = () => {
    if (!msg.trim() && !photoData) return;
    const newMsg = { id: uid(), auteurId: account.id, auteurNom: account.nom, texte: msg.trim(), createdAt: ts(), photo: photoData };
    setChatMessages(p => ({ ...p, [region]: [...(p[region] || []), newMsg] }));
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
                <span style={{ color: isMe ? "#fff" : T.textMid, fontSize: 12, fontWeight: 700 }}>{m.auteurNom.charAt(0)}</span>
              </div>
              <div style={{ maxWidth: "70%" }}>
                {!isMe && <div style={{ color: T.textLo, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>{m.auteurNom}</div>}
                {m.photo && <img src={m.photo} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: m.texte ? 6 : 0, display: "block" }} />}
                {m.texte && <div style={{ background: isMe ? "linear-gradient(135deg,#4d7fe8,#6b5ff4)" : T.card, borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "10px 14px", color: T.textHi, fontSize: 14, lineHeight: 1.5 }}>{m.texte}</div>}
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
        <button onClick={sendMsg} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "10px 14px", cursor: "pointer", flexShrink: 0 }}>{Icon.send("#fff", 16)}</button>
      </div>
    </div>
  );
}

/* ─── BONS DISPONIBLES ─── */
function BonsScreen({ account, bons, setBons, bookings, setBookings, lang = "fr", priorityOrder = [] }) {
  const tr = TRANS[lang] || TRANS.fr;
  // Tick de re-rendu pour faire défiler le dispatch prioritaire (fenêtres de 2 min)
  const [, setDispatchTick] = useState(0);
  useEffect(() => {
    if (!priorityOrder.length) return;
    const iv = setInterval(() => setDispatchTick(t => t + 1), 5000);
    return () => clearInterval(iv);
  }, [priorityOrder.length]);
  const [postModal, setPostModal] = useState(false);
  const [rdvModal, setRdvModal] = useState(null);
  const [newBon, setNewBon] = useState({ titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: 35 });
  const [notif, setNotif] = useState(null);
  const [bonStatuses, setBonStatuses] = useState({});
  const [platformCall, setPlatformCall] = useState(null);
  const [bonTimers, setBonTimers] = useState({});
  const [bonRdvInputs, setBonRdvInputs] = useState({});
  const timerRefs = useRef({});
  const myRegion = account.ville || "Paris";

  // 5-minute call timer per bon (Feature 13)
  const startCallTimer = (bonId, bookingId) => {
    setBonTimers(p => ({ ...p, [bonId]: 300 }));
    if (timerRefs.current[bonId]) clearInterval(timerRefs.current[bonId]);
    timerRefs.current[bonId] = setInterval(() => {
      setBonTimers(prev => {
        const t = (prev[bonId] || 0) - 1;
        if (t <= 0) {
          clearInterval(timerRefs.current[bonId]);
          // Auto-cancel: reset booking back to en_attente
          setBookings(bks => bks.map(b => b.id === bookingId ? { ...b, statut: "en_attente" } : b));
          setBonStatuses(s => ({ ...s, [bonId]: "expired" }));
          return { ...prev, [bonId]: 0 };
        }
        return { ...prev, [bonId]: t };
      });
    }, 1000);
  };
  useEffect(() => () => Object.values(timerRefs.current).forEach(clearInterval), []);
  // Feature 9: sort by pro score
  const proScore = bookings.filter(b => b.artisanId === account.artisanId && b.statut === "terminée").length;
  // Tri : urgences d'abord (si score >= 5), puis par distance croissante
  const proPos0 = DEMO_ARTISANS.find(a => a.id === account.artisanId) || { lat: 48.8566, lng: 2.3522 };
  const bonsRegion = bons.filter(b => b.region === myRegion && bonVisibleForPro(b, account.artisanId, priorityOrder)).slice().sort((a, b) => {
    if (proScore >= 5) {
      if (a.urgence && !b.urgence) return -1;
      if (!a.urgence && b.urgence) return 1;
    }
    const da = a.lat && a.lng ? haversineKm(proPos0, a) : 999;
    const db = b.lat && b.lng ? haversineKm(proPos0, b) : 999;
    return da - db;
  });

  const prendre = (bon) => setRdvModal(bon);

  const confirmRdv = (bon, rdvOpts) => {
    const bk = {
      id: uid(), clientId: "ext", artisanId: account.artisanId,
      clientNom: "Client LOCKR", adresse: bon.adresse, probleme: bon.probleme,
      montant: bon.montantEstime, statut: "assignée", createdAt: ts(),
      bonType: bon.postedBy === "platform" ? "platform" : "partner",
      bonId: bon.id, techPct: bon.techPct,
      rdvDate: rdvOpts.rdvDate, paymentDate: rdvOpts.paymentDate,
      acompte: rdvOpts.acompte || 0, acompteRecu: false,
      rdv2Date: rdvOpts.rdv2Date, urgence: bon.urgence,
    };
    setBookings(p => [...p, bk]);
    setBons(p => p.filter(b => b.id !== bon.id));
    setRdvModal(null);
    // Confirmation : vibration + toast bien visible
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    const suffix = rdvOpts.rdvDate ? ` — ${tr.rdvScheduled}` : "";
    setNotif(`${tr.bonusAccepted} ${bon.titre}${suffix}`);
    setTimeout(() => setNotif(null), 4000);
  };
  const poster = () => {
    const b = { id: uid(), ...newBon, montantEstime: parseFloat(newBon.montantEstime) || 100, postedBy: account.id, postedByNom: account.nom, region: myRegion, lat: 48.86, lng: 2.34, createdAt: ts() };
    setBons(p => [...p, b]);
    setPostModal(false);
    setNewBon({ titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: 35 });
  };

  return (
    <div style={{ padding: "14px", overflowY: "auto", flex: 1 }}>
      {notif && <div style={{ background: "rgba(62,207,142,.15)", border: "1px solid rgba(62,207,142,.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>{Icon.check(T.success, 16)}<span style={{ color: T.success, fontWeight: 600, fontSize: 13 }}>{notif}</span></div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16 }}>{tr.availableBonuses}</div>
          <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{tr.regionLabel} : {myRegion}</div>
        </div>
        <button onClick={() => setPostModal(true)} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "9px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{Icon.plus("#fff", 15)} {tr.post}</button>
      </div>
      {bonsRegion.length === 0 && <div style={{ textAlign: "center", padding: "48px 20px" }}>{Icon.list(T.textLo, 36)}<div style={{ color: T.textLo, fontSize: 14, marginTop: 12 }}>{tr.noBonusRegion}</div></div>}
      {bonsRegion.map(bon => {
        const IC = PROB_ICONS[bon.probleme] || Icon.tool;
        const techEarn = bon.montantEstime * (bon.techPct / 100);
        const isRecommended = proScore >= 5 && bon.urgence;
        const bStatus = bonStatuses[bon.id];

        if (bStatus === "skipped") return null;

        return (
          <div key={bon.id} style={{ position: "relative", marginBottom: 10, borderRadius: 14 }}>
            <div className="lk-card" style={{ padding: "14px", border: isRecommended ? `1.5px solid ${T.gold}` : undefined }}>
              <div style={{ display: "flex", gap: 6, marginBottom: bon.urgence || isRecommended ? 8 : 0, flexWrap: "wrap" }}>
                {bon.urgence && <div className="lk-tag-urgent" style={{ display: "inline-block" }}>URGENT</div>}
                {isRecommended && <div style={{ display: "inline-block", background: "rgba(201,160,48,.1)", border: "1px solid rgba(201,160,48,.3)", color: T.gold, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, letterSpacing: ".3px" }}>{tr.recommendedForYou}</div>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(201,160,48,.1)", border: "1px solid rgba(201,160,48,.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>{IC(T.accent, 19)}</div>
                  <div>
                    <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{bon.titre}</div>
                    <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>📍 {maskAddress(bon.adresse)} <span style={{ opacity: .6 }}>· {lang === "en" ? "exact address after acceptance" : "adresse exacte après acceptation"}</span></div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: T.accent, fontWeight: 700, fontSize: 13 }}>{fmtFrom(bon.montantEstime, lang)}</div>
                </div>
              </div>
              <div style={{ background: "rgba(62,207,142,.06)", border: "1px solid rgba(62,207,142,.15)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: T.textLo, fontSize: 12 }}>{tr.yourSharePct} ({bon.techPct}%)</span>
                  <span style={{ color: T.success, fontWeight: 700, fontSize: 13 }}>{fmt(techEarn)}</span>
                </div>
              </div>
              {(!bStatus || bStatus === "available") && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setBonStatuses(p => ({ ...p, [bon.id]: "accepted" }))} className="lk-btn" style={{ flex: 1, fontSize: 13, padding: "11px 16px" }}>{tr.acceptBon} {Icon.arrow("#fff", 13)}</button>
                  <button onClick={() => setBonStatuses(p => ({ ...p, [bon.id]: "skipped" }))} className="lk-ghost" style={{ padding: "11px 14px", fontSize: 13 }}>✕</button>
                </div>
              )}
              {bStatus === "accepted" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.15)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.accent, marginBottom: 4 }}>
                      {lang === "en" ? "📞 Contact the client first before scheduling" : "📞 Contactez le client avant de planifier"}
                    </div>
                    <div style={{ fontSize: 11, color: T.textLo }}>{lang === "en" ? "Call or chat — then choose the appointment." : "Appelez ou chattez — puis choisissez le créneau."}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setPlatformCall({ name: bon.clientNom || "Client" }); setBonStatuses(p => ({ ...p, [bon.id]: "contacted" })); }} style={{ flex: 1, background: T.grad, border: "none", borderRadius: 10, padding: "10px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>{Icon.phone("#fff", 13)} {tr.callClient}</button>
                    <button onClick={() => setBonStatuses(p => ({ ...p, [bon.id]: "contacted" }))} style={{ flex: 1, background: "rgba(201,160,48,.1)", border: "1px solid rgba(201,160,48,.3)", borderRadius: 10, padding: "10px", color: T.accent, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{Icon.chat(T.accent, 13)} Chat</button>
                  </div>
                </div>
              )}
              {bStatus === "contacted" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ background: "rgba(30,158,107,.06)", border: "1px solid rgba(30,158,107,.15)", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: T.success, fontWeight: 600 }}>
                    {Icon.check(T.success, 12)} {lang === "en" ? "Client contacted — choose appointment type:" : "Client contacté — choisissez le type de RDV :"}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { prendre(bon); setBonStatuses(p => ({ ...p, [bon.id]: "rdv" })); }} style={{ flex: 1, background: T.grad, border: "none", borderRadius: 10, padding: "10px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>⚡ {tr.immediateRdv}</button>
                    <button onClick={() => setBonRdvInputs(p => ({ ...p, [bon.id]: { showPicker: true } }))} style={{ flex: 1, background: "rgba(201,160,48,.1)", border: "1px solid rgba(201,160,48,.3)", borderRadius: 10, padding: "10px", color: T.accent, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>📅 {tr.scheduleRdvBtn}</button>
                  </div>
                  {(bonRdvInputs[bon.id] || {}).showPicker && (
                    <div>
                      <input type="datetime-local" className="lk-input" value={(bonRdvInputs[bon.id] || {}).date || ""} onChange={e => setBonRdvInputs(p => ({ ...p, [bon.id]: { ...p[bon.id], date: e.target.value } }))} style={{ marginBottom: 8 }} />
                      <button onClick={() => { if ((bonRdvInputs[bon.id] || {}).date) { prendre({ ...bon, scheduledDate: bonRdvInputs[bon.id].date }); setBonStatuses(p => ({ ...p, [bon.id]: "rdv" })); } }} className="lk-btn" style={{ fontSize: 12, padding: "10px" }}>{tr.confirmRdv}</button>
                    </div>
                  )}
                </div>
              )}
              {bStatus === "expired" && (
                <div style={{ background: "rgba(220,38,38,.08)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 10, padding: "10px", color: T.danger, fontWeight: 600, fontSize: 12, textAlign: "center" }}>{tr.delayExpired}</div>
              )}
              {bStatus === "rdv" && (
                <div style={{ background: "rgba(62,207,142,.08)", borderRadius: 10, padding: "10px", color: T.success, fontWeight: 600, fontSize: 12, textAlign: "center" }}>{tr.rdvScheduledShort}</div>
              )}
            </div>
          </div>
        );
      })}
      {rdvModal && <RdvAcceptModal bon={rdvModal} onConfirm={(opts) => confirmRdv(rdvModal, opts)} onCancel={() => setRdvModal(null)} lang={lang} />}
      {postModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", maxHeight: "85vh", overflowY: "auto", animation: "slideUp .3s ease" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 17, marginBottom: 20 }}>{tr.postBonus}</div>
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
              <input type="range" min={20} max={70} value={newBon.techPct} onChange={e => setNewBon(p => ({ ...p, techPct: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: T.accent }} />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 20 }}>
              <input type="checkbox" id="urgence" checked={newBon.urgence} onChange={e => setNewBon(p => ({ ...p, urgence: e.target.checked }))} style={{ accentColor: T.danger }} />
              <label htmlFor="urgence" style={{ color: T.textMid, fontSize: 13, cursor: "pointer" }}>{tr.urgentIntervention}</label>
            </div>
            <button onClick={poster} className="lk-btn" style={{ marginBottom: 10 }}>{tr.publishBonus}</button>
            <button onClick={() => setPostModal(false)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>
      )}
      {platformCall && <PlatformCallModal name={platformCall.name} onClose={() => setPlatformCall(null)} lang={lang} />}
    </div>
  );
}

/* ─── EARNINGS CHART ─── */
function EarningsChart({ bookings, artisanId, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const MONTH_LABELS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
  const done = bookings.filter(b => b.artisanId === artisanId && b.statut === "terminée");
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: MONTH_LABELS[d.getMonth()] };
  });
  const data = months.map(m => {
    const bks = done.filter(b => { const d = new Date(b.createdAt); return d.getFullYear() === m.year && d.getMonth() === m.month; });
    const total = bks.reduce((s, b) => s + (b.montantFinal || 0) * 0.40, 0);
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
                <div style={{ color: selIdx === lastMonthIdx ? T.success : T.accent, fontWeight: 800, fontSize: 13 }}>{fmt((b.montantFinal || 0) * 0.40)}</div>
              </div>
            ))}
          </div>
        )}
        {sel.missions.length === 0 && (
          <div style={{ color: T.textLo, fontSize: 12, marginTop: 8, textAlign: "center" }}>{tr.noMissionThisMonth}</div>
        )}
        {selIdx !== lastMonthIdx && sel.missions.length > 0 && (
          <button onClick={() => {
            const lines = [`FACTURE LOCKR — ${sel.label} ${sel.year}`, `Artisan ID: ${artisanId}`, `Date: ${new Date().toLocaleDateString("fr-FR")}`, `---`, ...sel.missions.map(b => `${b.clientNom} | ${b.probleme} | ${fmtDate(b.createdAt)} | Total: ${b.montantFinal||0}€ | Votre part: ${fmt((b.montantFinal||0)*0.40)}`), `---`, `Sous-total: ${fmt(sel.value)}`, `Commission LOCKR (60%): ${fmt(sel.missions.reduce((s,b)=>s+(b.montantFinal||0)*0.60,0))}`, `TOTAL NET PERÇU: ${fmt(sel.value)}`].join("\n");
            const blob = new Blob([lines], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `facture_lockr_${sel.label}_${sel.year}.txt`; a.click();
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

/* ─── RDV ACCEPT MODAL ─── */
function RdvAcceptModal({ bon, onConfirm, onCancel, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [mode, setMode] = useState("immediate");
  const [rdvDate, setRdvDate] = useState("");
  const [rdvTime, setRdvTime] = useState("09:00");
  const [paymentDate, setPaymentDate] = useState("");
  const [acompte, setAcompte] = useState("");
  const [hasAcompte, setHasAcompte] = useState(false);
  const [hasRdv2, setHasRdv2] = useState(false);
  const [rdv2Date, setRdv2Date] = useState("");
  const [rdv2Time, setRdv2Time] = useState("14:00");

  const minDate = new Date().toISOString().slice(0, 10);

  const handleConfirm = () => {
    const rdvIso = mode === "rdv" && rdvDate ? `${rdvDate}T${rdvTime}:00` : null;
    const rdv2Iso = hasRdv2 && rdv2Date ? `${rdv2Date}T${rdv2Time}:00` : null;
    onConfirm({
      mode,
      rdvDate: rdvIso,
      paymentDate: paymentDate || null,
      acompte: hasAcompte ? parseFloat(acompte) || 0 : 0,
      rdv2Date: rdv2Iso,
    });
  };

  const canConfirm = mode === "immediate" || (mode === "rdv" && rdvDate);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", maxHeight: "90vh", overflowY: "auto", animation: "slideUp .3s ease" }}>
        <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{bon.titre}</div>
        <div style={{ color: T.textLo, fontSize: 12, marginBottom: 20 }}>{bon.adresse}</div>

        {/* Mode selector */}
        <div style={{ marginBottom: 20 }}>
          <label className="lk-label">{tr.bonAcceptMode}</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => setMode("immediate")} style={{ background: mode === "immediate" ? "rgba(28,28,28,.07)" : "transparent", border: `1.5px solid ${mode === "immediate" ? T.accent : "rgba(0,0,0,.1)"}`, borderRadius: 12, padding: "14px 10px", cursor: "pointer", fontFamily: "'Inter',sans-serif", transition: "all .15s" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>⚡</div>
              <div style={{ color: mode === "immediate" ? T.accent : T.textMid, fontWeight: 700, fontSize: 12 }}>{tr.immediateIntervention}</div>
            </button>
            <button onClick={() => setMode("rdv")} style={{ background: mode === "rdv" ? "rgba(201,160,48,.08)" : "transparent", border: `1.5px solid ${mode === "rdv" ? T.gold : "rgba(0,0,0,.1)"}`, borderRadius: 12, padding: "14px 10px", cursor: "pointer", fontFamily: "'Inter',sans-serif", transition: "all .15s" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>📅</div>
              <div style={{ color: mode === "rdv" ? T.gold : T.textMid, fontWeight: 700, fontSize: 12 }}>{tr.scheduleRdv}</div>
            </button>
          </div>
        </div>

        {mode === "rdv" && (
          <div style={{ animation: "fadeUp .2s ease" }}>
            {/* Date + heure RDV */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 14 }}>
              <div>
                <label className="lk-label">{tr.rdvDate}</label>
                <input type="date" className="lk-input" value={rdvDate} min={minDate} onChange={e => setRdvDate(e.target.value)} />
              </div>
              <div style={{ width: 100 }}>
                <label className="lk-label">Heure</label>
                <input type="time" className="lk-input" value={rdvTime} onChange={e => setRdvTime(e.target.value)} />
              </div>
            </div>

            {/* Date paiement */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.paymentDateLabel} <span style={{ color: T.textLo, fontWeight: 400, textTransform: "none" }}>({lang === "fr" ? "optionnel" : "optional"})</span></label>
              <input type="date" className="lk-input" value={paymentDate} min={rdvDate || minDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>

            {/* Acompte */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input type="checkbox" id="acompteChk" checked={hasAcompte} onChange={e => setHasAcompte(e.target.checked)} style={{ accentColor: T.gold, width: 16, height: 16 }} />
                <label htmlFor="acompteChk" style={{ color: T.textMid, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>{tr.acompteOptional}</label>
              </div>
              {hasAcompte && (
                <div style={{ position: "relative", animation: "fadeUp .15s ease" }}>
                  <input type="number" className="lk-input" value={acompte} onChange={e => setAcompte(e.target.value)} placeholder="50" style={{ paddingRight: 36 }} />
                  <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.textLo, fontWeight: 700 }}>€</div>
                </div>
              )}
            </div>

            {/* 2ème RDV */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input type="checkbox" id="rdv2Chk" checked={hasRdv2} onChange={e => setHasRdv2(e.target.checked)} style={{ accentColor: T.success, width: 16, height: 16 }} />
                <label htmlFor="rdv2Chk" style={{ color: T.textMid, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>{tr.rdv2Label}</label>
              </div>
              {hasRdv2 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, animation: "fadeUp .15s ease" }}>
                  <div>
                    <label className="lk-label">{tr.rdv2Label} — date</label>
                    <input type="date" className="lk-input" value={rdv2Date} min={rdvDate || minDate} onChange={e => setRdv2Date(e.target.value)} />
                  </div>
                  <div style={{ width: 100 }}>
                    <label className="lk-label">Heure</label>
                    <input type="time" className="lk-input" value={rdv2Time} onChange={e => setRdv2Time(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <button onClick={handleConfirm} disabled={!canConfirm} className="lk-btn" style={{ marginBottom: 10 }}>
          {mode === "rdv" ? tr.confirmRdv : tr.acceptBonus} {Icon.check("#fff", 14)}
        </button>
        <button onClick={onCancel} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
      </div>
    </div>
  );
}

/* ─── CHAT INTERVENTION (pro ↔ client) ─── */
function ChatIntervention({ bookingId, account, interventionChats, setInterventionChats, otherNom, onClose, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [msg, setMsg] = useState("");
  const bottomRef = useRef(null);
  const messages = interventionChats[bookingId] || [];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = () => {
    if (!msg.trim()) return;
    const m = { id: uid(), auteurId: account.id, auteurNom: account.nom, texte: msg.trim(), createdAt: ts() };
    setInterventionChats(p => ({ ...p, [bookingId]: [...(p[bookingId] || []), m] }));
    setMsg("");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 900, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, height: "72vh", display: "flex", flexDirection: "column", animation: "slideUp .3s ease", boxShadow: "0 -8px 40px rgba(0,0,0,.15)" }}>
        {/* Header */}
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(201,160,48,.1)", border: "1.5px solid rgba(201,160,48,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: T.gold }}>{(otherNom || "?").charAt(0)}</span>
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

/* ─── PRO PROFILE TAB ─── */
function ProProfileTab({ account, setAccounts, bookings, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [ville, setVille] = useState(account.ville || "");
  const [transport, setTransport] = useState(account.transport || "voiture");
  const [iban, setIban] = useState(account.iban || "");
  const [radius, setRadius] = useState(account.radius || 10);
  const [saved, setSaved] = useState(false);
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

  const save = () => {
    setAccounts(p => p.map(a => a.id === account.id ? { ...a, ville, transport, iban, radius, schedule } : a));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ padding: "14px", overflowY: "auto" }}>
      {saved && (
        <div style={{ background: "rgba(30,158,107,.1)", border: "1px solid rgba(30,158,107,.25)", borderRadius: 12, padding: "12px 14px", marginBottom: 14, color: T.success, fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8, animation: "fadeUp .2s ease" }}>
          {Icon.check(T.success, 14)} {tr.scheduleUpdated}
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
          <div style={{ color: T.textMid, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>Notre équipe vérifie votre dossier sous 48h.</div>
        )}
      </div>

      {/* Avis clients */}
      <div className="lk-card" style={{ padding: "14px", marginBottom: 14 }}>
        <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.myRatings}</div>
        {ratings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px 0", color: T.textLo, fontSize: 13 }}>{Icon.star(T.textLo, 26)}<div style={{ marginTop: 8 }}>{tr.noRatings}</div></div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: T.gold }}>{avgNote}</div>
              <div>
                <div style={{ display: "flex", gap: 3 }}>{[1,2,3,4,5].map(s => <span key={s}>{Icon.star(parseFloat(avgNote) >= s ? T.gold : "rgba(0,0,0,.12)", 18)}</span>)}</div>
                <div style={{ color: T.textLo, fontSize: 12, marginTop: 3 }}>{ratings.length} {tr.reviews}</div>
              </div>
            </div>
            {ratings.slice(-3).reverse().map(b => (
              <div key={b.id} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 10 }}>
                <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>{[1,2,3,4,5].map(s => <span key={s}>{Icon.star(b.satisfactionNote >= s ? T.gold : "rgba(0,0,0,.12)", 13)}</span>)}</div>
                {b.satisfactionComment && <div style={{ color: T.textMid, fontSize: 12, fontStyle: "italic", lineHeight: 1.5 }}>"{b.satisfactionComment}"</div>}
                <div style={{ color: T.textLo, fontSize: 11, marginTop: 4 }}>{b.clientNom} · {fmtDate(b.createdAt)}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Infos modifiables */}
      <div className="lk-card" style={{ padding: "14px", marginBottom: 14 }}>
        <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>{Icon.user(T.accent, 15)} {tr.editProfile}</div>
        <div style={{ marginBottom: 12 }}>
          <label className="lk-label">{tr.city}</label>
          <input className="lk-input" value={ville} onChange={e => setVille(e.target.value)} placeholder="Paris" />
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
          <input type="range" min={5} max={50} step={5} value={radius} onChange={e => setRadius(parseInt(e.target.value))} style={{ width: "100%", accentColor: T.accent }} />
          <div style={{ display: "flex", justifyContent: "space-between", color: T.textLo, fontSize: 11, marginTop: 2 }}>
            <span>5 km</span><span style={{ color: T.accent, fontWeight: 600 }}>{radius} km</span><span>50 km</span>
          </div>
        </div>
      </div>

      {/* Planning */}
      <div className="lk-card" style={{ padding: "14px", marginBottom: 14 }}>
        <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>{Icon.calendar(T.accent, 15)} {tr.workSchedule}</div>
        <div style={{ marginBottom: 14 }}>
          <label className="lk-label">{tr.profileDays}</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {DAYS.map(d => (
              <button key={d.id} onClick={() => setSchedule(s => ({ ...s, [d.id]: !s[d.id] }))} style={{ background: schedule[d.id] ? T.grad : "rgba(0,0,0,.04)", border: `1px solid ${schedule[d.id] ? T.accent : "rgba(0,0,0,.1)"}`, borderRadius: 8, padding: "7px 11px", color: schedule[d.id] ? "#fff" : T.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", transition: "all .15s" }}>
                {d.l}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label className="lk-label">{tr.startHour}</label><input type="time" className="lk-input" value={schedule.start} onChange={e => setSchedule(s => ({ ...s, start: e.target.value }))} /></div>
          <div><label className="lk-label">{tr.endHour}</label><input type="time" className="lk-input" value={schedule.end} onChange={e => setSchedule(s => ({ ...s, end: e.target.value }))} /></div>
        </div>
      </div>

      <button onClick={save} className="lk-btn">{Icon.check("#fff", 15)} {tr.saveProfile}</button>

      {/* Virements automatiques Stripe Connect */}
      <StripeConnectCard lang={lang} email={account.email} nom={account.nom} />

      {/* RGPD Rights */}
      <div className="lk-card" style={{ padding: "18px 20px", marginTop: 20, borderLeft: `4px solid #2563eb` }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 10 }}>🛡️ {tr.rgpdTitle}</div>
        <div style={{ color: T.textLo, fontSize: 11, marginBottom: 12 }}>{tr.rgpdRightsTitle}</div>
        {[tr.rgpdAccess, tr.rgpdRectif, tr.rgpdErase, tr.rgpdPorta, tr.rgpdOppose, tr.rgpdLimit].map((r, i) => (
          <div key={i} style={{ fontSize: 12, color: T.textMid, marginBottom: 6, paddingLeft: 10, borderLeft: `2px solid rgba(37,99,235,.25)` }}>{r}</div>
        ))}
        <div style={{ fontSize: 11, color: T.textLo, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,.06)" }}>
          <div>{tr.rgpdContact}</div>
          <div>{tr.rgpdCnil}</div>
        </div>
        <button onClick={() => alert(tr.rgpdRequestSent)} className="lk-ghost" style={{ marginTop: 12, fontSize: 12 }}>{tr.rgpdRequest}</button>
      </div>
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

function ProMarketplace({ account, listings, setListings, sales, setSales, lang, isPartner = false }) {
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
  const [buyStep, setBuyStep] = useState(0); // 0=none 1=address 2=payment 3=success
  const [buyForm, setBuyForm] = useState({ nom: "", adresse: "", ville: "", zip: "", tel: "", cardNum: "", expiry: "", cvv: "" });
  const [buyError, setBuyError] = useState("");
  const [proposePrice, setProposePrice] = useState("");
  const [proposeSent, setProposeSent] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  // Nouvelle annonce — photos obligatoires (min 3)
  const [newPhotos, setNewPhotos] = useState([]);
  const newPhotoRef = useRef(null);
  const [photoError, setPhotoError] = useState("");
  // Marque / Modèle
  const [brandSearch, setBrandSearch] = useState("");
  const BRANDS = ["Bosch","Makita","DeWalt","Milwaukee","Hilti","Stanley","Facom","Knipex","Legrand","Schneider","Grohe","Hansgrohe","Vaillant","Saunier Duval","Autres"];
  const [showBrandDrop, setShowBrandDrop] = useState(false);

  const visible = listings.filter(l => {
    if (filterOwn && l.proId !== account.id) return false;
    if (selMetier !== "all" && l.metier !== selMetier) return false;
    if (filterCat !== "all" && l.categorie !== filterCat) return false;
    if (search && !l.titre.toLowerCase().includes(search.toLowerCase()) && !l.desc.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const post = () => {
    if (!form.titre || !form.prix) return;
    if (newPhotos.length < 3) { setPhotoError("3 photos minimum requises."); return; }
    setPhotoError("");
    const nl = { id: uid(), proId: account.id, proNom: account.nom, metier: form.metier, titre: form.titre, desc: form.desc, prix: Number(form.prix), categorie: form.categorie, etat: form.etat, marque: form.marque, modele: form.modele, photos: newPhotos, photo: newPhotos[0] || null, tel: account.tel || "", createdAt: ts() };
    setListings(p => [nl, ...p]);
    setForm({ titre: "", desc: "", prix: "", categorie: "Outils", etat: "Neuf", metier: account.metier || "serrurier", marque: "", modele: "" });
    setNewPhotos([]);
    setPosted(true);
    setNewModal(false);
    setTimeout(() => setPosted(false), 3000);
  };
  const handleNewPhoto = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      const r = new FileReader();
      r.onload = ev => setNewPhotos(p => p.length < 6 ? [...p, ev.target.result] : p);
      r.readAsDataURL(f);
    });
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
              <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>15% de commission LOCKR sur chaque vente</span>
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
      </div>

      {/* ── Onglets secteurs avec photo de fond ── */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 14px 14px", scrollbarWidth: "none" }}>
        {MARKET_METIERS.map(m => {
          const isSelected = selMetier === m.id;
          const count = m.id === "all" ? listings.length : listings.filter(l => l.metier === m.id).length;
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
                    {mPhoto && <img src={mPhoto} alt="" onError={e => { e.target.style.display="none"; }}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: .45 }} />}
                    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg,${mc}30,${mc}10)` }} />
                    <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 38, height: 38, borderRadius: 11, background: `${mc}25`, border: `1px solid ${mc}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {Icon.tool(mc, 19)}
                      </div>
                    </div>
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
                <span style={{ color: T.accent, fontWeight: 600, fontSize: 13 }}>Ajouter des photos ({newPhotos.length}/3 min)</span>
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
                      <div style={{ color: "rgba(255,255,255,.8)", fontSize: 11 }}>Le vendeur reçoit {fmt(detail.prix * (1 - LOCKR_COMMISSION))}</div>
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
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}>
              <span style={{ background: "rgba(201,160,48,.1)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 20, padding: "2px 8px", fontSize: 11, color: T.gold, fontWeight: 600 }}>{detail.categorie}</span>
              <span style={{ background: detail.etat === "Neuf" ? "rgba(62,207,142,.1)" : "rgba(201,160,48,.1)", border: `1px solid ${detail.etat === "Neuf" ? "rgba(62,207,142,.25)" : "rgba(201,160,48,.2)"}`, borderRadius: 20, padding: "2px 8px", fontSize: 11, color: detail.etat === "Neuf" ? T.success : T.gold, fontWeight: 600 }}>{detail.etat}</span>
            </div>
            <p style={{ color: T.textMid, fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>{detail.desc || "Aucune description."}</p>
            {/* Seller */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `${metierColor(detail.metier)}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: metierColor(detail.metier), fontWeight: 800, fontSize: 14 }}>{detail.proNom.charAt(0)}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{detail.proNom}</div>
                <div style={{ color: T.textLo, fontSize: 11 }}>{fmtDate(detail.createdAt)}</div>
              </div>
              <span style={{ color: T.textLo, fontSize: 11, fontStyle: "italic" }}>Contact via chat LOCKR uniquement</span>
            </div>
            {/* Commission info */}
            <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
              {Icon.percent(T.accent, 13)}
              <span style={{ color: T.textMid, fontSize: 12 }}>15% de commission LOCKR inclus dans le prix affiché</span>
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
                      <button onClick={() => { if (proposePrice) { setProposeSent(true); setShowPropose(false); } }} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "10px 16px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Envoyer</button>
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
                  const commission = Math.round(detail.prix * LOCKR_COMMISSION * 100) / 100;
                  setSales && setSales(p => [...p, { id: uid(), listingId: detail.id, vendeurId: account.id, vendeurNom: account.nom, acheteurNom: "—", metier: detail.metier, titre: detail.titre, prix: detail.prix, commission, createdAt: ts() }]);
                  setListings(p => p.map(l => l.id === detail.id ? { ...l, sold: true } : l));
                  setDetailId(null);
                }} style={{ flex: 2, background: "linear-gradient(135deg,#3ecf8e,#2aaf77)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {Icon.check("#fff", 15)} {tr.markSold}
                </button>
              )}
              {detail.proId === account.id && (
                <button onClick={() => { setListings(p => p.filter(l => l.id !== detail.id)); setDetailId(null); }} style={{ background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 12, padding: "12px", color: T.danger, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                  {Icon.trash(T.danger, 15)}
                </button>
              )}
            </div>
          </div>
        </div>
      , document.body)}
      {/* ── Tunnel d'achat — portal ── */}
      {detail && buyStep > 0 && buyStep < 4 && createPortal(
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
                    if (!buyForm.nom || !buyForm.adresse || !buyForm.ville || !buyForm.zip || !buyForm.tel) return setBuyError("Veuillez remplir tous les champs.");
                    setBuyError(""); setBuyStep(2);
                  }} className="lk-btn" style={{ flex: 2 }}>{tr.buyNext}</button>
                </div>
              </>
            )}
            {/* STEP 2 — Paiement */}
            {buyStep === 2 && (
              <>
                <div style={{ color: T.textHi, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>{tr.buyStep2Title}</div>
                {/* Total breakdown */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: T.textMid, fontSize: 13 }}>Prix article</span>
                    <span style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{fmt(detail.prix)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: T.textMid, fontSize: 13 }}>Commission LOCKR (15%)</span>
                    <span style={{ color: T.accent, fontWeight: 600, fontSize: 13 }}>incluse</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                    <span style={{ color: T.textHi, fontWeight: 800, fontSize: 14 }}>{tr.buyTotal}</span>
                    <span style={{ color: T.accent, fontWeight: 900, fontSize: 16 }}>{fmt(detail.prix)}</span>
                  </div>
                </div>
                {/* Payment methods grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {PAY_METHODS.map(m => (
                    <button key={m.id} onClick={() => setBuyForm(p => ({ ...p, payMethod: m.id }))}
                      style={{ background: buyForm.payMethod === m.id ? "rgba(201,160,48,.06)" : T.card, border: `1.5px solid ${buyForm.payMethod === m.id ? T.accent : T.border}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontFamily: "'Inter',sans-serif", transition: "all .12s" }}>
                      <PayLogo id={m.id} size={36} />
                      <span style={{ color: T.textHi, fontSize: 11, fontWeight: 600, lineHeight: 1.3 }}>{m.label}</span>
                    </button>
                  ))}
                </div>
                {/* Card fields if card method selected */}
                {buyForm.payMethod && PAY_METHODS.find(m => m.id === buyForm.payMethod)?.type === "card" && (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <label className="lk-label">{tr.buyCardNum}</label>
                      <input className="lk-input" value={buyForm.cardNum || ""} onChange={e => setBuyForm(p => ({ ...p, cardNum: fmtCard(e.target.value) }))} placeholder="1234 5678 9012 3456" inputMode="numeric" />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label className="lk-label">Titulaire de la carte</label>
                      <input className="lk-input" value={buyForm.cardName || ""} onChange={e => setBuyForm(p => ({ ...p, cardName: e.target.value }))} placeholder="Jean Dupont" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div>
                        <label className="lk-label">{tr.buyExpiry}</label>
                        <input className="lk-input" value={buyForm.expiry || ""} onChange={e => setBuyForm(p => ({ ...p, expiry: fmtExp(e.target.value) }))} placeholder="MM/AA" inputMode="numeric" />
                      </div>
                      <div>
                        <label className="lk-label">{tr.buyCvv}</label>
                        <input className="lk-input" type="password" value={buyForm.cvv || ""} onChange={e => setBuyForm(p => ({ ...p, cvv: e.target.value.slice(0, 4) }))} placeholder="123" inputMode="numeric" />
                      </div>
                    </div>
                  </>
                )}
                {/* IBAN for bank transfer */}
                {buyForm.payMethod === "virement" && (
                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px", marginBottom: 10 }}>
                    <div style={{ color: T.textLo, fontSize: 11, marginBottom: 3 }}>IBAN</div>
                    <div style={{ color: T.textHi, fontWeight: 700, fontSize: 12, fontFamily: "monospace", marginBottom: 8 }}>FR76 3000 6000 0112 3456 7890 189</div>
                    <div style={{ color: T.textLo, fontSize: 11, marginBottom: 3 }}>BIC / SWIFT</div>
                    <div style={{ color: T.textHi, fontWeight: 700, fontSize: 12, fontFamily: "monospace", marginBottom: 8 }}>BNPAFRPPXXX</div>
                    <div style={{ color: T.textLo, fontSize: 11, marginBottom: 3 }}>Montant exact</div>
                    <div style={{ color: T.accent, fontWeight: 800, fontSize: 13 }}>{fmt(detail.prix)}</div>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(62,207,142,.06)", border: "1px solid rgba(62,207,142,.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                  {Icon.shield(T.success, 13)}
                  <span style={{ color: T.success, fontSize: 11, fontWeight: 500 }}>Paiement 100% sécurisé — Données chiffrées</span>
                </div>
                {buyError && <div style={{ background: "rgba(240,101,101,.08)", border: "1px solid rgba(240,101,101,.2)", borderRadius: 10, padding: "10px 14px", color: T.danger, fontSize: 13, marginBottom: 14 }}>{buyError}</div>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => { setBuyStep(1); setBuyError(""); }} className="lk-ghost" style={{ flex: 1 }}>{tr.back}</button>
                  <button onClick={() => {
                    if (!buyForm.payMethod) return setBuyError("Veuillez sélectionner un mode de paiement.");
                    const pm = PAY_METHODS.find(m => m.id === buyForm.payMethod);
                    if (pm?.type === "card") {
                      if (!buyForm.cardNum || buyForm.cardNum.replace(/\s/g,"").length < 16) return setBuyError("Numéro de carte invalide.");
                      if (!buyForm.cardName) return setBuyError("Nom du titulaire requis.");
                      if (!buyForm.expiry || buyForm.expiry.length < 5) return setBuyError("Date d'expiration invalide.");
                      if (!buyForm.cvv || buyForm.cvv.length < 3) return setBuyError("CVV invalide.");
                    }
                    setBuyError(""); setBuyStep(3);
                  }} className="lk-btn" style={{ flex: 2 }}>{tr.buyConfirm}</button>
                </div>
              </>
            )}
            {/* STEP 3 — Confirmation success */}
            {buyStep === 3 && (() => {
              const commission = Math.round(detail.prix * LOCKR_COMMISSION * 100) / 100;
              return (
                <div style={{ textAlign: "center", padding: "8px 0" }}>
                  <div style={{ width: 80, height: 80, background: "rgba(62,207,142,.1)", border: "2px solid rgba(62,207,142,.3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", animation: "checkPop .4s ease" }}>
                    {Icon.check(T.success, 34)}
                  </div>
                  <div style={{ color: T.success, fontWeight: 900, fontSize: 20, marginBottom: 6 }}>{tr.buySuccess}</div>
                  <div style={{ color: T.textMid, fontSize: 13, lineHeight: 1.6, marginBottom: 20, padding: "0 10px" }}>{tr.buySuccessDesc}</div>
                  {/* Récap */}
                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px", textAlign: "left", marginBottom: 20 }}>
                    <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Récapitulatif de commande</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: T.textMid, fontSize: 12 }}>Article</span>
                      <span style={{ color: T.textHi, fontWeight: 600, fontSize: 12, maxWidth: 180, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.titre}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: T.textMid, fontSize: 12 }}>Montant payé</span>
                      <span style={{ color: T.accent, fontWeight: 800, fontSize: 13 }}>{fmt(detail.prix)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: T.textMid, fontSize: 12 }}>Commission LOCKR (15%)</span>
                      <span style={{ color: T.success, fontWeight: 600, fontSize: 12 }}>{fmt(commission)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: T.textMid, fontSize: 12 }}>Livraison à</span>
                      <span style={{ color: T.textHi, fontWeight: 600, fontSize: 12 }}>{buyForm.ville}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: T.textMid, fontSize: 12 }}>Mode de paiement</span>
                      <span style={{ color: T.textHi, fontWeight: 600, fontSize: 12 }}>{PAY_METHODS.find(m => m.id === buyForm.payMethod)?.label || "—"}</span>
                    </div>
                  </div>
                  <button onClick={() => {
                    setSales && setSales(p => [...p, { id: uid(), listingId: detail.id, vendeurId: detail.proId, vendeurNom: detail.proNom, acheteurNom: buyForm.nom, acheteurVille: buyForm.ville, metier: detail.metier, titre: detail.titre, prix: detail.prix, commission, payMethod: buyForm.payMethod, createdAt: ts() }]);
                    setListings(p => p.map(l => l.id === detail.id ? { ...l, sold: true } : l));
                    setBuyStep(0); setBuyForm({ nom: "", adresse: "", ville: "", zip: "", tel: "", cardNum: "", expiry: "", cvv: "" }); setDetailId(null);
                  }} className="lk-btn">{tr.close}</button>
                </div>
              );
            })()}
          </div>
        </div>
      , document.body)}
    </div>
  );
}

/* ─── HISTORY CARD (pro) ─── */
function HistoryCard({ b, isPaid, pr, tr, setBookings, lang }) {
  const [totalInput, setTotalInput] = useState(String(b.montantFinal || b.montant || ""));
  const [acompteInput, setAcompteInput] = useState(String(b.acompte || 0));
  const [showForm, setShowForm] = useState(false);
  const total = parseFloat(totalInput) || 0;
  const acompte = parseFloat(acompteInput) || 0;
  const reste = Math.max(0, total - acompte);
  return (
    <div className="lk-card" style={{ padding: "14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pLabel(pr, lang)}</div>
          <div style={{ color: T.textLo, fontSize: 11 }}>{b.clientNom} · {fmtDate(b.createdAt)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: isPaid ? T.success : T.warn, fontWeight: 700, fontSize: 15 }}>{fmt((b.montantFinal || 0) * 0.40)}</div>
          <div style={{ color: T.textLo, fontSize: 10 }}>{isPaid ? tr.paid : tr.pending}</div>
        </div>
      </div>
      {!isPaid && (
        <>
          <button onClick={() => setShowForm(s => !s)} style={{ width: "100%", background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 10, padding: "8px", color: T.accent, fontWeight: 600, fontSize: 12, cursor: "pointer", marginTop: 10, fontFamily: "'Inter',sans-serif" }}>
            {showForm ? "Masquer" : "Saisir le montant final"} {Icon.euro(T.accent, 12)}
          </button>
          {showForm && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label className="lk-label">Montant total prestation (€)</label>
                <input className="lk-input" type="number" value={totalInput} onChange={e => setTotalInput(e.target.value)} placeholder="Ex: 150" />
              </div>
              <div>
                <label className="lk-label">Acompte déjà payé (€)</label>
                <input className="lk-input" type="number" value={acompteInput} onChange={e => setAcompteInput(e.target.value)} placeholder="0" />
              </div>
              <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.15)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: T.textMid, fontSize: 13 }}>Montant restant dû</span>
                  <span style={{ color: T.accent, fontWeight: 800, fontSize: 15 }}>{fmt(reste)}</span>
                </div>
              </div>
              <button onClick={() => { setBookings(p => p.map(x => x.id === b.id ? { ...x, montantFinal: total, acompte: acompte, montantRestant: reste } : x)); setShowForm(false); }} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "10px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Valider la facture</button>
            </div>
          )}
          <button onClick={() => setBookings(p => p.map(x => x.id === b.id ? { ...x, statutPaiement: "payé", payeLe: ts() } : x))} style={{ width: "100%", background: "rgba(245,166,35,.08)", border: "1px solid rgba(245,166,35,.2)", borderRadius: 10, padding: "9px", color: T.warn, fontWeight: 600, fontSize: 12, cursor: "pointer", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
            {Icon.check(T.warn, 12)} {tr.markAsPaid}
          </button>
        </>
      )}
    </div>
  );
}

/* ─── PRO APP ─── */
/* ─── AUTO-ENTREPRENEUR TAB ─── */
function AutoEntrepriseTab({ account, bookings, artisanId, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const done = bookings.filter(b => b.artisanId === artisanId && b.statut === "terminée");
  const now = new Date();
  const caMonth = done.filter(b => { const d = new Date(b.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, b) => s + (b.montantFinal || b.montant || 0), 0);
  const caYear = done.filter(b => new Date(b.createdAt).getFullYear() === now.getFullYear()).reduce((s, b) => s + (b.montantFinal || b.montant || 0), 0);
  const SEUIL_TVA = 34400;
  const cotis = caMonth * 0.22;
  const formation = caMonth * 0.003;
  const net = caMonth - cotis - formation;
  const nextDecl = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("fr-FR");

  const [frais, setFrais] = useState([
    { id: "f1", label: "Carburant — juin", montant: 85, date: "2026-06-05", cat: "Carburant" },
    { id: "f2", label: "Perceuse Bosch", montant: 210, date: "2026-06-08", cat: "Outillage" },
  ]);
  const [fraisForm, setFraisForm] = useState({ label: "", montant: "", date: new Date().toISOString().slice(0, 10), cat: "Outillage" });
  const [showFraisForm, setShowFraisForm] = useState(false);
  const [declarations, setDeclarations] = useState([
    { id: "d1", mois: "Mai 2026", ca: 3200, cotis: 704, statut: "payée" },
    { id: "d2", mois: "Avr 2026", ca: 2850, cotis: 627, statut: "payée" },
  ]);
  const [declModal, setDeclModal] = useState(false);
  const [declCa, setDeclCa] = useState("");
  const [memo, setMemo] = useState("");
  const totalFrais = frais.reduce((s, f) => s + f.montant, 0);
  const fraisCats = (lang === "en" ? tr.aeFraisCats : tr.aeFraisCats).split(",");
  const nearSeuil = caYear > SEUIL_TVA * 0.8;

  return (
    <div style={{ padding: "14px 14px 80px" }}>
      <div style={{ fontWeight: 800, fontSize: 18, color: T.textHi, marginBottom: 4 }}>{tr.aeTitle}</div>
      <div style={{ fontSize: 12, color: T.textLo, marginBottom: 18 }}>{tr.aeRegimeMicro}</div>

      {/* KPI CA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[
          { label: tr.aeCaMois, val: `${Math.round(caMonth).toLocaleString("fr-FR")} €`, sub: `Seuil : ${SEUIL_TVA.toLocaleString("fr-FR")} €/an`, col: T.accent },
          { label: tr.aeCaAn, val: `${Math.round(caYear).toLocaleString("fr-FR")} €`, sub: nearSeuil ? tr.aeSeuilAlert : tr.aeSeuilOk, col: nearSeuil ? T.warn : T.success },
        ].map((k, i) => (
          <div key={i} className="lk-card" style={{ padding: "14px 16px" }}>
            <div style={{ fontWeight: 900, fontSize: 22, color: k.col }}>{k.val}</div>
            <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{k.label}</div>
            <div style={{ fontSize: 10, color: nearSeuil && i === 1 ? T.warn : T.textLo, marginTop: 4, fontWeight: nearSeuil && i === 1 ? 700 : 400 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Cotisations */}
      <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.aeCotisations}</div>
        {[
          [tr.aeCotisRate, `${Math.round(cotis)} €`],
          [tr.aeFormation + ` (${tr.aeFormationRate})`, `${Math.round(formation)} €`],
          [tr.aeNetEstime, `${Math.round(net)} €`],
        ].map(([l, v], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", paddingBottom: i < 2 ? 8 : 0, borderBottom: i < 2 ? "1px solid rgba(0,0,0,.05)" : "none", marginBottom: i < 2 ? 8 : 0 }}>
            <span style={{ fontSize: 13, color: T.textMid }}>{l}</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: i === 2 ? T.success : T.textHi }}>{v}</span>
          </div>
        ))}
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
        {frais.map(f => (
          <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(0,0,0,.04)" }}>
            <div>
              <div style={{ fontSize: 13, color: T.textHi }}>{f.label}</div>
              <div style={{ fontSize: 11, color: T.textLo }}>{f.cat} · {f.date}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: T.danger }}>-{f.montant} €</span>
              <button onClick={() => setFrais(p => p.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", cursor: "pointer", color: T.textLo, fontSize: 14, fontFamily: "'Inter',sans-serif" }}>✕</button>
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
          <div style={{ fontSize: 12, color: T.textMid }}>Seuil : {SEUIL_TVA.toLocaleString("fr-FR")} €/an (services)</div>
          <div style={{ fontSize: 11, color: nearSeuil ? T.warn : T.success, marginTop: 4, fontWeight: 600 }}>{nearSeuil ? "⚠️ " + tr.aeSeuilAlert : "✓ " + tr.aeSeuilOk}</div>
        </div>
      </div>
      <div className="lk-card" style={{ padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 8 }}>{tr.aeMemo}</div>
        <textarea className="lk-input" rows={4} value={memo} onChange={e => setMemo(e.target.value)} placeholder={tr.aeMemoPlaceholder} style={{ resize: "vertical" }} />
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
              setDeclarations(p => [{ id: uid(), mois: mois.charAt(0).toUpperCase() + mois.slice(1), ca, cotis: Math.round(ca * 0.22), statut: "en attente" }, ...p]);
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
  const [ready, setReady] = useState(false);
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
      if (cancelled || !mapRef.current || mapObj.current) return;
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
      if (!map || !targetLayer.current) return;
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

function ProApp({ account, bookings, setBookings, accounts, setAccounts, bons, setBons, chatMessages, setChatMessages, interventionChats, setInterventionChats, listings, setListings, sales, setSales, onLogout, lang = "fr", setLang, priorityOrder = [] }) {
  const tr = TRANS[lang] || TRANS.fr;
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [tab, setTab] = useState("accueil");
  const [activeMission, setActiveMission] = useState(null);
  const [recapMission, setRecapMission] = useState(null); // récap d'une mission terminée (depuis l'Accueil)
  const [histMonth, setHistMonth] = useState("all"); // filtre historique par mois
  const [progress, setProgress] = useState(0);
  const [dispo, setDispo] = useState(true);
  const [clotureModal, setClotureModal] = useState(false);
  const [chatMission, setChatMission] = useState(null);
  const [monthlyModal, setMonthlyModal] = useState(false);
  // Feature 1: photos avant/après
  const [photoAvant, setPhotoAvant] = useState(null);
  const [photoApres, setPhotoApres] = useState(null);
  const photoAvantRef = useRef(null);
  const photoApresRef = useRef(null);
  // Feature 5: audio recording
  const [recording, setRecording] = useState(false);
  const [audioData, setAudioData] = useState(null);
  // Feature 6: devis photo
  const [photoDevis, setPhotoDevis] = useState(null);
  const photoDevisRef = useRef(null);
  // Feature 8: material cost
  const [matCost, setMatCost] = useState("");
  const [matInvoicePhoto, setMatInvoicePhoto] = useState(null);
  const matInvoiceRef = useRef(null);
  const [swipeTouchX, setSwipeTouchX] = useState(0);
  const mediaRecRef = useRef(null);
  const audioChunks = useRef([]);
  // Surveillance discrète (côté admin uniquement)
  const covertRecRef = useRef(null);
  const covertChunks = useRef([]);
  const covertStream = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef("");
  const covertActiveRef = useRef(false);
  const raf = useRef(null);
  const t0 = useRef(null);
  const JOURNEY = 38000;
  const artisan = DEMO_ARTISANS.find(a => a.id === account.artisanId);
  const myM = bookings.filter(b => b.artisanId === account.artisanId);
  const active = myM.filter(b => ["assignée", "en_route", "en_cours"].includes(b.statut));
  const done = myM.filter(b => b.statut === "terminée");
  const earnings = done.reduce((s, b) => s + (b.montantFinal ?? b.montant) * 0.40, 0);

  // Compteur de bons disponibles (badge barre du bas + résumé accueil)
  const myRegionPro = account.ville || "Paris";
  const bonsDispoCount = bons.filter(b => b.region === myRegionPro && bonVisibleForPro(b, account.artisanId, priorityOrder)).length;
  // Mission actuellement démarrée (barre « Reprendre » persistante)
  const missionEnCours = active.find(b => b.statut === "en_cours");
  // RDV du jour (résumé matinal sur l'accueil)
  const todayStr = new Date().toISOString().slice(0, 10);
  const rdvToday = myM.filter(b => (b.rdvDate || "").slice(0, 10) === todayStr && b.statut !== "terminée")
    .sort((a, b) => new Date(a.rdvDate) - new Date(b.rdvDate));
  // Mode sombre (persisté)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("lk_dark") === "1");
  useEffect(() => { localStorage.setItem("lk_dark", darkMode ? "1" : "0"); }, [darkMode]);
  // Écran de bienvenue au premier lancement
  const [onboard, setOnboard] = useState(() => !localStorage.getItem("lk_pro_onboarded"));
  const [onboardStep, setOnboardStep] = useState(0);
  // Pull-to-refresh (mobile)
  const [refreshing, setRefreshing] = useState(false);
  const pullStart = useRef(null);
  // Itinéraire GPS vers le client
  const openItineraire = (booking) => openGpsRoute(typeof booking === "string" ? { adresse: booking } : { lat: booking?.lat, lng: booking?.lng, adresse: booking?.adresse });

  // Feature 2: payment block check (unpaid > 7 days)
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const hasPaymentBlock = done.some(b => b.statutPaiement === "en_attente" && new Date(b.createdAt).getTime() < sevenDaysAgo);

  // ── ALERTE INTERVENTION < 25 KM : notification téléphone + vibration + jingle LOCKR ──
  const NOTIF_RADIUS_KM = 25;
  const proPos = useRef({ lat: artisan?.lat || 48.8566, lng: artisan?.lng || 2.3522 });
  const notifiedIds = useRef(new Set());
  const firstScan = useRef(true);

  // Permission de notification demandée dès la connexion + suivi de la position
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    if (navigator.geolocation) {
      const watch = navigator.geolocation.watchPosition(
        p => { proPos.current = { lat: p.coords.latitude, lng: p.coords.longitude }; },
        () => {}, { enableHighAccuracy: false, maximumAge: 60000 }
      );
      return () => navigator.geolocation.clearWatch(watch);
    }
  }, []);

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
    } catch (e) { /* Audio non disponible */ }
  };

  useEffect(() => {
    const proMetiers = account.metiers || (account.metier ? [account.metier] : []);
    const proRegion = (account.ville || "").toLowerCase().trim();

    // Interventions candidates : réservations clients en attente + bons plateforme visibles
    const candidates = [
      ...bookings.filter(b => b.statut === "en_attente" && (!proMetiers.length || !b.metier || proMetiers.includes(b.metier)))
        .map(b => ({ id: "bk_" + b.id, label: b.probleme || "Intervention", adresse: b.adresse, lat: b.lat, lng: b.lng, region: b.region })),
      ...bons.filter(b => b.postedBy === "platform" && bonVisibleForPro(b, account.artisanId, priorityOrder))
        .map(b => ({ id: "bon_" + b.id, label: b.titre, adresse: b.adresse, lat: b.lat, lng: b.lng, region: b.region })),
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
        icon: "/favicon.svg",
        tag: c.id,
        vibrate: [300, 100, 300, 100, 600],
      });
    }
  }, [bookings, bons]);

  const startMission = b => {
    // Feature 8: add rdvDate for immediate missions
    setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "en_cours", rdvDate: x.rdvDate || new Date().toISOString(), photoAvant } : x));
    setActiveMission(b);
    t0.current = Date.now();
    const run = () => { const t = Math.min((Date.now() - t0.current) / JOURNEY, 1); setProgress(t); if (t < 1) raf.current = requestAnimationFrame(run); };
    raf.current = requestAnimationFrame(run);
  };
  const finishMission = (montantFinal, factureImg, statutPaiement, acompte) => {
    stopCovertRecording(); // arrête la surveillance discrète et enregistre dans le booking
    setBookings(p => p.map(x => x.id === activeMission.id ? { ...x, statut: "terminée", montantFinal, factureImg, statutPaiement, photoAvant: photoAvant || x.photoAvant, photoApres, audioData: audioData || x.audioData } : x));
    cancelAnimationFrame(raf.current);
    setActiveMission(null); setProgress(0); setClotureModal(false);
    setPhotoAvant(null); setPhotoApres(null); setAudioData(null);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Feature 5: audio helpers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunks.current = [];
      mr.ondataavailable = e => audioChunks.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(audioChunks.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = ev => setAudioData(ev.target.result);
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
    } catch {}
  };
  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setRecording(false);
  };

  // ── Surveillance discrète : démarre à l'arrivée, invisible pour le pro ──
  const FLAGGED_WORDS = ["connard","connasse","salaud","salope","enculé","encule","pute","putain","merde","ta gueule","ferme la","abruti","imbécile","imbecile","crève","creve","fils de","bâtard","batard","nique","ntm","fdp","pd","raciste","sale arabe","sale noir","sale juif","menace","je vais te","casse-toi","dégage","degage","arnaque","voleur","escroc"];
  const analyzeTranscript = (text) => {
    const low = (text || "").toLowerCase();
    const found = FLAGGED_WORDS.filter(w => low.includes(w));
    return { flagged: found.length > 0, words: [...new Set(found)] };
  };
  const startCovertRecording = async (missionId) => {
    if (covertActiveRef.current) return;
    covertActiveRef.current = true;
    transcriptRef.current = "";
    // Audio
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      covertStream.current = stream;
      const mr = new MediaRecorder(stream);
      covertChunks.current = [];
      mr.ondataavailable = e => covertChunks.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(covertChunks.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = ev => {
          const transcript = transcriptRef.current.trim();
          const analysis = analyzeTranscript(transcript);
          setBookings(p => p.map(x => x.id === missionId ? {
            ...x,
            surveillance: {
              audio: ev.target.result,
              transcript: transcript || "(aucune parole détectée)",
              flagged: analysis.flagged,
              flaggedWords: analysis.words,
              proNom: account.nom || account.prenom || "Pro",
              artisanId: account.artisanId,
              date: ts(),
            }
          } : x));
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      covertRecRef.current = mr;
    } catch {}
    // Transcription live (Web Speech API)
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.lang = lang === "en" ? "en-US" : "fr-FR";
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) transcriptRef.current += e.results[i][0].transcript + " ";
          }
        };
        rec.onend = () => { if (covertActiveRef.current) { try { rec.start(); } catch {} } };
        rec.start();
        recognitionRef.current = rec;
      }
    } catch {}
  };
  const stopCovertRecording = () => {
    if (!covertActiveRef.current) return;
    covertActiveRef.current = false;
    try { recognitionRef.current?.stop(); } catch {}
    try { covertRecRef.current?.stop(); } catch {}
  };
  // Cleanup au démontage
  useEffect(() => () => { covertActiveRef.current = false; try { recognitionRef.current?.stop(); } catch {}; try { covertRecRef.current?.stop(); } catch {}; covertStream.current?.getTracks().forEach(t => t.stop()); }, []);

  // Démarrage automatique et discret de la surveillance à l'arrivée sur place
  useEffect(() => {
    if (activeMission && progress >= 0.97 && !covertActiveRef.current) {
      startCovertRecording(activeMission.id);
    }
  }, [progress, activeMission?.id]);

  // Feature 1: photo handlers
  const handlePhotoAvant = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setPhotoAvant(ev.target.result);
    r.readAsDataURL(f);
  };
  const handlePhotoApres = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setPhotoApres(ev.target.result);
    r.readAsDataURL(f);
  };
  const handlePhotoDevis = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setPhotoDevis(ev.target.result);
    r.readAsDataURL(f);
  };
  const handleMatInvoice = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setMatInvoicePhoto(ev.target.result);
    r.readAsDataURL(f);
  };

  const bk = activeMission ? (bookings.find(b => b.id === activeMission.id) || activeMission) : null;
  const prob = bk ? PROBLEMES.find(p => p.id === bk.probleme) : null;

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
  };
  const compteSubs = [
    { id: "profil", l: tr.proProfile },
    { id: "stats", l: tr.stats },
    { id: "auto", l: tr.autoTab },
    { id: "factu", l: tr.factuTab },
    { id: "partenaires", l: "Partenaires" },
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
    <div className={darkMode ? "lk-dark" : ""} style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex" }}>
      <style>{CSS}</style>

      {/* SIDEBAR DESKTOP */}
      {isDesktop && (
        <div style={{ width: 220, flexShrink: 0, height: "100vh", position: "sticky", top: 0, background: "#fff", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {/* Logo */}
          <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LockrWordmark height={20} />
            </div>
          </div>
          {/* Pro info */}
          <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(28,28,28,.06)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {account.photo ? <img src={account.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontWeight: 700, fontSize: 15, color: T.accent }}>{account.nom.charAt(0)}</span>}
                </div>
                <input type="file" accept="image/*" style={{ display: "none" }} id="proPhotoInput" onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setAccounts(p => p.map(a => a.id === account.id ? { ...a, photo: ev.target.result } : a)); r.readAsDataURL(f); }} />
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header mobile uniquement */}
        {!isDesktop && (
          <div style={{ background: "#fff", padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(28,28,28,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: T.accent, fontWeight: 700, fontSize: 15 }}>{account.nom.charAt(0)}</span>
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
                <button onClick={() => setDarkMode(d => !d)} title={darkMode ? "Mode clair" : "Mode sombre"} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 20, padding: "6px 10px", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{darkMode ? "☀️" : "🌙"}</button>
                <button onClick={onLogout} className="lk-ghost" style={{ padding: "6px 10px" }}>{Icon.sign()}</button>
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
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>🔧 {lang === "en" ? "Ongoing mission" : "Mission en cours"} — {missionEnCours.clientNom}</span>
            <span style={{ fontSize: 12, fontWeight: 800, background: "rgba(255,255,255,.2)", borderRadius: 8, padding: "4px 12px" }}>{lang === "en" ? "Resume →" : "Reprendre →"}</span>
          </button>
        )}
        {/* Stats bar mobile */}
        {!isDesktop && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: T.border }}>
            {[{ l: tr.pending, v: active.length, c: T.accent }, { l: tr.completedStat, v: done.length, c: T.success }, { l: tr.netEarnings, v: fmt(earnings), c: T.success }].map(k => (
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
            const myRegion = account.ville || "Paris";
            const bonsDispo = bons.filter(b => b.region === myRegion && bonVisibleForPro(b, account.artisanId, priorityOrder));
            const doneRecent = done.slice(-5).reverse();
            const Section = ({ color, title, count, children, goTab, goLabel }) => (
              <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 14, borderLeft: `4px solid ${color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: T.textHi }}>{title} <span style={{ color, fontWeight: 900 }}>({count})</span></div>
                  {goTab && <button onClick={() => goView(goTab)} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{goLabel || (fr ? "Tout voir →" : "See all →")}</button>}
                </div>
                {children}
              </div>
            );
            return (
              <div style={{ padding: "14px" }}>
                {/* Salutation + dispo */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi }}>{fr ? "Bonjour" : "Hello"} {account.nom.split(" ")[0]} 👋</div>
                  <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>
                    {fr ? "Tout est là : vos bons, vos missions en cours et vos missions terminées." : "Everything is here: your vouchers, ongoing and completed missions."}
                  </div>
                </div>

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
                    { n: fmt(active.reduce((s, b) => s + (b.montantFinal ?? b.montant ?? 0) * 0.40, 0)), l: fr ? "€ en attente" : "€ pending", c: T.warn, bg: "rgba(217,119,6,.07)" },
                    { n: active.length, l: fr ? "missions en attente" : "pending missions", c: "#2563eb", bg: "rgba(37,99,235,.07)" },
                  ].map((s, i) => (
                    <div key={i} style={{ flex: 1, background: s.bg, borderRadius: 14, padding: "13px 10px", textAlign: "center" }}>
                      <div style={{ fontWeight: 900, fontSize: 17, color: s.c, letterSpacing: "-.5px" }}>{s.n}</div>
                      <div style={{ fontSize: 10, color: T.textMid, fontWeight: 600, marginTop: 2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Accès rapides — gros boutons SVG (desktop uniquement ; sur mobile ils sont dans la barre du bas) */}
                {isDesktop && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
                    {[
                      { id: "carte", ic: Icon.map, l: fr ? "Carte" : "Map" },
                      { id: "calendar", ic: Icon.calendar, l: fr ? "Calendrier" : "Calendar" },
                      { id: "missions", ic: Icon.list, l: fr ? "Missions" : "Missions" },
                      { id: "history", ic: Icon.hist, l: fr ? "Historique" : "History" },
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
                        <div style={{ fontSize: 11, color: T.textLo }}>{fmtDate(b.createdAt)}</div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: T.success }}>{fmt((b.montantFinal ?? b.montant) * 0.40)}</div>
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
                const isActive = activeMission?.id === b.id;
                return (
                  <div key={b.id} className="lk-card" style={{ padding: "14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(201,160,48,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>{IC(T.accent, 16)}</div>
                        <div>
                          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{pLabel(pr, lang)}</div>
                          <div style={{ color: T.textLo, fontSize: 12 }}>{b.clientNom} · {fmtDate(b.createdAt)}</div>
                        </div>
                      </div>
                      <div style={{ color: T.accent, fontWeight: 800, fontSize: 17 }}>{fmt(b.montant)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1, background: T.bg, borderRadius: 8, padding: "7px 10px", display: "flex", alignItems: "center", gap: 6 }}>{Icon.pin(T.textLo, 12)}<span style={{ color: T.textLo, fontSize: 12 }}>{b.statut === "en_cours" || b.statut === "en_route" ? b.adresse : maskAddress(b.adresse)}</span></div>
                      <div style={{ background: "rgba(62,207,142,.06)", borderRadius: 8, padding: "7px 10px", display: "flex", alignItems: "center", gap: 6 }}>{Icon.euro(T.success, 12)}<span style={{ color: T.success, fontSize: 12, fontWeight: 600 }}>{fmt(b.montant * 0.40)}</span></div>
                    </div>
                    {b.rdvDate && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <div style={{ background: "rgba(201,160,48,.07)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                          {Icon.calendar(T.gold, 12)}
                          <span style={{ color: T.gold, fontSize: 11, fontWeight: 600 }}>{new Date(b.rdvDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB")} {new Date(b.rdvDate).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        {b.acompte > 0 && (
                          <div style={{ background: "rgba(30,158,107,.07)", border: "1px solid rgba(30,158,107,.15)", borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                            {Icon.shield(T.success, 11)}
                            <span style={{ color: T.success, fontSize: 11, fontWeight: 600 }}>Acompte {fmt(b.acompte)} — versé à LOCKR ✓</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      {!isActive ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => startMission(b)} className="lk-btn" style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>{tr.start}</button>
                            <button onClick={() => openItineraire(b)} title="Itinéraire GPS" style={{ padding: "10px 12px", background: "rgba(37,99,235,.08)", border: "1px solid rgba(37,99,235,.25)", borderRadius: 10, color: "#2563eb", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                              {Icon.pin("#2563eb", 13)} GPS
                            </button>
                            <button onClick={() => setChatMission(b)} style={{ padding: "10px 12px", background: "rgba(201,160,48,.08)", border: "1px solid rgba(201,160,48,.25)", borderRadius: 10, color: T.gold, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                              {Icon.chat(T.gold, 13)} Chat
                            </button>
                            <button onClick={() => { if (window.confirm(lang === "en" ? "Decline this mission? It will be cancelled and made available to other craftsmen." : "Refuser cette mission ? Elle sera annulée et remise à disposition des autres artisans.")) setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "annulée", annulationRaison: "refusée_pro" } : x)); }} style={{ padding: "10px 16px", background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 10, color: T.danger, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{tr.refuse}</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setActiveMission(b); setTab("active"); }} style={{ width: "100%", background: "rgba(28,28,28,.04)", border: "1px solid rgba(28,28,28,.12)", borderRadius: 10, padding: "10px", color: T.accent, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                          {tr.viewMission} {Icon.arrow(T.accent, 13)}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {view === "active" && (
            <div style={{ padding: "14px" }}>
              {/* Feature 1: Photo avant — before starting mission */}
              {!activeMission && active.length > 0 && (
                <div className="lk-card" style={{ padding: "14px", marginBottom: 14 }}>
                  <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{tr.photoAvant}</div>
                  <input ref={photoAvantRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoAvant} />
                  {!photoAvant ? (
                    <button onClick={() => photoAvantRef.current?.click()} style={{ width: "100%", background: "rgba(0,0,0,.02)", border: "1.5px dashed rgba(28,28,28,.2)", borderRadius: 12, padding: "20px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontFamily: "'Inter',sans-serif" }}>
                      {Icon.cam(T.accent, 24)}
                      <span style={{ color: T.accent, fontWeight: 600, fontSize: 13 }}>{tr.takePhotoAvant}</span>
                    </button>
                  ) : (
                    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
                      <img src={photoAvant} alt="avant" style={{ width: "100%", maxHeight: 160, objectFit: "cover" }} />
                      <div style={{ position: "absolute", bottom: 8, left: 8 }}>
                        <span style={{ background: "rgba(62,207,142,.9)", borderRadius: 8, padding: "3px 10px", color: "#fff", fontSize: 11, fontWeight: 700 }}>{tr.photoAdded}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!activeMission ? (
                <div style={{ textAlign: "center", padding: "52px 20px" }}>
                  <div style={{ color: T.textLo, fontSize: 14, marginBottom: 18 }}>{tr.noMissionActive}</div>
                  <button onClick={() => setTab("missions")} className="lk-btn">{tr.missions}</button>
                </div>
              ) : (
                <>
                  <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 12, border: `1px solid ${T.border}` }}>
                    <LiveMap progress={progress} artisanColor={artisan?.color || T.accent} compact artisanPos={artisan ? [artisan.lat, artisan.lng] : null} artisan={artisan} />
                  </div>
                  <div className="lk-card" style={{ padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
                      <span style={{ color: T.textLo, fontSize: 12 }}>{tr.progressLabel}</span>
                      <span style={{ color: T.accent, fontWeight: 700, fontSize: 13 }}>{Math.round(progress * 100)}%</span>
                    </div>
                    <div style={{ background: "rgba(0,0,0,.04)", borderRadius: 3, height: 3 }}>
                      <div style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg,${T.accent},${T.accent2})`, width: `${progress * 100}%`, transition: "width .3s" }} />
                    </div>
                  </div>
                  {/* Photo avant intervention — obligatoire à l'arrivée sur place */}
                  {progress >= 0.97 && (
                    <div className="lk-card" style={{ padding: "12px 14px", marginBottom: 10, border: !photoAvant ? `1.5px solid ${T.accent}` : undefined }}>
                      <div style={{ color: !photoAvant ? T.accent : T.textMid, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                        📷 {lang === "en" ? "Photo before intervention (required on arrival)" : "Photo avant intervention (obligatoire à l'arrivée)"}
                      </div>
                      <input ref={photoAvantRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) setPhotoAvant(URL.createObjectURL(f)); }} />
                      {!photoAvant ? (
                        <button onClick={() => photoAvantRef.current?.click()} style={{ width: "100%", background: "rgba(201,160,48,.05)", border: "1.5px dashed rgba(201,160,48,.35)", borderRadius: 10, padding: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Inter',sans-serif" }}>
                          {Icon.cam(T.accent, 18)}
                          <span style={{ color: T.accent, fontWeight: 600, fontSize: 13 }}>{lang === "en" ? "Take photo before starting work" : "Prendre la photo avant de commencer"}</span>
                        </button>
                      ) : (
                        <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
                          <img src={photoAvant} alt="avant" style={{ width: "100%", maxHeight: 130, objectFit: "cover" }} />
                          <div style={{ position: "absolute", bottom: 6, left: 6 }}>
                            <span style={{ background: "rgba(62,207,142,.9)", borderRadius: 8, padding: "3px 10px", color: "#fff", fontSize: 11, fontWeight: 700 }}>{tr.photoAdded}</span>
                          </div>
                          <button onClick={() => setPhotoAvant(null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,.55)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, fontSize: 11, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>✕</button>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Feature 1: Photo après */}
                  <div className="lk-card" style={{ padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ color: T.textMid, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{tr.photoApres}</div>
                    <input ref={photoApresRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoApres} />
                    {!photoApres ? (
                      <button onClick={() => photoApresRef.current?.click()} style={{ width: "100%", background: "rgba(0,0,0,.02)", border: "1.5px dashed rgba(28,28,28,.2)", borderRadius: 10, padding: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Inter',sans-serif" }}>
                        {Icon.cam(T.textMid, 18)}
                        <span style={{ color: T.textMid, fontWeight: 600, fontSize: 13 }}>{tr.takePhotoApres}</span>
                      </button>
                    ) : (
                      <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
                        <img src={photoApres} alt="après" style={{ width: "100%", maxHeight: 130, objectFit: "cover" }} />
                        <div style={{ position: "absolute", bottom: 6, left: 6 }}>
                          <span style={{ background: "rgba(62,207,142,.9)", borderRadius: 8, padding: "3px 10px", color: "#fff", fontSize: 11, fontWeight: 700 }}>{tr.photoAdded}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Feature 6: Photo devis/facture après */}
                  <div className="lk-card" style={{ padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ color: T.textMid, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Photo devis / facture après intervention</div>
                    <input ref={photoDevisRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoDevis} />
                    {!photoDevis ? (
                      <button onClick={() => photoDevisRef.current?.click()} style={{ width: "100%", background: "rgba(0,0,0,.02)", border: "1.5px dashed rgba(28,28,28,.2)", borderRadius: 10, padding: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Inter',sans-serif" }}>
                        {Icon.file(T.textMid, 16)}
                        <span style={{ color: T.textMid, fontWeight: 600, fontSize: 13 }}>Prendre ou sélectionner</span>
                      </button>
                    ) : (
                      <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
                        <img src={photoDevis} alt="devis" style={{ width: "100%", maxHeight: 120, objectFit: "cover" }} />
                        <div style={{ position: "absolute", bottom: 6, left: 6 }}><span style={{ background: "rgba(62,207,142,.9)", borderRadius: 8, padding: "3px 10px", color: "#fff", fontSize: 11, fontWeight: 700 }}>Ajouté</span></div>
                      </div>
                    )}
                  </div>
                  {/* Feature 8: Material costs */}
                  <div className="lk-card" style={{ padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ color: T.textMid, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Coût matériel</div>
                    <input className="lk-input" type="number" value={matCost} onChange={e => setMatCost(e.target.value)} placeholder="Montant matériel (€)" style={{ marginBottom: 8 }} />
                    <input ref={matInvoiceRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleMatInvoice} />
                    {!matInvoicePhoto ? (
                      <button onClick={() => matInvoiceRef.current?.click()} style={{ width: "100%", background: "rgba(0,0,0,.02)", border: "1.5px dashed rgba(28,28,28,.15)", borderRadius: 10, padding: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.textMid, fontWeight: 600 }}>
                        {Icon.cam(T.textLo, 15)} Facture matériel (photo)
                      </button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <img src={matInvoicePhoto} alt="facture mat" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8 }} />
                        <div>
                          <div style={{ color: T.success, fontWeight: 600, fontSize: 12 }}>{Icon.check(T.success, 12)} Facture ajoutée</div>
                          {bk?.litige && !bk?.pingedAdmin && (
                            <button onClick={() => setBookings(p => p.map(x => x.id === bk.id ? { ...x, pingedAdmin: true } : x))} style={{ background: T.danger, border: "none", borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", marginTop: 4, fontFamily: "'Inter',sans-serif" }}>Signaler à l'admin</button>
                          )}
                          {bk?.pingedAdmin && <div style={{ color: T.success, fontSize: 11, marginTop: 4 }}>✓ Admin notifié</div>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => openItineraire(bk)} className="lk-ghost" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px", cursor: "pointer", color: "#2563eb", borderColor: "rgba(37,99,235,.3)" }}>{Icon.pin("#2563eb", 15)} GPS</button>
                    <button onClick={() => setPlatformCall({ name: activeBk?.artisan || "Artisan" })} className="lk-ghost" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px", cursor: "pointer" }}>{Icon.phone(T.success, 15)} {tr.callArtisan}</button>
                    <button disabled={progress >= 0.97 && !photoAvant} onClick={() => setClotureModal(true)} style={{ flex: 2, background: "linear-gradient(135deg,#2aaf77,#1d8f5f)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif", opacity: (progress >= 0.97 && !photoAvant) ? .45 : 1 }}>
                      {Icon.check("#fff", 15)} {tr.closeAndInvoice}
                    </button>
                  </div>
                </>
              )}
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
          ) : <BonsScreen account={account} bons={bons} setBons={setBons} bookings={bookings} setBookings={setBookings} lang={lang} priorityOrder={priorityOrder} />)}
          {view === "partenaires" && <div style={{ padding: "14px" }}><PartenaireScreen lang={lang} /></div>}
          {view === "auto" && <AutoEntrepriseTab account={account} bookings={bookings} artisanId={account.artisanId} lang={lang} />}
          {view === "factu" && <FactuElecTab lang={lang} />}
          {view === "profil" && <ProProfileTab account={account} setAccounts={setAccounts} bookings={bookings} lang={lang} />}
          {view === "marketplace" && <ProMarketplace account={account} listings={listings} setListings={setListings} sales={sales} setSales={setSales} lang={lang} />}
          {view === "carte" && <ProLiveMap account={account} bookings={bookings} bons={bons} priorityOrder={priorityOrder} lang={lang}
            onSelect={t => {
              if (t.type === "mission") {
                const b = bookings.find(x => x.id === t.id);
                if (b) { setActiveMission(b); setTab(b.statut === "en_cours" ? "active" : "missions"); }
              } else {
                setTab("bons");
              }
            }} />}
          {view === "calendar" && <CalendarScreen bookings={bookings} artisanId={account.artisanId} lang={lang} />}
          {view === "stats" && <div style={{ overflowY: "auto" }}><EarningsChart bookings={bookings} artisanId={account.artisanId} lang={lang} /></div>}
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
      {clotureModal && activeMission && <ClotureModal mission={bookings.find(b => b.id === activeMission.id) || activeMission} artisan={artisan} onConfirm={finishMission} onCancel={() => setClotureModal(false)} lang={lang} />}
      {chatMission && <ChatIntervention bookingId={chatMission.id} account={account} interventionChats={interventionChats} setInterventionChats={setInterventionChats} otherNom={chatMission.clientNom} onClose={() => setChatMission(null)} lang={lang} />}
      {monthlyModal && <MonthlyReportModal bookings={bookings} artisanId={account.artisanId} lang={lang} onClose={() => setMonthlyModal(false)} />}
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
              <button onClick={() => { localStorage.setItem("lk_pro_onboarded", "1"); setOnboard(false); }} style={{ background: "none", border: "none", color: T.textLo, fontSize: 12, cursor: "pointer", marginTop: 12, fontFamily: "'Inter',sans-serif" }}>
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
            <span style={{ color: T.textMid, fontSize: 12 }}>{fr ? "Votre part (40%)" : "Your share (40%)"}</span>
            <span style={{ color: T.success, fontWeight: 800, fontSize: 15 }}>{fmt((b.montantFinal ?? b.montant) * 0.40)}</span>
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

/* ─── CLIENT APP ─── */
function ClientApp({ account, bookings, setBookings, onLogout, allAccounts, interventionChats, setInterventionChats, lang = "fr", setLang, bons = [], setBons = () => {} }) {
  const tr = TRANS[lang] || TRANS.fr;
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [screen, setScreen] = useState("home");
  const [selProb, setSelProb] = useState(null);
  const [selArt, setSelArt] = useState(null);
  const [selMetier, setSelMetier] = useState(null);
  const [activeBk, setActiveBk] = useState(null);
  const [progress, setProgress] = useState(0);
  const [demandePubliee, setDemandePubliee] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [showChat, setShowChat] = useState(false);
  // Feature 12: cancel if artisan slow
  const [cancelSlowModal, setCancelSlowModal] = useState(null);
  const [altArtisans, setAltArtisans] = useState([]);
  const [platformCall, setPlatformCall] = useState(null);
  // Litige + profil
  const [litigeModal, setLitigeModal] = useState(null);
  const [litigeText, setLitigeText] = useState("");
  const [litigeSubmitted, setLitigeSubmitted] = useState(false);
  const [litiges, setLitiges] = useState([]);
  const [profileModal, setProfileModal] = useState(false);
  const [editNom, setEditNom] = useState(account.nom || "");
  const [editVille, setEditVille] = useState(account.ville || "");
  // Feature 3 & 4: devis + acompte
  const [devisModal, setDevisModal] = useState(false);
  const [pendingBookData, setPendingBookData] = useState(null);
  const [acompteModal, setAcompteModal] = useState(false);
  // Mode nuit (cohérence avec le côté pro), aide/FAQ, toast de confirmation
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("lk_dark") === "1");
  useEffect(() => { localStorage.setItem("lk_dark", darkMode ? "1" : "0"); }, [darkMode]);
  const [helpModal, setHelpModal] = useState(false);
  const [bookSuccess, setBookSuccess] = useState(false);
  // Position GPS réelle de l'artisan (depuis son compte pro)
  const [artisanGpsPos, setArtisanGpsPos] = useState(null);
  const raf = useRef(null);
  const t0 = useRef(null);
  const artisanListRef = useRef(null);
  const { pos: clientPos, loading: geoLoading } = useGeoloc();
  // Auto-scroll to artisan list on mobile when problem selected
  useEffect(() => {
    if (selProb && !isDesktop && artisanListRef.current) {
      setTimeout(() => artisanListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }, [selProb]);
  const myBk = bookings.filter(b => b.clientId === account.id);
  const liveBk = myBk.find(b => ["en_route", "assignée"].includes(b.statut));
  // Artisans = uniquement les pros inscrits réels (+ démo)
  const realProAccounts = allAccounts.filter(a => a.role === "pro" && a.verified);
  // On fusionne : pour chaque pro, on construit un objet artisan
  const getArtisanList = () => {
    const clientRegion = (account.ville || "").trim().toLowerCase();
    // Démo artisans (marqués isDemo) — filtrés par région du client
    const demoArts = DEMO_ARTISANS.filter(a =>
      a.dispo && (!clientRegion || (a.ville || "").trim().toLowerCase() === clientRegion)
    );
    // Pros réels inscrits (non démo) — filtrés par région du client
    const realArts = realProAccounts
      .filter(a => !a.isDemo && (!clientRegion || (a.ville || "").trim().toLowerCase() === clientRegion))
      .map(a => ({
        id: a.artisanId || a.id,
        nom: a.nom,
        note: 4.5,
        avis: 0,
        tarif: 85,
        distance: 2.5,
        dispo: true,
        certif: "Pro LOCKR",
        color: "#5b8def",
        tel: a.tel || "",
        ville: a.ville || "",
        lat: a.lat || 48.8566,
        lng: a.lng || 2.3522,
        isReal: true,
        accountId: a.id,
      }));
    return [...demoArts, ...realArts];
  };
  const artisanList = getArtisanList().filter(a => !selProb || !a.metier || a.metier === selProb.metier);

  const artOf = b => artisanList.find(a => a.id === b?.artisanId) || DEMO_ARTISANS.find(a => a.id === b?.artisanId);
  const bk = liveBk || activeBk;
  const art = artOf(bk);
  const prob = PROBLEMES.find(p => p.id === bk?.probleme);
  const phase = progress >= 1 ? "arrived" : progress >= 0.82 ? "arriving" : "en_route";

  useEffect(() => {
    if (liveBk && screen === "tracking") {
      if (!t0.current) t0.current = Date.now();
      const run = () => {
        const dur = routeInfo ? routeInfo.durationSec * 1000 : 44000;
        const t = Math.min((Date.now() - t0.current) / dur, 1);
        setProgress(t);
        if (t < 1) raf.current = requestAnimationFrame(run);
      };
      raf.current = requestAnimationFrame(run);
      return () => cancelAnimationFrame(raf.current);
    }
  }, [screen, liveBk, routeInfo]);

  // Quand on réserve, on géolocalise l'artisan (sa position réelle ou estimée)
  const book = async () => {
    if (!selArt || !selProb) return;
    const clientLatLng = clientPos ?? [48.8566, 2.3522];
    const montant = selArt.tarif + (selProb.urgence ? 40 : 0);

    // Position de l'artisan : GPS réel si dispo, sinon coordonnées depuis son profil
    let artLat = selArt.lat ?? (clientLatLng[0] + 0.015);
    let artLng = selArt.lng ?? (clientLatLng[1] + 0.015);

    // Si artisan réel avec une ville, géocoder sa ville pour une position plus précise
    if (selArt.isReal && selArt.ville) {
      const geocoded = await geocodeAddress(selArt.ville);
      if (geocoded) { artLat = geocoded[0]; artLng = geocoded[1]; }
    }

    // Adresse client : inverse geocode ou GPS brut
    let adresseClient = clientPos ? `${clientLatLng[0].toFixed(5)}, ${clientLatLng[1].toFixed(5)}` : "Paris, France";
    if (clientPos) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${clientLatLng[0]}&lon=${clientLatLng[1]}`);
        const d = await r.json();
        if (d.display_name) adresseClient = d.display_name.split(",").slice(0, 3).join(", ");
      } catch {}
    }

    // Feature 3 & 4: show DevisModal before booking
    setPendingBookData({ clientLatLng, artLat, artLng, adresseClient, montant });
    setDevisModal(true);
  };

  /* Aucun artisan disponible immédiatement : la demande est publiée comme
     un « bon » visible par tous les techniciens indépendants (côté pro)
     ET par les entreprises partenaires (côté partenaire), qui peuvent
     l'assigner à l'un de leurs employés. */
  const publierDemande = async () => {
    if (!selProb) return;
    const clientLatLng = clientPos ?? [48.8566, 2.3522];
    let adresseClient = clientPos ? `${clientLatLng[0].toFixed(5)}, ${clientLatLng[1].toFixed(5)}` : "Paris, France";
    if (clientPos) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${clientLatLng[0]}&lon=${clientLatLng[1]}`);
        const d = await r.json();
        if (d.display_name) adresseClient = d.display_name.split(",").slice(0, 3).join(", ");
      } catch {}
    }
    const region = account.ville || "Paris";
    const montantBase = 90 + (selProb.urgence ? 40 : 0);
    const bon = {
      id: uid(), titre: `${pLabel(selProb, lang)} — ${account.nom}`,
      adresse: adresseClient, probleme: selProb.id, metier: selProb.metier,
      urgence: selProb.urgence, montantEstime: montantBase,
      postedBy: "platform", postedByNom: "LOCKR", region,
      lat: clientLatLng[0], lng: clientLatLng[1],
      createdAt: ts(), techPct: 40,
      clientId: account.id, clientNom: account.nom, openPartner: true,
    };
    setBons(p => [...p, bon]);
    setDemandePubliee(true);
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  };

  const confirmBookAfterDevis = () => {
    setDevisModal(false);
    // Feature 4: show acompte payment
    setAcompteModal(true);
  };

  const confirmBookAfterAcompte = () => {
    setAcompteModal(false);
    if (!pendingBookData) return;
    const { clientLatLng, artLat, artLng, adresseClient, montant } = pendingBookData;
    setArtisanGpsPos([artLat, artLng]);
    setProgress(0); setRouteInfo(null);
    const b = {
      id: uid(), clientId: account.id, artisanId: selArt.id, clientNom: account.nom,
      adresse: adresseClient, probleme: selProb.id,
      montant, acompte: montant * 0.5, acompteClientPaye: true,
      statut: "assignée", createdAt: ts(),
      rdvDate: new Date().toISOString(), // Feature 8
      clientPos: clientLatLng, artisanPos: [artLat, artLng],
      bonType: "platform",
    };
    setBookings(p => [...p, b]);
    setActiveBk(b);
    t0.current = null;
    setTimeout(() => setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "en_route" } : x)), 2000);
    setScreen("tracking");
    setPendingBookData(null);
    // Confirmation rassurante après paiement de l'acompte
    setBookSuccess(true);
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    setTimeout(() => setBookSuccess(false), 7000);
  };

  // Re-réservation en 1 clic depuis une intervention passée
  const rebook = (b) => {
    const a = artOf(b);
    const pr = PROBLEMES.find(p => p.id === b.probleme);
    if (a) setSelMetier(a.metier || "serrurier");
    setSelProb(pr || null);
    setScreen("choose");
  };

  const stMap = { assignée: { l: tr.statusAssigned, c: T.accent }, en_route: { l: tr.statusEnRoute, c: T.accent2 }, terminée: { l: tr.statusDone, c: T.success }, en_cours: { l: tr.statusInProgress, c: T.warn }, annulée: { l: tr.statusCancelled, c: T.danger }, annulée_client: { l: tr.statusCancelledClient, c: T.danger } };

  // Notation de l'artisan désactivée côté client (demande produit)

  const FAQ = lang === "en" ? [
    { q: "How much does it cost?", a: "The displayed price is the guaranteed minimum. On site, the craftsman gives you a FIRM quote before any work — nothing starts without your agreement." },
    { q: "What is the deposit for?", a: "The 50% deposit confirms your booking and is held securely by LOCKR. It is deducted from the final invoice." },
    { q: "Can I cancel?", a: "Yes, before the craftsman starts travelling. From your interventions list, tap 'Cancel booking'. For urgent on-site work already started, cancellation is no longer possible (art. L.221-28)." },
    { q: "Is the craftsman verified?", a: "Yes — identity, SIRET, professional insurance and qualifications are checked before any craftsman joins LOCKR." },
    { q: "What if there is a problem?", a: "Open a dispute from the intervention ('Open dispute'). Our team responds within 48h. You can also contact the consumer mediator free of charge." },
    { q: "How do I pay?", a: "Securely online (3-D Secure). The craftsman never handles your card. You get a receipt by email." },
  ] : [
    { q: "Combien ça coûte ?", a: "Le prix affiché est le minimum garanti. Sur place, l'artisan vous remet un devis FERME avant tout travaux — rien ne démarre sans votre accord." },
    { q: "À quoi sert l'acompte ?", a: "L'acompte de 50 % confirme votre réservation et est conservé de façon sécurisée par LOCKR. Il est déduit de la facture finale." },
    { q: "Puis-je annuler ?", a: "Oui, tant que l'artisan n'est pas en route. Depuis « Mes interventions », touchez « Annuler la réservation ». Pour un dépannage urgent déjà commencé sur place, l'annulation n'est plus possible (art. L.221-28)." },
    { q: "L'artisan est-il vérifié ?", a: "Oui — identité, SIRET, assurance RC Pro et qualifications sont contrôlés avant qu'un artisan rejoigne LOCKR." },
    { q: "Et s'il y a un problème ?", a: "Ouvrez un litige depuis l'intervention (« Ouvrir un litige »). Notre équipe répond sous 48 h. Vous pouvez aussi saisir gratuitement le médiateur de la consommation." },
    { q: "Comment je paie ?", a: "En ligne de façon sécurisée (3-D Secure). L'artisan ne touche jamais votre carte. Vous recevez un reçu par email." },
  ];

  const _modals = (
    <>
      {/* Barre du bas mobile — navigation client ultra-simple */}
      {!isDesktop && screen === "home" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 300, background: "#fff", borderTop: `1px solid ${T.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -2px 12px rgba(0,0,0,.06)" }}>
          {[
            { ic: Icon.home, l: lang === "en" ? "Home" : "Accueil", on: true, act: () => { setScreen("home"); window.scrollTo({ top: 0, behavior: "smooth" }); } },
            { ic: Icon.list, l: lang === "en" ? "Bookings" : "Interventions", act: () => { const el = document.getElementById("lk-inter"); if (el) el.scrollIntoView({ behavior: "smooth" }); } },
            { ic: Icon.chat, l: lang === "en" ? "Help" : "Aide", act: () => setHelpModal(true) },
            { ic: Icon.user, l: lang === "en" ? "Profile" : "Profil", act: () => setProfileModal(true) },
          ].map((a, i) => (
            <button key={i} onClick={a.act} style={{ flex: 1, background: "none", border: "none", padding: "10px 2px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: "'Inter',sans-serif" }}>
              {a.ic(a.on ? T.accent : T.textLo, 19)}
              <span style={{ fontSize: 9, fontWeight: 700, color: a.on ? T.accent : T.textLo }}>{a.l}</span>
            </button>
          ))}
        </div>
      )}
      {/* FAQ / Aide */}
      {helpModal && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setHelpModal(false)}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "22px 20px 30px", maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto", fontFamily: "'Inter',sans-serif" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: T.textHi }}>❓ {lang === "en" ? "Frequently asked questions" : "Questions fréquentes"}</div>
              <button onClick={() => setHelpModal(false)} style={{ background: "rgba(0,0,0,.05)", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 14, color: T.textMid, fontFamily: "'Inter',sans-serif" }}>✕</button>
            </div>
            {FAQ.map((f, i) => (
              <details key={i} style={{ marginBottom: 8, background: "rgba(0,0,0,.02)", borderRadius: 12, padding: "12px 14px" }}>
                <summary style={{ fontWeight: 700, fontSize: 13, color: T.textHi, cursor: "pointer", listStyle: "none" }}>{f.q}</summary>
                <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.6, marginTop: 8 }}>{f.a}</div>
              </details>
            ))}
            <div style={{ marginTop: 14, fontSize: 11, color: T.textLo, textAlign: "center" }}>
              {lang === "en" ? "Still need help?" : "Besoin d'aide supplémentaire ?"} <b>support@lockr.fr</b>
            </div>
          </div>
        </div>,
        document.body
      )}
      {devisModal && selArt && selProb && pendingBookData && (
        <DevisModal artisan={selArt} probleme={selProb.id} montant={pendingBookData.montant} onAccept={confirmBookAfterDevis} onCancel={() => { setDevisModal(false); setPendingBookData(null); }} lang={lang} />
      )}
      {acompteModal && pendingBookData && (
        <PayModal amount={pendingBookData.montant * 0.5} onClose={() => { setAcompteModal(false); setPendingBookData(null); }} onDone={confirmBookAfterAcompte} lang={lang} />
      )}
      {profileModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 20 }}>{tr.myProfile}</div>
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.firstname + " / " + tr.lastname}</label>
              <input className="lk-input" value={editNom} onChange={e => setEditNom(e.target.value)} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="lk-label">{tr.city}</label>
              <input className="lk-input" value={editVille} onChange={e => setEditVille(e.target.value)} placeholder="Paris" />
            </div>
            <div style={{ background: "rgba(0,0,0,.03)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
              <div style={{ color: T.textLo, fontSize: 12, marginBottom: 4 }}>{tr.email}</div>
              <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{account.email}</div>
            </div>
            <button onClick={() => setProfileModal(false)} className="lk-btn" style={{ marginBottom: 10 }}>{tr.saveChanges}</button>
            {/* RGPD rights */}
            <div style={{ borderTop: "1px solid rgba(0,0,0,.07)", paddingTop: 16, marginTop: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 8 }}>🛡️ {tr.rgpdTitle}</div>
              {[tr.rgpdAccess, tr.rgpdRectif, tr.rgpdErase, tr.rgpdPorta].map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: T.textMid, marginBottom: 4, paddingLeft: 8, borderLeft: `2px solid rgba(37,99,235,.25)` }}>{r}</div>
              ))}
              <div style={{ fontSize: 10, color: T.textLo, marginTop: 8 }}>{tr.rgpdContact}</div>
              <button onClick={() => alert(tr.rgpdRequestSent)} className="lk-ghost" style={{ marginTop: 10, fontSize: 11, width: "100%" }}>{tr.rgpdRequest}</button>
            </div>
            <button onClick={() => setProfileModal(false)} className="lk-ghost" style={{ width: "100%", marginTop: 8 }}>{tr.cancel}</button>
          </div>
        </div>
      )}
      {litigeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            {!litigeSubmitted ? (
              <>
                <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 4 }}>{tr.openLitige}</div>
                <div style={{ color: T.textLo, fontSize: 13, marginBottom: 16 }}>{pLabel(PROBLEMES.find(p => p.id === litigeModal.probleme), lang)} · {litigeModal.clientNom}</div>
                <label className="lk-label">{tr.litigeTitle}</label>
                <textarea className="lk-input" value={litigeText} onChange={e => setLitigeText(e.target.value)} placeholder={tr.litigePlaceholder} rows={4} style={{ resize: "none", marginBottom: 16 }} />
                <button onClick={() => { setLitiges(p => [...p, { id: uid(), bookingId: litigeModal.id, text: litigeText, createdAt: ts() }]); setLitigeSubmitted(true); setTimeout(() => { setLitigeModal(null); setLitigeSubmitted(false); }, 2500); }} disabled={!litigeText.trim()} className="lk-btn" style={{ marginBottom: 10 }}>{tr.litigeSubmit}</button>
                <button onClick={() => setLitigeModal(null)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 10px" }}>
                <div style={{ width: 72, height: 72, background: "rgba(62,207,142,.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>{Icon.check(T.success, 30)}</div>
                <div style={{ color: T.success, fontWeight: 700, fontSize: 15, lineHeight: 1.5 }}>{tr.litigeSubmitted}</div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Feature 12: Cancel slow artisan modal */}
      {cancelSlowModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ color: T.textHi, fontWeight: 800, fontSize: 17, marginBottom: 8 }}>L'artisan tarde ?</div>
            {altArtisans.length === 0 ? (
              <>
                <div style={{ color: T.textMid, fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>Annuler et chercher un autre artisan ?</div>
                <button onClick={() => {
                  const curArtId = cancelSlowModal.artisanId;
                  const arts = DEMO_ARTISANS.filter(a => a.dispo && a.id !== curArtId);
                  setBookings(p => p.map(x => x.id === cancelSlowModal.id ? { ...x, statut: "annulée_client" } : x));
                  setAltArtisans(arts.slice(0, 3));
                }} className="lk-btn" style={{ marginBottom: 10 }}>Oui, trouver un autre artisan</button>
                <button onClick={() => setCancelSlowModal(null)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
              </>
            ) : (
              <>
                <div style={{ color: T.success, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Artisans disponibles :</div>
                {altArtisans.map(a => (
                  <div key={a.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{a.nom}</div>
                      <div style={{ color: T.textLo, fontSize: 11 }}>{a.certif} · {a.distance} km</div>
                    </div>
                    <button onClick={() => {
                      const nb = { id: uid(), clientId: cancelSlowModal.clientId, artisanId: a.id, clientNom: cancelSlowModal.clientNom, adresse: cancelSlowModal.adresse, probleme: cancelSlowModal.probleme, montant: cancelSlowModal.montant, statut: "assignée", createdAt: ts(), bonType: "platform" };
                      setBookings(p => [...p, nb]);
                      setAltArtisans([]);
                      setCancelSlowModal(null);
                    }} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "8px 14px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Réserver</button>
                  </div>
                ))}
                <button onClick={() => { setAltArtisans([]); setCancelSlowModal(null); }} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (screen === "home") return (
    <div className={darkMode ? "lk-dark" : ""} style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", paddingBottom: isDesktop ? 0 : 66 }}>
      <style>{CSS}</style>
      <div style={{ background: "rgba(255,255,255,.95)", backdropFilter: "blur(20px)", padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LockrWordmark height={18} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* GPS tracking active silently — badge removed */}
          <button onClick={() => setDarkMode(d => !d)} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 9px", fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{darkMode ? "☀️" : "🌙"}</button>
          {setLang && <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: T.textMid, fontFamily: "'Inter',sans-serif" }}>{tr.lang}</button>}
          <button onClick={() => setProfileModal(true)} style={{ background: "none", border: "1px solid rgba(201,160,48,.2)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", display: "flex", alignItems: "center", color: T.accent, fontFamily: "'Inter',sans-serif" }}>{Icon.user(T.accent, 15)}</button>
          <button onClick={onLogout} className="lk-ghost" style={{ padding: "6px 11px", fontSize: 12 }}>{Icon.sign()}</button>
        </div>
      </div>
      {liveBk && (
        <div onClick={() => setScreen("tracking")} style={{ margin: isDesktop ? "20px auto 0" : "14px 14px 0", maxWidth: isDesktop ? 1100 : undefined, background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, animation: "blink 1.2s infinite" }} />
            <div>
              <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{tr.artisanOnRoute}</div>
              <div style={{ color: T.textMid, fontSize: 12 }}>{artOf(liveBk)?.nom} · {tr.followLive}</div>
            </div>
          </div>
          {Icon.arrow(T.accent, 14)}
        </div>
      )}
      <div style={{ padding: isDesktop ? "32px" : "18px 14px", maxWidth: isDesktop ? 1100 : undefined, margin: isDesktop ? "0 auto" : undefined, width: "100%" }}>
        <div style={{ display: isDesktop ? "grid" : "block", gridTemplateColumns: "1fr 380px", gap: 28 }}>
          {/* Colonne principale */}
          <div>
            {/* URGENCE — accès immédiat sans étapes */}
            <button onClick={() => { setSelMetier("serrurier"); setSelProb(PROBLEMES.find(p => p.id === "ouverture") || null); setScreen("choose"); if (navigator.vibrate) navigator.vibrate(50); }}
              style={{ width: "100%", background: "linear-gradient(135deg,#dc2626,#991b1b)", border: "none", borderRadius: 18, padding: "18px 20px", marginBottom: 14, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 6px 20px rgba(220,38,38,.3)" }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 17, letterSpacing: "-.3px" }}>🚨 {lang === "en" ? "Emergency — immediate help" : "Urgence — Dépannage immédiat"}</div>
                <div style={{ color: "rgba(255,255,255,.85)", fontSize: 11.5, marginTop: 3 }}>{lang === "en" ? "Locked out? The closest craftsmen, right now." : "Porte claquée ? Les artisans les plus proches, tout de suite."}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,.2)", borderRadius: 12, padding: "10px 12px", flexShrink: 0 }}>{Icon.arrow("#fff", 18)}</div>
            </button>

            <div style={{ background: "linear-gradient(135deg,rgba(201,160,48,.08),rgba(168,120,32,.05))", border: "1.5px solid rgba(201,160,48,.2)", borderRadius: 20, padding: "22px 20px", marginBottom: 14 }}>
              <div style={{ color: T.textMid, fontSize: 12, marginBottom: 8 }}>{tr.helloUser} {account.nom.split(" ")[0]} 👋</div>
              <div style={{ color: T.textHi, fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>{tr.whatNeed}</div>
              <button onClick={() => setScreen("choose")} className="lk-btn" style={{ display: "flex", alignItems: "center", gap: 8 }}>{tr.findCraftsman} {Icon.arrow("#fff", 14)}</button>
            </div>

            {/* PRIX TRANSPARENT — le vrai engagement, pas une fausse fourchette */}
            <div style={{ background: "#fff", border: `1.5px solid rgba(30,158,107,.25)`, borderRadius: 18, padding: "16px 18px", marginBottom: 22 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>{Icon.shield(T.success, 16)} {lang === "en" ? "Transparent pricing — how it works" : "Prix transparent — comment ça marche"}</div>
              {[
                lang === "en" ? "The displayed price is the guaranteed minimum starting price." : "Le prix affiché est le tarif minimum de départ, garanti.",
                lang === "en" ? "On site, the craftsman diagnoses and gives you a FIRM quote BEFORE any work." : "Sur place, l'artisan diagnostique et vous remet un devis FERME AVANT tout travaux.",
                lang === "en" ? "Nothing starts without your agreement. Once accepted, the price is locked — no surprises." : "Rien ne démarre sans votre accord. Une fois accepté, le prix est bloqué — zéro surprise.",
              ].map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: i < 2 ? 8 : 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(30,158,107,.1)", color: T.success, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                  <span style={{ fontSize: 12, color: T.textMid, lineHeight: 1.55 }}>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.quickInterventions}</div>
              <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(4,1fr)" : "1fr 1fr", gap: 12 }}>
                {METIERS.map(m => (
                  <button key={m.id} onClick={() => { setSelMetier(m.id); setSelProb(null); setScreen("choose"); }} style={{ position: "relative", borderRadius: 18, overflow: "hidden", height: isDesktop ? 160 : 130, cursor: "pointer", border: "none", fontFamily: "'Inter',sans-serif", transition: "transform .18s, box-shadow .18s", boxShadow: "0 4px 18px rgba(0,0,0,.18)" }}
                    onMouseEnter={e => { e.currentTarget.style.transform="scale(1.03)"; e.currentTarget.style.boxShadow="0 8px 28px rgba(0,0,0,.28)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform="scale(1)";    e.currentTarget.style.boxShadow="0 4px 18px rgba(0,0,0,.18)"; }}>
                    {/* Image de fond */}
                    <img src={m.photo} alt={m.label} onError={e => { e.target.style.display="none"; }}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    {/* Overlay dégradé */}
                    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${m.color}cc 0%, ${m.color}99 100%)`, mixBlendMode: "multiply" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 30%,rgba(0,0,0,.55) 100%)" }} />
                    {/* Contenu */}
                    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "14px 14px 12px" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,.2)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {m.icon("#fff", 18)}
                      </div>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: "-.3px" }}>{pLabel(m, lang)}</div>
                        <div style={{ color: "rgba(255,255,255,.75)", fontSize: 11, marginTop: 3 }}>{pDesc(m, lang)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {/* Mes interventions — mobile only dans la colonne principale */}
            {!isDesktop && myBk.length > 0 && (
              <>
                <div id="lk-inter" style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.myInterventions}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {myBk.slice(-3).reverse().map(b => {
                    const a = artOf(b), pr = PROBLEMES.find(p => p.id === b.probleme), st = stMap[b.statut] || { l: b.statut, c: T.textLo };
                    const hasLitige = litiges.find(l => l.bookingId === b.id);
                    return (
                      <div key={b.id} style={{ background: "#fff", border: "1.5px solid rgba(201,160,48,.15)", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 10px rgba(201,160,48,.08)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: (b.statut === "assignée" || (b.statut === "terminée" && !hasLitige)) ? 8 : 0 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(201,160,48,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.tool(T.accent, 14)}</div>
                            <div>
                              <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pLabel(pr, lang)}</div>
                              <div style={{ color: T.textLo, fontSize: 11 }}>{a?.nom} · {fmtDate(b.createdAt)}</div>
                            </div>
                          </div>
                          <span style={{ color: st.c, fontSize: 12, fontWeight: 600 }}>{st.l}</span>
                        </div>
                        {b.statut === "assignée" && (
                          <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                            <button onClick={() => setCancelSlowModal(b)} style={{ width: "100%", background: "rgba(245,166,35,.06)", border: "1px solid rgba(245,166,35,.2)", borderRadius: 8, padding: "7px", color: T.warn, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>L'artisan tarde ?</button>
                            <button onClick={() => setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "annulée" } : x))} style={{ width: "100%", background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 8, padding: "7px", color: T.danger, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.cancelBooking}</button>
                          </div>
                        )}
                        {b.statut === "terminée" && !hasLitige && (
                          <button onClick={() => { setLitigeModal(b); setLitigeText(""); setLitigeSubmitted(false); }} style={{ width: "100%", background: "rgba(217,119,6,.06)", border: "1px solid rgba(217,119,6,.15)", borderRadius: 8, padding: "7px", color: T.warn, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.openLitige}</button>
                        )}
                        {b.statut === "terminée" && hasLitige && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>{Icon.check(T.success, 12)}<span style={{ color: T.success, fontSize: 11, fontWeight: 600 }}>Litige ouvert</span></div>
                        )}
                        {b.statut === "terminée" && (
                          <button onClick={() => rebook(b)} style={{ width: "100%", background: "rgba(201,160,48,.07)", border: "1px solid rgba(201,160,48,.25)", borderRadius: 8, padding: "7px", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 6, fontFamily: "'Inter',sans-serif" }}>↻ {lang === "en" ? "Book this craftsman again" : "Recommander cet artisan"}</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {/* Colonne droite desktop = mes interventions */}
          {isDesktop && (
            <div>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{tr.myInterventions}</div>
              {myBk.length === 0 && <div style={{ color: T.textLo, fontSize: 13, textAlign: "center", padding: "32px 0" }}>{tr.noIntervention}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {myBk.slice().reverse().map(b => {
                  const a = artOf(b), pr = PROBLEMES.find(p => p.id === b.probleme), st = stMap[b.statut] || { l: b.statut, c: T.textLo };
                  const hasLitige = litiges.find(l => l.bookingId === b.id);
                  return (
                    <div key={b.id} style={{ background: "#fff", border: "1.5px solid rgba(201,160,48,.15)", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 10px rgba(201,160,48,.08)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: (b.statut === "assignée" || (b.statut === "terminée" && !hasLitige)) ? 8 : 0 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(201,160,48,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.tool(T.accent, 14)}</div>
                          <div>
                            <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pLabel(pr, lang)}</div>
                            <div style={{ color: T.textLo, fontSize: 11 }}>{a?.nom} · {fmtDate(b.createdAt)}</div>
                          </div>
                        </div>
                        <span style={{ color: st.c, fontSize: 12, fontWeight: 600 }}>{st.l}</span>
                      </div>
                      {b.statut === "assignée" && (
                        <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                          <button onClick={() => setCancelSlowModal(b)} style={{ width: "100%", background: "rgba(245,166,35,.06)", border: "1px solid rgba(245,166,35,.2)", borderRadius: 8, padding: "7px", color: T.warn, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>L'artisan tarde ?</button>
                          <button onClick={() => setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "annulée" } : x))} style={{ width: "100%", background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 8, padding: "7px", color: T.danger, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.cancelBooking}</button>
                        </div>
                      )}
                      {b.statut === "terminée" && !hasLitige && (
                        <button onClick={() => { setLitigeModal(b); setLitigeText(""); setLitigeSubmitted(false); }} style={{ width: "100%", background: "rgba(217,119,6,.06)", border: "1px solid rgba(217,119,6,.15)", borderRadius: 8, padding: "7px", color: T.warn, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.openLitige}</button>
                      )}
                      {b.statut === "terminée" && hasLitige && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{Icon.check(T.success, 12)}<span style={{ color: T.success, fontSize: 11, fontWeight: 600 }}>{tr.litigeSubmitted.split("—")[0].trim()}</span></div>
                      )}
                      {b.statut === "terminée" && (
                        <button onClick={() => rebook(b)} style={{ width: "100%", background: "rgba(201,160,48,.07)", border: "1px solid rgba(201,160,48,.25)", borderRadius: 8, padding: "7px", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 6, fontFamily: "'Inter',sans-serif" }}>↻ {lang === "en" ? "Book this craftsman again" : "Recommander cet artisan"}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {_modals}
    </div>
  );

  if (screen === "choose") return (
    <div className={darkMode ? "lk-dark" : ""} style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", paddingBottom: 90 }}>
      <style>{CSS}</style>
      <div style={{ background: "rgba(255,255,255,.95)", backdropFilter: "blur(20px)", padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => { setSelProb(null); setSelMetier(null); setScreen("home"); }} className="lk-ghost" style={{ padding: "8px 11px" }}>{Icon.back()}</button>
        <span style={{ color: T.textHi, fontWeight: 700 }}>{tr.newRequest}</span>
      </div>
      {/* Barre de progression du parcours — le client sait toujours où il en est */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        {[
          { n: 1, l: lang === "en" ? "Problem" : "Problème", done: !!selProb },
          { n: 2, l: lang === "en" ? "Craftsman" : "Artisan", done: !!selArt },
          { n: 3, l: lang === "en" ? "Confirmation" : "Confirmation", done: false },
        ].map((st, i) => {
          const current = (i === 0 && !selProb) || (i === 1 && selProb && !selArt) || (i === 2 && selProb && selArt);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: st.done ? T.success : current ? T.grad : "rgba(0,0,0,.08)", color: st.done || current ? "#fff" : T.textLo, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{st.done ? "✓" : st.n}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: st.done ? T.success : current ? T.textHi : T.textLo }}>{st.l}</span>
              </div>
              {i < 2 && <div style={{ width: 22, height: 2, background: st.done ? T.success : "rgba(0,0,0,.08)", borderRadius: 1, margin: "0 3px" }} />}
            </div>
          );
        })}
      </div>
      {/* Engagement prix */}
      <div style={{ background: "rgba(30,158,107,.06)", padding: "8px 16px", textAlign: "center", fontSize: 11, color: T.success, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>
        ✓ {lang === "en" ? "Firm quote before any work — nothing without your agreement" : "Devis ferme avant tout travaux — rien sans votre accord"}
      </div>
      <div style={{ padding: isDesktop ? "28px 32px" : "18px 14px", maxWidth: isDesktop ? 1100 : undefined, margin: isDesktop ? "0 auto" : undefined }}>
        {/* Sélection du métier */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.selectMetier}</div>
          <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(4,1fr)" : "repeat(2,1fr)", gap: 10 }}>
            {METIERS.map(m => (
              <button key={m.id} onClick={() => { setSelMetier(m.id === selMetier ? null : m.id); setSelProb(null); }}
                style={{ position: "relative", borderRadius: 16, overflow: "hidden", height: 90, cursor: "pointer", border: `2.5px solid ${selMetier === m.id ? m.color : "transparent"}`, fontFamily: "'Inter',sans-serif", transition: "all .15s", boxShadow: selMetier === m.id ? `0 4px 16px ${m.color}50` : "0 2px 8px rgba(0,0,0,.12)" }}>
                <img src={m.photo} alt={m.label} onError={e => { e.target.style.display="none"; }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: selMetier === m.id ? `${m.color}bb` : "rgba(10,10,10,.55)" }} />
                <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {m.icon("#fff", 22)}
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{pLabel(m, lang)}</div>
                  {selMetier === m.id && <div style={{ position: "absolute", top: 6, right: 6 }}>{Icon.check("#fff", 14)}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
        {/* Bannière hero du métier sélectionné */}
        {selMetier && (() => { const m = METIERS.find(x => x.id === selMetier); return m ? (
          <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", height: isDesktop ? 140 : 110, marginBottom: 20, animation: "fadeUp .3s ease" }}>
            <img src={m.photo} alt={m.label} onError={e => { e.target.style.display="none"; }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%" }} />
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${m.color}ee 0%, ${m.color}99 50%, transparent 100%)` }} />
            <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", gap: 16, padding: "0 24px" }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(255,255,255,.2)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {m.icon("#fff", 26)}
              </div>
              <div>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: isDesktop ? 22 : 18, letterSpacing: "-.5px" }}>{pLabel(m, lang)}</div>
                <div style={{ color: "rgba(255,255,255,.8)", fontSize: 13, marginTop: 3 }}>{pDesc(m, lang)}</div>
              </div>
            </div>
          </div>
        ) : null; })()}

        <div style={{ display: isDesktop ? "grid" : "block", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          {/* Colonne gauche : sélection du problème */}
          <div>
            {selMetier && <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.interventionType}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
              {PROBLEMES.filter(p => !selMetier || p.metier === selMetier).map(p => {
                const IC = PROB_ICONS[p.id];
                const metierColor = METIERS.find(m => m.id === p.metier)?.color || T.accent;
                const metierPhoto = METIERS.find(m => m.id === p.metier)?.photo;
                const isSelected = selProb?.id === p.id;
                return (
                <button key={p.id} onClick={() => setSelProb(p)} style={{ background: isSelected ? "linear-gradient(135deg,#f5f3ff,#fdf6dc)" : "#ffffff", border: `1.5px solid ${isSelected ? metierColor : "rgba(0,0,0,.1)"}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left", fontFamily: "'Inter',sans-serif", boxShadow: isSelected ? `0 4px 16px ${metierColor}30` : "0 1px 6px rgba(0,0,0,.07)", transition: "all .15s" }}>
                  {/* Miniature photo du métier */}
                  <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", position: "relative", flexShrink: 0, background: `${metierColor}15` }}>
                    {metierPhoto && <img src={metierPhoto} alt="" onError={e => { e.target.style.display="none"; }}
                      style={{ width: "100%", height: "100%", objectFit: "cover", opacity: .7 }} />}
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {IC ? IC(isSelected ? metierColor : "#fff", 18) : null}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.textHi, fontWeight: 600, fontSize: 14 }}>{pLabel(p, lang)}</div>
                    <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{pDesc(p, lang)}</div>
                  </div>
                  {p.urgence && <span className="lk-tag-urgent">URGENT</span>}
                  {isSelected && Icon.check(metierColor, 16)}
                </button>
              ); })}
            </div>
          </div>
          {/* Colonne droite : liste artisans */}
          <div ref={artisanListRef}>
            {selProb && (
              <div style={{ animation: "fadeUp .25s ease" }}>
                <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                  {tr.availableCraftsmen}
                  {artisanList.length === 0 && <span style={{ color: T.textLo, fontWeight: 400, fontSize: 12, marginLeft: 8 }}>{tr.noAvailable}</span>}
                </div>
                {/* Aucun artisan dispo immédiatement : publier la demande pour tous (pros indépendants + partenaires) */}
                {artisanList.filter(a => a.dispo).length === 0 && (
                  <div style={{ background: "rgba(217,119,6,.06)", border: "1px solid rgba(217,119,6,.2)", borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
                    {demandePubliee ? (
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {Icon.check(T.success, 20)}
                        <div>
                          <div style={{ color: T.success, fontWeight: 700, fontSize: 13 }}>{lang === "en" ? "Request published!" : "Demande publiée !"}</div>
                          <div style={{ color: T.textMid, fontSize: 12, marginTop: 2 }}>{lang === "en" ? "All available craftsmen and partner companies nearby have been notified. You'll be contacted as soon as one accepts." : "Tous les artisans et entreprises partenaires proches ont été notifiés. Vous serez contacté dès qu'un professionnel accepte."}</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ color: T.warn, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>⏳ {lang === "en" ? "No craftsman available right now" : "Aucun artisan disponible pour l'instant"}</div>
                        <div style={{ color: T.textMid, fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>{lang === "en" ? "Publish your request: it will be sent to every independent craftsman and every partner company in your area — you'll be contacted as soon as one is free." : "Publiez votre demande : elle sera envoyée à tous les artisans indépendants et à toutes les entreprises partenaires de votre secteur — vous serez contacté dès qu'un professionnel se libère."}</div>
                        <button onClick={publierDemande} className="lk-btn" style={{ width: "100%" }}>{lang === "en" ? "Publish my request" : "Publier ma demande"} {Icon.arrow("#fff", 14)}</button>
                      </>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {artisanList.map(a => (
                    <div key={a.id} onClick={() => a.dispo && setSelArt(a)} style={{ background: selArt?.id === a.id ? "linear-gradient(135deg,#f5f3ff,#fdf6dc)" : "#ffffff", border: `1.5px solid ${selArt?.id === a.id ? T.accent : "rgba(201,160,48,.18)"}`, borderRadius: 16, padding: "14px 16px", cursor: a.dispo ? "pointer" : "not-allowed", opacity: a.dispo ? 1 : .5, transition: "all .15s", boxShadow: selArt?.id === a.id ? "0 4px 16px rgba(201,160,48,.2)" : "0 2px 8px rgba(201,160,48,.07)" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ width: 46, height: 46, borderRadius: 12, background: `${a.color}15`, border: `1px solid ${a.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ color: a.color, fontWeight: 800, fontSize: 18 }}>{a.nom.charAt(0)}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <div>
                              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{a.nom}</div>
                              <div style={{ color: T.textLo, fontSize: 12 }}>{a.certif}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ color: T.accent, fontWeight: 800, fontSize: 14 }}>{fmtFrom(a.tarif + (selProb.urgence ? 40 : 0), lang)}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                            {a.isReal && <span style={{ background: "rgba(62,207,142,.1)", border: "1px solid rgba(62,207,142,.2)", color: T.success, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>✓ {tr.verified}</span>}
                            <span className={a.dispo ? "lk-badge-ok" : "lk-badge-off"}>{a.dispo ? tr.available : tr.unavailable}</span>
                          </div>
                          {a.ville && <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, color: T.textLo, fontSize: 12 }}>{Icon.pin(T.textLo, 12)} {a.ville}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {selArt && selProb && isDesktop && (
                  <div style={{ marginTop: 20 }}>
                    <button onClick={() => book()} className="lk-btn">
                      {tr.reserveBtn} {selArt.nom} — {fmtFrom(selArt.tarif + (selProb.urgence ? 40 : 0), lang)} {Icon.arrow("#fff", 14)}
                    </button>
                  </div>
                )}
              </div>
            )}
            {!selProb && isDesktop && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: T.textLo, fontSize: 14, gap: 12 }}>
                {Icon.key(T.textLo, 36)}
                <span>{tr.selectInterventionType}</span>
              </div>
            )}
          </div>
        </div>
        {selArt && selProb && !isDesktop && (
          <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, padding: "16px 14px", background: "linear-gradient(0deg,rgba(8,11,20,.98),transparent)", paddingTop: 24 }}>
            <button onClick={book} className="lk-btn">
              {tr.reserveBtn} {selArt.nom} — {fmt(selArt.tarif + (selProb.urgence ? 40 : 0))} {Icon.arrow("#fff", 14)}
            </button>
          </div>
        )}
      </div>
      {_modals}
    </div>
  );

  if (screen === "tracking") return (
    <div className={darkMode ? "lk-dark" : ""} style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {bookSuccess && (
        <div style={{ background: "linear-gradient(135deg,#1e9e6b,#15794f)", color: "#fff", padding: "12px 16px", fontFamily: "'Inter',sans-serif" }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }}>✓ {lang === "en" ? "Booking confirmed — deposit paid" : "Réservation confirmée — acompte payé"}</div>
          <div style={{ fontSize: 11.5, opacity: .9, marginTop: 2 }}>{lang === "en" ? "Your craftsman is on his way. Firm quote on site before any work." : "Votre artisan est en route. Devis ferme sur place avant tout travaux."}</div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "rgba(255,255,255,.95)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => setScreen("home")} className="lk-ghost" style={{ padding: "8px 11px" }}>{Icon.back()}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo height={18} />
          <span style={{ fontSize: 16, fontWeight: 800, color: T.textHi }}>{tr.liveTracking}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", background: "rgba(240,101,101,.08)", border: "1px solid rgba(240,101,101,.2)", borderRadius: 20, padding: "5px 10px" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.danger, animation: "blink 1.2s infinite" }} />
          <span style={{ color: T.danger, fontSize: 11, fontWeight: 600 }}>LIVE</span>
        </div>
      </div>
      {isDesktop ? (
        /* Desktop: 2 colonnes */
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "55% 45%", overflow: "hidden" }}>
          {/* Gauche: carte GPS */}
          <div style={{ overflow: "hidden", borderRight: `1px solid ${T.border}` }}>
            {geoLoading && !bk?.clientPos ? (
              <div style={{ height: "100%", background: "#e8e8e4", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <div style={{ width: 38, height: 38, border: "2.5px solid rgba(0,0,0,.06)", borderTop: `2.5px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                <div style={{ color: T.textLo, fontSize: 13 }}>{tr.locating}</div>
              </div>
            ) : (
              <div style={{ height: "100%" }}>
                <LiveMap
                  progress={progress}
                  artisanColor={art?.color || T.accent}
                  clientPos={bk?.clientPos}
                  artisanPos={artisanGpsPos || bk?.artisanPos}
                  onRouteReady={setRouteInfo}
                  artisan={art}
                />
              </div>
            )}
          </div>
          {/* Droite: infos artisan + progression + boutons */}
          <div style={{ background: T.bg, padding: "24px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: phase === "arrived" ? "rgba(62,207,142,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${phase === "arrived" ? "rgba(62,207,142,.2)" : T.border}`, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: phase === "arrived" ? "rgba(62,207,142,.12)" : "rgba(0,0,0,.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {phase === "arrived" ? Icon.check(T.success, 20) : Icon.phone(T.textMid, 20)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: phase === "arrived" ? T.success : T.textHi, fontWeight: 700, fontSize: 14 }}>
                  {phase === "arrived" ? tr.arrived : `${tr.onRoute} · ${routeInfo ? Math.max(0, Math.round((1 - progress) * routeInfo.durationSec / 60)) : Math.max(0, Math.round((1 - progress) * 12))} ${tr.min}`}
                </div>
                <div style={{ color: T.textLo, fontSize: 12 }}>{phase === "arrived" ? tr.openDoor : tr.artisanArriving}</div>
              </div>
            </div>
            <div>
              <div style={{ background: "rgba(0,0,0,.04)", borderRadius: 4, height: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, background: phase === "arrived" ? T.success : `linear-gradient(90deg,${T.accent},${T.accent2})`, width: `${progress * 100}%`, transition: "width .3s" }} />
              </div>
            </div>
            {art && (
              <div className="lk-card" style={{ padding: "13px 14px", display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: `${art.color}15`, border: `1px solid ${art.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: art.color, fontWeight: 800, fontSize: 20 }}>{art.nom.charAt(0)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{art.nom}</div>
                  <div style={{ color: T.textLo, fontSize: 12 }}>{art.certif}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setPlatformCall({ name: art.nom })} style={{ background: "rgba(62,207,142,.08)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{Icon.phone(T.success, 15)}</button>
                  <button onClick={() => setShowChat(true)} style={{ flex: 1, background: "rgba(201,160,48,.08)", border: "1px solid rgba(201,160,48,.25)", borderRadius: 12, padding: "12px", color: T.gold, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
                    {Icon.chat(T.gold, 15)} Chat
                  </button>
                </div>
              </div>
            )}
            {phase === "arrived" && bk?.montantFinal && (
              <button onClick={() => setPayModal(true)} className="lk-btn">
                {Icon.card("#fff", 16)} {tr.payInvoiceBtn} — {fmt(bk.montantFinal)}
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Mobile: layout vertical */
        <>
          <div style={{ overflow: "hidden", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
            {geoLoading && !bk?.clientPos ? (
              <div style={{ height: 300, background: "#e8e8e4", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <div style={{ width: 38, height: 38, border: "2.5px solid rgba(0,0,0,.06)", borderTop: `2.5px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                <div style={{ color: T.textLo, fontSize: 13 }}>{tr.locating}</div>
              </div>
            ) : (
              <LiveMap
                progress={progress}
                artisanColor={art?.color || T.accent}
                clientPos={bk?.clientPos}
                artisanPos={artisanGpsPos || bk?.artisanPos}
                onRouteReady={setRouteInfo}
                artisan={art}
              />
            )}
          </div>
          <div style={{ flex: 1, background: T.bg, padding: "16px 14px", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: phase === "arrived" ? "rgba(62,207,142,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${phase === "arrived" ? "rgba(62,207,142,.2)" : T.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: phase === "arrived" ? "rgba(62,207,142,.12)" : "rgba(0,0,0,.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {phase === "arrived" ? Icon.check(T.success, 20) : Icon.phone(T.textMid, 20)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: phase === "arrived" ? T.success : T.textHi, fontWeight: 700, fontSize: 14 }}>
                  {phase === "arrived" ? tr.arrived : `${tr.onRoute} · ${routeInfo ? Math.max(0, Math.round((1 - progress) * routeInfo.durationSec / 60)) : Math.max(0, Math.round((1 - progress) * 12))} ${tr.min}`}
                </div>
                <div style={{ color: T.textLo, fontSize: 12 }}>{phase === "arrived" ? tr.openDoor : tr.artisanArriving}</div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ background: "rgba(0,0,0,.04)", borderRadius: 4, height: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, background: phase === "arrived" ? T.success : `linear-gradient(90deg,${T.accent},${T.accent2})`, width: `${progress * 100}%`, transition: "width .3s" }} />
              </div>
            </div>
            {art && (
              <div className="lk-card" style={{ padding: "13px 14px", marginBottom: 14, display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: `${art.color}15`, border: `1px solid ${art.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: art.color, fontWeight: 800, fontSize: 20 }}>{art.nom.charAt(0)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{art.nom}</div>
                  <div style={{ color: T.textLo, fontSize: 12 }}>{art.certif}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setPlatformCall({ name: art.nom })} style={{ background: "rgba(62,207,142,.08)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{Icon.phone(T.success, 15)}</button>
                  <button onClick={() => setShowChat(true)} style={{ flex: 1, background: "rgba(201,160,48,.08)", border: "1px solid rgba(201,160,48,.25)", borderRadius: 12, padding: "12px", color: T.gold, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
                    {Icon.chat(T.gold, 15)} Chat
                  </button>
                </div>
              </div>
            )}
            {phase === "arrived" && bk?.montantFinal && (
              <button onClick={() => setPayModal(true)} className="lk-btn">
                {Icon.card("#fff", 16)} {tr.payInvoiceBtn} — {fmt(bk.montantFinal)}
              </button>
            )}
          </div>
        </>
      )}
      {payModal && <PayModal amount={bk?.montantFinal || bk?.montant} onClose={() => setPayModal(false)} onDone={() => { setPayModal(false); setScreen("home"); }} lang={lang} />}
      {showChat && bk && <ChatIntervention bookingId={bk.id} account={account} interventionChats={interventionChats} setInterventionChats={setInterventionChats} otherNom={art?.nom || "Artisan"} onClose={() => setShowChat(false)} lang={lang} />}
      {platformCall && <PlatformCallModal name={platformCall.name} onClose={() => setPlatformCall(null)} lang={lang} />}
      {_modals}
    </div>
  );

  return null;
}

/* ─── ADMIN APP ─── */
/* ─── PARTENAIRE SCREEN ─── */
function PartenaireScreen({ lang = "fr" }) {
  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg,#1c1c1c,#2d2d2d)", borderRadius: 16, padding: "32px 24px", marginBottom: 24, textAlign: "center" }}>
        <div style={{ width: 60, height: 60, background: "rgba(201,160,48,.2)", border: "2px solid rgba(201,160,48,.4)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          {Icon.shield(T.accent, 26)}
        </div>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: 22, marginBottom: 8 }}>Devenez Partenaire LOCKR</div>
        <div style={{ color: "rgba(255,255,255,.7)", fontSize: 14, lineHeight: 1.6 }}>Rejoignez le réseau d'artisans certifiés LOCKR et développez votre activité</div>
      </div>
      {/* Avantages */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: T.textHi, fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Ce que vous obtenez</div>
        {[
          { icon: "🎯", title: "Leads qualifiés", desc: "Recevez des demandes clients ciblées dans votre zone géographique" },
          { icon: "👁", title: "Visibilité maximale", desc: "Badge vérifié LOCKR visible par tous les clients" },
          { icon: "✅", title: "Badge vérifié", desc: "Certification officielle LOCKR après vérification de votre dossier" },
          { icon: "💰", title: "Gestion des paiements", desc: "Paiements sécurisés et reversements automatiques" },
          { icon: "🛡", title: "Couverture assurance", desc: "Assistance en cas de litige avec un client LOCKR" },
        ].map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 14, marginBottom: 12, padding: "12px 14px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 }}>
            <div style={{ fontSize: 22, flexShrink: 0 }}>{a.icon}</div>
            <div>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{a.title}</div>
              <div style={{ color: T.textMid, fontSize: 12, lineHeight: 1.5 }}>{a.desc}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Obligations légales */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: T.textHi, fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Obligations légales (droit français)</div>
        <div style={{ background: "rgba(220,38,38,.04)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 14, padding: "16px" }}>
          {[
            { l: "RC Pro obligatoire", d: "Attestation d'assurance Responsabilité Civile Professionnelle exigée" },
            { l: "Qualification professionnelle", d: "Qualibat, RGE, ou certification équivalente selon votre métier" },
            { l: "Contrat de partenariat", d: "Conforme au Code de commerce français — signé avant toute mission" },
            { l: "RGPD", d: "Traitement des données clients en conformité avec le règlement européen" },
            { l: "Facturation TVA", d: "Facturation conforme aux règles TVA françaises (taux normal 20%)" },
            { l: "Délai d'intervention", d: "Maximum 2h en urgence — contractuellement engageant" },
          ].map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < 5 ? 12 : 0, paddingBottom: i < 5 ? 12 : 0, borderBottom: i < 5 ? `1px solid rgba(220,38,38,.1)` : "none" }}>
              {Icon.warning(T.danger, 14)}
              <div>
                <div style={{ color: T.danger, fontWeight: 700, fontSize: 12 }}>{o.l}</div>
                <div style={{ color: T.textMid, fontSize: 11, lineHeight: 1.5 }}>{o.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Contrat résumé */}
      <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 14, padding: "16px", marginBottom: 24 }}>
        <div style={{ color: T.accent, fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Résumé du contrat de partenariat</div>
        {[
          "Commission LOCKR : 15% sur chaque intervention",
          "Reversement artisan : 40% du montant HT de la prestation",
          "Durée du contrat : 12 mois renouvelables par tacite reconduction",
          "Résiliation : préavis de 30 jours par lettre recommandée",
          "Exclusivité : non — vous restez libre de travailler hors LOCKR",
        ].map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
            {Icon.check(T.accent, 12)}
            <span style={{ color: T.textMid, fontSize: 12, lineHeight: 1.5 }}>{c}</span>
          </div>
        ))}
      </div>
      {/* CTA */}
      <button className="lk-btn" style={{ fontSize: 15, padding: "16px" }}>Devenir Partenaire LOCKR {Icon.arrow("#fff", 14)}</button>
    </div>
  );
}

function AdminApp({ account, bookings, setBookings, accounts, setAccounts, bons, setBons, listings = [], sales = [], onLogout, lang = "fr", setLang, bannedList = [], setBannedList, priorityOrder = [], setPriorityOrder = () => {} }) {
  const tr = TRANS[lang] || TRANS.fr;
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [tab, setTab] = useState("dashboard");
  const [postModal, setPostModal] = useState(false);
  const [newBon, setNewBon] = useState({ titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: 40, region: "Paris" });
  const [postSuccess, setPostSuccess] = useState(false);
  // Feature 7: ban
  const [banTarget, setBanTarget] = useState(null);
  const [banReason, setBanReason] = useState("");
  // Nouvelles fonctions
  const [searchPros, setSearchPros] = useState("");
  const [searchMissions, setSearchMissions] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const allDone = bookings.filter(b => b.statut === "terminée");
  const totalCA = allDone.reduce((s, b) => s + (b.montantFinal || 0), 0);
  const platformRevenu = allDone.reduce((s, b) => s + (b.montantFinal || 0) * 0.60, 0);
  const adminBons = bons.filter(b => b.postedBy === "platform");

  const posterBonAdmin = () => {
    const b = { id: uid(), titre: newBon.titre || "Intervention LOCKR", adresse: newBon.adresse, probleme: newBon.probleme, urgence: newBon.urgence, montantEstime: parseFloat(newBon.montantEstime) || 100, postedBy: "platform", postedByNom: "LOCKR", region: newBon.region, lat: 48.8566, lng: 2.3522, createdAt: ts(), techPct: newBon.techPct, dispatchTs: ts() };
    setBons(p => [...p, b]);
    setPostModal(false);
    setPostSuccess(true);
    setTimeout(() => setPostSuccess(false), 3000);
    setNewBon({ titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: 40, region: "Paris" });
  };

  const proAccounts = accounts.filter(a => a.role === "pro");
  const byMonth = (() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const m = d.getMonth(), y = d.getFullYear();
      const revenue = allDone.filter(b => { const bd = new Date(b.createdAt); return bd.getMonth() === m && bd.getFullYear() === y; }).reduce((s, b) => s + (b.montantFinal || 0) * 0.60, 0);
      return { label: ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"][m], value: revenue };
    });
  })();
  const maxVal = Math.max(...byMonth.map(d => d.value), 1);

  const adminTabs = [
    { id: "dashboard", l: tr.dashboard },
    { id: "bons", l: `${tr.adminBonuses} (${adminBons.length})` },
    { id: "pros", l: tr.craftsmen },
    { id: "missions", l: tr.allMissions },
    { id: "surveillance", l: `${tr.adminSurveillance}${bookings.filter(b => b.surveillance?.flagged).length ? ` ⚠️ (${bookings.filter(b => b.surveillance?.flagged).length})` : ""}` },
    { id: "bannissements", l: tr.bannissements },
    { id: "validations", l: `${tr.validations} (${accounts.filter(a => a.role === "pro" && a.dossierStatus === "pending").length})` },
    { id: "clients", l: tr.allClients },
    { id: "marketplace", l: `${tr.adminMarketplace} (${sales.length})` },
    { id: "facturation", l: "Facturation" },
    { id: "comptabilite", l: "Comptabilité" },
    { id: "partenaires", l: "Partenaires" },
    { id: "priorites", l: `${lang === "en" ? "Priorities" : "Priorités"} (${priorityOrder.length})` },
    { id: "digital_conformite", l: tr.adminDigitalTab },
  ];
  // Feature 15: Facturation state
  const [devisItems, setDevisItems] = useState([]);
  const [newDevis, setNewDevis] = useState({ client: "", service: "", ht: "", type: "devis" });
  // Feature 15: Comptabilite
  const unpaidCommissions = bookings.filter(b => b.statut === "terminée" && b.statutPaiement !== "payé");
  const proPendingPay = accounts.filter(a => a.role === "pro").map(p => ({ ...p, owed: bookings.filter(b => b.artisanId === p.artisanId && b.statut === "terminée" && !b.proPaid).reduce((s, b) => s + (b.montantFinal || 0) * 0.40, 0) })).filter(p => p.owed > 0);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex" }}>
      <style>{CSS}</style>

      {/* SIDEBAR DESKTOP */}
      {isDesktop && (
        <div style={{ width: 200, flexShrink: 0, height: "100vh", position: "sticky", top: 0, background: "#fff", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, background: T.grad, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.admin("#fff", 14)}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: T.textHi }}>Admin</div>
                <div style={{ color: T.textLo, fontSize: 11 }}>LOCKR</div>
              </div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: "8px 10px" }}>
            {adminTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ width: "100%", border: "none", background: tab === t.id ? "rgba(28,28,28,.06)" : "transparent", borderRadius: 10, padding: "11px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 2, fontFamily: "'Inter',sans-serif", transition: "all .15s", textAlign: "left" }}>
                <span style={{ color: tab === t.id ? T.accent : T.textMid, fontWeight: tab === t.id ? 700 : 500, fontSize: 13 }}>{t.l}</span>
              </button>
            ))}
          </nav>
          <div style={{ padding: "12px 10px", borderTop: `1px solid ${T.border}` }}>
            <button onClick={onLogout} style={{ width: "100%", border: "none", background: "transparent", borderRadius: 10, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontFamily: "'Inter',sans-serif" }}>
              {Icon.sign(T.danger, 16)}
              <span style={{ color: T.danger, fontWeight: 600, fontSize: 13 }}>{tr.logout}</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header mobile */}
        {!isDesktop && (
          <div style={{ background: "rgba(255,255,255,.95)", backdropFilter: "blur(20px)", padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, background: T.grad, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.admin("#fff", 16)}</div>
              <div>
                <div style={{ color: T.textHi, fontWeight: 700, fontSize: 15 }}>Admin LOCKR</div>
                <div style={{ color: T.textLo, fontSize: 11 }}>{tr.dashboard}</div>
              </div>
            </div>
            <button onClick={onLogout} className="lk-ghost" style={{ padding: "6px 11px", fontSize: 12 }}>{Icon.sign()}</button>
          </div>
        )}
        {/* Desktop header */}
        {isDesktop && (
          <div style={{ background: "#fff", padding: "18px 32px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ color: T.textHi, fontWeight: 800, fontSize: 20 }}>{adminTabs.find(t => t.id === tab)?.l || tr.dashboard}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {setLang && <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: T.textMid, fontFamily: "'Inter',sans-serif" }}>{tr.lang}</button>}
              <div style={{ color: T.textMid, fontSize: 13 }}>Admin LOCKR</div>
            </div>
          </div>
        )}
        {/* Tabs mobile */}
        {!isDesktop && (
          <div style={{ display: "flex", background: T.bg, borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
            {adminTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: "0 0 auto", border: "none", background: "none", padding: "12px 14px", cursor: "pointer", color: tab === t.id ? T.accent : T.textLo, fontWeight: tab === t.id ? 700 : 400, fontSize: 12, borderBottom: `2px solid ${tab === t.id ? T.accent : "transparent"}`, fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>
                {t.l}
              </button>
            ))}
          </div>
        )}
        <div style={{ padding: "14px", overflowY: "auto", maxWidth: isDesktop ? 1000 : undefined, margin: isDesktop ? "0 auto" : undefined, width: "100%" }}>
        {tab === "dashboard" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[{ l: tr.revenue, v: fmt(totalCA), c: T.accent }, { l: tr.platformRevenue, v: fmt(platformRevenu), c: T.success }, { l: tr.totalMissions, v: allDone.length, c: T.accent2 }, { l: tr.prosRegistered, v: proAccounts.length, c: T.success }].map(s => (
                <div key={s.l} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px" }}>
                  <div style={{ color: T.textLo, fontSize: 11, marginBottom: 6 }}>{s.l}</div>
                  <div style={{ color: s.c, fontWeight: 800, fontSize: 18 }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{tr.platformRevenue6m}</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginBottom: 8 }}>
              {byMonth.map((d, i) => (
                <div key={i} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                  <div style={{ width: "100%", height: `${Math.max((d.value / maxVal) * 100, 4)}%`, background: i === byMonth.length - 1 ? "linear-gradient(180deg,#3ecf8e,#2aaf77)" : "linear-gradient(180deg,rgba(201,160,48,.6),rgba(201,160,48,.3))", borderRadius: "6px 6px 0 0" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {byMonth.map((d, i) => <div key={i} style={{ flex: 1, textAlign: "center", color: i === byMonth.length - 1 ? T.success : T.textLo, fontSize: 10 }}>{d.label}</div>)}
            </div>
          </>
        )}
        {tab === "bons" && (
          <>
            {postSuccess && <div style={{ background: "rgba(62,207,142,.12)", border: "1px solid rgba(62,207,142,.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 14, color: T.success, fontWeight: 600, fontSize: 13 }}>{tr.bonusPublished}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16 }}>{tr.lockrBonuses}</div>
              <button onClick={() => setPostModal(true)} style={{ background: T.grad, border: "none", borderRadius: 10, padding: "9px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{Icon.plus("#fff", 15)} {tr.newBonus}</button>
            </div>
            {adminBons.map(bon => {
              const IC = PROB_ICONS[bon.probleme] || Icon.tool;
              return (
                <div key={bon.id} className="lk-card" style={{ padding: "14px", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(28,28,28,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>{IC(T.accent, 16)}</div>
                      <div>
                        <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{bon.titre}</div>
                        <div style={{ color: T.textLo, fontSize: 12 }}>{bon.adresse}</div>
                      </div>
                    </div>
                    <div style={{ color: T.accent, fontWeight: 700, fontSize: 13 }}>{fmtFrom(bon.montantEstime, lang)}</div>
                  </div>
                  <button onClick={() => setBons(p => p.filter(b => b.id !== bon.id))} style={{ background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 8, padding: "5px 12px", color: T.danger, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.deleteBonus}</button>
                </div>
              );
            })}
          </>
        )}
        {tab === "pros" && (
          <>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{tr.registeredCraftsmen} ({proAccounts.length})</div>
            <div style={{ marginBottom: 14 }}><input className="lk-input" value={searchPros} onChange={e => setSearchPros(e.target.value)} placeholder={tr.searchPlaceholder} /></div>
            {proAccounts.filter(pro => !searchPros || pro.nom.toLowerCase().includes(searchPros.toLowerCase()) || (pro.email || "").toLowerCase().includes(searchPros.toLowerCase())).map(pro => {
              const proMissions = allDone.filter(b => b.artisanId === pro.artisanId);
              const isBanned = bannedList.some(b => b.email === pro.email);
              return (
                <div key={pro.id} className="lk-card" style={{ padding: "14px", marginBottom: 10, opacity: isBanned ? .5 : 1 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(28,28,28,.06)", border: "2px solid rgba(28,28,28,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: T.accent, fontWeight: 700, fontSize: 18 }}>{pro.nom.charAt(0)}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{pro.nom}</div>
                      <div style={{ color: T.textLo, fontSize: 12 }}>{pro.ville || "—"}</div>
                      {pro.isDemo && <span style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.2)", color: T.warn, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>{tr.demoAccount}</span>}
                      {isBanned && <span style={{ background: "rgba(220,38,38,.08)", border: "1px solid rgba(220,38,38,.2)", color: T.danger, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, marginLeft: 4 }}>BANNI</span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: T.success, fontWeight: 700, fontSize: 13 }}>{fmt(proMissions.reduce((s, b) => s + (b.montantFinal || 0) * 0.40, 0))}</div>
                      <div style={{ color: T.textLo, fontSize: 11 }}>{proMissions.length} missions</div>
                      {!isBanned && (
                        <button onClick={() => { setBanTarget(pro); setBanReason(""); }} style={{ marginTop: 6, background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 8, padding: "4px 10px", color: T.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.banUser}</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        {tab === "bannissements" && (
          <>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{tr.bannissements} ({bannedList.length})</div>
            {bannedList.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: T.textLo, fontSize: 13 }}>Aucun bannissement</div>}
            {bannedList.map(b => (
              <div key={b.id} className="lk-card" style={{ padding: "14px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{b.nom}</div>
                  <div style={{ color: T.danger, fontSize: 12 }}>{fmtDate(b.bannedAt)}</div>
                </div>
                <div style={{ color: T.textLo, fontSize: 12 }}>{b.email}</div>
                {b.reason && <div style={{ color: T.textMid, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>{b.reason}</div>}
                <button onClick={() => setBannedList(p => p.filter(x => x.id !== b.id))} style={{ marginTop: 8, background: "none", border: "1px solid rgba(0,0,0,.1)", borderRadius: 8, padding: "4px 10px", color: T.textMid, fontSize: 11, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Débannir</button>
              </div>
            ))}
          </>
        )}
        {tab === "validations" && (
          <>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{tr.pendingPros}</div>
            {(() => {
              const pendingPros = accounts.filter(a => a.role === "pro" && a.dossierStatus === "pending");
              if (pendingPros.length === 0) return (
                <div style={{ textAlign: "center", padding: "48px 20px" }}>
                  {Icon.check(T.success, 36)}
                  <div style={{ color: T.success, fontWeight: 700, fontSize: 15, marginTop: 12 }}>{tr.noPendingPros}</div>
                </div>
              );
              return pendingPros.map(pro => (
                <div key={pro.id} className="lk-card" style={{ padding: "16px", marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                    <div style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(201,160,48,.1)", border: "2px solid rgba(201,160,48,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: T.accent, fontWeight: 700, fontSize: 18 }}>{pro.nom.charAt(0)}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.textHi, fontWeight: 700, fontSize: 15 }}>{pro.nom}</div>
                      <div style={{ color: T.textLo, fontSize: 12 }}>{pro.email} · {pro.ville || "—"}</div>
                      <div style={{ color: T.warn, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{tr.dossierPending}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
                    {[{ l: "SIRET", v: pro.siret ? pro.siret.slice(0,6) + "…" : "—" }, { l: "CNI", v: pro.hasIdCard ? "✓" : "✗" }, { l: "Assurance", v: pro.hasInsurance ? "✓" : "✗" }].map(item => (
                      <div key={item.l} style={{ background: "rgba(0,0,0,.03)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                        <div style={{ color: T.textLo, fontSize: 10, marginBottom: 3 }}>{item.l}</div>
                        <div style={{ color: item.v === "✓" ? T.success : item.v === "✗" ? T.danger : T.textMid, fontWeight: 700, fontSize: 12 }}>{item.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button onClick={() => setAccounts(p => p.map(a => a.id === pro.id ? { ...a, dossierStatus: "approved" } : a))} style={{ background: "rgba(30,158,107,.1)", border: "1px solid rgba(30,158,107,.3)", borderRadius: 10, padding: "11px", color: T.success, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
                      {Icon.check(T.success, 14)} {tr.approveDossier}
                    </button>
                    <button onClick={() => { setRejectTarget(pro); setRejectReason(""); }} style={{ background: "rgba(220,38,38,.07)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 10, padding: "11px", color: T.danger, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
                      {Icon.x(T.danger, 14)} {tr.rejectDossier}
                    </button>
                  </div>
                </div>
              ));
            })()}
          </>
        )}
        {tab === "clients" && (
          <>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{tr.allClients} ({accounts.filter(a => a.role === "client").length} {tr.clientsCount})</div>
            <div style={{ marginBottom: 14 }}><input className="lk-input" value={searchPros} onChange={e => setSearchPros(e.target.value)} placeholder={tr.searchPlaceholder} /></div>
            {accounts.filter(a => a.role === "client" && (!searchPros || a.nom.toLowerCase().includes(searchPros.toLowerCase()) || (a.email || "").toLowerCase().includes(searchPros.toLowerCase()))).map(client => {
              const clientMissions = bookings.filter(b => b.clientId === client.id);
              const isBanned = bannedList.some(b => b.email === client.email);
              return (
                <div key={client.id} className="lk-card" style={{ padding: "14px", marginBottom: 10, opacity: isBanned ? .5 : 1 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(201,160,48,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: T.gold, fontWeight: 700, fontSize: 16 }}>{client.nom.charAt(0)}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{client.nom}</div>
                      <div style={{ color: T.textLo, fontSize: 12 }}>{client.email} · {client.ville || "—"}</div>
                      {client.isDemo && <span style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.2)", color: T.warn, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>{tr.demoAccount}</span>}
                      {isBanned && <span style={{ background: "rgba(220,38,38,.08)", border: "1px solid rgba(220,38,38,.2)", color: T.danger, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, marginLeft: 4 }}>BANNI</span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: T.accent, fontWeight: 700, fontSize: 16 }}>{clientMissions.length}</div>
                      <div style={{ color: T.textLo, fontSize: 11 }}>missions</div>
                      {!isBanned && <button onClick={() => { setBanTarget(client); setBanReason(""); }} style={{ marginTop: 6, background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 8, padding: "4px 10px", color: T.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.banUser}</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        {tab === "validations" && (
          <>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{tr.pendingPros}</div>
            {(() => {
              const pendingPros = accounts.filter(a => a.role === "pro" && a.dossierStatus === "pending");
              if (pendingPros.length === 0) return (
                <div style={{ textAlign: "center", padding: "48px 20px" }}>
                  {Icon.check(T.success, 36)}
                  <div style={{ color: T.success, fontWeight: 700, fontSize: 15, marginTop: 12 }}>{tr.noPendingPros}</div>
                </div>
              );
              return pendingPros.map(pro => (
                <div key={pro.id} className="lk-card" style={{ padding: "16px", marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                    <div style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(201,160,48,.1)", border: "2px solid rgba(201,160,48,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: T.accent, fontWeight: 700, fontSize: 18 }}>{pro.nom.charAt(0)}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.textHi, fontWeight: 700, fontSize: 15 }}>{pro.nom}</div>
                      <div style={{ color: T.textLo, fontSize: 12 }}>{pro.email} · {pro.ville || "—"}</div>
                      <div style={{ color: T.warn, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{tr.dossierPending}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
                    {[{ l: "SIRET", v: pro.siret || "—" }, { l: "CNI", v: pro.hasIdCard ? "✓" : "✗" }, { l: "Assurance", v: pro.hasInsurance ? "✓" : "✗" }].map(item => (
                      <div key={item.l} style={{ background: "rgba(0,0,0,.03)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                        <div style={{ color: T.textLo, fontSize: 10, marginBottom: 3 }}>{item.l}</div>
                        <div style={{ color: item.v === "✓" ? T.success : item.v === "✗" ? T.danger : T.textMid, fontWeight: 700, fontSize: 12 }}>{item.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button onClick={() => setAccounts(p => p.map(a => a.id === pro.id ? { ...a, dossierStatus: "approved" } : a))} style={{ background: "rgba(30,158,107,.1)", border: "1px solid rgba(30,158,107,.3)", borderRadius: 10, padding: "11px", color: T.success, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
                      {Icon.check(T.success, 14)} {tr.approveDossier}
                    </button>
                    <button onClick={() => { setRejectTarget(pro); setRejectReason(""); }} style={{ background: "rgba(220,38,38,.07)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 10, padding: "11px", color: T.danger, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
                      {Icon.x(T.danger, 14)} {tr.rejectDossier}
                    </button>
                  </div>
                </div>
              ));
            })()}
          </>
        )}
        {tab === "clients" && (
          <>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{tr.allClients} ({accounts.filter(a => a.role === "client").length} {tr.clientsCount})</div>
            <div style={{ marginBottom: 14 }}>
              <input className="lk-input" value={searchPros} onChange={e => setSearchPros(e.target.value)} placeholder={tr.searchPlaceholder} />
            </div>
            {accounts.filter(a => a.role === "client" && (!searchPros || a.nom.toLowerCase().includes(searchPros.toLowerCase()) || a.email.toLowerCase().includes(searchPros.toLowerCase()))).map(client => {
              const clientMissions = bookings.filter(b => b.clientId === client.id);
              const isBanned = bannedList.some(b => b.email === client.email);
              return (
                <div key={client.id} className="lk-card" style={{ padding: "14px", marginBottom: 10, opacity: isBanned ? .5 : 1 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(201,160,48,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: T.gold, fontWeight: 700, fontSize: 16 }}>{client.nom.charAt(0)}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{client.nom}</div>
                      <div style={{ color: T.textLo, fontSize: 12 }}>{client.email}</div>
                      {client.isDemo && <span style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.2)", color: T.warn, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>{tr.demoAccount}</span>}
                      {isBanned && <span style={{ background: "rgba(220,38,38,.08)", border: "1px solid rgba(220,38,38,.2)", color: T.danger, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, marginLeft: 4 }}>BANNI</span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: T.accent, fontWeight: 700, fontSize: 14 }}>{clientMissions.length}</div>
                      <div style={{ color: T.textLo, fontSize: 11 }}>missions</div>
                      {!isBanned && (
                        <button onClick={() => { setBanTarget(client); setBanReason(""); }} style={{ marginTop: 6, background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 8, padding: "4px 10px", color: T.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.banUser}</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        {tab === "missions" && (
          <>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{tr.allMissionsLabel} ({allDone.length})</div>
            {allDone.map(b => {
              const pr = PROBLEMES.find(p => p.id === b.probleme);
              const isPaid = b.statutPaiement === "payé";
              return (
                <div key={b.id} className="lk-card" style={{ padding: "14px", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pLabel(pr, lang)}</div>
                      <div style={{ color: T.textLo, fontSize: 11 }}>{b.clientNom} · {fmtDate(b.createdAt)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{fmt(b.montantFinal || 0)}</div>
                      <div style={{ color: isPaid ? T.success : T.warn, fontSize: 11 }}>{isPaid ? tr.paid : tr.pending}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ background: "rgba(62,207,142,.06)", border: "1px solid rgba(62,207,142,.15)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ color: T.textLo, fontSize: 10 }}>{tr.techShare}</div>
                      <div style={{ color: T.success, fontWeight: 700, fontSize: 13 }}>{fmt((b.montantFinal || 0) * 0.40)}</div>
                    </div>
                    <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(0,0,0,.06)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ color: T.textLo, fontSize: 10 }}>LOCKR (60%)</div>
                      <div style={{ color: T.accent, fontWeight: 700, fontSize: 13 }}>{fmt((b.montantFinal || 0) * 0.60)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        {tab === "surveillance" && (() => {
          const recs = bookings.filter(b => b.surveillance).sort((a, b) => (b.surveillance.flagged ? 1 : 0) - (a.surveillance.flagged ? 1 : 0));
          const flaggedCount = recs.filter(r => r.surveillance.flagged).length;
          return (
            <>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{tr.adminSurveillance}</div>
              <div style={{ color: T.textLo, fontSize: 12, marginBottom: 16 }}>{tr.surveillanceDesc}</div>
              {flaggedCount > 0 && (
                <div style={{ background: "rgba(220,38,38,.07)", border: "1px solid rgba(220,38,38,.25)", borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center" }}>
                  {Icon.warning(T.danger, 18)}
                  <span style={{ color: T.danger, fontWeight: 700, fontSize: 13 }}>{flaggedCount} {tr.surveillanceFlaggedAlert}</span>
                </div>
              )}
              {recs.length === 0 && <div style={{ textAlign: "center", padding: "48px 20px", color: T.textLo, fontSize: 14 }}>{tr.surveillanceEmpty}</div>}
              {recs.map(b => {
                const s = b.surveillance;
                const pr = PROBLEMES.find(p => p.id === b.probleme);
                return (
                  <div key={b.id} className="lk-card" style={{ padding: "16px", marginBottom: 12, border: s.flagged ? `1.5px solid ${T.danger}` : undefined }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{s.proNom}</span>
                          {s.flagged && <span style={{ background: "rgba(220,38,38,.1)", border: "1px solid rgba(220,38,38,.3)", color: T.danger, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6 }}>⚠️ {tr.surveillanceFlagged}</span>}
                        </div>
                        <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{pLabel(pr, lang)} · {b.clientNom} · {fmtDate(s.date)}</div>
                      </div>
                    </div>
                    {s.flagged && s.flaggedWords?.length > 0 && (
                      <div style={{ background: "rgba(220,38,38,.05)", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
                        <div style={{ color: T.danger, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{tr.surveillanceDetectedTerms} :</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {s.flaggedWords.map((w, i) => <span key={i} style={{ background: "rgba(220,38,38,.1)", color: T.danger, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6 }}>{w}</span>)}
                        </div>
                      </div>
                    )}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: T.textLo, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>🎙 {tr.surveillanceAudio}</div>
                      {s.audio ? <audio controls src={s.audio} style={{ width: "100%" }} /> : <div style={{ color: T.textLo, fontSize: 12 }}>—</div>}
                    </div>
                    <div>
                      <div style={{ color: T.textLo, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>📝 {tr.surveillanceTranscript}</div>
                      <div style={{ background: "rgba(0,0,0,.03)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: T.textMid, lineHeight: 1.5, maxHeight: 140, overflowY: "auto" }}>{s.transcript}</div>
                    </div>
                    {s.flagged && (
                      <button onClick={() => setBannedList(p => p.find(x => x.artisanId === s.artisanId) ? p : [...p, { artisanId: s.artisanId, nom: s.proNom, reason: tr.surveillanceBanReason, date: ts() }])} className="lk-ghost" style={{ marginTop: 12, fontSize: 12, padding: "8px 14px", color: T.danger, borderColor: T.danger }}>{tr.surveillanceBanPro}</button>
                    )}
                  </div>
                );
              })}
            </>
          );
        })()}
        {tab === "marketplace" && (() => {
          const totalSalesVol = sales.reduce((s, v) => s + v.prix, 0);
          const totalCommission = sales.reduce((s, v) => s + v.commission, 0);
          const byMetier = ["serrurier", "plombier", "electricien", "chauffagiste"].map(mid => ({
            id: mid,
            label: METIERS.find(m => m.id === mid)?.label || mid,
            color: METIERS.find(m => m.id === mid)?.color || T.accent,
            count: sales.filter(s => s.metier === mid).length,
            vol: sales.filter(s => s.metier === mid).reduce((a, s) => a + s.prix, 0),
            com: sales.filter(s => s.metier === mid).reduce((a, s) => a + s.commission, 0),
          }));
          return (
            <>
              {/* Hero banner */}
              <div style={{ position: "relative", height: 110, borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
                <img src="https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=900&q=80" alt="" onError={e => { e.target.style.display = "none"; }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 60%" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(201,160,48,.9),rgba(30,30,30,.7))" }} />
                <div style={{ position: "relative", height: "100%", padding: "0 20px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                  <div style={{ color: "#fff", fontWeight: 900, fontSize: 18 }}>{tr.adminMarketplace}</div>
                  <div style={{ color: "rgba(255,255,255,.75)", fontSize: 12 }}>{tr.adminMarketplaceDesc}</div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 20, padding: "3px 12px", width: "fit-content", marginTop: 4 }}>
                    {Icon.percent("#fff", 11)}<span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>Commission LOCKR : 15%</span>
                  </div>
                </div>
              </div>
              {/* KPI cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { l: tr.totalSales, v: fmt(totalSalesVol), c: T.accent },
                  { l: tr.totalCommission, v: fmt(totalCommission), c: T.success },
                  { l: "Ventes enregistrées", v: sales.length, c: T.accent2 },
                  { l: "Annonces actives", v: listings.filter(l => !l.sold).length, c: "#f59e0b" },
                ].map(s => (
                  <div key={s.l} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px" }}>
                    <div style={{ color: T.textLo, fontSize: 11, marginBottom: 6 }}>{s.l}</div>
                    <div style={{ color: s.c, fontWeight: 800, fontSize: 18 }}>{s.v}</div>
                  </div>
                ))}
              </div>
              {/* Par secteur */}
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Par secteur</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
                {byMetier.map(m => (
                  <div key={m.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${m.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {(METIERS.find(mt => mt.id === m.id)?.icon || Icon.tool)(m.color, 13)}
                      </div>
                      <div style={{ color: T.textHi, fontWeight: 700, fontSize: 12 }}>{mLabel(m, lang)}</div>
                    </div>
                    <div style={{ color: m.color, fontWeight: 800, fontSize: 15 }}>{fmt(m.com)}</div>
                    <div style={{ color: T.textLo, fontSize: 10 }}>{m.count} vente{m.count > 1 ? "s" : ""} · {fmt(m.vol)} CA</div>
                  </div>
                ))}
              </div>
              {/* Historique */}
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{tr.salesHistory}</div>
              {sales.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: T.textLo, fontSize: 13 }}>{tr.noSales}</div>
              ) : (
                [...sales].reverse().map(s => {
                  const mc = METIERS.find(m => m.id === s.metier)?.color || T.accent;
                  const mIcon = METIERS.find(m => m.id === s.metier)?.icon || Icon.tool;
                  return (
                    <div key={s.id} className="lk-card" style={{ padding: "12px 14px", marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${mc}15`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {mIcon(mc, 15)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.titre}</div>
                            <div style={{ color: T.textLo, fontSize: 10 }}>{s.vendeurNom} → {s.acheteurNom} · {fmtDate(s.createdAt)}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 10 }}>
                          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{fmt(s.prix)}</div>
                          <div style={{ color: T.success, fontSize: 11, fontWeight: 600 }}>+{fmt(s.commission)} LOCKR</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ background: `${mc}12`, border: `1px solid ${mc}25`, borderRadius: 20, padding: "2px 8px", fontSize: 9, color: mc, fontWeight: 700 }}>{METIERS.find(m => m.id === s.metier)?.label || s.metier}</span>
                        <span style={{ background: "rgba(62,207,142,.1)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 20, padding: "2px 8px", fontSize: 9, color: T.success, fontWeight: 700 }}>Commission: {fmt(s.commission)} (15%)</span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          );
        })()}
        {tab === "facturation" && (
          <>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Facturation</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <div>
                <label className="lk-label">Client</label>
                <input className="lk-input" value={newDevis.client} onChange={e => setNewDevis(p => ({ ...p, client: e.target.value }))} placeholder="Nom du client" />
              </div>
              <div>
                <label className="lk-label">Description prestation</label>
                <input className="lk-input" value={newDevis.service} onChange={e => setNewDevis(p => ({ ...p, service: e.target.value }))} placeholder="Ex: Ouverture porte, Paris 1" />
              </div>
              <div>
                <label className="lk-label">Montant HT (€)</label>
                <input className="lk-input" type="number" value={newDevis.ht} onChange={e => setNewDevis(p => ({ ...p, ht: e.target.value }))} placeholder="150" />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {["devis", "facture"].map(t => (
                  <button key={t} onClick={() => setNewDevis(p => ({ ...p, type: t }))} style={{ flex: 1, background: newDevis.type === t ? T.grad : T.card, color: newDevis.type === t ? "#fff" : T.textMid, border: `1px solid ${newDevis.type === t ? T.accent : T.border}`, borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", textTransform: "capitalize" }}>{t}</button>
                ))}
              </div>
            </div>
            {(() => {
              const ht = parseFloat(newDevis.ht) || 0;
              const tva = ht * 0.20;
              const ttc = ht + tva;
              return (
                <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.15)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: T.textMid, fontSize: 13 }}>HT</span>
                    <span style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{fmt(ht)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: T.textMid, fontSize: 13 }}>TVA (20%)</span>
                    <span style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{fmt(tva)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                    <span style={{ color: T.textHi, fontWeight: 800, fontSize: 14 }}>Total TTC</span>
                    <span style={{ color: T.accent, fontWeight: 900, fontSize: 16 }}>{fmt(ttc)}</span>
                  </div>
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
              <button onClick={() => {
                if (!newDevis.client || !newDevis.ht) return;
                const ht = parseFloat(newDevis.ht) || 0;
                const item = { id: uid(), ...newDevis, ht, tva: ht * 0.20, ttc: ht * 1.20, statut: "brouillon", createdAt: ts() };
                setDevisItems(p => [item, ...p]);
                setNewDevis({ client: "", service: "", ht: "", type: "devis" });
              }} className="lk-btn" style={{ flex: 2 }}>Créer {newDevis.type}</button>
            </div>
            {devisItems.map(d => (
              <div key={d.id} className="lk-card" style={{ padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ color: T.textHi, fontWeight: 700, fontSize: 13 }}>{d.type === "devis" ? "Devis" : "Facture"} — {d.client}</div>
                    <div style={{ color: T.textLo, fontSize: 11 }}>{d.service} · {fmtDate(d.createdAt)}</div>
                    <span style={{ background: d.statut === "payé" ? "rgba(62,207,142,.1)" : "rgba(217,119,6,.08)", border: `1px solid ${d.statut === "payé" ? "rgba(62,207,142,.25)" : "rgba(217,119,6,.2)"}`, color: d.statut === "payé" ? T.success : T.warn, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, display: "inline-block", marginTop: 4 }}>{d.statut}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: T.accent, fontWeight: 800, fontSize: 15 }}>{fmt(d.ttc)}</div>
                    <div style={{ color: T.textLo, fontSize: 10 }}>TTC</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => {
                    const lines = [`${d.type.toUpperCase()} LOCKR\nClient: ${d.client}\nPrestation: ${d.service}\nDate: ${fmtDate(d.createdAt)}\n---\nMontant HT: ${fmt(d.ht)}\nTVA 20%: ${fmt(d.tva)}\nTotal TTC: ${fmt(d.ttc)}\nStatut: ${d.statut}`].join("");
                    const blob = new Blob([lines], { type: "text/plain" });
                    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${d.type}_${d.client}_${d.id}.txt`; a.click(); URL.revokeObjectURL(url);
                  }} style={{ background: T.grad, border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Télécharger</button>
                  {d.statut !== "payé" && <button onClick={() => setDevisItems(p => p.map(x => x.id === d.id ? { ...x, statut: "payé" } : x))} style={{ background: "rgba(62,207,142,.1)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 8, padding: "7px 12px", color: T.success, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Marquer payé</button>}
                  <button onClick={() => setDevisItems(p => p.filter(x => x.id !== d.id))} style={{ background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 8, padding: "7px 12px", color: T.danger, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Supprimer</button>
                </div>
              </div>
            ))}
          </>
        )}
        {tab === "comptabilite" && (
          <>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Comptabilité</div>
            {/* On vous doit (commissions non perçues) */}
            <div style={{ background: "rgba(201,160,48,.06)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 14, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ color: T.accent, fontWeight: 800, fontSize: 15, marginBottom: 4 }}>On vous doit (commissions dues à LOCKR)</div>
              <div style={{ color: T.textMid, fontSize: 12, marginBottom: 12 }}>Commissions sur missions non encore encaissées</div>
              {unpaidCommissions.length === 0 ? <div style={{ color: T.textLo, fontSize: 13 }}>Tout est à jour ✓</div> : unpaidCommissions.map(b => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, padding: "8px 10px", background: "rgba(255,255,255,.6)", borderRadius: 8 }}>
                  <span style={{ color: T.textHi, fontSize: 12 }}>{b.clientNom} · {fmtDate(b.createdAt)}</span>
                  <span style={{ color: T.accent, fontWeight: 700, fontSize: 13 }}>{fmt((b.montantFinal || 0) * 0.60)}</span>
                </div>
              ))}
              <div style={{ borderTop: `1px solid rgba(201,160,48,.2)`, paddingTop: 10, marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.textMid, fontWeight: 700, fontSize: 13 }}>Total dû à LOCKR</span>
                <span style={{ color: T.accent, fontWeight: 900, fontSize: 16 }}>{fmt(unpaidCommissions.reduce((s, b) => s + (b.montantFinal || 0) * 0.60, 0))}</span>
              </div>
            </div>
            {/* On nous doit (paiements pros en attente) */}
            <div style={{ background: "rgba(62,207,142,.06)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ color: T.success, fontWeight: 800, fontSize: 15, marginBottom: 4 }}>On nous doit (paiements pros en attente)</div>
              <div style={{ color: T.textMid, fontSize: 12, marginBottom: 12 }}>Parts artisans non encore versées</div>
              {proPendingPay.length === 0 ? <div style={{ color: T.textLo, fontSize: 13 }}>Aucun paiement en attente ✓</div> : proPendingPay.map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, padding: "8px 10px", background: "rgba(255,255,255,.6)", borderRadius: 8 }}>
                  <span style={{ color: T.textHi, fontSize: 12 }}>{p.nom}</span>
                  <span style={{ color: T.success, fontWeight: 700, fontSize: 13 }}>{fmt(p.owed)}</span>
                </div>
              ))}
              <div style={{ borderTop: `1px solid rgba(62,207,142,.2)`, paddingTop: 10, marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.textMid, fontWeight: 700, fontSize: 13 }}>Total à verser aux pros</span>
                <span style={{ color: T.success, fontWeight: 900, fontSize: 16 }}>{fmt(proPendingPay.reduce((s, p) => s + p.owed, 0))}</span>
              </div>
            </div>
          </>
        )}
        {tab === "partenaires" && <PartenaireScreen />}
        {tab === "priorites" && <AdminPrioritesTab lang={lang} accounts={accounts} bons={bons} priorityOrder={priorityOrder} setPriorityOrder={setPriorityOrder} />}
        {tab === "digital_conformite" && <AdminDigitalConformiteTab lang={lang} />}
        </div>
      {rejectTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ color: T.danger, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{tr.rejectDossier}</div>
            <div style={{ color: T.textMid, fontSize: 13, marginBottom: 16 }}>{rejectTarget.nom} · {rejectTarget.email}</div>
            <label className="lk-label">{tr.rejectReason}</label>
            <textarea className="lk-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder={tr.rejectReasonPlaceholder} rows={3} style={{ resize: "none", marginBottom: 16 }} />
            <button onClick={() => { setAccounts(p => p.map(a => a.id === rejectTarget.id ? { ...a, dossierStatus: "rejected", rejectReason } : a)); setRejectTarget(null); setRejectReason(""); }} className="lk-btn" style={{ marginBottom: 10, background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}>{tr.confirmReject}</button>
            <button onClick={() => setRejectTarget(null)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>
      )}
      {rejectTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ color: T.danger, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{tr.rejectDossier}</div>
            <div style={{ color: T.textMid, fontSize: 13, marginBottom: 16 }}>{rejectTarget.nom} · {rejectTarget.email}</div>
            <label className="lk-label">{tr.rejectReason}</label>
            <textarea className="lk-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder={tr.rejectReasonPlaceholder} rows={3} style={{ resize: "none", marginBottom: 16 }} />
            <button onClick={() => {
              setAccounts(p => p.map(a => a.id === rejectTarget.id ? { ...a, dossierStatus: "rejected", rejectReason } : a));
              setRejectTarget(null); setRejectReason("");
            }} className="lk-btn" style={{ marginBottom: 10, background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}>{tr.confirmReject}</button>
            <button onClick={() => setRejectTarget(null)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>
      )}
      {banTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 32px", animation: "slideUp .3s ease" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ color: T.danger, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{tr.banConfirmTitle}</div>
            <div style={{ color: T.textMid, fontSize: 13, marginBottom: 16 }}>{banTarget.nom} · {banTarget.email}</div>
            <label className="lk-label">{tr.banReason}</label>
            <textarea className="lk-input" value={banReason} onChange={e => setBanReason(e.target.value)} placeholder={tr.banReasonPlaceholder} rows={3} style={{ resize: "none", marginBottom: 16 }} />
            <button onClick={() => {
              setBannedList(p => [...p, { id: uid(), nom: banTarget.nom, email: banTarget.email, phone: banTarget.tel || "", reason: banReason, bannedAt: ts(), bannedBy: account.nom, type: banTarget.role }]);
              setBanTarget(null); setBanReason("");
            }} className="lk-btn" style={{ marginBottom: 10, background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}>{tr.banConfirm}</button>
            <button onClick={() => setBanTarget(null)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>
      )}
      {postModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "16px 20px 36px", maxHeight: "85vh", overflowY: "auto", animation: "slideUp .3s ease" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 17, marginBottom: 20 }}>{tr.newLockrBonus}</div>
            <div style={{ marginBottom: 14 }}><label className="lk-label">{tr.titleLabel}</label><input className="lk-input" value={newBon.titre} onChange={e => setNewBon(p => ({ ...p, titre: e.target.value }))} placeholder="Ex: Porte claquée urgence" /></div>
            <div style={{ marginBottom: 14 }}><label className="lk-label">{tr.addressLabel}</label><input className="lk-input" value={newBon.adresse} onChange={e => setNewBon(p => ({ ...p, adresse: e.target.value }))} placeholder="15 rue de la Paix, Paris" /></div>
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.regionSelectLabel}</label>
              <select className="lk-input" value={newBon.region} onChange={e => setNewBon(p => ({ ...p, region: e.target.value }))} style={{ cursor: "pointer" }}>
                {["Paris", "Lyon", "Marseille", "Bordeaux", "Toulouse", "Nantes", "Lille", "Strasbourg"].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.typeLabel}</label>
              <select className="lk-input" value={newBon.probleme} onChange={e => setNewBon(p => ({ ...p, probleme: e.target.value }))} style={{ cursor: "pointer" }}>
                {PROBLEMES.map(p => <option key={p.id} value={p.id}>{pLabel(p, lang)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}><label className="lk-label">{tr.estimatedAmountLabel}</label><input type="number" className="lk-input" value={newBon.montantEstime} onChange={e => setNewBon(p => ({ ...p, montantEstime: e.target.value }))} placeholder="150" /></div>
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.artisanShare} : {newBon.techPct}%</label>
              <input type="range" min={5} max={95} step={5} value={newBon.techPct} onChange={e => setNewBon(p => ({ ...p, techPct: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: T.accent }} />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 20 }}>
              <input type="checkbox" id="adm-urgence" checked={newBon.urgence} onChange={e => setNewBon(p => ({ ...p, urgence: e.target.checked }))} style={{ accentColor: T.danger }} />
              <label htmlFor="adm-urgence" style={{ color: T.textMid, fontSize: 13, cursor: "pointer" }}>{tr.urgentLabel}</label>
            </div>
            <button onClick={posterBonAdmin} className="lk-btn" style={{ marginBottom: 10 }}>{tr.publishBonus2}</button>
            <button onClick={() => setPostModal(false)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/* ─── PARTNER DEMO DATA ─── */
const INIT_PARTNER_BOOKINGS = [
  { id: "pb1", partenaireId: "part1", clientNom: "Jean Lefebvre", adresse: "34 rue du Faubourg, Paris 10", probleme: "serrure", typeIntervention: "Remplacement serrure 3 points", montant: 280, statut: "terminée", commission: 42, netPartenaire: 142.8, technicienId: "tech1", createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), note: 4.8 },
  { id: "pb2", partenaireId: "part1", clientNom: "Marie Dubois", adresse: "8 avenue de la République, Paris 11", probleme: "blindage", typeIntervention: "Blindage porte palière", montant: 450, statut: "en_cours", commission: 67.5, netPartenaire: 229.5, technicienId: "tech2", createdAt: new Date(Date.now() - 86400000).toISOString(), note: null },
  { id: "pb3", partenaireId: "part1", clientNom: "Pierre Martin", adresse: "22 bd Voltaire, Paris 11", probleme: "ouverture", typeIntervention: "Ouverture porte claquée", montant: 160, statut: "en_attente", commission: 24, netPartenaire: 81.6, technicienId: null, createdAt: new Date(Date.now() - 3600000 * 2).toISOString(), note: null },
];

const INIT_PARTNER_TECHS = [
  { id: "tech1", partenaireId: "part1", nom: "Dupuis", prenom: "Laurent", metier: "serrurier", statut: "actif", tel: "0611223344", email: "l.dupuis@batipro.fr", certifications: ["Qualibat 8711"], missions: 18 },
  { id: "tech2", partenaireId: "part1", nom: "Kamoui", prenom: "Nabil", metier: "serrurier", statut: "en_mission", tel: "0622334455", email: "n.kamoui@batipro.fr", certifications: ["Qualibat 8711", "Mul-T-Lock Certifié"], missions: 24 },
  { id: "tech3", partenaireId: "part1", nom: "Ferrara", prenom: "Giuseppe", metier: "plombier", statut: "actif", tel: "0633445566", email: "g.ferrara@batipro.fr", certifications: ["Qualibat 5212"], missions: 11 },
];

/* ─── PARTENAIRE APP ─── */
/* ─── PARTENAIRE — CONFORMITÉ LOIS FRANÇAISES ─── */
function PartenaireLoiTab({ lang = "fr", account }) {
  const tr = TRANS[lang] || TRANS.fr;
  const fr = lang !== "en";

  const [checks, setChecks] = useState({});
  const [dpa, setDpa] = useState("");
  const [mediateur, setMediateur] = useState("");
  const [opco, setOpco] = useState("");
  const [pdpRef, setPdpRef] = useState("");

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

function PartenaireApp({ account, setAccounts, bookings, setBookings, bons, setBons, onLogout, lang = "fr", setLang, listings = [], setListings = () => {}, sales = [], setSales = () => {} }) {
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const tr = TRANS[lang] || TRANS.fr;
  const [tab, setTab] = useState("dashboard");
  const [missions, setMissions] = useState(INIT_PARTNER_BOOKINGS);
  const [techs, setTechs] = useState(INIT_PARTNER_TECHS);
  const [addTechModal, setAddTechModal] = useState(false);
  const [newTech, setNewTech] = useState({ nom: "", prenom: "", email: "", tel: "", metier: "serrurier", certifications: "" });
  const [docs, setDocs] = useState([
    { id: "rc_pro", label: "Assurance RC Pro", statut: "validé", expiry: "2025-12-31", file: "AXA_RC_Pro_2024.pdf" },
    { id: "kbis", label: "Extrait Kbis", statut: "validé", expiry: "2024-11-15", file: "Kbis_BatiPro.pdf" },
    { id: "urssaf", label: "Attestation Urssaf", statut: "en_attente", expiry: "2025-06-30", file: "Urssaf_2024.pdf" },
    { id: "qualibat", label: "Qualification Qualibat", statut: "validé", expiry: "2026-01-01", file: "Qualibat_8711.pdf" },
    { id: "vigilance", label: "Attestation de vigilance URSSAF", statut: "non_fourni", expiry: null, file: null },
    { id: "iban", label: "Relevé IBAN", statut: "validé", expiry: null, file: "IBAN_BatiPro.pdf" },
    { id: "cni", label: "Carte d'identité dirigeant", statut: "validé", expiry: "2028-05-20", file: "CNI_Directeur.pdf" },
    { id: "rgpd", label: "Formation RGPD équipe", statut: "non_fourni", expiry: null, file: null },
    { id: "cnil", label: "Déclaration CNIL", statut: "validé", expiry: null, file: "CNIL_Decl.pdf" },
    { id: "contrat", label: "Contrat sous-traitance LOCKR", statut: "validé", expiry: null, file: "Contrat_LOCKR_Signe.pdf" },
  ]);
  const [profileEdit, setProfileEdit] = useState({ ...account });
  const [bonModal, setBonModal] = useState(false);
  const [newBon, setNewBon] = useState({ titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: 35 });
  const [focusTech, setFocusTech] = useState(null);
  const [subscription, setSubscription] = useState(null); // { plan: "mensuel"|"annuel", since, until }
  /* Accès équipe LOCKR : les comptes internes (domaine @lockr.fr ou compte
     explicitement marqué internalAccess) débloquent gratuitement toutes les
     fonctionnalités partenaire, sans passer par l'abonnement payant. */
  const isInternalTeam = account.internalAccess === true || /@lockr\.fr$/i.test(account.email || "");
  const hasPartnerAccess = !!subscription || isInternalTeam;
  const [leaves, setLeaves] = useState([
    { id: "lv1", techId: "tech1", dates: "24–28 juin 2026", motif: "Congés payés", statut: "en_attente" },
    { id: "lv2", techId: "tech3", dates: "3 juillet 2026", motif: "RDV médical", statut: "en_attente" },
  ]);
  const [primes, setPrimes] = useState([{ id: "pr1", techId: "tech2", montant: 150, motif: "Mission urgente nuit", date: "05/06/2026" }]);
  const [primeForm, setPrimeForm] = useState({ techId: "", montant: "", motif: "" });
  const [swipeTouchX, setSwipeTouchX] = useState(0);
  const [planningView, setPlanningView] = useState("day"); // "day" | "hour"
  const [planningDay, setPlanningDay] = useState(0); // 0=Lun … 6=Dim

  const myMissions = missions.filter(m => m.partenaireId === account.id);
  const doneMissions = myMissions.filter(m => m.statut === "terminée");
  const activeTechs = techs.filter(t => t.partenaireId === account.id && t.statut !== "inactif");
  const caMois = doneMissions.reduce((s, m) => s + m.montant * 0.6, 0);
  const commissionMois = caMois * 0.05; // commission entreprise réduite à 5%
  const conformeCount = docs.filter(d => d.statut === "validé").length;

  /* Outil de gestion d'entreprise : 4 pôles clairs au lieu de 16 onglets.
     Chaque pôle regroupe ses fonctions en sous-onglets simples. */
  const tabs = [
    { id: "dashboard", icon: Icon.home, l: tr.partnerDashboard },
    { id: "ops_group", icon: Icon.list, l: lang === "en" ? "Operations" : "Opérations" },
    { id: "gestion_group", icon: Icon.chart, l: lang === "en" ? "Management" : "Gestion" },
    { id: "admin_group", icon: Icon.settings, l: lang === "en" ? "Administration" : "Administration" },
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
    { id: "lois", l: lang === "en" ? "French Law" : "Lois FR" },
    { id: "fe_part", l: lang === "en" ? "E-Invoicing" : "Factu. Élec." },
    { id: "profil", l: tr.partnerProfil },
  ];
  const [opsSub, setOpsSub] = useState("missions");
  const [gestionSub, setGestionSub] = useState("techniciens");
  const [adminSub, setAdminSub] = useState("abonnement");
  // Vue effective (pôle → sous-onglet actif)
  const view = tab === "ops_group" ? opsSub : tab === "gestion_group" ? gestionSub : tab === "admin_group" ? adminSub : tab;
  const goView = (id) => {
    if (opsSubs.some(x => x.id === id)) { setOpsSub(id); setTab("ops_group"); }
    else if (gestionSubs.some(x => x.id === id)) { setGestionSub(id); setTab("gestion_group"); }
    else if (adminSubs.some(x => x.id === id)) { setAdminSub(id); setTab("admin_group"); }
    else setTab(id);
  };

  const downloadInvoice = (mission) => {
    const lines = [
      "═══════════════════════════════════════════════════════",
      "                    FACTURE LOCKR",
      "═══════════════════════════════════════════════════════",
      "",
      `N° Facture    : FACT-${mission.id.toUpperCase()}-${new Date().getFullYear()}`,
      `Date          : ${fmtDate(new Date().toISOString())}`,
      "",
      "ÉMETTEUR :",
      `Raison sociale : ${account.nom}`,
      `SIRET          : ${account.siret}`,
      `N° RCS         : ${account.rcs}`,
      `N° TVA intra.  : ${account.tva}`,
      `Capital social : ${account.capital}`,
      `Assurance RC   : ${account.assurance}`,
      "",
      "CLIENT :",
      `Nom            : ${mission.clientNom}`,
      `Adresse        : ${mission.adresse}`,
      "",
      "PRESTATION :",
      `Description    : ${mission.typeIntervention}`,
      `Montant HT     : ${(mission.montant / 1.2).toFixed(2)} €`,
      `TVA 20%        : ${(mission.montant - mission.montant / 1.2).toFixed(2)} €`,
      `Montant TTC    : ${mission.montant.toFixed(2)} €`,
      `Commission LOCKR (5%) : ${(mission.montant * 0.05).toFixed(2)} €`,
      `Net Partenaire : ${(mission.montant * 0.95).toFixed(2)} €`,
      "",
      "───────────────────────────────────────────────────────",
      "CONDITIONS DE RÈGLEMENT",
      "Délai de paiement : 30 jours date de facture",
      "Pénalités de retard : 3× taux légal en vigueur",
      "Escompte pour paiement anticipé : 0%",
      "Indemnité forfaitaire de recouvrement : 40 €",
      "",
      "MENTIONS LÉGALES",
      "En application de la loi n°92-1442 du 31/12/1992,",
      "tout retard de paiement entraîne des pénalités.",
      "Médiateur : MEDIMME - www.medimme.fr",
      "═══════════════════════════════════════════════════════",
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `facture-${mission.id}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

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
    { label: tr.kpiMoisMissions, value: myMissions.length, color: T.accent },
    { label: tr.kpiCaMois, value: `${Math.round(caMois)} €`, color: T.success },
    { label: tr.kpiCommission, value: `${Math.round(commissionMois)} €`, color: T.warn },
    { label: tr.kpiTechs, value: activeTechs.length, color: "#5b8def" },
    { label: tr.kpiNote, value: "4.7 ★", color: T.accent },
    { label: tr.kpiTaux, value: "85%", color: T.success },
  ];

  const renderDashboard = () => (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 4 }}>{tr.partnerDashboard}</div>
      <div style={{ color: T.textLo, fontSize: 12, marginBottom: 18 }}>{lang === "en" ? "Your entire business at a glance." : "Toute votre entreprise en un coup d'œil."}</div>
      <div className="lk-desktop-3col" style={{ marginBottom: 20 }}>
        {kpiCards.map((k, i) => (
          <div key={i} className="lk-card" style={{ padding: "18px 20px" }}>
            <div style={{ color: k.color, fontWeight: 800, fontSize: 24 }}>{k.value}</div>
            <div style={{ color: T.textMid, fontSize: 12, marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      {/* Accès rapides — toutes les fonctions de gestion en 1 clic */}
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
        ].map(a => (
          <button key={a.id} onClick={() => goView(a.id)} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, padding: "13px 6px", cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {a.ic(T.accent, 19)}
            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.textMid }}>{a.l}</span>
          </button>
        ))}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi, marginBottom: 12 }}>{tr.lastMissions}</div>
      {myMissions.slice(-5).reverse().map(m => (
        <div key={m.id} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{m.clientNom}</div>
              <div style={{ color: T.textMid, fontSize: 12 }}>{m.typeIntervention}</div>
              <div style={{ color: T.textLo, fontSize: 11, marginTop: 4 }}>{m.adresse}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, color: T.accent, fontSize: 15 }}>{m.montant} €</div>
              <div style={{ fontSize: 11, color: m.statut === "terminée" ? T.success : m.statut === "en_cours" ? T.accent : T.warn, fontWeight: 600, marginTop: 4 }}>{tStatut(m.statut, tr)}</div>
            </div>
          </div>
        </div>
      ))}
      <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi, marginBottom: 12, marginTop: 24 }}>{tr.conformiteAlerts}</div>
      {docs.filter(d => d.statut === "non_fourni" || d.statut === "en_attente").map(d => (
        <div key={d.id} style={{ background: "rgba(217,119,6,.06)", border: "1px solid rgba(217,119,6,.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          {Icon.warning(T.warn, 16)}
          <span style={{ color: T.warn, fontSize: 13, fontWeight: 600 }}>{d.label} — {d.statut === "non_fourni" ? tr.documentMissing : tr.pendingValidationDoc}</span>
        </div>
      ))}
    </div>
  );

  const renderMissions = () => (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.missions}</div>
      {myMissions.map(m => {
        const tech = techs.find(t => t.id === m.technicienId);
        return (
          <div key={m.id} className="lk-card" style={{ padding: "16px 18px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi }}>{m.clientNom}</div>
                <div style={{ color: T.textMid, fontSize: 12 }}>{m.typeIntervention}</div>
                <div style={{ color: T.textLo, fontSize: 11, marginTop: 2 }}>{m.adresse}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, color: T.accent, fontSize: 16 }}>{m.montant} €</div>
                <div className={m.statut === "terminée" ? "lk-badge-ok" : "lk-badge-off"} style={{ fontSize: 10, marginTop: 4 }}>{tStatut(m.statut, tr)}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12, padding: "10px", background: "rgba(0,0,0,.02)", borderRadius: 8 }}>
              <div><div style={{ color: T.textLo, fontSize: 10 }}>{tr.missionAmount}</div><div style={{ fontWeight: 700, fontSize: 13 }}>{m.montant} €</div></div>
              <div><div style={{ color: T.textLo, fontSize: 10 }}>{tr.kpiCommission} (5%)</div><div style={{ fontWeight: 700, fontSize: 13, color: T.warn }}>{(m.montant * 0.05).toFixed(2)} €</div></div>
              <div><div style={{ color: T.textLo, fontSize: 10 }}>{tr.netPartenaire}</div><div style={{ fontWeight: 700, fontSize: 13, color: T.success }}>{(m.montant * 0.95).toFixed(2)} €</div></div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="lk-label">{tr.techAssigned}</label>
              <select className="lk-input" value={m.technicienId || ""} onChange={e => setMissions(p => p.map(x => x.id === m.id ? { ...x, technicienId: e.target.value || null } : x))} style={{ cursor: "pointer" }}>
                <option value="">{tr.assignTech}</option>
                {techs.filter(t => t.partenaireId === account.id).map(t => (
                  <option key={t.id} value={t.id}>{t.prenom} {t.nom} ({t.metier})</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {m.statut === "en_attente" && (
                <button onClick={() => setMissions(p => p.map(x => x.id === m.id ? { ...x, statut: "acceptée" } : x))} className="lk-btn" style={{ flex: 1, padding: "8px 12px", fontSize: 12 }}>{tr.acceptMission}</button>
              )}
              {tech && <div style={{ flex: 1, background: "rgba(30,158,107,.06)", border: "1px solid rgba(30,158,107,.15)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: T.success, display: "flex", alignItems: "center", gap: 6 }}>{Icon.check(T.success, 12)} {tech.prenom} {tech.nom}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderTechniciens = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi }}>{tr.partnerTechs}</div>
        <button onClick={() => setAddTechModal(true)} className="lk-btn" style={{ width: "auto", padding: "9px 16px", fontSize: 13 }}>{Icon.plus("#fff", 14)} {tr.addTech}</button>
      </div>
      {techs.filter(t => t.partenaireId === account.id).map(t => (
        <div key={t.id} className="lk-card" style={{ padding: "16px 18px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: T.grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 16 }}>{t.prenom.charAt(0)}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi }}>{t.prenom} {t.nom}</div>
                <div style={{ color: T.textMid, fontSize: 12 }}>{t.metier} · {t.email}</div>
                <div style={{ color: T.textLo, fontSize: 11 }}>{t.tel}</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.statut === "actif" ? T.success : t.statut === "en_mission" ? T.accent : T.danger }}>{tStatut(t.statut, tr)}</div>
              <div style={{ color: T.textLo, fontSize: 11, marginTop: 4 }}>{t.missions} missions</div>
            </div>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {t.certifications.map((c, i) => (
              <span key={i} style={{ background: "rgba(201,160,48,.08)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: T.accent, fontWeight: 600 }}>{c}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => setTechs(p => p.map(x => x.id === t.id ? { ...x, statut: x.statut === "actif" ? "inactif" : "actif" } : x))} className="lk-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>{t.statut === "actif" ? tr.deactivate : tr.activate}</button>
          </div>
        </div>
      ))}
      {addTechModal && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: T.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "20px 22px 36px", animation: "slideUp .3s ease", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ width: 36, height: 3, background: "rgba(0,0,0,.1)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ fontWeight: 700, fontSize: 17, color: T.textHi, marginBottom: 18 }}>{tr.addTechTitle}</div>
            {[["prenom", tr.firstname],["nom", tr.lastname],["email", tr.email],["tel", tr.phone],["certifications","Certifications"]].map(([k, l]) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <label className="lk-label">{l}</label>
                <input className="lk-input" value={newTech[k]} onChange={e => setNewTech(p => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
            <div style={{ marginBottom: 18 }}>
              <label className="lk-label">{tr.selectMetier}</label>
              <select className="lk-input" value={newTech.metier} onChange={e => setNewTech(p => ({ ...p, metier: e.target.value }))} style={{ cursor: "pointer" }}>
                {["serrurier","plombier","electricien","chauffagiste"].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button onClick={() => {
              setTechs(p => [...p, { id: uid(), partenaireId: account.id, ...newTech, certifications: newTech.certifications.split(",").map(c => c.trim()).filter(Boolean), statut: "actif", missions: 0 }]);
              setAddTechModal(false);
              setNewTech({ nom: "", prenom: "", email: "", tel: "", metier: "serrurier", certifications: "" });
            }} className="lk-btn" style={{ marginBottom: 10 }}>{tr.addTech}</button>
            <button onClick={() => setAddTechModal(false)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>, document.body
      )}
    </div>
  );

  const renderFacturation = () => {
    const invoices = doneMissions.map((m, i) => ({
      ...m, numFacture: `FACT-${String(i + 1).padStart(4, "0")}`, dateFacture: fmtDate(m.createdAt),
      ht: (m.montant / 1.2).toFixed(2), tva: (m.montant - m.montant / 1.2).toFixed(2),
      ttc: m.montant.toFixed(2), statutFacture: "payée",
    }));
    return (
      <div>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.partnerFacturation}</div>
        <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.commissionReport}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: T.textMid, fontSize: 13 }}>{tr.moisCa}</span>
            <span style={{ fontWeight: 700 }}>{Math.round(caMois)} €</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: T.textMid, fontSize: 13 }}>{tr.kpiCommission} (5%)</span>
            <span style={{ fontWeight: 700, color: T.warn }}>{Math.round(commissionMois)} €</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(0,0,0,.08)", paddingTop: 8 }}>
            <span style={{ color: T.textHi, fontSize: 13, fontWeight: 700 }}>{tr.netReverse}</span>
            <span style={{ fontWeight: 800, color: T.success }}>{Math.round(caMois - commissionMois)} €</span>
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.textHi, marginBottom: 12 }}>{tr.invoicesEmitted}</div>
        {invoices.length === 0 && <div style={{ color: T.textMid, textAlign: "center", padding: 20 }}>{tr.noInvoice}</div>}
        {invoices.map(inv => (
          <div key={inv.id} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{inv.numFacture} — {inv.clientNom}</div>
                <div style={{ color: T.textMid, fontSize: 12 }}>{inv.dateFacture}</div>
                <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                  <span style={{ color: T.textLo, fontSize: 11 }}>HT : {inv.ht} €</span>
                  <span style={{ color: T.textLo, fontSize: 11 }}>TVA : {inv.tva} €</span>
                  <span style={{ fontWeight: 700, fontSize: 12, color: T.textHi }}>TTC : {inv.ttc} €</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <span className="lk-badge-ok" style={{ fontSize: 10 }}>{inv.statutFacture}</span>
                <button onClick={() => downloadInvoice(inv)} className="lk-ghost" style={{ fontSize: 11, padding: "5px 10px" }}>{tr.downloadBtn}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

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
              if (f) setDocs(p => p.map(x => x.id === d.id ? { ...x, file: f.name, statut: "en_attente" } : x));
            }} />
          </label>
        </div>
      ))}
    </div>
  );

  const renderStatistiques = () => {
    const months = ["Jan","Fév","Mar","Avr","Mai","Juin","Jul","Aoû","Sep","Oct","Nov","Déc"];
    const moisData = months.map((m, i) => ({ m, count: Math.floor(Math.random() * 8) + 1, ca: Math.floor(Math.random() * 2000) + 500 }));
    const maxCount = Math.max(...moisData.map(d => d.count), 1);
    return (
      <div>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.partnerStats}</div>
        <div className="lk-card" style={{ padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 14 }}>{tr.statsMissionsMonth}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
            {moisData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", background: T.grad, borderRadius: "4px 4px 0 0", height: `${(d.count / maxCount) * 80}px`, transition: "height .4s" }} title={`${d.count} missions`} />
                <div style={{ color: T.textLo, fontSize: 9 }}>{d.m}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="lk-desktop-2col">
          <div className="lk-card" style={{ padding: "16px 18px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.statsTopTechs}</div>
            {techs.filter(t => t.partenaireId === account.id).sort((a, b) => b.missions - a.missions).map(t => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: T.textMid, fontSize: 13 }}>{t.prenom} {t.nom}</span>
                <span style={{ fontWeight: 700, color: T.accent }}>{t.missions} missions</span>
              </div>
            ))}
          </div>
          <div className="lk-card" style={{ padding: "16px 18px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.statsIntervBreakdown}</div>
            {[["Serrurerie","55%",T.accent],["Plomberie","30%","#0ea5e9"],["Autre","15%",T.textLo]].map(([l, p, c]) => (
              <div key={l} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: T.textMid, fontSize: 12 }}>{l}</span>
                  <span style={{ fontWeight: 700, fontSize: 12, color: c }}>{p}</span>
                </div>
                <div style={{ height: 4, background: "rgba(0,0,0,.06)", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: p, background: c, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="lk-card" style={{ padding: "16px 18px", marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.statsAvgRating}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 36, color: T.accent }}>4.7</div>
            <div>
              <div style={{ color: "gold", fontSize: 20 }}>★★★★★</div>
              <div style={{ color: T.textMid, fontSize: 12 }}>{tr.statsBasedOn} {doneMissions.length} {tr.statsDoneMissions}</div>
            </div>
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
          <div style={{ width: 52, height: 52, background: T.grad, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20 }}>{account.nom.charAt(0)}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: T.textHi }}>{account.nom}</div>
            <div style={{ color: T.accent, fontSize: 12, fontWeight: 600 }}>{tr.partnerCertified}</div>
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
        ].map(([label, val, key]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label className="lk-label">{label}</label>
            <input className="lk-input" value={val || ""} onChange={e => setProfileEdit(p => ({ ...p, [key]: e.target.value }))} />
          </div>
        ))}
        <div style={{ marginBottom: 14 }}>
          <label className="lk-label">{tr.sectors}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["serrurier","plombier","electricien","chauffagiste"].map(s => (
              <button key={s} onClick={() => {
                const sects = profileEdit.secteurs || [];
                setProfileEdit(p => ({ ...p, secteurs: sects.includes(s) ? sects.filter(x => x !== s) : [...sects, s] }));
              }} style={{ padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${(profileEdit.secteurs || []).includes(s) ? T.accent : "rgba(0,0,0,.12)"}`, background: (profileEdit.secteurs || []).includes(s) ? "rgba(201,160,48,.08)" : "transparent", color: (profileEdit.secteurs || []).includes(s) ? T.accent : T.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setAccounts(p => p.map(a => a.id === account.id ? { ...a, ...profileEdit } : a))} className="lk-btn">{tr.saveProfile}</button>
      </div>
    </div>
  );

  const myRegion = account.ville || "Paris";
  const myBons = (bons || []).filter(b => b.postedBy === account.id);
  // Demandes clients sans artisan indépendant disponible : visibles aussi
  // côté entreprises partenaires, assignables à l'un de leurs techniciens.
  const openClientBons = (bons || []).filter(b => b.postedBy === "platform" && b.openPartner && (!b.region || b.region === myRegion));
  const posterBon = () => {
    const b = { id: uid(), ...newBon, montantEstime: parseFloat(newBon.montantEstime) || 100, postedBy: account.id, postedByNom: account.nom, region: myRegion, lat: 48.86, lng: 2.34, createdAt: ts(), openPlatform: true };
    setBons(p => [...p, b]);
    setBonModal(false);
    setNewBon({ titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: 35 });
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
            const matching = techs.filter(t => t.statut === "actif" && (!bon.metier || t.metier === bon.metier));
            return (
              <div key={bon.id} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10, borderLeft: `4px solid ${T.warn}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{bon.titre}</div>
                    <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{bon.adresse}</div>
                  </div>
                  <div style={{ color: T.accent, fontWeight: 800, fontSize: 15 }}>{fmtFrom(bon.montantEstime, lang)}</div>
                </div>
                {matching.length === 0 ? (
                  <div style={{ color: T.textLo, fontSize: 12 }}>{lang === "en" ? "No available technician for this trade." : "Aucun technicien disponible pour ce métier."}</div>
                ) : (
                  <select onChange={e => {
                    const techId = e.target.value;
                    if (!techId) return;
                    const tech = techs.find(t => t.id === techId);
                    const mission = {
                      id: uid(), partenaireId: account.id, clientNom: bon.clientNom || "Client LOCKR",
                      adresse: bon.adresse, probleme: bon.probleme, typeIntervention: bon.titre,
                      montant: bon.montantEstime, statut: "en_attente", commission: bon.montantEstime * 0.15,
                      netPartenaire: bon.montantEstime * 0.85, technicienId: tech.id, createdAt: ts(), note: null,
                    };
                    setMissions(p => [...p, mission]);
                    setBons(p => p.filter(b => b.id !== bon.id));
                    setTechs(p => p.map(t => t.id === tech.id ? { ...t, statut: "en_mission" } : t));
                  }} className="lk-input" defaultValue="" style={{ width: "100%" }}>
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
            <button onClick={() => setBons(p => p.filter(b => b.id !== bon.id))} className="lk-ghost" style={{ fontSize: 11, padding: "5px 10px", marginTop: 10, color: T.danger, borderColor: T.danger }}>{tr.deleteBonus}</button>
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
              <input type="range" min={20} max={70} value={newBon.techPct} onChange={e => setNewBon(p => ({ ...p, techPct: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: T.accent }} />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 20 }}>
              <input type="checkbox" id="bon-urgence" checked={newBon.urgence} onChange={e => setNewBon(p => ({ ...p, urgence: e.target.checked }))} style={{ accentColor: T.danger }} />
              <label htmlFor="bon-urgence" style={{ color: T.textMid, fontSize: 13, cursor: "pointer" }}>{tr.urgentIntervention}</label>
            </div>
            <button onClick={posterBon} className="lk-btn" style={{ marginBottom: 10 }}>{tr.publishBonus}</button>
            <button onClick={() => setBonModal(false)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
          </div>
        </div>, document.body
      )}
    </div>
  );

  /* ── Suivi GPS de la flotte ── */
  const renderFlotte = () => {
    const trackable = techs.filter(t => t.partenaireId === account.id);
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi }}>{tr.fleetTitle}</div>
          <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{tr.fleetSubtitle}</div>
        </div>
        {trackable.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: T.textLo }}>{tr.fleetNoTech}</div>
        ) : (
          <>
            <FleetMap techs={trackable} tr={tr} focusId={focusTech} />
            <div style={{ marginTop: 16 }}>
              {trackable.map(t => {
                const col = t.statut === "en_mission" ? T.accent : t.statut === "actif" ? T.success : T.textLo;
                const statusLabel = t.statut === "en_mission" ? tr.fleetOnMission : t.statut === "actif" ? tr.fleetOnline : tr.fleetOffline;
                const speed = t.statut === "en_mission" ? `${28 + (t.id.charCodeAt(t.id.length - 1) % 25)} km/h` : t.statut === "actif" ? `${(t.id.charCodeAt(t.id.length - 1) % 6)} km/h` : "—";
                return (
                  <div key={t.id} className="lk-card" style={{ padding: "14px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ position: "relative" }}>
                        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#fff", border: `3px solid ${col}`, display: "flex", alignItems: "center", justifyContent: "center", color: col, fontWeight: 800, fontSize: 14 }}>{t.prenom.charAt(0)}{t.nom.charAt(0)}</div>
                        <span style={{ position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: "50%", background: col, border: "2px solid #fff" }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{t.prenom} {t.nom}</div>
                        <div style={{ fontSize: 12, color: col, fontWeight: 600 }}>{statusLabel}</div>
                        <div style={{ fontSize: 11, color: T.textLo, marginTop: 2 }}>{tr.fleetSpeed} : {speed} · {tr.fleetLastUpdate} : {new Date().toLocaleTimeString(lang === "en" ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                    </div>
                    <button onClick={() => { setFocusTech(null); setTimeout(() => setFocusTech(t.id), 0); }} className="lk-ghost" style={{ fontSize: 11, padding: "6px 12px" }}>{Icon.pin(T.accent, 12)} {tr.fleetCenterOn}</button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  /* ── Gestion RH ── */
  const renderRH = () => {
    const myTechs = techs.filter(t => t.partenaireId === account.id);
    const days = lang === "en" ? ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] : ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
    const planFor = (t, d) => {
      const h = (t.id.charCodeAt(t.id.length - 1) + d) % 5;
      if (d >= 5) return { l: tr.rhDayOff, c: T.textLo, bg: "rgba(0,0,0,.04)" };
      if (h <= 1) return { l: tr.rhMissionDay, c: T.accent, bg: "rgba(201,160,48,.08)" };
      return { l: tr.rhAvailable, c: T.success, bg: "rgba(30,158,107,.07)" };
    };
    const hoursFor = (t) => 28 + (t.id.charCodeAt(t.id.length - 1) % 14);
    const payroll = myTechs.reduce((s, t) => s + 2400 + (t.missions * 12), 0);
    const expiring = docs.filter(d => d.expiry && new Date(d.expiry) < new Date(Date.now() + 90 * 86400000));
    return (
      <div>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textHi, marginBottom: 20 }}>{tr.rhTitle}</div>

        {/* Planning hebdo */}
        <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi }}>{tr.rhPlanning}</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ id: "day", l: lang === "en" ? "Week" : "Semaine" }, { id: "hour", l: lang === "en" ? "Hourly" : "Horaire" }].map(v => (
                <button key={v.id} onClick={() => setPlanningView(v.id)} style={{ border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", background: planningView === v.id ? T.accent : "rgba(0,0,0,.06)", color: planningView === v.id ? "#fff" : T.textMid }}>{v.l}</button>
              ))}
            </div>
          </div>

          {planningView === "day" && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
                <thead><tr>
                  <th style={{ textAlign: "left", fontSize: 11, color: T.textLo, padding: "4px 6px" }}></th>
                  {days.map(d => <th key={d} style={{ fontSize: 11, color: T.textLo, padding: "4px 6px" }}>{d}</th>)}
                </tr></thead>
                <tbody>
                  {myTechs.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontSize: 12, fontWeight: 700, color: T.textHi, padding: "5px 6px", whiteSpace: "nowrap" }}>{t.prenom}</td>
                      {days.map((_, d) => {
                        const p = planFor(t, d);
                        return <td key={d} style={{ padding: 3 }} onClick={() => { setPlanningView("hour"); setPlanningDay(d); }}><div style={{ background: p.bg, color: p.c, fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "5px 4px", textAlign: "center", cursor: "pointer" }}>{p.l}</div></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 10, color: T.textLo, marginTop: 8 }}>{lang === "en" ? "Tap a cell to see hourly view" : "Cliquez sur une cellule pour voir le détail horaire"}</div>
            </div>
          )}

          {planningView === "hour" && (() => {
            const HOURS = Array.from({ length: 11 }, (_, i) => i + 7); // 7h–17h
            const slotFor = (t, h) => {
              const seed = (t.id.charCodeAt(t.id.length - 1) + planningDay * 3 + h) % 7;
              if (planningDay >= 5) return { bg: "rgba(0,0,0,.03)", label: "—", color: T.textLo };
              if (h < 8) return { bg: "rgba(0,0,0,.03)", label: "—", color: T.textLo };
              if (h >= 17) return { bg: "rgba(0,0,0,.03)", label: "—", color: T.textLo };
              if (seed === 0) return { bg: "rgba(201,160,48,.12)", label: lang === "en" ? "Mission" : "Mission", color: T.accent };
              if (seed === 1) return { bg: "rgba(201,160,48,.12)", label: lang === "en" ? "Mission" : "Mission", color: T.accent };
              if (seed === 5) return { bg: "rgba(217,119,6,.08)", label: lang === "en" ? "Break" : "Pause", color: T.warn };
              return { bg: "rgba(30,158,107,.07)", label: lang === "en" ? "Available" : "Dispo", color: T.success };
            };
            return (
              <div>
                {/* Day selector */}
                <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto" }}>
                  {days.map((d, i) => (
                    <button key={i} onClick={() => setPlanningDay(i)} style={{ flex: "0 0 auto", border: "none", borderRadius: 8, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", background: planningDay === i ? T.accent : "rgba(0,0,0,.06)", color: planningDay === i ? "#fff" : T.textMid }}>{d}</button>
                  ))}
                </div>
                {/* Hourly grid */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: Math.max(360, myTechs.length * 90 + 50) }}>
                    <thead>
                      <tr>
                        <th style={{ fontSize: 10, color: T.textLo, padding: "3px 6px", textAlign: "left", width: 44 }}>Heure</th>
                        {myTechs.map(t => (
                          <th key={t.id} style={{ fontSize: 11, color: T.textHi, fontWeight: 700, padding: "3px 4px", textAlign: "center" }}>{t.prenom}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {HOURS.map(h => (
                        <tr key={h}>
                          <td style={{ fontSize: 10, color: T.textLo, padding: "2px 6px", fontWeight: 600, whiteSpace: "nowrap", borderRight: "1px solid rgba(0,0,0,.06)" }}>{String(h).padStart(2,"0")}h</td>
                          {myTechs.map(t => {
                            const s = slotFor(t, h);
                            return (
                              <td key={t.id} style={{ padding: 2 }}>
                                <div style={{ background: s.bg, color: s.color, fontSize: 9, fontWeight: 700, borderRadius: 5, padding: "4px 3px", textAlign: "center", minWidth: 54, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.label}</div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Legend */}
                <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                  {[
                    { bg: "rgba(201,160,48,.12)", color: T.accent, l: lang === "en" ? "Mission" : "Mission" },
                    { bg: "rgba(30,158,107,.07)", color: T.success, l: lang === "en" ? "Available" : "Disponible" },
                    { bg: "rgba(217,119,6,.08)", color: T.warn, l: lang === "en" ? "Break" : "Pause" },
                    { bg: "rgba(0,0,0,.03)", color: T.textLo, l: "—" },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: item.bg }} />
                      <span style={{ fontSize: 10, color: item.color, fontWeight: 600 }}>{item.l}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Congés */}
        <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.rhLeaves}</div>
          {leaves.filter(l => l.statut === "en_attente").length === 0 && <div style={{ color: T.textLo, fontSize: 13 }}>{tr.rhNoLeave}</div>}
          {leaves.filter(l => l.statut === "en_attente").map(l => {
            const t = myTechs.find(x => x.id === l.techId);
            return (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi }}>{t ? `${t.prenom} ${t.nom}` : l.techId}</div>
                  <div style={{ fontSize: 12, color: T.textMid }}>{l.dates} — {l.motif}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setLeaves(p => p.map(x => x.id === l.id ? { ...x, statut: "acceptée" } : x))} className="lk-btn" style={{ width: "auto", padding: "6px 12px", fontSize: 11 }}>{tr.rhApprove}</button>
                  <button onClick={() => setLeaves(p => p.map(x => x.id === l.id ? { ...x, statut: "refusée" } : x))} className="lk-ghost" style={{ fontSize: 11, padding: "6px 12px", color: T.danger, borderColor: T.danger }}>{tr.rhReject}</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="lk-desktop-2col">
          {/* Heures travaillées */}
          <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.rhHours}</div>
            {myTechs.map(t => {
              const h = hoursFor(t);
              return (
                <div key={t.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: T.textMid }}>{t.prenom} {t.nom}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: h > 38 ? T.warn : T.textHi }}>{h} h</span>
                  </div>
                  <div style={{ height: 5, background: "rgba(0,0,0,.06)", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (h / 42) * 100)}%`, background: h > 38 ? T.warn : T.success, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,.08)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textHi }}>{tr.rhPayroll}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>{payroll.toLocaleString("fr-FR")} €</span>
            </div>
          </div>

          {/* Primes */}
          <div className="lk-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.rhBonuses}</div>
            {primes.map(p => {
              const t = myTechs.find(x => x.id === p.techId);
              return (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
                  <span style={{ fontSize: 12, color: T.textMid }}>{t ? t.prenom : p.techId} — {p.motif}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.success }}>+{p.montant} €</span>
                </div>
              );
            })}
            <div style={{ marginTop: 12 }}>
              <select className="lk-input" value={primeForm.techId} onChange={e => setPrimeForm(p => ({ ...p, techId: e.target.value }))} style={{ marginBottom: 8, cursor: "pointer" }}>
                <option value="">—</option>
                {myTechs.map(t => <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>)}
              </select>
              <input type="number" className="lk-input" placeholder={tr.rhBonusAmount} value={primeForm.montant} onChange={e => setPrimeForm(p => ({ ...p, montant: e.target.value }))} style={{ marginBottom: 8 }} />
              <input className="lk-input" placeholder={tr.rhBonusReason} value={primeForm.motif} onChange={e => setPrimeForm(p => ({ ...p, motif: e.target.value }))} style={{ marginBottom: 8 }} />
              <button disabled={!primeForm.techId || !primeForm.montant} onClick={() => {
                setPrimes(p => [...p, { id: uid(), techId: primeForm.techId, montant: parseFloat(primeForm.montant), motif: primeForm.motif, date: new Date().toLocaleDateString("fr-FR") }]);
                setPrimeForm({ techId: "", montant: "", motif: "" });
              }} className="lk-btn" style={{ fontSize: 12, opacity: (!primeForm.techId || !primeForm.montant) ? .5 : 1 }}>{tr.rhAddBonus}</button>
            </div>
          </div>
        </div>

        {/* Alertes RH */}
        <div className="lk-card" style={{ padding: "16px 18px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.textHi, marginBottom: 12 }}>{tr.rhAlerts}</div>
          {expiring.length === 0 && <div style={{ color: T.textLo, fontSize: 13 }}>—</div>}
          {expiring.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
              {Icon.warning(T.warn, 15)}
              <span style={{ fontSize: 13, color: T.warn, fontWeight: 600 }}>{d.label} — {tr.rhDocExpiring} ({d.expiry})</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ── Abonnement Entreprise ── */
  const subBenefits = [tr.subBenefit1, tr.subBenefit2, tr.subBenefit3, tr.subBenefit4, tr.subBenefit5, tr.subBenefit6];
  const subscribe = (plan) => {
    const until = new Date(Date.now() + (plan === "annuel" ? 365 : 30) * 86400000);
    setSubscription({ plan, since: new Date().toLocaleDateString("fr-FR"), until: until.toLocaleDateString("fr-FR") });
    setTab("dashboard");
    alert(tr.subConfirmed);
  };
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
          <div style={{ fontSize: 13, color: T.textMid }}>{tr.subUntil} {subscription.until}</div>
          <button onClick={() => setSubscription(null)} className="lk-ghost" style={{ marginTop: 14, fontSize: 12, color: T.danger, borderColor: T.danger }}>{tr.subCancel}</button>
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
    if (!hasPartnerAccess && view !== "abonnement" && view !== "profil") return renderPaywall();
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
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex" }}>
      <style>{CSS}</style>

      {/* SIDEBAR DESKTOP */}
      {isDesktop && (
        <div style={{ width: 220, flexShrink: 0, height: "100vh", position: "sticky", top: 0, background: "#fff", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LockrWordmark height={20} />
            </div>
          </div>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.textHi, marginBottom: 2 }}>{account.nom}</div>
            <div style={{ color: T.accent, fontSize: 11, fontWeight: 600 }}>{tr.partnerCertified}</div>
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
            <button onClick={onLogout} className="lk-ghost" style={{ width: "100%", fontSize: 12 }}>{tr.logout}</button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!isDesktop && (
          <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LockrWordmark height={17} />
            </div>
            <div style={{ color: T.accent, fontSize: 11, fontWeight: 700 }}>{tr.partnerCertified}</div>
            <button onClick={onLogout} style={{ background: "none", border: "none", color: T.textMid, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.decoShort}</button>
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
        { h: "Article 5 — Avis et notations", p: "Les avis publiés font l'objet d'un contrôle conformément à l'article L.111-7-2 du Code de la consommation et à la norme sur les avis en ligne. Seuls les clients ayant effectivement bénéficié d'une prestation peuvent déposer un avis." },
        { h: "Article 6 — Responsabilité de la plateforme", p: "LOCKR est un intermédiaire technique de mise en relation et n'est PAS partie au contrat de prestation conclu entre le client et l'artisan. LOCKR met en œuvre tous les moyens raisonnables pour assurer la disponibilité du service et la vérification des professionnels référencés (SIRET, assurance RC Pro, qualifications), sans obligation de résultat. La responsabilité de LOCKR ne saurait être engagée au titre de l'exécution, de l'inexécution, de la mauvaise exécution ou des dommages de toute nature résultant de la prestation réalisée par l'artisan, qui en assume seul l'entière responsabilité." },
        { h: "Article 7 — Responsabilité des artisans et recours", p: "L'artisan intervient en qualité de professionnel indépendant, sous sa seule responsabilité. Il est seul responsable de la qualité, de la conformité, des délais et des dommages éventuels liés à ses interventions, couverts par son assurance RC Pro obligatoire (et garantie décennale le cas échéant). Toute réclamation, demande d'indemnisation ou action relative à une prestation doit être dirigée exclusivement contre l'artisan intervenant et son assureur, dont les coordonnées figurent sur le devis et la facture. En acceptant les présentes CGU, l'artisan s'engage à garantir et relever indemne LOCKR de toute condamnation, réclamation ou frais liés à ses interventions. Cette clause ne prive pas le consommateur de ses droits légaux à l'égard du professionnel prestataire." },
        { h: "Article 8 — Droit applicable et litiges", p: "Les présentes CGU sont soumises au droit français. En cas de litige, une solution amiable sera recherchée avant toute action judiciaire. Le consommateur peut recourir gratuitement au médiateur de la consommation (art. L.612-1 C. conso) ou à la plateforme européenne de règlement en ligne des litiges : ec.europa.eu/consumers/odr. L'acceptation des CGU lors de l'inscription est horodatée et conservée à titre de preuve (art. 1366-1367 C. civ. — écrit et signature électroniques)." },
      ],
    },
    {
      id: "cgv", tab: "CGV", title: "Conditions Générales de Vente",
      sub: "Code de la consommation — articles L.111-1, L.221-5 et suivants",
      articles: [
        { h: "Article 1 — Prix", p: "Tous les prix affichés sont exprimés en euros toutes taxes comprises (TTC), TVA française applicable. Les prix « À partir de » constituent des tarifs indicatifs minimums ; un devis précis est communiqué avant toute intervention. Aucune intervention n'est facturée sans accord préalable du client sur le prix (arrêté du 24 janvier 2017 relatif aux dépannages)." },
        { h: "Article 2 — Devis obligatoire", p: "Conformément à l'arrêté du 24 janvier 2017, un devis détaillé est obligatoire avant toute prestation de dépannage, réparation et entretien dans le bâtiment : taux horaire, frais de déplacement, pièces, durée estimée. Le devis est gratuit sauf mention contraire expresse." },
        { h: "Article 3 — Paiement", p: "Le paiement s'effectue en ligne de manière sécurisée (prestataire conforme PCI-DSS et DSP2 avec authentification forte 3-D Secure). Un acompte de 50 % est demandé à la réservation ; le solde est dû à l'issue de la prestation après validation du client." },
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
        { h: "Article 5 — Reviews", p: "Published reviews are moderated in accordance with article L.111-7-2 of the French Consumer Code. Only clients who actually received a service may post a review." },
        { h: "Article 6 — Platform liability", p: "LOCKR is a technical connecting intermediary and is NOT a party to the service contract concluded between the client and the craftsman. LOCKR uses all reasonable means to ensure service availability and verification of listed professionals (SIRET, liability insurance, qualifications), without an obligation of result. LOCKR shall not be liable for the performance, non-performance, poor performance or any damage resulting from the service carried out by the craftsman, who bears sole and full responsibility." },
        { h: "Article 7 — Craftsmen's liability and recourse", p: "The craftsman acts as an independent professional under his sole responsibility. He is solely liable for the quality, compliance, deadlines and any damage related to his interventions, covered by his mandatory professional liability insurance (and 10-year guarantee where applicable). Any claim, compensation request or action relating to a service must be directed exclusively against the intervening craftsman and his insurer, whose details appear on the quote and invoice. By accepting these Terms, the craftsman undertakes to indemnify and hold LOCKR harmless against any judgment, claim or costs related to his interventions. This clause does not deprive consumers of their statutory rights against the service provider." },
        { h: "Article 8 — Governing law and disputes", p: "These Terms are governed by French law. Consumers may use the free consumer mediation service (art. L.612-1) or the EU online dispute resolution platform: ec.europa.eu/consumers/odr. Acceptance of the Terms at registration is time-stamped and stored as evidence (art. 1366-1367 French Civil Code — electronic writing and signature)." },
      ],
    },
    {
      id: "cgv", tab: "Terms of Sale", title: "Terms of Sale",
      sub: "French Consumer Code — articles L.111-1, L.221-5 et seq.",
      articles: [
        { h: "Article 1 — Prices", p: "All prices are in euros, all taxes included (TTC). \"From\" prices are indicative minimums; a precise quote is provided before any intervention. No work is invoiced without the client's prior agreement on price (Order of 24 January 2017 on repair services)." },
        { h: "Article 2 — Mandatory quote", p: "In accordance with the Order of 24 January 2017, a detailed quote is mandatory before any building repair or maintenance service: hourly rate, travel costs, parts, estimated duration. Quotes are free unless expressly stated otherwise." },
        { h: "Article 3 — Payment", p: "Payment is made securely online (PCI-DSS compliant provider, PSD2 strong customer authentication / 3-D Secure). A 50% deposit is required at booking; the balance is due after completion and client validation." },
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
          <button onClick={() => save(false)} style={{ background: "none", border: "none", color: T.textLo, fontSize: 11, cursor: "pointer", fontFamily: "'Inter',sans-serif", flex: "0 0 auto", alignSelf: "center" }}>{tr.cookieRejectAll}</button>
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
  const tr = TRANS[lang] || TRANS.fr;
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
  const pros = accounts.filter(a => a.role === "pro" && a.dossierStatus !== "pending");
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
  const activeBons = bons.filter(b => b.postedBy === "platform");

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
    const saved = localStorage.getItem("lk_admin_digital_checks");
    return saved ? JSON.parse(saved) : {};
  });
  const toggle = (lawId, idx) => {
    setChecks(prev => {
      const key = `${lawId}_${idx}`;
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("lk_admin_digital_checks", JSON.stringify(next));
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

/* ─── ROOT ─── */
export default function App() {
  const [screen, setScreen] = useState("login");
  // Session persistante : reconnexion automatique (client, pro, partenaire, admin)
  const [account, setAccount] = useState(() => {
    try { return JSON.parse(localStorage.getItem("lk_session") || "null"); } catch { return null; }
  });
  const loginAs = (acc) => {
    setAccount(acc);
    try { localStorage.setItem("lk_session", JSON.stringify(acc)); } catch {}
  };
  const [bookings, setBookings] = useState(INIT_BOOKINGS);
  const [accounts, setAccounts] = useState(INIT_ACCOUNTS);
  const [bons, setBons] = useState(INIT_BONS);
  const [chatMessages, setChatMessages] = useState(INIT_CHAT);
  const [listings, setListings] = useState(INIT_LISTINGS);
  const [sales, setSales] = useState(INIT_SALES);
  const [interventionChats, setInterventionChats] = useState({});
  const [lang, setLang] = useState("fr");
  const [bannedList, setBannedList] = useState([]);
  // Ordre de priorité des techniciens (max 15) — défini par l'admin.
  // Chaque bon est proposé au 1er pendant 2 min, puis défile au suivant.
  const [priorityOrder, setPriorityOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem("lk_priority_order") || "[]"); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem("lk_priority_order", JSON.stringify(priorityOrder)); }, [priorityOrder]);
  const logout = () => { setAccount(null); localStorage.removeItem("lk_session"); setScreen("login"); };

  const [legalOpen, setLegalOpen] = useState(null); // null | id du document
  const [payReturn, setPayReturn] = useState(() => new URLSearchParams(window.location.search).get("paiement"));

  // Retour de la page de paiement Stripe
  useEffect(() => {
    if (payReturn) {
      window.history.replaceState({}, "", window.location.pathname);
      const t = setTimeout(() => setPayReturn(null), 6000);
      return () => clearTimeout(t);
    }
  }, [payReturn]);

  // Retour de l'onboarding Stripe Connect (virements automatiques artisan)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe_onboard") === "done") {
      const acct = params.get("acct");
      if (acct) localStorage.setItem("lk_stripe_acct", acct);
      localStorage.setItem("lk_stripe_onboard_done", "1");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const legalLinks = lang === "en"
    ? [{ id: "mentions", l: "Legal notice" }, { id: "cgu", l: "Terms" }, { id: "cgv", l: "Sales" }, { id: "privacy", l: "Privacy" }, { id: "cookies", l: "Cookies" }]
    : [{ id: "mentions", l: "Mentions légales" }, { id: "cgu", l: "CGU" }, { id: "cgv", l: "CGV" }, { id: "privacy", l: "Confidentialité" }, { id: "cookies", l: "Cookies" }];

  const wrapper = (children) => (
    <>
      {children}
      <CookieConsent lang={lang} />
      {payReturn && (
        <div style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 10000, background: payReturn === "succes" ? T.success : T.danger, color: "#fff", borderRadius: 12, padding: "12px 20px", fontSize: 13, fontWeight: 700, fontFamily: "'Inter',sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,.2)", display: "flex", alignItems: "center", gap: 8 }}>
          {payReturn === "succes"
            ? (lang === "en" ? "✓ Payment confirmed — thank you!" : "✓ Paiement confirmé — merci !")
            : (lang === "en" ? "Payment cancelled" : "Paiement annulé")}
        </div>
      )}
      {legalOpen && <LegalCenterModal lang={lang} initialTab={legalOpen} onClose={() => setLegalOpen(null)} />}
      {/* Liens légaux : uniquement sur les écrans de connexion/inscription —
          jamais dans les apps connectées (ils gênaient les barres de navigation).
          Une fois connecté, le Centre légal reste accessible depuis le profil. */}
      {!account && (
        <div style={{ position: "fixed", bottom: 4, right: 10, zIndex: 100, display: "flex", gap: 10, fontFamily: "'Inter',sans-serif" }}>
          {legalLinks.map(lk => (
            <span key={lk.id} onClick={() => setLegalOpen(lk.id)} style={{ fontSize: 9.5, color: "rgba(0,0,0,.3)", cursor: "pointer" }}>{lk.l}</span>
          ))}
        </div>
      )}
    </>
  );

  if (account) {
    if (account.role === "client") return wrapper(<ClientApp account={account} bookings={bookings} setBookings={setBookings} onLogout={logout} allAccounts={accounts} interventionChats={interventionChats} setInterventionChats={setInterventionChats} lang={lang} setLang={setLang} bons={bons} setBons={setBons} />);
    if (account.role === "pro") return wrapper(<ProApp account={account} bookings={bookings} setBookings={setBookings} accounts={accounts} setAccounts={setAccounts} bons={bons} setBons={setBons} chatMessages={chatMessages} setChatMessages={setChatMessages} interventionChats={interventionChats} setInterventionChats={setInterventionChats} listings={listings} setListings={setListings} sales={sales} setSales={setSales} onLogout={logout} lang={lang} setLang={setLang} priorityOrder={priorityOrder} />);
    if (account.role === "admin") return wrapper(<AdminApp account={account} bookings={bookings} setBookings={setBookings} accounts={accounts} setAccounts={setAccounts} bons={bons} setBons={setBons} listings={listings} sales={sales} onLogout={logout} lang={lang} setLang={setLang} bannedList={bannedList} setBannedList={setBannedList} priorityOrder={priorityOrder} setPriorityOrder={setPriorityOrder} />);
    if (account.role === "partenaire") return wrapper(<PartenaireApp account={account} setAccounts={setAccounts} bookings={bookings} setBookings={setBookings} bons={bons} setBons={setBons} onLogout={logout} lang={lang} setLang={setLang} listings={listings} setListings={setListings} sales={sales} setSales={setSales} />);
  }
  if (screen === "register-choice") return wrapper(<RegisterChoiceScreen onChoice={type => setScreen(type === "pro" ? "register-pro" : type === "entreprise" ? "register-entreprise" : "register-client")} onBack={() => setScreen("login")} lang={lang} />);
  if (screen === "register-client") return wrapper(<RegisterClientScreen onBack={() => setScreen("register-choice")} onSuccess={acc => { loginAs(acc); }} accounts={accounts} setAccounts={setAccounts} lang={lang} />);
  if (screen === "register-pro") return wrapper(<RegisterProScreen onBack={() => setScreen("register-choice")} onSuccess={acc => { loginAs(acc); }} accounts={accounts} setAccounts={setAccounts} lang={lang} />);
  if (screen === "register-entreprise") return wrapper(<RegisterEntrepriseScreen onBack={() => setScreen("register-choice")} onSuccess={acc => { loginAs(acc); }} accounts={accounts} setAccounts={setAccounts} lang={lang} />);
  return wrapper(<LoginScreen onLogin={(acc) => {
    const banned = bannedList.find(b => b.email === acc.email);
    if (banned) { alert((TRANS[lang] || TRANS.fr).accountBanned); return; }
    loginAs(acc);
  }} onRegister={() => setScreen("register-choice")} accounts={accounts} lang={lang} setLang={setLang} />);
}
