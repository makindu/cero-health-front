import { healthClient } from '@/core/api';

/**
 * Assurance sur l'API HEALTH : organismes payeurs, créances sur les factures, règlements reçus et rejets.
 * Le serveur répartit les règlements, calcule les soldes et refuse un trop-perçu : l'interface montre et envoie.
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);

export const ORG_KINDS = ['insurer', 'mutuelle', 'company', 'institution', 'other'] as const;
export const ORG_STATUSES = ['active', 'suspended', 'inactive'] as const;
export const SETTLE_MODES = ['oldest', 'member', 'proportional'] as const;
export type OrgKind = (typeof ORG_KINDS)[number];
export type OrgStatus = (typeof ORG_STATUSES)[number];
export type SettleMode = (typeof SETTLE_MODES)[number];

export interface ApiOrganization {
  id: string; code: string; name: string; kind: string; contactPerson: string; phone: string; email: string; status: string;
  validFrom: string; validTo: string; conditions: string;
}
export interface OrganizationInput {
  code?: string; name: string; kind: OrgKind; contactPerson: string; phone: string; email: string; status?: OrgStatus;
  validFrom: string; validTo: string; conditions: string;
}
export interface Due {
  id: string; linkId: string; patientId: string; patientName: string; fileNumber: string; currency: string;
  amountMinor: number; settledMinor: number; rejectedMinor: number; outstandingMinor: number; status: string; createdAt: string;
}
export interface Settlement { id: string; currency: string; mode: string; patientId: string; amountMinor: number; reference: string; paidOn: string; note: string }
export interface CurrencyTotals { currency: string; billedMinor: number; settledMinor: number; rejectedMinor: number; outstandingMinor: number }
export interface Statement { from: string; to: string; totals: CurrencyTotals[]; dues: Due[]; settlements: Settlement[] }
export interface SettleInput { amountMinor: number; currency: string; mode: SettleMode; patientId?: string; reference: string; paidOn: string; note: string }
export interface SettleResult { settlementId: string; allocations: { dueId: string; amountMinor: number }[] }

export interface ApiRule {
  category: string; itemCode: string; coverageBp: number; excluded: boolean; negotiatedUnitMinor: number | null;
  ceilingPerLineMinor: number | null; quota: number | null; requiresAuthorization: boolean;
}
export interface ApiContract {
  id: string; organizationId: string; label: string; currency: string; validFrom: string; validTo: string; status: string;
  franchiseMinor: number | null; ceilingMinor: number | null; allowsComplementary: boolean; canBeComplementary: boolean; conditions: string; rules: ApiRule[];
}
export interface ApiSubscription {
  id: string; type: string; holderName: string; patientIds: string[]; priceMinor: number; currency: string; validFrom: string; validTo: string;
  status: string; freeConsultations: number | null; discounts: Record<string, number>; includedCategories: string[];
}
export interface ApiCoverage {
  id: string; patientId: string; organizationId: string; contractId: string; kind: string; policyNumber: string; cardNumber: string; memberNumber: string;
  coverageType: string; validFrom: string; validTo: string; status: string; ceilingRemainingMinor: number | null; priority: number; beneficiaryIds: string[];
}
export interface ApiAuthorization { id: string; itemCode: string; grantedAt: string; note: string }
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));

export function ruleFrom(r: Row): ApiRule {
  return {
    category: text(r.category), itemCode: text(r.item_code), coverageBp: num(r.coverage_bp), excluded: Boolean(r.excluded),
    negotiatedUnitMinor: numOrNull(r.negotiated_unit_minor), ceilingPerLineMinor: numOrNull(r.ceiling_per_line_minor), quota: numOrNull(r.quota),
    requiresAuthorization: Boolean(r.requires_authorization),
  };
}
export function contractFrom(r: Row): ApiContract {
  return {
    id: text(r.id), organizationId: text(r.organization_id), label: text(r.label), currency: text(r.currency) || 'USD', validFrom: text(r.valid_from), validTo: text(r.valid_to),
    status: text(r.status), franchiseMinor: numOrNull(r.franchise_per_episode_minor), ceilingMinor: numOrNull(r.ceiling_per_episode_minor),
    allowsComplementary: Boolean(r.allows_complementary), canBeComplementary: Boolean(r.can_be_complementary), conditions: text(r.conditions), rules: rows(r.rules).map(ruleFrom),
  };
}
export function subscriptionFrom(r: Row): ApiSubscription {
  const d = rec(r.discounts);
  return {
    id: text(r.id), type: text(r.type), holderName: text(r.holder_name), patientIds: Array.isArray(r.patient_ids) ? r.patient_ids.map(text) : [],
    priceMinor: num(r.price_minor), currency: text(r.currency) || 'USD', validFrom: text(r.valid_from), validTo: text(r.valid_to), status: text(r.status),
    freeConsultations: numOrNull(r.free_consultations), discounts: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, num(v)])),
    includedCategories: Array.isArray(r.included_categories) ? r.included_categories.map(text) : [],
  };
}

export function coverageFrom(r: Row): ApiCoverage {
  return {
    id: text(r.id), patientId: text(r.patient_id), organizationId: text(r.organization_id), contractId: text(r.contract_id), kind: text(r.kind),
    policyNumber: text(r.policy_number), cardNumber: text(r.card_number), memberNumber: text(r.member_number), coverageType: text(r.coverage_type),
    validFrom: text(r.valid_from), validTo: text(r.valid_to), status: text(r.status), ceilingRemainingMinor: numOrNull(r.ceiling_remaining_minor),
    priority: num(r.priority) || 1, beneficiaryIds: Array.isArray(r.beneficiary_ids) ? r.beneficiary_ids.map(text) : [],
  };
}
export function authorizationFrom(r: Row): ApiAuthorization { return { id: text(r.id), itemCode: text(r.item_code), grantedAt: text(r.granted_at), note: text(r.note) }; }

export function organizationFrom(r: Row): ApiOrganization {
  return {
    id: text(r.id), code: text(r.code), name: text(r.name), kind: text(r.kind), contactPerson: text(r.contact_person), phone: text(r.phone), email: text(r.email),
    status: text(r.status), validFrom: text(r.valid_from), validTo: text(r.valid_to), conditions: text(r.conditions),
  };
}

export function dueFrom(r: Row): Due {
  const p = rec(r.patient);
  return {
    id: text(r.id), linkId: text(r.link_id), patientId: text(r.patient_id),
    patientName: text(p.full_name) || (r.patient_id ? `#${text(r.patient_id)}` : ''), fileNumber: text(p.file_number), currency: text(r.currency) || 'USD',
    amountMinor: num(r.amount_minor), settledMinor: num(r.settled_minor), rejectedMinor: num(r.rejected_minor), outstandingMinor: num(r.outstanding_minor),
    status: text(r.status), createdAt: text(r.created_at),
  };
}

export function settlementFrom(r: Row): Settlement {
  return { id: text(r.id), currency: text(r.currency), mode: text(r.mode), patientId: r.patient_id ? text(r.patient_id) : '', amountMinor: num(r.amount_minor), reference: text(r.reference), paidOn: text(r.paid_on), note: text(r.note) };
}

export function statementFrom(r: Row): Statement {
  const period = rec(r.period);
  return {
    from: text(period.from), to: text(period.to),
    totals: rows(r.totals).map((t) => ({ currency: text(t.currency), billedMinor: num(t.billed_minor), settledMinor: num(t.settled_minor), rejectedMinor: num(t.rejected_minor), outstandingMinor: num(t.outstanding_minor) })),
    dues: rows(r.dues).map(dueFrom), settlements: rows(r.settlements).map(settlementFrom),
  };
}

/** Une créance qu'on peut encore régler ou rejeter. */
export const isOpenDue = (d: Pick<Due, 'status' | 'outstandingMinor'>): boolean => (d.status === 'open' || d.status === 'partial') && d.outstandingMinor > 0;

