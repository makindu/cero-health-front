import { money } from '@/core/money/money';
import type { CatalogItem, Contract, Organization, PatientCoverage, Subscription } from '@/core/pricing/types';
import type { ValidityConfig } from '@/core/billing/validity';

/**
 * DONNÉES FICTIVES de démonstration (aucun organisme, tarif ou contrat réel). Tous les libellés portent « (démo) ».
 * Les montants sont en centimes de USD. Les patients visés sont les patients fictifs DEMO-P-xxx.
 * Les validités sont larges (2026-2030) pour que la démonstration reste utilisable ; l'état « expiré » est couvert par les tests.
 */
const CUR = 'USD';
const item = (id: string, code: string, label: string, category: CatalogItem['category'], price: number): CatalogItem => ({ id, code, label: `${label} (démo)`, category, price: money(price, CUR), active: true });

const catalog: CatalogItem[] = [
  item('cat-01', 'CONS-GEN', 'Consultation générale', 'consultation', 2000),
  item('cat-02', 'CONS-SPE', 'Consultation spécialisée', 'consultation', 4000),
  item('cat-03', 'LAB-NFS', 'Numération formule sanguine', 'laboratory', 1500),
  item('cat-04', 'LAB-GLY', 'Glycémie', 'laboratory', 800),
  item('cat-05', 'LAB-PALU', 'Test de paludisme', 'laboratory', 600),
  item('cat-13', 'LAB-CREA', 'Créatininémie', 'laboratory', 1200),
  item('cat-14', 'LAB-URINE', 'Examen d\'urine', 'laboratory', 700),
  item('cat-15', 'LAB-GROSS', 'Test de grossesse', 'laboratory', 500),
  item('cat-06', 'PHA-ANT', 'Antalgique (boîte)', 'pharmacy', 500),
  item('cat-07', 'PHA-ATB', 'Antibiotique (cure)', 'pharmacy', 1800),
  item('cat-08', 'ROOM-STD', 'Chambre standard / jour', 'room', 4000),
  item('cat-09', 'ROOM-PRI', 'Chambre privée / jour', 'room', 9000),
  item('cat-10', 'PROC-SUT', 'Petite suture', 'procedure', 3500),
  item('cat-11', 'PROC-ESTH', 'Acte esthétique', 'procedure', 6000),
  item('cat-12', 'NUR-PANS', 'Pansement', 'nursing', 700),
];

const organizations: Organization[] = [
  { id: 'org-assur-a', code: 'ASSUR-A', name: 'Assurance Alpha (démo)', kind: 'insurer', contactPerson: 'Contact démo', phone: '+000 000 0101', email: '', status: 'active', validFrom: '2020-01-01' },
  { id: 'org-assur-b', code: 'ASSUR-B', name: 'Assurance Bravo (démo)', kind: 'insurer', contactPerson: 'Contact démo', phone: '+000 000 0102', email: '', status: 'active', validFrom: '2020-01-01' },
  { id: 'org-mut-c', code: 'MUT-C', name: 'Mutuelle Charlie (démo)', kind: 'mutuelle', contactPerson: 'Contact démo', phone: '+000 000 0103', email: '', status: 'active', validFrom: '2020-01-01' },
];

const contracts: Contract[] = [
  {
    id: 'ctr-a', organizationId: 'org-assur-a', label: 'Alpha — formule standard (démo)', currency: CUR, validFrom: '2026-01-01', validTo: '2030-12-31', status: 'active',
    rules: [
      { coverageBp: 8000 },
      { itemCode: 'CONS-GEN', coverageBp: 8000, negotiatedUnit: 1800 },
      { category: 'room', coverageBp: 7000, ceilingPerLine: 20000 },
      { itemCode: 'PROC-SUT', coverageBp: 8000, requiresAuthorization: true },
      { category: 'procedure', coverageBp: 0, excluded: true },
    ],
    franchisePerEpisode: 0, ceilingPerEpisode: 100000, allowsComplementary: true, canBeComplementary: false,
    conditions: 'Actes esthétiques exclus. Suture : autorisation préalable. (démo)',
  },
  {
    id: 'ctr-b', organizationId: 'org-assur-b', label: 'Bravo — formule économique (démo)', currency: CUR, validFrom: '2026-01-01', validTo: '2030-12-31', status: 'active',
    rules: [{ coverageBp: 6000 }, { category: 'pharmacy', coverageBp: 0, excluded: true }],
    franchisePerEpisode: 500, allowsComplementary: false, canBeComplementary: false,
    conditions: 'Franchise 5,00 USD par épisode. Pharmacie exclue. (démo)',
  },
  {
    id: 'ctr-c', organizationId: 'org-mut-c', label: 'Charlie — complémentaire (démo)', currency: CUR, validFrom: '2026-01-01', validTo: '2030-12-31', status: 'active',
    rules: [{ coverageBp: 10000 }], allowsComplementary: false, canBeComplementary: true,
    conditions: 'Intervient en complément du ticket modérateur d’une assurance principale. (démo)',
  },
];

const hist = (at: string, by: string, status: PatientCoverage['status']) => ({ at, by, status, note: 'Validation de démonstration' });
const cov = (id: string, patientId: string, organizationId: string, contractId: string, kind: PatientCoverage['kind'], priority: number, status: PatientCoverage['status'] = 'validated'): PatientCoverage => ({
  id, patientId, organizationId, contractId, kind, policyNumber: `POL-DEMO-${id}`, cardNumber: `CARTE-DEMO-${id}`, memberNumber: `MEMBRE-DEMO-${id}`,
  coverageType: 'standard', validFrom: '2026-01-01', validTo: '2030-12-31', status, beneficiaryIds: [], documents: [],
  history: status === 'pending' ? [] : [hist('2026-01-02T08:00:00.000Z', 'Validation démo', status)], priority,
});

const coverages: PatientCoverage[] = [
  cov('cov-01', 'DEMO-P-002', 'org-assur-a', 'ctr-a', 'insurance', 1),
  cov('cov-02', 'DEMO-P-003', 'org-assur-b', 'ctr-b', 'insurance', 1),
  cov('cov-03', 'DEMO-P-004', 'org-assur-a', 'ctr-a', 'insurance', 1),
  cov('cov-04', 'DEMO-P-004', 'org-mut-c', 'ctr-c', 'mutuelle', 2),
  cov('cov-05', 'DEMO-P-005', 'org-assur-a', 'ctr-a', 'insurance', 1, 'pending'),
];

const subscriptions: Subscription[] = [
  { id: 'sub-01', type: 'individual', holderName: 'Abonné démo', patientIds: ['DEMO-P-006'], price: money(6000, CUR), validFrom: '2026-01-01', validTo: '2030-12-31', status: 'active', freeConsultations: 2, discounts: { laboratory: 2000 }, includedCategories: [] },
];

const feeConfig: { id: 'config'; history: ValidityConfig[] } = { id: 'config', history: [{ effectiveFrom: '2000-01-01', months: 1, mode: 'clamp', reason: 'Configuration initiale (démo)' }] };

export const FINANCE_SEED = { catalog, organizations, contracts, coverages, subscriptions, feeConfig: [feeConfig] };
