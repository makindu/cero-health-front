import type { Money } from '../money/money';

/** Catégories de prestations (une règle de contrat peut varier selon la catégorie ou la prestation précise). */
export type ServiceCategory =
  | 'consultation'
  | 'laboratory'
  | 'pharmacy'
  | 'hospitalization'
  | 'room'
  | 'procedure'
  | 'nursing'
  | 'consumable';

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  'consultation', 'laboratory', 'pharmacy', 'hospitalization', 'room', 'procedure', 'nursing', 'consumable',
];

/** Prestation du catalogue de l'établissement. `price` = tarif PRIVÉ de référence (unités mineures, devise de l'établissement). */
export interface CatalogItem {
  id: string;
  code: string;
  label: string;
  category: ServiceCategory;
  price: Money;
  active: boolean;
  /**
   * Conditionnement (médicaments) : cet article puise dans le stock de `stock.itemId`, à raison de `stock.perUnit` unités de base
   * par unité vendue. Le stock est compté en unité de base (ex. le comprimé) ; absent = 1 article = 1 unité de stock.
   */
  stock?: { itemId: string; perUnit: number };
  /** Unité dans laquelle cet article est vendu (boîte, sachet, comprimé…). */
  unit?: string;
  /** Sur l'article qui porte le stock : nom de l'unité de base (comprimé…). */
  baseUnit?: string;
}

export type OrganizationKind = 'insurer' | 'mutuelle' | 'company' | 'institution' | 'other';

export interface Organization {
  id: string;
  code: string;
  name: string;
  kind: OrganizationKind;
  contactPerson: string;
  phone: string;
  email: string;
  status: 'active' | 'suspended' | 'inactive';
  validFrom: string;
  validTo?: string;
  /** Conditions générales de prise en charge (texte libre ; les règles chiffrées sont dans les contrats). */
  conditions?: string;
}

/**
 * Règle de contrat. Spécificité : prestation précise > catégorie > règle générale (ni catégorie ni code).
 * Taux en points de base (8000 = 80 %) calculés sur le TARIF NÉGOCIÉ (jamais sur le tarif privé).
 */
export interface ContractRule {
  category?: ServiceCategory;
  itemCode?: string;
  coverageBp: number;
  excluded?: boolean;
  /** Tarif négocié unitaire (unités mineures). Absent = tarif privé. */
  negotiatedUnit?: number;
  /** Plafond de prise en charge par ligne (part organisme). */
  ceilingPerLine?: number;
  /** Nombre d'unités couvrables par couverture (au-delà : hors contrat, tarif privé). */
  quota?: number;
  requiresAuthorization?: boolean;
}

export interface Contract {
  id: string;
  organizationId: string;
  label: string;
  currency: string;
  validFrom: string;
  validTo: string;
  status: 'active' | 'suspended' | 'terminated';
  rules: ContractRule[];
  /** Franchise par épisode de soins (restant à la charge du patient avant toute prise en charge). */
  franchisePerEpisode?: number;
  /** Plafond de la part organisme par épisode de soins. */
  ceilingPerEpisode?: number;
  /** Ce contrat accepte qu'une couverture complémentaire intervienne après lui. */
  allowsComplementary: boolean;
  /** Ce contrat accepte d'intervenir en complément d'une autre couverture. */
  canBeComplementary: boolean;
  conditions?: string;
}

export type CoverageKind = 'insurance' | 'mutuelle';
export type ValidationStatus = 'pending' | 'validated' | 'rejected' | 'suspended';

export interface CoverageValidation {
  at: string;
  by: string;
  status: ValidationStatus;
  note?: string;
}

/** Couverture d'un patient. Jamais considérée comme confirmée tant qu'une validation tracée n'existe pas. */
export interface PatientCoverage {
  id: string;
  patientId: string;
  organizationId: string;
  contractId: string;
  kind: CoverageKind;
  policyNumber: string;
  cardNumber: string;
  memberNumber: string;
  coverageType: string;
  validFrom: string;
  validTo: string;
  status: ValidationStatus;
  /** Plafond disponible, si connu (unités mineures). */
  ceilingRemaining?: number;
  /** Ayants droit (identifiants de patients). Le titulaire est `patientId`. */
  beneficiaryIds: string[];
  documents: string[];
  history: CoverageValidation[];
  /** Plus petit = plus prioritaire pour la désignation automatique de la couverture principale. */
  priority: number;
}