/** Corps envoyé à la création/modification d'un organisme : le code ne se change plus, le statut ne se choisit qu'en modification. */
export function organizationPayload(v: OrganizationInput, creating: boolean): Record<string, unknown> {
  const opt = (s: string): string | null => (s.trim() === '' ? null : s.trim());
  const body: Record<string, unknown> = {
    name: v.name.trim(), kind: v.kind, contact_person: opt(v.contactPerson), phone: opt(v.phone), email: opt(v.email),
    valid_from: v.validFrom, valid_to: opt(v.validTo), conditions: opt(v.conditions),
  };
  if (creating) body.code = (v.code ?? '').trim().toUpperCase();
  else if (v.status) body.status = v.status;
  return body;
}

export function settlePayload(i: SettleInput): Record<string, unknown> {
  const body: Record<string, unknown> = { amount_minor: i.amountMinor, currency: i.currency, mode: i.mode, paid_on: i.paidOn };
  if (i.mode === 'member') body.patient_id = Number(i.patientId);
  if (i.reference.trim()) body.reference = i.reference.trim();
  if (i.note.trim()) body.note = i.note.trim();
  return body;
}

export function settleResultFrom(r: Row): SettleResult {
  return { settlementId: text(rec(r.settlement).id), allocations: rows(r.allocations).map((a) => ({ dueId: text(a.due_id), amountMinor: num(a.amount_minor) })) };
}

