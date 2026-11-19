import { BusinessRuleError } from '../_shared/business-error';

/**
 * Catégories de patients, entièrement CONFIGURABLES (aucun code à modifier pour en ajouter) :
 * chaque catégorie déclare ses obligations de paiement avant consommation.
 */
export interface PatientCategory {
  id: string;
  label: string;
  description: string;
  /** Doit payer la consultation avant qu'elle soit ouverte. */
  payConsultation: boolean;
  /** Doit payer les examens de laboratoire avant le prélèvement. */
  payLab: boolean;
  /** Doit payer les médicaments avant la dispensation. */
  payMedication: boolean;
  active: boolean;
}

export const DEFAULT_CATEGORY_ID = 'PRIVATE';

/** Catégories de départ (modifiables ensuite par l'administrateur). */
export const DEFAULT_CATEGORIES: readonly PatientCategory[] = [
  { id: 'PRIVATE', label: 'Privé', description: 'Paie tout avant consommation.', payConsultation: true, payLab: true, payMedication: true, active: true },
  { id: 'SUBSCRIBER', label: 'Abonné', description: 'Ne paie pas tout avant consommation (facturé ensuite).', payConsultation: false, payLab: false, payMedication: false, active: true },
  { id: 'INDIGENT', label: 'Indigent', description: 'Ne paie pas tout avant consommation (pris en charge).', payConsultation: false, payLab: false, payMedication: false, active: true },
];

export type PaymentKind = 'consultation' | 'lab' | 'medication';

/** Politique de paiement : sans catégorie connue, le patient est traité comme « privé » (paie avant consommation). */
export function mustPayBefore(category: PatientCategory | undefined, kind: PaymentKind): boolean {
  if (!category) return true;
  return kind === 'consultation' ? category.payConsultation : kind === 'lab' ? category.payLab : category.payMedication;
}

const clean = (v: string | undefined): string => (v ?? '').replace(/\s+/g, ' ').trim();
const flag = (v: string | undefined, fallback: boolean): boolean => (v === 'true' ? true : v === 'false' ? false : fallback);

/** Identifiant stable dérivé du libellé (sans accents, majuscules). */
export function categoryIdFor(label: string): string {
  return clean(label).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
}

export function buildCategory(input: Record<string, string>, existing: readonly PatientCategory[]): PatientCategory {
  const label = clean(input.label);
  if (label.length < 2) throw new BusinessRuleError('categoryLabelRequired');
  const id = categoryIdFor(label);
  if (id === '') throw new BusinessRuleError('categoryLabelRequired');
  if (existing.some((c) => c.id === id || c.label.toLowerCase() === label.toLowerCase())) throw new BusinessRuleError('categoryExists', { label }, 'conflict');
  return {
    id, label, description: clean(input.description),
    payConsultation: flag(input.payConsultation, true), payLab: flag(input.payLab, true), payMedication: flag(input.payMedication, true),
    active: true,
  };
}

export function applyCategoryUpdate(row: PatientCategory, input: Record<string, string>, existing: readonly PatientCategory[]): PatientCategory {
  const label = clean(input.label) || row.label;
  if (existing.some((c) => c.id !== row.id && c.label.toLowerCase() === label.toLowerCase())) throw new BusinessRuleError('categoryExists', { label }, 'conflict');
  const active = flag(input.active, row.active);
  // La catégorie par défaut ne peut pas être désactivée : tout patient sans catégorie en dépend.
  if (row.id === DEFAULT_CATEGORY_ID && !active) throw new BusinessRuleError('categoryDefaultLocked', {}, 'conflict');
  return {
    ...row, label, description: input.description === undefined ? row.description : clean(input.description),
    payConsultation: flag(input.payConsultation, row.payConsultation), payLab: flag(input.payLab, row.payLab), payMedication: flag(input.payMedication, row.payMedication),
    active,
  };
}
