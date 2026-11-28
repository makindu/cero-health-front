/**
 * Codes de permission de CERO HEALTH (convention : health.<ressource>.<action>).
 *
 * Source : cahier des charges fonctionnel §5.1 (noms « proposés ») et CDC technique CERO PLATFORM §8
 * (préfixe de domaine « health. »). Les noms définitifs sont à confirmer avec CERO ID CORE :
 * ils sont centralisés ICI pour qu'un renommage ne touche qu'un fichier.
 *
 * ⚠ Le frontend n'est JAMAIS une barrière de sécurité : ces codes ne servent qu'à adapter l'interface
 * (menus, boutons). L'API vérifie chaque autorisation côté serveur, par établissement et par périmètre.
 */
export const PERMISSIONS = {
  dashboard: { view: 'health.dashboard.view' },
  patients: {
    view: 'health.patients.view',
    create: 'health.patients.create',
    update: 'health.patients.update',
    merge: 'health.patients.merge',
    export: 'health.patients.export',
  },
  appointments: {
    view: 'health.appointments.view',
    create: 'health.appointments.create',
    update: 'health.appointments.update',
    cancel: 'health.appointments.cancel',
    checkIn: 'health.appointments.check-in',
  },
  medicalRecords: { view: 'health.medical-records.view', manage: 'health.medical-records.manage', export: 'health.medical-records.export' },
  consultations: {
    view: 'health.consultations.view',
    create: 'health.consultations.create',
    update: 'health.consultations.update',
    sign: 'health.consultations.sign',
    close: 'health.consultations.close',
  },
  nursing: { view: 'health.nursing.view', record: 'health.nursing.record', validateCare: 'health.nursing.validateCare' },
  prescriptions: {
    view: 'health.prescriptions.view',
    create: 'health.prescriptions.create',
    validate: 'health.prescriptions.validate',
    dispense: 'health.prescriptions.dispense',
  },
  laboratory: {
    view: 'health.laboratory.view',
    order: 'health.laboratory.order',
    collect: 'health.laboratory.collect',
    resultsEnter: 'health.laboratory.results.enter',
    resultsValidate: 'health.laboratory.results.validate',
    /** Valider ses propres résultats même quand l'établissement exige un valideur différent. */
    resultsValidateOwn: 'health.laboratory.results.validate-own',
    /** Prélèvement sans paiement préalable (exception motivée, tracée). */
    exception: 'health.laboratory.exception',
    /** Gérer le catalogue des examens et leurs prix. */
    catalog: 'health.laboratory.catalog',
  },
  pharmacy: {
    view: 'health.pharmacy.view',
    dispense: 'health.pharmacy.dispense',
    exception: 'health.pharmacy.exception',
    /** Gérer le catalogue des médicaments et leurs prix. */
    catalog: 'health.pharmacy.catalog',
  },
  hospitalization: {
    view: 'health.admissions.view',
    create: 'health.admissions.create',
    /** Valider ou refuser une demande d'hospitalisation (médecin du service d'accueil, avec un motif). */
    decide: 'health.admissions.decide',
    assignBed: 'health.beds.assign',
    discharge: 'health.discharges.validate',
    /** Sortie malgré un solde patient dû (exception motivée, tracée). */
    dischargeException: 'health.discharges.exception',
    /** Visites (tour de salle) et consommations du patient hospitalisé. */
    visitView: 'health.visits.view',
    visitRecord: 'health.visits.record',
    /** Volet clinique de la visite : examen, diagnostic et plan (les plaintes restent saisissables par tout soignant). */
    visitClinical: 'health.visits.clinical',
    /** Contre-écriture d'une consommation saisie par erreur (motif obligatoire). */
    consumptionReverse: 'health.consumptions.reverse',
  },
  billing: {
    view: 'health.billing.view',
    create: 'health.billing.create',
    pay: 'health.billing.pay',
    /** Lier un patient à une fiche client (ou la créer) : préalable à toute facture. */
    linkCustomer: 'health.billing.link-customer',
    /** Corrections sensibles (toujours avec motif, toujours tracées). */
    refund: 'health.billing.refund',
    cancel: 'health.billing.cancel',
    reverse: 'health.billing.reverse',
    /** Autoriser un crédit (reste dû patient) et une sortie avec dette. */
    credit: 'health.billing.credit',
    /** Exempter les frais de consultation. */
    exempt: 'health.billing.exempt',
    /** Enregistrer règlements et rejets d'organismes. */
    settle: 'health.billing.settle',
    /** Durée de validité des frais, catalogue de tarifs. */
    configure: 'health.billing.configure',
    /** Accorder une réduction sur la facture des consommations (motif obligatoire, plafonnée). */
    discount: 'health.billing.discount',
    /** Voir les opérations de tous les caissiers (sans ce droit : seulement les siennes). */
    viewAll: 'health.billing.viewAll',
  },
  insurance: {
    view: 'health.insurance.view',
    /** Créer organismes, contrats, couvertures, abonnements. */
    manage: 'health.insurance.manage',
    /** Valider une couverture (jamais « confirmée » sans cette validation tracée). */
    validate: 'health.insurance.validate',
    /** Accorder une autorisation préalable. */
    authorize: 'health.insurance.authorize',
    /** Gérer le catalogue des prestations (actes) et leurs tarifs. */
    catalog: 'health.insurance.catalog',
  },
  cash: { view: 'health.cash.view', record: 'health.cash.record', close: 'health.cash.close' },
  inventory: {
    view: 'health.stock.view',
    receive: 'health.stock.receive',
    adjust: 'health.stock.adjust',
  },
  /** Dépenses de l'établissement (écrites dans la comptabilité UZISHA) : saisir, valider par un responsable, annuler tant que non validée. */
  expenses: { view: 'health.expenses.view', create: 'health.expenses.create', validate: 'health.expenses.validate', cancel: 'health.expenses.cancel' },
  reports: { view: 'health.reports.view', scope: 'health.reports.scope' },
  /** Financière : reçoit les versements des caissiers, clôture la caisse de l'établissement, voit toutes les caisses. */
  treasury: { manage: 'health.treasury.manage' },
  cashAssign: { manage: 'health.cash.assign' },
  exchange: { manage: 'health.exchange-rates.manage' },
  administration: {
    view: 'health.administration.view',
    manageUsers: 'health.users.manage',
    manageServices: 'health.services.manage',
    /** Dépôts de stock : voir, puis créer et gérer les membres (droits de mouvement, chef). */
    viewDeposits: 'health.deposits.read',
    manageDeposits: 'health.deposits.manage',
    /** Entrées de stock (approvisionnement) : s'ajoute au niveau du membre dans le dépôt. */
    moveStock: 'health.stock.move',
    /** Paramètres de l'établissement (durée de consultation, catégories de patients…). */
    manageSettings: 'health.settings.manage',
  },
  audit: { view: 'health.audit.view' },
} as const;

/** Permissions accordées : liste explicite, ou '*' (mode aperçu uniquement). */
export type GrantedPermissions = readonly string[] | '*';

/**
 * Une permission est accordée si elle figure dans la liste, ou si un joker la couvre :
 * '*' (tout) ou 'health.patients.*' (toutes les actions d'une ressource).
 */
export function hasPermission(granted: GrantedPermissions, required: string): boolean {
  if (granted === '*') return true;
  return granted.some(
    (code) =>
      code === '*' || code === required || (code.endsWith('.*') && required.startsWith(code.slice(0, -1))),
  );
}

export function hasAnyPermission(granted: GrantedPermissions, required: readonly string[]): boolean {
  return required.some((code) => hasPermission(granted, code));
}

export function hasAllPermissions(granted: GrantedPermissions, required: readonly string[]): boolean {
  return required.every((code) => hasPermission(granted, code));
}