export const apiInsurance = {
  organizations: async (): Promise<ApiOrganization[]> => rows((await healthClient.get<Row[]>('/insurance/organizations')).data).map(organizationFrom),

  saveOrganization: async (id: string | null, v: OrganizationInput): Promise<ApiOrganization> => {
    const body = organizationPayload(v, id === null);
    const res = id === null ? await healthClient.post<Row>('/insurance/organizations', body) : await healthClient.patch<Row>(`/insurance/organizations/${id}`, body);
    return organizationFrom(rec(res.data));
  },

  contracts: async (): Promise<ApiContract[]> => rows((await healthClient.get<Row[]>('/insurance/contracts')).data).map(contractFrom),

  saveContract: async (id: string | null, body: Record<string, unknown>): Promise<ApiContract> => {
    const res = id === null ? await healthClient.post<Row>('/insurance/contracts', body) : await healthClient.patch<Row>(`/insurance/contracts/${id}`, body);
    return contractFrom(rec(res.data));
  },

  subscriptions: async (): Promise<ApiSubscription[]> => rows((await healthClient.get<Row[]>('/insurance/subscriptions')).data).map(subscriptionFrom),

  saveSubscription: async (id: string | null, body: Record<string, unknown>): Promise<ApiSubscription> => {
    const res = id === null ? await healthClient.post<Row>('/insurance/subscriptions', body) : await healthClient.patch<Row>(`/insurance/subscriptions/${id}`, body);
    return subscriptionFrom(rec(res.data));
  },

  coverages: async (patientId: string): Promise<ApiCoverage[]> => rows((await healthClient.get<Row[]>(`/patients/${patientId}/insurance-coverages`)).data).map(coverageFrom),

  saveCoverage: async (patientId: string, id: string | null, body: Record<string, unknown>): Promise<ApiCoverage> => {
    const res = id === null ? await healthClient.post<Row>(`/patients/${patientId}/insurance-coverages`, body) : await healthClient.patch<Row>(`/insurance/coverages/${id}`, body);
    return coverageFrom(rec(res.data));
  },

  decideCoverage: async (id: string, status: string, note: string): Promise<ApiCoverage> =>
    coverageFrom(rec((await healthClient.post<Row>(`/insurance/coverages/${id}/decision`, note.trim() ? { status, note: note.trim() } : { status })).data)),

  authorizations: async (coverageId: string): Promise<ApiAuthorization[]> => rows((await healthClient.get<Row[]>(`/insurance/coverages/${coverageId}/authorizations`)).data).map(authorizationFrom),

  grantAuthorization: async (coverageId: string, itemCode: string, note: string): Promise<ApiAuthorization> =>
    authorizationFrom(rec((await healthClient.post<Row>(`/insurance/coverages/${coverageId}/authorizations`, note.trim() ? { item_code: itemCode.trim(), note: note.trim() } : { item_code: itemCode.trim() })).data)),

  statement: async (orgId: string, from: string, to: string): Promise<Statement> =>
    statementFrom(rec((await healthClient.get<Row>(`/insurance/organizations/${orgId}/statement`, { params: { from, to } })).data)),

  /** La clé d'idempotence rend l'envoi sûr : un clic double ou un rejeu après coupure ne crée jamais deux règlements. */
  settle: async (orgId: string, i: SettleInput, key: string): Promise<SettleResult> =>
    settleResultFrom(rec((await healthClient.post<Row>(`/insurance/organizations/${orgId}/settlements`, settlePayload(i), { headers: { 'Idempotency-Key': key } })).data)),

  reject: async (dueId: string, reason: string, amountMinor?: number): Promise<void> => {
    await healthClient.post(`/insurance/dues/${dueId}/reject`, amountMinor ? { reason: reason.trim(), amount_minor: amountMinor } : { reason: reason.trim() });
  },
};
