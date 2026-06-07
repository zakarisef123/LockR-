import { useState, useEffect, useRef, useCallback } from "react";

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
    noIntervention: "Aucune intervention",
    payInvoiceBtn: "Payer la facture",
    selectInterventionType: "Sélectionnez un type d'intervention",
    reserveBtn: "Réserver",
    // LoginScreen
    loginFeature1: "Artisans certifiés & vérifiés", loginFeature2: "Suivi GPS en temps réel", loginFeature3: "Intervention en moins de 30 min",
    wrongCredentials: "Email ou mot de passe incorrect", notVerified: "Compte non vérifié",
    loginTitle: "Connexion",
    // RegisterChoiceScreen
    chooseProfile: "Choisissez votre profil",
    clientDesc: "Trouvez un artisan qualifié rapidement. Suivi en temps réel de votre intervention.",
    getStarted: "Commencer",
    proDesc: "Recevez des missions près de chez vous. Gérez votre activité et vos revenus.",
    proDocsRequired: "Documents professionnels requis (SIRET, assurance, pièce d'identité)",
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
    noIntervention: "No intervention",
    payInvoiceBtn: "Pay invoice",
    selectInterventionType: "Select an intervention type",
    reserveBtn: "Book",
    // LoginScreen
    loginFeature1: "Certified & verified craftsmen", loginFeature2: "Real-time GPS tracking", loginFeature3: "Intervention in under 30 min",
    wrongCredentials: "Incorrect email or password", notVerified: "Account not verified",
    loginTitle: "Sign in",
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
  }
};

const T = {
  bg: "#f5f3ff", surface: "#ffffff", card: "#ffffff", border: "rgba(124,58,237,.1)",
  borderHi: "rgba(124,58,237,.45)", accent: "#7c3aed", accent2: "#a78bfa",
  success: "#1e9e6b", warn: "#d97706", danger: "#dc2626",
  textHi: "#1c1c1c", textMid: "rgba(28,28,28,.55)", textLo: "rgba(28,28,28,.38)",
  grad: "linear-gradient(135deg,#7c3aed,#5b21b6)", gradBtn: "linear-gradient(135deg,#7c3aed,#5b21b6)",
  gold: "#a78bfa",
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
  { id: "a1", nom: "Karim Benali", note: 4.9, avis: 127, tarif: 90, distance: 1.2, dispo: true, certif: "RGE Certifié", color: "#5b8def", tel: "0601020304", ville: "Paris", lat: 48.8566, lng: 2.3522, isDemo: true, transport: "voiture" },
  { id: "a2", nom: "Youssef Mrani", note: 4.7, avis: 89, tarif: 80, distance: 2.1, dispo: true, certif: "Qualibat", color: "#7b6ef6", tel: "0605060708", ville: "Paris", lat: 48.860, lng: 2.340, isDemo: true, transport: "scooter" },
  { id: "a3", nom: "Ahmed Tazi", note: 4.8, avis: 203, tarif: 95, distance: 3.4, dispo: false, certif: "Pro Certifié", color: "#3ecf8e", tel: "0609101112", ville: "Paris", lat: 48.850, lng: 2.360, isDemo: true, transport: "voiture" },
  { id: "a4", nom: "Thomas Leclerc", note: 4.6, avis: 54, tarif: 75, distance: 4.8, dispo: true, certif: "Artisan Agréé", color: "#f5a623", tel: "0612131415", ville: "Lyon", lat: 45.764, lng: 4.834, isDemo: true, transport: "scooter" },
];

const PROBLEMES = [
  { id: "ouverture", label: "Porte claquée", urgence: true, desc: "Ouverture sans destruction" },
  { id: "serrure", label: "Changer la serrure", urgence: false, desc: "Cylindre ou serrure multipoints" },
  { id: "blindage", label: "Blindage de porte", urgence: false, desc: "Renforcement anti-effraction" },
  { id: "digicode", label: "Badge / Digicode", urgence: false, desc: "Installation ou remplacement" },
  { id: "coffre", label: "Coffre-fort bloqué", urgence: true, desc: "Ouverture sans dommage" },
  { id: "autre", label: "Autre demande", urgence: false, desc: "Décrivez votre besoin" },
];

const INIT_ACCOUNTS = [
  { id: "c1", role: "client", nom: "Martin Dupont", email: "client@demo.fr", pass: "1234", verified: true, isDemo: true },
  { id: "c2", role: "client", nom: "Sophie Bernard", email: "sophie@demo.fr", pass: "1234", verified: true, isDemo: true },
  { id: "p1", role: "pro", artisanId: "a1", nom: "Karim Benali", email: "karim@demo.fr", pass: "1234", verified: true, photo: null, ville: "Paris", lat: 48.8566, lng: 2.3522, isDemo: true, dossierStatus: "approved" },
  { id: "p2", role: "pro", artisanId: "a2", nom: "Youssef Mrani", email: "youssef@demo.fr", pass: "1234", verified: true, photo: null, ville: "Paris", lat: 48.860, lng: 2.340, isDemo: true, dossierStatus: "approved" },
  { id: "admin1", role: "admin", nom: "Admin LOCKR", email: "admin@lockr.fr", pass: "admin2024", verified: true },
  { id: "admin2", role: "admin", nom: "Soze", email: "soze@lockr.fr", pass: "soze2024", verified: true },
  { id: "admin3", role: "admin", nom: "Emma", email: "emma@lockr.fr", pass: "emma2024", verified: true },
  { id: "admin4", role: "admin", nom: "Zakari", email: "zakari@lockr.fr", pass: "zakari2024", verified: true },
];

const INIT_BOOKINGS = [
  { id: "b0", clientId: "c1", artisanId: "a1", clientNom: "Martin Dupont", adresse: "12 rue de la Paix, Paris", probleme: "ouverture", montant: 130, statut: "terminée", montantFinal: 130, statutPaiement: "payé", createdAt: new Date(Date.now() - 86400000 * 5).toISOString(), bonType: "platform", factureImg: null, factureClient: null },
  { id: "b1", clientId: "c1", artisanId: "a1", clientNom: "Martin Dupont", adresse: "12 rue de la Paix, Paris", probleme: "serrure", montant: 95, statut: "terminée", montantFinal: 95, statutPaiement: "en_attente", createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), bonType: "platform", factureImg: null, factureClient: null },
  { id: "b2", clientId: "c2", artisanId: "a2", clientNom: "Sophie Bernard", adresse: "8 avenue Montaigne, Paris", probleme: "blindage", montant: 350, statut: "terminée", montantFinal: 350, statutPaiement: "payé", createdAt: new Date(Date.now() - 86400000 * 10).toISOString(), bonType: "platform", factureImg: null, factureClient: null },
];

const INIT_BONS = [
  { id: "bon1", titre: "Porte claquée urgence", adresse: "15 rue Lepic, Paris 18", probleme: "ouverture", urgence: true, montantEstime: 140, postedBy: "platform", postedByNom: "LOCKR", region: "Paris", lat: 48.884, lng: 2.337, createdAt: new Date(Date.now() - 3600000).toISOString(), techPct: 40 },
  { id: "bon2", titre: "Changement serrure 3 points", adresse: "42 bd Haussmann, Paris 9", probleme: "serrure", urgence: false, montantEstime: 190, postedBy: "p1", postedByNom: "Karim Benali", region: "Paris", lat: 48.874, lng: 2.330, createdAt: new Date(Date.now() - 7200000).toISOString(), techPct: 35 },
  { id: "bon3", titre: "Blindage porte appartement", adresse: "8 rue du Commerce, Lyon", probleme: "blindage", urgence: false, montantEstime: 420, postedBy: "platform", postedByNom: "LOCKR", region: "Lyon", lat: 45.750, lng: 4.830, createdAt: new Date(Date.now() - 14400000).toISOString(), techPct: 40 },
];

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
};

