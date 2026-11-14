import { money } from '../money/money';
import type { CatalogItem, Contract, CoverageBundle, Organization, PatientCoverage, PricingContext, Subscription } from './types';
import { emptyUsage } from './types';

/** Jeu FICTIF commun aux tests et aux données de démonstration du moteur (aucun organisme réel). */
export const CUR = 'USD';

export const ITEMS = {
  consult: { id: 'i1', code: 'CONS-GEN', label: 'Consultation générale (démo)', category: 'consultation', price: money(2000, CUR), active: true },
  lab: { id: 'i2', code: 'LAB-NFS', label: 'Examen de laboratoire (démo)', category: 'laboratory', price: money(1500, CUR), active: true },
  drug: { id: 'i3', code: 'PHA-ANT', label: 'Médicament (démo)', category: 'pharmacy', price: money(800, CUR), active: true },
  room: { id: 'i4', code: 'ROOM-STD', label: 'Chambre standard / jour (démo)', category: 'room', price: money(4000, CUR), active: true },
  cosmetic: { id: 'i5', code: 'PROC-ESTH', label: 'Acte esthétique (démo)', category: 'procedure', price: money(6000, CUR), active: true },
} satisfies Record<string, CatalogItem>;

export const org = (id: string, kind: Organization['kind'] = 'insurer', over: Partial<Organization> = {}): Organization => ({
  id, code: id.toUpperCase(), name: `Organisme ${id} (démo)`, kind, contactPerson: 'Contact démo', phone: '+000 000 0000', email: '',
  status: 'active', validFrom: '2020-01-01', ...over,
});

export const contract = (id: string, organizationId: string, over: Partial<Contract> = {}): Contract => ({
  id, organizationId, label: `Convention ${id} (démo)`, currency: CUR, validFrom: '2026-01-01', validTo: '2026-12-31', status: 'active',
  rules: [{ coverageBp: 8000, negotiatedUnit: undefined }], allowsComplementary: false, canBeComplementary: false, ...over,
});

export const coverage = (id: string, patientId: string, organizationId: string, contractId: string, over: Partial<PatientCoverage> = {}): PatientCoverage => ({
  id, patientId, organizationId, contractId, kind: 'insurance', policyNumber: `POL-${id}`, cardNumber: `CARD-${id}`, memberNumber: `MEM-${id}`,
  coverageType: 'standard', validFrom: '2026-01-01', validTo: '2026-12-31', status: 'validated', beneficiaryIds: [], documents: [],
  history: [{ at: '2026-01-02T08:00:00.000Z', by: 'Validation démo', status: 'validated' }], priority: 1, ...over,
});

export const bundle = (c: PatientCoverage, o: Organization, k: Contract): CoverageBundle => ({ coverage: c, organization: o, contract: k });

export const subscription = (over: Partial<Subscription> = {}): Subscription => ({
  id: 'sub1', type: 'individual', holderName: 'Abonné démo', patientIds: ['P1'], price: money(5000, CUR),
  validFrom: '2026-01-01', validTo: '2026-12-31', status: 'active', discounts: {}, includedCategories: [], ...over,
});

export const ctx = (over: Partial<PricingContext> = {}): PricingContext => ({
  date: '2026-11-14', patientId: 'P1', currency: CUR, coverages: [], usage: emptyUsage(), grantedAuthorizations: [], ...over,
});
