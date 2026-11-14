import { defineCollection } from '@/core/local/unit-of-work';
import type { Invoice, LedgerEntry } from '@/core/billing/invoice';
import type { FeePayment, ValidityConfig } from '@/core/billing/validity';
import type { CatalogItem, Contract, Organization, PatientCoverage, Subscription } from '@/core/pricing/types';
import { FINANCE_SEED } from './seeds';

/** Autorisation préalable accordée par un organisme pour une prestation (traçable). */
export interface AuthorizationGrant {
  id: string;
  coverageId: string;
  itemCode: string;
  grantedBy: string;
  at: string;
  reference?: string;
  note?: string;
  patientId: string;
}

/** Document unique : historique des durées de validité des frais de consultation. */
export interface FeeConfigDoc {
  id: 'config';
  history: ValidityConfig[];
}

export const FINANCE_COLLECTIONS = {
  catalog: 'health-catalog-items-v2',
  organizations: 'health-organizations',
  contracts: 'health-contracts',
  coverages: 'health-patient-coverages',
  subscriptions: 'health-subscriptions',
  authorizations: 'health-authorizations',
  feeConfig: 'health-consultation-fee-config',
  feePayments: 'health-consultation-fees',
  // Comptabilité : jamais pré-remplie (livres propres), voir docs/PHASE3_BILLING.md.
  invoices: 'health-billing-invoices',
  ledger: 'health-billing-ledger',
} as const;

export const catalogRef = defineCollection<CatalogItem>(FINANCE_COLLECTIONS.catalog, FINANCE_SEED.catalog);
export const organizationsRef = defineCollection<Organization>(FINANCE_COLLECTIONS.organizations, FINANCE_SEED.organizations);
export const contractsRef = defineCollection<Contract>(FINANCE_COLLECTIONS.contracts, FINANCE_SEED.contracts);
export const coveragesRef = defineCollection<PatientCoverage>(FINANCE_COLLECTIONS.coverages, FINANCE_SEED.coverages);
export const subscriptionsRef = defineCollection<Subscription>(FINANCE_COLLECTIONS.subscriptions, FINANCE_SEED.subscriptions);
export const authorizationsRef = defineCollection<AuthorizationGrant>(FINANCE_COLLECTIONS.authorizations);
export const feeConfigRef = defineCollection<FeeConfigDoc>(FINANCE_COLLECTIONS.feeConfig, FINANCE_SEED.feeConfig);
export const feePaymentsRef = defineCollection<FeePayment>(FINANCE_COLLECTIONS.feePayments);
export const invoicesRef = defineCollection<Invoice>(FINANCE_COLLECTIONS.invoices);
export const ledgerRef = defineCollection<LedgerEntry>(FINANCE_COLLECTIONS.ledger);