const PROB_ICONS = { ouverture: Icon.door, serrure: Icon.key, blindage: Icon.shield, coffre: Icon.safe, digicode: Icon.code, autre: Icon.tool };

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
@import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;background:#f5f3ff}
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
.lk-btn{background:linear-gradient(135deg,#7c3aed,#5b21b6);border:none;border-radius:12px;padding:14px 20px;color:#fff;font-weight:700;font-size:14px;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s;font-family:'Inter',sans-serif;box-shadow:0 2px 12px rgba(124,58,237,.35)}
.lk-btn:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(124,58,237,.45)}
.lk-btn:active{transform:translateY(0)}
.lk-btn:disabled{opacity:.4;cursor:not-allowed;transform:none!important}
.lk-ghost{background:#fff;border:1.5px solid rgba(124,58,237,.25);border-radius:10px;color:#5b21b6;font-size:13px;font-weight:600;cursor:pointer;padding:9px 14px;transition:all .15s;font-family:'Inter',sans-serif;box-shadow:0 2px 8px rgba(124,58,237,.1)}
.lk-ghost:hover{background:#faf5ff;border-color:rgba(124,58,237,.5);box-shadow:0 4px 14px rgba(124,58,237,.18)}
.lk-card{background:#ffffff;border:1.5px solid rgba(124,58,237,.15);border-radius:16px;transition:all .2s;box-shadow:0 4px 18px rgba(124,58,237,.1)}
.lk-card:hover{border-color:rgba(124,58,237,.38);box-shadow:0 6px 26px rgba(124,58,237,.18)}
.lk-input{width:100%;background:#f8f8f6;border:1px solid rgba(0,0,0,.12);border-radius:10px;color:#1c1c1c;font-size:14px;padding:12px 14px;outline:none;transition:border-color .15s;font-family:'Inter',sans-serif}
.lk-input:focus{border-color:rgba(124,58,237,.5);background:#ffffff;box-shadow:0 0 0 3px rgba(124,58,237,.12)}
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
  .lk-card:hover{transform:translateY(-2px);border-color:rgba(124,58,237,.38);box-shadow:0 8px 30px rgba(124,58,237,.2)}
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

/* ─── LIVE MAP ─── */
function LiveMap({ progress = 0, artisanColor = "#5b8def", compact = false, clientPos = null, artisanPos = null, onRouteReady = null }) {
  const mapRef = useRef(null);
  const L_ = useRef(null);
  const mapObj = useRef(null);
  const artMk = useRef(null);
  const donePoly = useRef(null);
  const routeCoords = useRef(null);
  const H = compact ? 210 : 300;

  useEffect(() => {
    if (!mapRef.current) return;
    let dead = false;
    (async () => {
      const L = await loadLeaflet();
      if (dead || !mapRef.current) return;
      L_.current = L;
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }

      // Positions client et artisan (coordonnées GPS réelles)
      const cLat = clientPos?.[0] ?? 48.8566;
      const cLng = clientPos?.[1] ?? 2.3522;
      const aLat = artisanPos?.[0] ?? (cLat + 0.015);
      const aLng = artisanPos?.[1] ?? (cLng + 0.015);

      const map = L.map(mapRef.current, { center: [cLat, cLng], zoom: 14, zoomControl: true, attributionControl: false });
      mapObj.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

      // Marqueur client
      L.marker([cLat, cLng], { icon: makeSvgIcon(L, false, "#3ecf8e", 40), zIndexOffset: 10 }).addTo(map);
      // Marqueur artisan
      artMk.current = L.marker([aLat, aLng], { icon: makeSvgIcon(L, true, artisanColor, 44), zIndexOffset: 20 }).addTo(map);

      // Tracé de route RÉEL via OSRM
      const route = await fetchRoute(aLat, aLng, cLat, cLng);
      if (dead) return;
      routeCoords.current = route.coords;
      if (onRouteReady) onRouteReady(route);

      // Route grisée (tout le trajet)
      L.polyline(route.coords, { color: "rgba(28,28,28,.12)", weight: 4, dashArray: "8 6" }).addTo(map);
      // Route effectuée (colorée)
      donePoly.current = L.polyline([], { color: artisanColor, weight: 5 }).addTo(map);

      map.fitBounds(L.latLngBounds([[aLat, aLng], [cLat, cLng]]), { padding: [44, 44] });
    })();
    return () => { dead = true; };
  }, [clientPos?.[0], clientPos?.[1], artisanPos?.[0], artisanPos?.[1]]);

  useEffect(() => {
    const c = routeCoords.current;
    if (!c || !artMk.current || !L_.current) return;
    const idx = Math.min(Math.floor(progress * (c.length - 1)), c.length - 1);
    const pos = c[idx];
    if (!pos) return;
    artMk.current.setLatLng(pos);
    donePoly.current?.setLatLngs(c.slice(0, idx + 1));
  }, [progress]);

  const eta = Math.max(0, Math.round((1 - progress) * 12));
  return (
    <div style={{ position: "relative", height: H, background: "#e8e8e4", overflow: "hidden" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 52, background: "linear-gradient(0deg,#f4f4f2,transparent)", pointerEvents: "none" }} />
      {progress < 0.97 && (
        <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,.92)", border: "1px solid rgba(0,0,0,.1)", borderRadius: 10, padding: "7px 12px", display: "flex", alignItems: "center", gap: 7, boxShadow: "0 2px 8px rgba(0,0,0,.12)" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#dc2626", animation: "blink 1.2s infinite" }} />
          <span style={{ color: "#1c1c1c", fontWeight: 700, fontSize: 12, letterSpacing: ".5px" }}>EN DIRECT</span>
          <span style={{ color: artisanColor, fontWeight: 800, fontSize: 13, marginLeft: 2 }}>{eta} min</span>
        </div>
      )}
      {progress >= 0.97 && (
        <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: "rgba(30,158,107,.12)", border: "1px solid rgba(30,158,107,.3)", borderRadius: 10, padding: "7px 14px", boxShadow: "0 2px 8px rgba(0,0,0,.1)" }}>
          <span style={{ color: "#1e9e6b", fontWeight: 700, fontSize: 13 }}>Artisan arrivé ✓</span>
        </div>
      )}
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
  { id: "stripe", label: "Carte / Stripe", abbr: "S", color: "#635bff", bg: "#f0efff" },
  { id: "apple", label: "Apple Pay", abbr: "A", color: "#e8e8e8", bg: "#f5f5f5" },
  { id: "google", label: "Google Pay", abbr: "G", color: "#4285f4", bg: "#eef4ff" },
  { id: "paypal", label: "PayPal", abbr: "PP", color: "#009cde", bg: "#e8f6ff" },
];
const fmtCard = v => v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
const fmtExp = v => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d; };

