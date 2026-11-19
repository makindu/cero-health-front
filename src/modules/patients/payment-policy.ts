import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { collectionNameFor } from '@/core/local/repository';
import { defineCollection, type Unit } from '@/core/local/unit-of-work';
import { admissionsRef } from '../hospitalization/collections';
import { isActive } from '../hospitalization/hospital-rules';
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_ID, mustPayBefore, type PatientCategory } from './categories';

/** Références minimales (mêmes collections locales que les modules patients et catégories). */
const patientsRef = defineCollection<{ id: string; categoryId?: string }>(collectionNameFor(HEALTH_ENDPOINTS.patients.collection));
export const CATEGORIES_ENDPOINT = '/health/patient-categories';
export const categoriesRef = defineCollection<PatientCategory>(collectionNameFor(CATEGORIES_ENDPOINT), DEFAULT_CATEGORIES);

export interface PaymentPolicy {
  category?: PatientCategory;
  /** Vrai : le paiement doit précéder l'ouverture de la consultation / le prélèvement / la dispensation. */
  consultation: boolean;
  lab: boolean;
  medication: boolean;
  /** Patient hospitalisé : il règle sa facture une fois pour toutes à la sortie, donc aucun paiement préalable. */
  hospitalized: boolean;
}

/** Politique de paiement d'un patient : sa catégorie, puis l'exception des patients hospitalisés. */
export async function paymentPolicy(u: Unit, patientId: string): Promise<PaymentPolicy> {
  const patient = await u.get(patientsRef, patientId);
  const category = (await u.get(categoriesRef, patient?.categoryId || DEFAULT_CATEGORY_ID)) ?? DEFAULT_CATEGORIES.find((c) => c.id === DEFAULT_CATEGORY_ID);
  const hospitalized = (await u.list(admissionsRef)).some((a) => a.patientId === patientId && isActive(a));
  return {
    category, hospitalized,
    consultation: mustPayBefore(category, 'consultation'),
    lab: mustPayBefore(category, 'lab') && !hospitalized,
    medication: mustPayBefore(category, 'medication') && !hospitalized,
  };
}
