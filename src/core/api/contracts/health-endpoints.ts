/**
 * CONTRAT CIBLE de l'API CERO HEALTH — endpoints indicatifs du cahier des charges fonctionnel (§11.2).
 *
 * ⚠ Ces routes ne sont PAS déclarées existantes côté backend. Elles servent de contrat à développer
 * (voir docs/API_CONTRACTS_NEEDED.md). Le préfixe (/api/v1, /api/v1/health...) est défini par l'URL de
 * base VITE_HEALTH_API_URL et reste à confirmer.
 *
 * Les composants n'importent jamais ce fichier : seuls les services métier (src/modules/<module>/services) le font.
 */

const seg = (id: string | number): string => encodeURIComponent(String(id));

export const HEALTH_ENDPOINTS = {
  patients: {
    collection: '/health/patients',
    item: (id: string) => `/health/patients/${seg(id)}`,
  },
  appointments: {
    collection: '/health/appointments',
    status: (id: string) => `/health/appointments/${seg(id)}/status`,
  },
  encounters: {
    collection: '/health/encounters',
    consultations: (encounterId: string) => `/health/encounters/${seg(encounterId)}/consultations`,
  },
  consultations: {
    diagnoses: (consultationId: string) => `/health/consultations/${seg(consultationId)}/diagnoses`,
    prescriptions: (consultationId: string) =>
      `/health/consultations/${seg(consultationId)}/prescriptions`,
  },
  prescriptions: {
    collection: '/health/prescriptions',
    dispense: (prescriptionId: string) => `/health/prescriptions/${seg(prescriptionId)}/dispense`,
  },
  laboratory: {
    orders: '/health/lab-orders',
    results: (orderId: string) => `/health/lab-orders/${seg(orderId)}/results`,
    validateResult: (resultId: string) => `/health/lab-results/${seg(resultId)}/validate`,
  },
  admissions: {
    collection: '/health/admissions',
    bedMovements: (admissionId: string) => `/health/admissions/${seg(admissionId)}/bed-movements`,
    discharge: (admissionId: string) => `/health/admissions/${seg(admissionId)}/discharge`,
  },
  billing: {
    invoices: '/health/billing/invoices',
    payments: (invoiceId: string) => `/health/invoices/${seg(invoiceId)}/payments`,
  },
  /**
   * ── AJOUTS PHASE 3 (contrat PROPOSÉ, absent du CDC §11.2 — à valider avec l'équipe backend) ──
   * Commandes métier : POST {collection}/{id}/{action} (confirm, cancel, validate, sign, close, access…).
   */
  medicalRecords: { collection: '/health/medical-records' },
  consultationsList: { collection: '/health/consultations' },
  triage: {
    collection: '/health/triage',
    vitals: (entryId: string) => `/health/triage/${seg(entryId)}/vitals`,
  },
  beds: { collection: '/health/beds' },
  cash: { transactions: '/health/cash/transactions' },
  /** Tarification, couvertures et abonnements (contrats PROPOSÉS, voir docs/API_CONTRACTS_NEEDED.md). */
  finance: {
    catalog: '/health/catalog-items',
    organizations: '/health/organizations',
    contracts: '/health/contracts',
    coverages: '/health/patient-coverages',
    subscriptions: '/health/subscriptions',
    consultationFees: '/health/consultation-fees',
    feeConfig: '/health/consultation-fee-config',
  },
  audit: { collection: '/health/audit-logs' },
  administration: {
    services: '/health/services',
    /** Annuaire du personnel (praticiens inclus). Proposition : l'identité réelle relèvera de CERO ID CORE. */
    staff: '/health/staff',
    facility: '/health/facility',
    reportRun: (reportId: string) => `/health/reports/${seg(reportId)}/run`,
  },
  reports: {
    dashboard: '/health/reports/dashboard',
    stock: '/health/reports/stock',
    finance: '/health/reports/finance',
  },
} as const;