function PayModal({ amount, onClose, onDone, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [step, setStep] = useState("method");
  const [method, setMethod] = useState(null);
  const [card, setCard] = useState({ num: "", exp: "", cvv: "", nom: "" });
  const [err, setErr] = useState("");

  const pick = m => { setMethod(m); setStep(m.id === "stripe" ? "card" : "confirm"); };
  const payCard = () => {
    if (card.num.replace(/\s/g, "").length < 16) return setErr(tr.cardInvalid);
    if (card.exp.length < 5) return setErr(tr.expInvalid);
    if (card.cvv.length < 3) return setErr(tr.cvvInvalid);
    if (!card.nom) return setErr(tr.holderRequired);
    setErr(""); setStep("processing"); setTimeout(() => setStep("done"), 2000);
  };
  const payNow = () => { setStep("processing"); setTimeout(() => setStep("done"), 1600); };

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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {PAY_METHODS.map(m => (
                <button key={m.id} onClick={() => pick(m)} style={{ background: m.bg, border: "1px solid rgba(0,0,0,.06)", borderRadius: 14, padding: "14px 12px", cursor: "pointer", textAlign: "left", transition: "all .15s", fontFamily: "'Inter',sans-serif" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${m.color}18`, border: `1px solid ${m.color}30`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                    <span style={{ color: m.color, fontWeight: 800, fontSize: 13 }}>{m.abbr}</span>
                  </div>
                  <div style={{ color: T.textHi, fontSize: 13, fontWeight: 600 }}>{m.label}</div>
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
            <button onClick={() => setStep("method")} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>{Icon.back(T.accent, 14)} {tr.back}</button>
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
        {step === "confirm" && method && (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ width: 72, height: 72, background: `${method.color}12`, border: `1px solid ${method.color}30`, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <span style={{ color: method.color, fontWeight: 800, fontSize: 22 }}>{method.abbr}</span>
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
          <div style={{ width: 56, height: 56, background: "rgba(201,160,48,.15)", border: "1.5px solid rgba(201,160,48,.3)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            {Icon.lock("#c9a030", 26)}
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", marginBottom: 12 }}>LOCKR</div>
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
    return e;
  };

  const submit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrs(e); return; }
    const acc = { id: uid(), role: "client", nom: prenom + " " + nom, email, pass, verified: false, photo: null, ville, tel };
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
          <div style={{ width: 56, height: 56, background: "rgba(201,160,48,.15)", border: "1.5px solid rgba(201,160,48,.3)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            {Icon.lock("#c9a030", 26)}
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", marginBottom: 12 }}>LOCKR</div>
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
  const [siret, setSiret] = useState("");
  const [iban, setIban] = useState("");
  const [certif, setCertif] = useState("aucune");
  const [idCardFile, setIdCardFile] = useState(null);
  const [insuranceFile, setInsuranceFile] = useState(null);
  const [kbisFile, setKbisFile] = useState(null);
  const [errs, setErrs] = useState({});
  const [modal, setModal] = useState(false);
  const [pending, setPending] = useState(null);
  const idRef = useRef(null);
  const insRef = useRef(null);
  const kbisRef = useRef(null);

  const clr = k => setErrs(p => { const e = { ...p }; delete e[k]; return e; });

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
    if (!siret.replace(/\s/g, "").match(/^\d{14}$/)) e.siret = tr.siretInvalid;
    if (!idCardFile) e.idCard = tr.idCardRequired;
    if (!insuranceFile) e.insurance = tr.insuranceRequired;
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const goStep2 = () => { if (validateStep1()) setStep(2); };

  const submit = () => {
    if (!validateStep2()) return;
    const acc = {
      id: uid(), role: "pro", artisanId: "a" + uid(),
      nom: prenom + " " + nom, email, pass, verified: false,
      photo: null, ville, tel, transport, siret, iban, certif,
      hasIdCard: !!idCardFile, hasInsurance: !!insuranceFile, hasKbis: !!kbisFile, dossierStatus: "pending",
      dossierStatus: "pending",
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
          <div style={{ width: 56, height: 56, background: "rgba(201,160,48,.15)", border: "1.5px solid rgba(201,160,48,.3)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            {Icon.lock("#c9a030", 26)}
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", marginBottom: 12 }}>LOCKR</div>
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
              <input type="file" accept="image/*,.pdf" ref={idRef} onChange={e => { const f = e.target.files?.[0]; if (f) { setIdCardFile(f); clr("idCard"); } }} style={{ display: "none" }} />
              <button type="button" onClick={() => idRef.current?.click()} style={{ width: "100%", background: idCardFile ? "rgba(30,158,107,.06)" : "rgba(0,0,0,.02)", border: `1.5px dashed ${errs.idCard ? "rgba(220,38,38,.5)" : idCardFile ? "rgba(30,158,107,.4)" : "rgba(0,0,0,.15)"}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: "'Inter',sans-serif" }}>
                {idCardFile ? Icon.check(T.success, 18) : Icon.file(T.textLo, 18)}
                <span style={{ color: idCardFile ? T.success : T.textMid, fontSize: 13, fontWeight: 600 }}>
                  {idCardFile ? idCardFile.name : tr.uploadIdCard}
                </span>
              </button>
              {errs.idCard && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.idCard}</div>}
            </div>

            {/* Assurance RC Pro */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.insuranceLabel}</label>
              <input type="file" accept="image/*,.pdf" ref={insRef} onChange={e => { const f = e.target.files?.[0]; if (f) { setInsuranceFile(f); clr("insurance"); } }} style={{ display: "none" }} />
              <button type="button" onClick={() => insRef.current?.click()} style={{ width: "100%", background: insuranceFile ? "rgba(30,158,107,.06)" : "rgba(0,0,0,.02)", border: `1.5px dashed ${errs.insurance ? "rgba(220,38,38,.5)" : insuranceFile ? "rgba(30,158,107,.4)" : "rgba(0,0,0,.15)"}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: "'Inter',sans-serif" }}>
                {insuranceFile ? Icon.check(T.success, 18) : Icon.shield(T.textLo, 18)}
                <span style={{ color: insuranceFile ? T.success : T.textMid, fontSize: 13, fontWeight: 600 }}>
                  {insuranceFile ? insuranceFile.name : tr.uploadInsurance}
                </span>
              </button>
              {errs.insurance && <div style={{ color: T.danger, fontSize: 11, marginTop: 4 }}>{errs.insurance}</div>}
            </div>

            {/* Kbis (optionnel) */}
            <div style={{ marginBottom: 14 }}>
              <label className="lk-label">{tr.kbisLabel} <span style={{ color: T.textLo, fontWeight: 400, textTransform: "none" }}>({tr.optionalWord})</span></label>
              <input type="file" accept="image/*,.pdf" ref={kbisRef} onChange={e => { const f = e.target.files?.[0]; if (f) setKbisFile(f); }} style={{ display: "none" }} />
              <button type="button" onClick={() => kbisRef.current?.click()} style={{ width: "100%", background: kbisFile ? "rgba(30,158,107,.06)" : "rgba(0,0,0,.02)", border: `1.5px dashed ${kbisFile ? "rgba(30,158,107,.4)" : "rgba(0,0,0,.15)"}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: "'Inter',sans-serif" }}>
                {kbisFile ? Icon.check(T.success, 18) : Icon.file(T.textLo, 18)}
                <span style={{ color: kbisFile ? T.success : T.textMid, fontSize: 13, fontWeight: 600 }}>
                  {kbisFile ? kbisFile.name : tr.uploadKbis}
                </span>
              </button>
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
    : [{ email: "karim@demo.fr", label: "Karim B." }, { email: "youssef@demo.fr", label: "Youssef M." }];

  const login = () => {
    const adminAcc = accounts.find(a => a.email === email && a.pass === pass && a.role === "admin");
    if (adminAcc) return onLogin(adminAcc);
    const acc = accounts.find(a => a.email === email && a.pass === pass && a.role === tab);
    if (!acc) return setErr(tr.wrongCredentials);
    if (!acc.verified) return setErr(tr.notVerified);
    onLogin(acc);
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex" }}>
      <style>{CSS}</style>
      {isDesktop && (
        <div style={{ flex: 1, background: "linear-gradient(135deg,#1c1c1c 0%,#2e2e2e 60%,#1a1a1a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 48px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 30% 50%, rgba(201,160,48,.15) 0%, transparent 60%), radial-gradient(circle at 80% 80%, rgba(201,160,48,.08) 0%, transparent 50%)" }} />
          <div style={{ position: "relative", textAlign: "center", maxWidth: 360 }}>
            <div style={{ width: 72, height: 72, background: "rgba(201,160,48,.15)", border: "1.5px solid rgba(201,160,48,.3)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              {Icon.lock("#c9a030", 32)}
            </div>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#fff", letterSpacing: "-2px", marginBottom: 12 }}>LOCKR</div>
            <div style={{ color: "rgba(255,255,255,.55)", fontSize: 16, lineHeight: 1.7, marginBottom: 40 }}>{tr.appTagline}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[{ icon: Icon.shield, text: tr.loginFeature1 }, { icon: Icon.map, text: tr.loginFeature2 }, { icon: Icon.check, text: tr.loginFeature3 }].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, background: "rgba(201,160,48,.12)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {f.icon("rgba(201,160,48,.9)", 16)}
                  </div>
                  <span style={{ color: "rgba(255,255,255,.7)", fontSize: 14 }}>{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{ width: isDesktop ? 440 : "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: isDesktop ? "48px 40px" : "20px 18px", overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 390, animation: "fadeUp .45s ease" }}>
          {!isDesktop && (
            <div style={{ textAlign: "center", marginBottom: 42 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, background: T.grad, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.lock("#fff", 20)}</div>
                <span style={{ fontSize: 28, fontWeight: 800, color: T.textHi, letterSpacing: "-1.2px" }}>LOCKR</span>
              </div>
              <div style={{ color: T.textLo, fontSize: 14 }}>{tr.appTagline}</div>
            </div>
          )}
          {isDesktop && <div style={{ fontSize: 24, fontWeight: 800, color: T.textHi, marginBottom: 28, letterSpacing: "-.5px" }}>{tr.loginTitle}</div>}
          <div style={{ display: "flex", background: "rgba(0,0,0,.04)", borderRadius: 11, padding: 4, marginBottom: 22 }}>
            {[{ id: "client", label: tr.individual }, { id: "pro", label: tr.craftsman }].map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setEmail(""); setPass(""); setErr(""); }} style={{ flex: 1, border: "none", borderRadius: 9, padding: "10px 8px", cursor: "pointer", background: tab === t.id ? T.grad : "transparent", color: tab === t.id ? "#fff" : T.textLo, fontWeight: 600, fontSize: 12, transition: "all .2s", fontFamily: "'Inter',sans-serif" }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="lk-card" style={{ borderRadius: 16, padding: "24px 20px", marginBottom: 18 }}>
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
              {tab === "client" ? tr.findCraftsman : tr.myMissions} {Icon.arrow("#fff", 15)}
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
          <div style={{ background: "#fff", border: "1.5px solid rgba(124,58,237,.15)", borderRadius: 14, padding: "16px 18px", textAlign: "center", boxShadow: "0 2px 10px rgba(124,58,237,.08)" }}>
            <div style={{ color: T.textMid, fontSize: 13, marginBottom: 10 }}>{tr.notMember}</div>
            <button onClick={onRegister} className="lk-ghost" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {tr.freeAccount} {Icon.arrow(T.accent, 14)}
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
            <span style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{prob?.label || probleme}</span>
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
          <div style={{ color: T.textLo, fontSize: 13 }}>{prob?.label}</div>
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
                    <div style={{ color: T.textHi, fontSize: 13, fontWeight: 600 }}>{pr?.label || b.probleme}</div>
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
                <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{prob?.label} · {mission?.clientNom}</div>
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
function BonsScreen({ account, bons, setBons, bookings, setBookings, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const [postModal, setPostModal] = useState(false);
  const [rdvModal, setRdvModal] = useState(null);
  const [newBon, setNewBon] = useState({ titre: "", adresse: "", probleme: "ouverture", urgence: false, montantEstime: "", techPct: 35 });
  const [notif, setNotif] = useState(null);
  const myRegion = account.ville || "Paris";
  // Feature 9: sort by pro score
  const proScore = bookings.filter(b => b.artisanId === account.artisanId && b.statut === "terminée").length;
  const bonsRegion = bons.filter(b => b.region === myRegion).slice().sort((a, b) => {
    if (proScore >= 5) {
      if (a.urgence && !b.urgence) return -1;
      if (!a.urgence && b.urgence) return 1;
    }
    return 0;
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
        const isPlatform = bon.postedBy === "platform";
        const techEarn = bon.montantEstime * (bon.techPct / 100);
        const isRecommended = proScore >= 5 && bon.urgence;
        return (
          <div key={bon.id} className="lk-card" style={{ padding: "14px", marginBottom: 10, border: isRecommended ? `1.5px solid ${T.gold}` : undefined }}>
            <div style={{ display: "flex", gap: 6, marginBottom: bon.urgence || isRecommended ? 8 : 0, flexWrap: "wrap" }}>
              {bon.urgence && <div className="lk-tag-urgent" style={{ display: "inline-block" }}>URGENT</div>}
              {isRecommended && <div style={{ display: "inline-block", background: "rgba(201,160,48,.1)", border: "1px solid rgba(201,160,48,.3)", color: T.gold, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, letterSpacing: ".3px" }}>{tr.recommendedForYou}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(124,58,237,.1)", border: "1px solid rgba(124,58,237,.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>{IC(T.accent, 19)}</div>
                <div>
                  <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{bon.titre}</div>
                  <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{bon.adresse}</div>
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
            <button onClick={() => prendre(bon)} className="lk-btn" style={{ fontSize: 13, padding: "11px 16px" }}>{tr.acceptBonus} {Icon.arrow("#fff", 13)}</button>
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
                {PROBLEMES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
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
    </div>
  );
}

/* ─── EARNINGS CHART ─── */
function EarningsChart({ bookings, artisanId, lang = "fr" }) {
  const tr = TRANS[lang] || TRANS.fr;
  const done = bookings.filter(b => b.artisanId === artisanId && b.statut === "terminée");
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"][d.getMonth()] };
  });
  const data = months.map(m => {
    const total = done.filter(b => { const d = new Date(b.createdAt); return d.getFullYear() === m.year && d.getMonth() === m.month; }).reduce((s, b) => s + (b.montantFinal || 0) * 0.40, 0);
    return { ...m, value: total };
  });
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const thisMonth = data[data.length - 1];

  return (
    <div style={{ padding: "14px" }}>
      <div style={{ color: T.textHi, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{tr.earnings}</div>
      <div style={{ background: "rgba(62,207,142,.06)", border: "1px solid rgba(62,207,142,.15)", borderRadius: 14, padding: "16px", marginBottom: 20 }}>
        <div style={{ color: T.success, fontWeight: 800, fontSize: 28 }}>{fmt(thisMonth.value)}</div>
        <div style={{ color: T.textLo, fontSize: 12, marginTop: 4 }}>{tr.thisMonth}</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, marginBottom: 8 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
            <div style={{ width: "100%", height: `${Math.max((d.value / maxVal) * 100, 4)}%`, background: i === data.length - 1 ? "linear-gradient(180deg,#3ecf8e,#2aaf77)" : "linear-gradient(180deg,rgba(201,160,48,.6),rgba(201,160,48,.3))", borderRadius: "6px 6px 0 0" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {data.map((d, i) => <div key={i} style={{ flex: 1, textAlign: "center", color: i === data.length - 1 ? T.success : T.textLo, fontSize: 11 }}>{d.label}</div>)}
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

  const myBk = bookings.filter(b => b.artisanId === artisanId && (b.rdvDate || b.rdv2Date));

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
      return r1 === dateStr || r2 === dateStr;
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
                    <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{pr?.label || b.probleme}</div>
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
    </div>
  );
}

/* ─── PRO APP ─── */
function ProApp({ account, bookings, setBookings, accounts, setAccounts, bons, setBons, chatMessages, setChatMessages, interventionChats, setInterventionChats, onLogout, lang = "fr", setLang }) {
  const tr = TRANS[lang] || TRANS.fr;
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [tab, setTab] = useState("missions");
  const [activeMission, setActiveMission] = useState(null);
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
  const mediaRecRef = useRef(null);
  const audioChunks = useRef([]);
  const raf = useRef(null);
  const t0 = useRef(null);
  const JOURNEY = 38000;
  const artisan = DEMO_ARTISANS.find(a => a.id === account.artisanId);
  const myM = bookings.filter(b => b.artisanId === account.artisanId);
  const active = myM.filter(b => ["assignée", "en_route", "en_cours"].includes(b.statut));
  const done = myM.filter(b => b.statut === "terminée");
  const earnings = done.reduce((s, b) => s + (b.montantFinal ?? b.montant) * 0.40, 0);

  // Feature 2: payment block check (unpaid > 7 days)
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const hasPaymentBlock = done.some(b => b.statutPaiement === "en_attente" && new Date(b.createdAt).getTime() < sevenDaysAgo);

  const startMission = b => {
    // Feature 8: add rdvDate for immediate missions
    setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "en_cours", rdvDate: x.rdvDate || new Date().toISOString(), photoAvant } : x));
    setActiveMission(b);
    t0.current = Date.now();
    const run = () => { const t = Math.min((Date.now() - t0.current) / JOURNEY, 1); setProgress(t); if (t < 1) raf.current = requestAnimationFrame(run); };
    raf.current = requestAnimationFrame(run);
  };
  const finishMission = (montantFinal, factureImg, statutPaiement, acompte) => {
    setBookings(p => p.map(x => x.id === activeMission.id ? { ...x, statut: "terminée", montantFinal, factureImg, statutPaiement, photoApres, audioData: audioData || x.audioData } : x));
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

  const bk = activeMission ? (bookings.find(b => b.id === activeMission.id) || activeMission) : null;
  const prob = bk ? PROBLEMES.find(p => p.id === bk.probleme) : null;

  const acomptesPending = myM.filter(b => b.acompte > 0 && !b.acompteRecu && b.statut !== "terminée");

  const tabs = [
    { id: "missions", icon: Icon.list, l: tr.missions },
    { id: "active", icon: Icon.map, l: tr.inProgress },
    { id: "bons", icon: Icon.percent, l: tr.bonuses },
    { id: "calendar", icon: Icon.calendar, l: tr.calendarTab },
    { id: "stats", icon: Icon.chart, l: tr.stats },
    { id: "history", icon: Icon.hist, l: tr.history },
    { id: "profil", icon: Icon.user, l: tr.proProfile },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex" }}>
      <style>{CSS}</style>

      {/* SIDEBAR DESKTOP */}
      {isDesktop && (
        <div style={{ width: 220, flexShrink: 0, height: "100vh", position: "sticky", top: 0, background: "#fff", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {/* Logo */}
          <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, background: T.grad, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.lock("#fff", 14)}</div>
              <span style={{ fontWeight: 800, fontSize: 16, color: T.textHi, letterSpacing: "-.5px" }}>LOCKR</span>
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
                  {t.id === "missions" && acomptesPending.length > 0 && (
                    <div style={{ position: "absolute", top: -4, right: -5, width: 8, height: 8, borderRadius: "50%", background: T.warn, border: "1.5px solid #fff" }} />
                  )}
                </div>
                <span style={{ color: tab === t.id ? T.accent : T.textMid, fontWeight: tab === t.id ? 700 : 500, fontSize: 13 }}>{t.l}</span>
                {t.id === "missions" && acomptesPending.length > 0 && (
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
                <button onClick={onLogout} className="lk-ghost" style={{ padding: "6px 10px" }}>{Icon.sign()}</button>
              </div>
            </div>
          </div>
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
                {t.id === "missions" && acomptesPending.length > 0 && (
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
              {setLang && <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: T.textMid, fontFamily: "'Inter',sans-serif" }}>{tr.lang}</button>}
              <div style={{ color: T.success, fontWeight: 700, fontSize: 14 }}>{fmt(earnings)} {tr.earned}</div>
            </div>
          </div>
        )}
        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", maxWidth: isDesktop ? 900 : undefined, width: "100%", margin: isDesktop ? "0 auto" : undefined }}>
          {tab === "missions" && (
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
                          <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14 }}>{pr?.label}</div>
                          <div style={{ color: T.textLo, fontSize: 12 }}>{b.clientNom} · {fmtDate(b.createdAt)}</div>
                        </div>
                      </div>
                      <div style={{ color: T.accent, fontWeight: 800, fontSize: 17 }}>{fmt(b.montant)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1, background: T.bg, borderRadius: 8, padding: "7px 10px", display: "flex", alignItems: "center", gap: 6 }}>{Icon.pin(T.textLo, 12)}<span style={{ color: T.textLo, fontSize: 12 }}>{b.adresse}</span></div>
                      <div style={{ background: "rgba(62,207,142,.06)", borderRadius: 8, padding: "7px 10px", display: "flex", alignItems: "center", gap: 6 }}>{Icon.euro(T.success, 12)}<span style={{ color: T.success, fontSize: 12, fontWeight: 600 }}>{fmt(b.montant * 0.40)}</span></div>
                    </div>
                    {b.rdvDate && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <div style={{ background: "rgba(201,160,48,.07)", border: "1px solid rgba(201,160,48,.2)", borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                          {Icon.calendar(T.gold, 12)}
                          <span style={{ color: T.gold, fontSize: 11, fontWeight: 600 }}>{new Date(b.rdvDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB")} {new Date(b.rdvDate).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        {b.acompte > 0 && !b.acompteRecu && (
                          <div style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.2)", borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                            {Icon.euro(T.warn, 11)}
                            <span style={{ color: T.warn, fontSize: 11, fontWeight: 600 }}>{tr.acompteNotif} {fmt(b.acompte)}</span>
                          </div>
                        )}
                        {b.acompte > 0 && b.acompteRecu && (
                          <div style={{ background: "rgba(30,158,107,.07)", borderRadius: 8, padding: "5px 10px" }}>
                            <span style={{ color: T.success, fontSize: 11, fontWeight: 600 }}>{tr.acompteReceived}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      {!isActive ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => startMission(b)} className="lk-btn" style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>{tr.start}</button>
                            <button onClick={() => setChatMission(b)} style={{ padding: "10px 12px", background: "rgba(201,160,48,.08)", border: "1px solid rgba(201,160,48,.25)", borderRadius: 10, color: T.gold, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                              {Icon.chat(T.gold, 13)} Chat
                            </button>
                            <button onClick={() => setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "terminée", montantFinal: b.montant, statutPaiement: "en_attente" } : x))} className="lk-ghost" style={{ padding: "10px 16px" }}>{tr.refuse}</button>
                          </div>
                          {b.acompte > 0 && !b.acompteRecu && (
                            <button onClick={() => setBookings(p => p.map(x => x.id === b.id ? { ...x, acompteRecu: true } : x))} style={{ width: "100%", background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.25)", borderRadius: 10, padding: "9px", color: T.warn, fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
                              {Icon.check(T.warn, 13)} {tr.markAcompte} ({fmt(b.acompte)})
                            </button>
                          )}
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
          {tab === "active" && (
            <div style={{ padding: "14px" }}>
              {/* Feature 1: Photo avant — before starting mission */}
              {!activeMission && active.length > 0 && (
                <div className="lk-card" style={{ padding: "14px", marginBottom: 14 }}>
                  <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{tr.photoAvant}</div>
                  <input ref={photoAvantRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhotoAvant} />
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
                    <LiveMap progress={progress} artisanColor={artisan?.color || T.accent} compact artisanPos={artisan ? [artisan.lat, artisan.lng] : null} />
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
                  {/* Feature 5: Audio recording */}
                  <div className="lk-card" style={{ padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ color: T.textMid, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{tr.recordDiscussion}</div>
                    {!audioData ? (
                      <button onClick={recording ? stopRecording : startRecording} style={{ width: "100%", background: recording ? "rgba(220,38,38,.08)" : "rgba(0,0,0,.03)", border: `1px solid ${recording ? "rgba(220,38,38,.25)" : "rgba(0,0,0,.1)"}`, borderRadius: 10, padding: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: recording ? T.danger : T.textMid, fontWeight: 600, fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: recording ? T.danger : T.textLo, animation: recording ? "blink 1s infinite" : "none" }} />
                        {recording ? tr.stopRecording : tr.startRecording}
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {Icon.check(T.success, 14)}
                          <span style={{ color: T.success, fontSize: 12, fontWeight: 600 }}>{tr.audioRecorded}</span>
                        </div>
                        <audio controls src={audioData} style={{ width: "100%" }} />
                      </div>
                    )}
                  </div>
                  {/* Feature 1: Photo après */}
                  <div className="lk-card" style={{ padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ color: T.textMid, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{tr.photoApres}</div>
                    <input ref={photoApresRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhotoApres} />
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
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <a href="tel:0600000000" className="lk-ghost" style={{ flex: 1, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px" }}>{Icon.phone(T.success, 15)} {tr.callArtisan}</a>
                    <button onClick={() => setClotureModal(true)} style={{ flex: 2, background: "linear-gradient(135deg,#2aaf77,#1d8f5f)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
                      {Icon.check("#fff", 15)} {tr.closeAndInvoice}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {tab === "bons" && (hasPaymentBlock ? (
            <div style={{ padding: "14px" }}>
              <div style={{ background: "rgba(220,38,38,.07)", border: "1px solid rgba(220,38,38,.2)", borderRadius: 14, padding: "20px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                {Icon.warning(T.danger, 22)}
                <div>
                  <div style={{ color: T.danger, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{tr.paymentBlockTitle}</div>
                  <div style={{ color: T.danger, fontSize: 13, opacity: .8, lineHeight: 1.5 }}>{tr.paymentBlockMsg}</div>
                </div>
              </div>
            </div>
          ) : <BonsScreen account={account} bons={bons} setBons={setBons} bookings={bookings} setBookings={setBookings} lang={lang} />)}
          {tab === "profil" && <ProProfileTab account={account} setAccounts={setAccounts} bookings={bookings} lang={lang} />}
          {tab === "calendar" && <CalendarScreen bookings={bookings} artisanId={account.artisanId} lang={lang} />}
          {tab === "stats" && <div style={{ overflowY: "auto" }}><EarningsChart bookings={bookings} artisanId={account.artisanId} lang={lang} /></div>}
          {tab === "history" && (
            <div style={{ padding: "14px" }}>
              <button onClick={() => setMonthlyModal(true)} style={{ width: "100%", background: T.grad, border: "none", borderRadius: 12, padding: "12px 16px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16, fontFamily: "'Inter',sans-serif" }}>
                {Icon.file("#fff", 15)} {tr.downloadMonthlyReport}
              </button>
              {done.length === 0 && <div style={{ textAlign: "center", padding: "52px 20px", color: T.textLo, fontSize: 14 }}>{tr.noCompletedMission}</div>}
              {done.map(b => {
                const isPaid = b.statutPaiement === "payé";
                const pr = PROBLEMES.find(p => p.id === b.probleme);
                return (
                  <div key={b.id} className="lk-card" style={{ padding: "14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pr?.label}</div>
                        <div style={{ color: T.textLo, fontSize: 11 }}>{b.clientNom} · {fmtDate(b.createdAt)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: isPaid ? T.success : T.warn, fontWeight: 700, fontSize: 15 }}>{fmt((b.montantFinal || 0) * 0.40)}</div>
                        <div style={{ color: T.textLo, fontSize: 10 }}>{isPaid ? tr.paid : tr.pending}</div>
                      </div>
                    </div>
                    {!isPaid && (
                      <button onClick={() => setBookings(p => p.map(x => x.id === b.id ? { ...x, statutPaiement: "payé", payeLe: ts() } : x))} style={{ width: "100%", background: "rgba(245,166,35,.08)", border: "1px solid rgba(245,166,35,.2)", borderRadius: 10, padding: "9px", color: T.warn, fontWeight: 600, fontSize: 12, cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Inter',sans-serif" }}>
                        {Icon.check(T.warn, 12)} {tr.markAsPaid}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {clotureModal && activeMission && <ClotureModal mission={bookings.find(b => b.id === activeMission.id) || activeMission} artisan={artisan} onConfirm={finishMission} onCancel={() => setClotureModal(false)} lang={lang} />}
      {chatMission && <ChatIntervention bookingId={chatMission.id} account={account} interventionChats={interventionChats} setInterventionChats={setInterventionChats} otherNom={chatMission.clientNom} onClose={() => setChatMission(null)} lang={lang} />}
      {monthlyModal && <MonthlyReportModal bookings={bookings} artisanId={account.artisanId} lang={lang} onClose={() => setMonthlyModal(false)} />}
    </div>
  );
}

/* ─── CLIENT APP ─── */
function ClientApp({ account, bookings, setBookings, onLogout, allAccounts, interventionChats, setInterventionChats, lang = "fr", setLang }) {
  const tr = TRANS[lang] || TRANS.fr;
  const w = useWindowSize();
  const isDesktop = w >= BP;
  const [screen, setScreen] = useState("home");
  const [selProb, setSelProb] = useState(null);
  const [selArt, setSelArt] = useState(null);
  const [activeBk, setActiveBk] = useState(null);
  const [progress, setProgress] = useState(0);
  const [payModal, setPayModal] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [showChat, setShowChat] = useState(false);
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
  // Feature 6: satisfaction modal
  const [satisfactionBk, setSatisfactionBk] = useState(null);
  // Position GPS réelle de l'artisan (depuis son compte pro)
  const [artisanGpsPos, setArtisanGpsPos] = useState(null);
  const raf = useRef(null);
  const t0 = useRef(null);
  const { pos: clientPos, loading: geoLoading } = useGeoloc();
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
  const artisanList = getArtisanList();

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
  };

  const stMap = { assignée: { l: tr.statusAssigned, c: T.accent }, en_route: { l: tr.statusEnRoute, c: T.accent2 }, terminée: { l: tr.statusDone, c: T.success }, en_cours: { l: tr.statusInProgress, c: T.warn } };

  // Feature 6: check if any booking needs satisfaction rating
  useEffect(() => {
    const pending = myBk.find(b => b.statut === "terminée" && !b.satisfactionDone);
    if (pending && !satisfactionBk) setSatisfactionBk(pending);
  }, [myBk.length]);

  const _modals = (
    <>
      {devisModal && selArt && selProb && pendingBookData && (
        <DevisModal artisan={selArt} probleme={selProb.id} montant={pendingBookData.montant} onAccept={confirmBookAfterDevis} onCancel={() => { setDevisModal(false); setPendingBookData(null); }} lang={lang} />
      )}
      {acompteModal && pendingBookData && (
        <PayModal amount={pendingBookData.montant * 0.5} onClose={() => { setAcompteModal(false); setPendingBookData(null); }} onDone={confirmBookAfterAcompte} lang={lang} />
      )}
      {satisfactionBk && (
        <SatisfactionModal booking={satisfactionBk} lang={lang}
          onSubmit={(note, comment) => { setBookings(p => p.map(b => b.id === satisfactionBk.id ? { ...b, satisfactionNote: note, satisfactionComment: comment, satisfactionDone: true } : b)); setSatisfactionBk(null); }}
          onClose={() => { setBookings(p => p.map(b => b.id === satisfactionBk.id ? { ...b, satisfactionDone: true } : b)); setSatisfactionBk(null); }}
        />
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
            <button onClick={() => setProfileModal(false)} className="lk-ghost" style={{ width: "100%" }}>{tr.cancel}</button>
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
                <div style={{ color: T.textLo, fontSize: 13, marginBottom: 16 }}>{PROBLEMES.find(p => p.id === litigeModal.probleme)?.label} · {litigeModal.clientNom}</div>
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
    </>
  );

  if (screen === "home") return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ background: "rgba(255,255,255,.95)", backdropFilter: "blur(20px)", padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, background: T.grad, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.lock("#fff", 13)}</div>
          <span style={{ fontSize: 17, fontWeight: 800, color: T.textHi, letterSpacing: "-.5px" }}>LOCKR</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {clientPos && <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(30,158,107,.08)", border: "1px solid rgba(30,158,107,.15)", borderRadius: 20, padding: "4px 10px" }}>{Icon.pin(T.success, 11)}<span style={{ color: T.success, fontSize: 11, fontWeight: 600 }}>{tr.gpsActive}</span></div>}
          {setLang && <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} style={{ background: "none", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: T.textMid, fontFamily: "'Inter',sans-serif" }}>{tr.lang}</button>}
          <button onClick={() => setProfileModal(true)} style={{ background: "none", border: "1px solid rgba(124,58,237,.2)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", display: "flex", alignItems: "center", color: T.accent, fontFamily: "'Inter',sans-serif" }}>{Icon.user(T.accent, 15)}</button>
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
            <div style={{ background: "linear-gradient(135deg,rgba(124,58,237,.08),rgba(91,33,182,.05))", border: "1.5px solid rgba(124,58,237,.2)", borderRadius: 20, padding: "22px 20px", marginBottom: 22 }}>
              <div style={{ color: T.textMid, fontSize: 12, marginBottom: 8 }}>{tr.helloUser} {account.nom.split(" ")[0]} 👋</div>
              <div style={{ color: T.textHi, fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>{tr.whatNeed}</div>
              <button onClick={() => setScreen("choose")} className="lk-btn" style={{ display: "flex", alignItems: "center", gap: 8 }}>{tr.findCraftsman} {Icon.arrow("#fff", 14)}</button>
            </div>
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.quickInterventions}</div>
              <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(3,1fr)" : "1fr 1fr", gap: 10 }}>
                {PROBLEMES.slice(0, isDesktop ? 6 : 4).map(p => { const IC = PROB_ICONS[p.id]; return (
                  <button key={p.id} onClick={() => { setSelProb(p); setScreen("choose"); }} className="lk-card" style={{ borderRadius: 14, padding: "14px", cursor: "pointer", textAlign: "left", fontFamily: "'Inter',sans-serif", background: "#fff" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(124,58,237,.1)", border: "1px solid rgba(124,58,237,.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>{IC ? IC(T.accent, 18) : null}</div>
                    <div style={{ color: T.textHi, fontWeight: 600, fontSize: 12 }}>{p.label}</div>
                    {p.urgence && <div className="lk-tag-urgent" style={{ display: "inline-block", marginTop: 4 }}>URGENT</div>}
                  </button>
                ); })}
              </div>
            </div>
            {/* Mes interventions — mobile only dans la colonne principale */}
            {!isDesktop && myBk.length > 0 && (
              <>
                <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.myInterventions}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {myBk.slice(-3).reverse().map(b => {
                    const a = artOf(b), pr = PROBLEMES.find(p => p.id === b.probleme), st = stMap[b.statut] || { l: b.statut, c: T.textLo };
                    const hasLitige = litiges.find(l => l.bookingId === b.id);
                    return (
                      <div key={b.id} style={{ background: "#fff", border: "1.5px solid rgba(124,58,237,.15)", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 10px rgba(124,58,237,.08)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: (b.statut === "assignée" || (b.statut === "terminée" && !hasLitige)) ? 8 : 0 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(201,160,48,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.tool(T.accent, 14)}</div>
                            <div>
                              <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pr?.label}</div>
                              <div style={{ color: T.textLo, fontSize: 11 }}>{a?.nom} · {fmtDate(b.createdAt)}</div>
                            </div>
                          </div>
                          <span style={{ color: st.c, fontSize: 12, fontWeight: 600 }}>{st.l}</span>
                        </div>
                        {b.statut === "assignée" && (
                          <button onClick={() => setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "annulée" } : x))} style={{ width: "100%", background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 8, padding: "7px", color: T.danger, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.cancelBooking}</button>
                        )}
                        {b.statut === "terminée" && !hasLitige && (
                          <button onClick={() => { setLitigeModal(b); setLitigeText(""); setLitigeSubmitted(false); }} style={{ width: "100%", background: "rgba(217,119,6,.06)", border: "1px solid rgba(217,119,6,.15)", borderRadius: 8, padding: "7px", color: T.warn, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.openLitige}</button>
                        )}
                        {b.statut === "terminée" && hasLitige && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>{Icon.check(T.success, 12)}<span style={{ color: T.success, fontSize: 11, fontWeight: 600 }}>Litige ouvert</span></div>
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
                    <div key={b.id} style={{ background: "#fff", border: "1.5px solid rgba(124,58,237,.15)", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 10px rgba(124,58,237,.08)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: (b.statut === "assignée" || (b.statut === "terminée" && !hasLitige)) ? 8 : 0 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(201,160,48,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.tool(T.accent, 14)}</div>
                          <div>
                            <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pr?.label}</div>
                            <div style={{ color: T.textLo, fontSize: 11 }}>{a?.nom} · {fmtDate(b.createdAt)}</div>
                          </div>
                        </div>
                        <span style={{ color: st.c, fontSize: 12, fontWeight: 600 }}>{st.l}</span>
                      </div>
                      {b.statut === "assignée" && (
                        <button onClick={() => setBookings(p => p.map(x => x.id === b.id ? { ...x, statut: "annulée" } : x))} style={{ width: "100%", background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: 8, padding: "7px", color: T.danger, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.cancelBooking}</button>
                      )}
                      {b.statut === "terminée" && !hasLitige && (
                        <button onClick={() => { setLitigeModal(b); setLitigeText(""); setLitigeSubmitted(false); }} style={{ width: "100%", background: "rgba(217,119,6,.06)", border: "1px solid rgba(217,119,6,.15)", borderRadius: 8, padding: "7px", color: T.warn, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{tr.openLitige}</button>
                      )}
                      {b.statut === "terminée" && hasLitige && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{Icon.check(T.success, 12)}<span style={{ color: T.success, fontSize: 11, fontWeight: 600 }}>{tr.litigeSubmitted.split("—")[0].trim()}</span></div>
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
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", paddingBottom: 90 }}>
      <style>{CSS}</style>
      <div style={{ background: "rgba(255,255,255,.95)", backdropFilter: "blur(20px)", padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => { setSelProb(null); setScreen("home"); }} className="lk-ghost" style={{ padding: "8px 11px" }}>{Icon.back()}</button>
        <span style={{ color: T.textHi, fontWeight: 700 }}>{tr.newRequest}</span>
      </div>
      <div style={{ padding: isDesktop ? "28px 32px" : "18px 14px", maxWidth: isDesktop ? 1100 : undefined, margin: isDesktop ? "0 auto" : undefined }}>
        <div style={{ display: isDesktop ? "grid" : "block", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          {/* Colonne gauche : sélection du problème */}
          <div>
            <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{tr.interventionType}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
              {PROBLEMES.map(p => { const IC = PROB_ICONS[p.id]; return (
                <button key={p.id} onClick={() => setSelProb(p)} style={{ background: selProb?.id === p.id ? "linear-gradient(135deg,#f5f3ff,#ede9fe)" : "#ffffff", border: `1.5px solid ${selProb?.id === p.id ? T.accent : "rgba(124,58,237,.18)"}`, borderRadius: 14, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left", fontFamily: "'Inter',sans-serif", boxShadow: selProb?.id === p.id ? "0 4px 16px rgba(124,58,237,.2)" : "0 2px 8px rgba(124,58,237,.07)", transition: "all .15s" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: selProb?.id === p.id ? "rgba(124,58,237,.12)" : "rgba(124,58,237,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>{IC ? IC(selProb?.id === p.id ? T.accent : T.accent, 18) : null}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.textHi, fontWeight: 600, fontSize: 14 }}>{p.label}</div>
                    <div style={{ color: T.textLo, fontSize: 12, marginTop: 2 }}>{p.desc}</div>
                  </div>
                  {p.urgence && <span className="lk-tag-urgent">URGENT</span>}
                  {selProb?.id === p.id && Icon.check(T.accent, 16)}
                </button>
              ); })}
            </div>
          </div>
          {/* Colonne droite : liste artisans */}
          <div>
            {selProb && (
              <div style={{ animation: "fadeUp .25s ease" }}>
                <div style={{ color: T.textHi, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                  {tr.availableCraftsmen}
                  {artisanList.length === 0 && <span style={{ color: T.textLo, fontWeight: 400, fontSize: 12, marginLeft: 8 }}>{tr.noAvailable}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {artisanList.map(a => (
                    <div key={a.id} onClick={() => a.dispo && setSelArt(a)} style={{ background: selArt?.id === a.id ? "linear-gradient(135deg,#f5f3ff,#ede9fe)" : "#ffffff", border: `1.5px solid ${selArt?.id === a.id ? T.accent : "rgba(124,58,237,.18)"}`, borderRadius: 16, padding: "14px 16px", cursor: a.dispo ? "pointer" : "not-allowed", opacity: a.dispo ? 1 : .5, transition: "all .15s", boxShadow: selArt?.id === a.id ? "0 4px 16px rgba(124,58,237,.2)" : "0 2px 8px rgba(124,58,237,.07)" }}>
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
                            {a.avis > 0 && <span style={{ color: T.textLo, fontSize: 11 }}>{a.note}★ · {a.avis} {tr.reviews}</span>}
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
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "rgba(255,255,255,.95)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => setScreen("home")} className="lk-ghost" style={{ padding: "8px 11px" }}>{Icon.back()}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, background: T.grad, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.lock("#fff", 13)}</div>
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
                  {art.tel && <a href={`tel:${art.tel}`} style={{ background: "rgba(62,207,142,.08)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 10, padding: "10px 14px", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>{Icon.phone(T.success, 15)}</a>}
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
                  {art.tel && <a href={`tel:${art.tel}`} style={{ background: "rgba(62,207,142,.08)", border: "1px solid rgba(62,207,142,.2)", borderRadius: 10, padding: "10px 14px", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>{Icon.phone(T.success, 15)}</a>}
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
      {_modals}
    </div>
  );

  return null;
}

/* ─── ADMIN APP ─── */
function AdminApp({ account, bookings, setBookings, accounts, setAccounts, bons, setBons, onLogout, lang = "fr", setLang, bannedList = [], setBannedList }) {
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
    const b = { id: uid(), titre: newBon.titre || "Intervention LOCKR", adresse: newBon.adresse, probleme: newBon.probleme, urgence: newBon.urgence, montantEstime: parseFloat(newBon.montantEstime) || 100, postedBy: "platform", postedByNom: "LOCKR", region: newBon.region, lat: 48.8566, lng: 2.3522, createdAt: ts(), techPct: newBon.techPct };
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
    { id: "bannissements", l: tr.bannissements },
    { id: "validations", l: `${tr.validations} (${accounts.filter(a => a.role === "pro" && a.dossierStatus === "pending").length})` },
    { id: "clients", l: tr.allClients },
  ];

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
                    <div style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(124,58,237,.1)", border: "2px solid rgba(124,58,237,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                    <div style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(124,58,237,.1)", border: "2px solid rgba(124,58,237,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                      <div style={{ color: T.textHi, fontWeight: 600, fontSize: 13 }}>{pr?.label}</div>
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
                {PROBLEMES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
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

/* ─── ROOT ─── */
export default function App() {
  const [screen, setScreen] = useState("login");
  const [account, setAccount] = useState(null);
  const [bookings, setBookings] = useState(INIT_BOOKINGS);
  const [accounts, setAccounts] = useState(INIT_ACCOUNTS);
  const [bons, setBons] = useState(INIT_BONS);
  const [chatMessages, setChatMessages] = useState(INIT_CHAT);
  const [interventionChats, setInterventionChats] = useState({});
  const [lang, setLang] = useState("fr");
  const [bannedList, setBannedList] = useState([]);
  const logout = () => { setAccount(null); setScreen("login"); };

  if (account) {
    if (account.role === "client") return <ClientApp account={account} bookings={bookings} setBookings={setBookings} onLogout={logout} allAccounts={accounts} interventionChats={interventionChats} setInterventionChats={setInterventionChats} lang={lang} setLang={setLang} />;
    if (account.role === "pro") return <ProApp account={account} bookings={bookings} setBookings={setBookings} accounts={accounts} setAccounts={setAccounts} bons={bons} setBons={setBons} chatMessages={chatMessages} setChatMessages={setChatMessages} interventionChats={interventionChats} setInterventionChats={setInterventionChats} onLogout={logout} lang={lang} setLang={setLang} />;
    if (account.role === "admin") return <AdminApp account={account} bookings={bookings} setBookings={setBookings} accounts={accounts} setAccounts={setAccounts} bons={bons} setBons={setBons} onLogout={logout} lang={lang} setLang={setLang} bannedList={bannedList} setBannedList={setBannedList} />;
  }
  if (screen === "register-choice") return <RegisterChoiceScreen onChoice={type => setScreen(type === "pro" ? "register-pro" : "register-client")} onBack={() => setScreen("login")} lang={lang} />;
  if (screen === "register-client") return <RegisterClientScreen onBack={() => setScreen("register-choice")} onSuccess={acc => { setAccount(acc); }} accounts={accounts} setAccounts={setAccounts} lang={lang} />;
  if (screen === "register-pro") return <RegisterProScreen onBack={() => setScreen("register-choice")} onSuccess={acc => { setAccount(acc); }} accounts={accounts} setAccounts={setAccounts} lang={lang} />;
  return <LoginScreen onLogin={(acc) => {
    const banned = bannedList.find(b => b.email === acc.email);
    if (banned) { alert((TRANS[lang] || TRANS.fr).accountBanned); return; }
    setAccount(acc);
  }} onRegister={() => setScreen("register-choice")} accounts={accounts} lang={lang} setLang={setLang} />;
}
