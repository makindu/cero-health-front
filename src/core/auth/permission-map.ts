/**
 * Traduction des permissions du catalogue CERO CEPATEC (ce que l'administrateur attribue)
 * vers les codes utilisés par l'interface de CERO HEALTH.
 *
 * Une permission du catalogue peut ouvrir plusieurs codes de l'interface. Le propriétaire d'une
 * entreprise reçoit déjà toutes les permissions du catalogue côté serveur : le calcul reste donc
 * identique pour tous. Ceci n'est qu'un confort d'affichage : l'API revérifie toujours.
 */
const MAP: Record<string, readonly string[]> = {
  'health.patients.read': ['health.patients.view', 'health.dashboard.view'],
  'health.patients.create': ['health.patients.create'],
  'health.patients.update': ['health.patients.update'],
  'health.patients.merge': ['health.patients.merge'],
  'health.appointments.read': ['health.appointments.view'],
  'health.appointments.manage': ['health.appointments.create', 'health.appointments.update', 'health.appointments.cancel'],
  'health.appointments.check-in': ['health.appointments.check-in'],
  'health.triage.read': ['health.nursing.view'],
  'health.triage.record': ['health.nursing.record'],
  'health.triage.validate-care': ['health.nursing.validateCare'],
  'health.consultations.read': ['health.consultations.view'],
  'health.consultations.write': ['health.consultations.create', 'health.consultations.update'],
  'health.consultations.sign': ['health.consultations.sign'],
  'health.consultations.close': ['health.consultations.close'],
  'health.medical-records.read': ['health.medical-records.view'],
  'health.prescriptions.read': ['health.prescriptions.view'],
  'health.prescriptions.write': ['health.prescriptions.create'],
  'health.prescriptions.validate': ['health.prescriptions.validate'],
  'health.lab.read': ['health.laboratory.view'],
  'health.lab.order': ['health.laboratory.order'],
  'health.lab.collect': ['health.laboratory.collect'],
  'health.lab.result': ['health.laboratory.results.enter'],
  'health.lab.validate': ['health.laboratory.results.validate'],
  'health.lab.validate-own': ['health.laboratory.results.validate-own'],
  'health.pharmacy.read': ['health.pharmacy.view', 'health.stock.view'],
  'health.pharmacy.dispense': ['health.pharmacy.dispense', 'health.prescriptions.dispense'],
  'health.pharmacy.exception': ['health.pharmacy.exception'],
  'health.admissions.read': ['health.admissions.view'],
  'health.admissions.manage': ['health.admissions.create'],
  'health.admissions.decide': ['health.admissions.decide'],
  'health.beds.manage': ['health.beds.assign'],
  'health.discharge.approve': ['health.discharges.validate'],
  'health.billing.read': ['health.billing.view', 'health.cash.view'],
  'health.billing.invoice': ['health.billing.create', 'health.billing.pay', 'health.cash.record'],
  'health.billing.discount': ['health.billing.exempt'],
  'health.billing.read-all': ['health.billing.viewAll'],
  'health.billing.exception': ['health.billing.credit', 'health.laboratory.exception', 'health.discharges.exception'],
  'health.billing.manage': ['health.billing.refund', 'health.billing.cancel', 'health.billing.reverse', 'health.billing.settle', 'health.billing.configure', 'health.cash.close'],
  'health.insurance.view': ['health.insurance.view'],
  'health.insurance.manage': ['health.insurance.manage'],
  'health.insurance.validate': ['health.insurance.validate'],
  'health.insurance.authorize': ['health.insurance.authorize'],
  'health.insurance.settle': ['health.insurance.settle'],
  // Lire le personnel ou les unités de soins sert aux listes (médecin prescripteur, nom du service) : cela n'ouvre PAS le menu Administration.
  // Le menu Administration s'ouvre pour qui peut gérer le personnel, les unités de soins ou les paramètres.
  'health.staff.manage': ['health.users.manage', 'health.administration.view'],
  'health.care-units.manage': ['health.services.manage', 'health.administration.view'],
  // Les dépôts et leurs entrées vivent dans la page Stock : leurs droits ouvrent ce menu, pas l'Administration.
  'health.deposits.read': ['health.stock.view'],
  'health.deposits.manage': ['health.stock.view', 'health.deposits.read'],
  'health.stock.move': ['health.stock.view', 'health.deposits.read'],
  'health.audit.read': ['health.audit.view', 'health.reports.view'],
  // Choisir, par utilisateur, les services dont il voit les rapports financiers.
  'health.reports.scope.manage': ['health.reports.scope', 'health.administration.view'],
  'health.treasury.manage': ['health.treasury.manage'],
  'health.cash.assign': ['health.cash.assign'],
  'health.exchange-rates.manage': ['health.exchange-rates.manage'],
  'health.patients.categories': ['health.settings.manage', 'health.administration.view'],
  'health.visits.read': ['health.visits.view'],
  'health.lab.catalog': ['health.laboratory.catalog'],
  'health.catalog.manage': ['health.pharmacy.catalog', 'health.insurance.catalog', 'health.stock.receive', 'health.stock.adjust'],
  'health.medical-records.export': ['health.patients.export'],
  'health.expenses.read': ['health.expenses.view'],
  'health.expenses.create': ['health.expenses.create'],
  'health.expenses.validate': ['health.expenses.validate'],
  'health.expenses.cancel': ['health.expenses.cancel'],
};

/** Codes de l'interface déduits des permissions du serveur (sans doublon). */
export function toUiPermissions(serverCodes: readonly string[]): string[] {
  const out = new Set<string>();
  for (const code of serverCodes) {
    // Les codes déjà au format de l'interface restent valables.
    out.add(code);
    for (const mapped of MAP[code] ?? []) out.add(mapped);
  }
  return [...out];
}