export interface Subscription {
  id: string;
  type: 'individual' | 'family' | 'company';
  holderName: string;
  patientIds: string[];
  price: Money;
  validFrom: string;
  validTo: string;
  status: 'active' | 'suspended' | 'cancelled';
  freeConsultations?: number;
  /** Réductions (points de base) par catégorie. */
  discounts: Partial<Record<ServiceCategory, number>>;
  /** Catégories entièrement incluses (financées par l'abonnement). */
  includedCategories: ServiceCategory[];
}

export interface CoverageBundle {
  coverage: PatientCoverage;
  organization: Organization;
  contract: Contract;
}

/** Consommations déjà enregistrées dans l'épisode (plafonds, franchise, quotas, gratuités). Jamais modifié en place. */
export interface UsageState {
  coverageSpent: Record<string, number>;
  franchiseUsed: Record<string, number>;
  quotaUsed: Record<string, number>;
  freeConsultationsUsed: Record<string, number>;
}

export const emptyUsage = (): UsageState => ({ coverageSpent: {}, franchiseUsed: {}, quotaUsed: {}, freeConsultationsUsed: {} });

export interface PricingContext {
  /** Jour civil de la prestation (AAAA-MM-JJ) : les droits sont évalués à CETTE date. */
  date: string;
  patientId: string;
  currency: string;
  coverages: CoverageBundle[];
  primaryCoverageId?: string;
  secondaryCoverageId?: string;
  subscription?: Subscription;
  usage: UsageState;
  /** Autorisations préalables accordées : « coverageId|itemCode ». */
  grantedAuthorizations: string[];
  /** Exception autorisée par permission en amont (ex. tarif privé imposé) : tracée dans la justification. */
  forcePrivate?: boolean;
}

export interface Reason {
  code: string;
  params?: Record<string, string | number>;
}

export interface InsurerShare {
  coverageId: string;
  organizationId: string;
  contractId: string;
  role: 'primary' | 'complementary';
  rateBp: number;
  amount: Money;
}

export interface AppliedRulesSnapshot {
  engineVersion: number;
  date: string;
  basis: 'private' | 'insurance' | 'subscription';
  primary?: { coverageId: string; organizationId: string; organizationName: string; contractId: string; contractLabel: string; policyNumber: string; rule: ContractRule };
  secondary?: { coverageId: string; organizationId: string; organizationName: string; contractId: string; contractLabel: string; policyNumber: string; rule: ContractRule };
  negotiatedUnit?: number;
  franchiseApplied?: number;
  ceilingBefore?: { episode?: number; known?: number; line?: number };
  subscriptionId?: string;
  coordination: string;
}

export interface UsageDelta {
  coverageSpent: Record<string, number>;
  franchiseUsed: Record<string, number>;
  quotaUsed: Record<string, number>;
  freeConsultationsUsed: Record<string, number>;
}

export type CoverageOutcome = 'none' | 'full' | 'partial' | 'excluded' | 'authorizationRequired';

export interface PricingResult {
  itemCode: string;
  quantity: number;
  currency: string;
  reference: Money;
  /** Montant facturable de la ligne (tarif négocié / remisé / privé selon le cas). */
  billable: Money;
  discount: Money;
  insurerShares: InsurerShare[];
  /** Part financée par l'abonnement (gratuités, catégories incluses) : ce n'est PAS une créance sur un organisme. */
  subscriptionShare: Money;
  patientShare: Money;
  franchise: Money;
  ticketModerator: Money;
  basis: 'private' | 'insurance' | 'subscription';
  outcome: CoverageOutcome;
  needsAuthorization: boolean;
  justification: Reason[];
  rules: AppliedRulesSnapshot;
  usageDelta: UsageDelta;
}
