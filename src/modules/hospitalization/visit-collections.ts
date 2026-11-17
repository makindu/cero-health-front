import { defineCollection } from '@/core/local/unit-of-work';
import type { ConsumptionBilling, ConsumptionEntry, Visit } from './visit-rules';

export const VISIT_COLLECTIONS = {
  visits: 'health-hospital-visits',
  consumptions: 'health-hospital-consumptions',
  billings: 'health-hospital-consumption-billings',
} as const;

/** Registres en ajout seul : aucune donnée de démonstration (les visites sont saisies pendant la démonstration). */
export const visitsRef = defineCollection<Visit>(VISIT_COLLECTIONS.visits);
export const consumptionsRef = defineCollection<ConsumptionEntry>(VISIT_COLLECTIONS.consumptions);
export const consumptionBillingsRef = defineCollection<ConsumptionBilling>(VISIT_COLLECTIONS.billings);
