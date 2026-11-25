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
/** Moyen de paiement reçu de l'organisme. */
export const PAYMENT_METHODS = ['transfer', 'cash', 'mobile_money', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

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
export interface Settlement { id: string; currency: string; mode: string; paymentMethod: string; patientId: string; amountMinor: number; reference: string; paidOn: string; note: string }
export interface CurrencyTotals { currency: string; billedMinor: number; settledMinor: number; rejectedMinor: number; outstandingMinor: number }
export interface Statement { from: string; to: string; totals: CurrencyTotals[]; dues: Due[]; settlements: Settlement[] }
export interface OutboxMail { id: string; toEmail: string; status: 'queued' | 'sent' | 'failed'; createdAt: string; by: string }

export function outboxFrom(r: Row): OutboxMail {
  const status = r.status === 'sent' || r.status === 'failed' ? r.status : 'queued';
  return { id: text(r.id), toEmail: text(r.to_email), status, createdAt: text(r.created_at), by: text(r.by) };
}

/** Relevé synthétique (une ligne par créance) ou détaillé (par patient, avec ses consommations et sous-totaux). */
export type StatementKind = 'synthetic' | 'detailed';

export interface StatementMailInput { from: string; to: string; email: string; message: string; kind?: StatementKind }

/** Adresse et message seulement s'ils sont saisis : le serveur reprend sinon l'adresse de l'organisme. */
export function statementMailPayload(i: StatementMailInput): Record<string, unknown> {
  const email = i.email.trim();
  const message = i.message.trim();
  return { from: i.from, to: i.to, ...(i.kind === 'detailed' ? { kind: 'detailed' } : {}), ...(email ? { email } : {}), ...(message ? { message } : {}) };
}

export interface SettleInput { amountMinor: number; currency: string; mode: SettleMode; paymentMethod: PaymentMethod; patientId?: string; reference: string; paidOn: string; note: string }
export interface SettleResult { settlementId: string; allocations: { dueId: string; amountMinor: number }[] }

export interface ApiRule {
  category: string; itemCode: string; catalogItemId: string; coverageBp: number; excluded: boolean; negotiatedUnitMinor: number | null;
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
  /** Nom du patient (liste globale) ; vide si l'utilisateur n'a pas le droit de lire les patients. */
  patientName: string;
}
export interface ApiAuthorization { id: string; itemCode: string; catalogItemId: string; grantedAt: string; note: string }
/** Acte du catalogue proposé par la recherche (prestation, examen ou médicament). */
export interface ApiCatalogHit { id: string; label: string; code: string; kind: string }
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));

export function ruleFrom(r: Row): ApiRule {
  return {
    category: text(r.category), itemCode: text(r.item_code), catalogItemId: text(r.catalog_item_id), coverageBp: num(r.coverage_bp), excluded: Boolean(r.excluded),
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
    priority: num(r.priority) || 1, beneficiaryIds: Array.isArray(r.beneficiary_ids) ? r.beneficiary_ids.map(text) : [], patientName: text(r.patient_name),
  };
}
export function catalogHitFrom(r: Row): ApiCatalogHit { return { id: text(r.id), label: text(r.label), code: text(r.code), kind: text(r.kind) }; }
export function authorizationFrom(r: Row): ApiAuthorization { return { id: text(r.id), itemCode: text(r.item_code), catalogItemId: text(r.catalog_item_id), grantedAt: text(r.granted_at), note: text(r.note) }; }

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
  return { id: text(r.id), currency: text(r.currency), mode: text(r.mode), paymentMethod: text(r.payment_method), patientId: r.patient_id ? text(r.patient_id) : '', amountMinor: num(r.amount_minor), reference: text(r.reference), paidOn: text(r.paid_on), note: text(r.note) };
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
  const body: Record<string, unknown> = { amount_minor: i.amountMinor, currency: i.currency, mode: i.mode, payment_method: i.paymentMethod, paid_on: i.paidOn };
  if (i.mode === 'member') body.patient_id = Number(i.patientId);
  if (i.reference.trim()) body.reference = i.reference.trim();
  if (i.note.trim()) body.note = i.note.trim();
  return body;
}

export function settleResultFrom(r: Row): SettleResult {
  return { settlementId: text(rec(r.settlement).id), allocations: rows(r.allocations).map((a) => ({ dueId: text(a.due_id), amountMinor: num(a.amount_minor) })) };
}

/** Monnaie de l'établissement (celles de la comptabilité), proposée pour un contrat ou un abonnement. */
export interface ApiCurrency {
  code: string;
  isDefault: boolean;
}

export function currencyFrom(r: Row): ApiCurrency {
  return { code: text(r.code).toUpperCase(), isDefault: r.is_default === true };
}

/** Monnaie à présélectionner : la principale, sinon la première ; vide si l'établissement n'en a aucune. */
export function defaultCurrency(list: readonly ApiCurrency[]): string {
  return (list.find((c) => c.isDefault) ?? list[0])?.code ?? '';
}

export const apiInsurance = {
  currencies: async (): Promise<ApiCurrency[]> => rows((await healthClient.get<Row[]>('/insurance/currencies')).data).map(currencyFrom).filter((c) => c.code !== ''),

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

  /** Toutes les couvertures de l'établissement, paginées côté serveur (plus récentes d'abord). */
  coveragePage: async (p: { page: number; perPage: number; status?: string; q?: string; patientId?: string }): Promise<{ rows: ApiCoverage[]; total: number }> => {
    const res = await healthClient.get<Row[]>('/insurance/coverages', { params: { page: p.page, per_page: p.perPage, ...(p.status ? { status: p.status } : {}), ...(p.q ? { q: p.q } : {}), ...(p.patientId ? { patient_id: p.patientId } : {}) } });
    const list = rows(res.data).map(coverageFrom);
    return { rows: list, total: res.meta?.total ?? list.length };
  },

  saveCoverage: async (patientId: string, id: string | null, body: Record<string, unknown>): Promise<ApiCoverage> => {
    const res = id === null ? await healthClient.post<Row>(`/patients/${patientId}/insurance-coverages`, body) : await healthClient.patch<Row>(`/insurance/coverages/${id}`, body);
    return coverageFrom(rec(res.data));
  },

  decideCoverage: async (id: string, status: string, note: string): Promise<ApiCoverage> =>
    coverageFrom(rec((await healthClient.post<Row>(`/insurance/coverages/${id}/decision`, note.trim() ? { status, note: note.trim() } : { status })).data)),

  authorizations: async (coverageId: string): Promise<ApiAuthorization[]> => rows((await healthClient.get<Row[]>(`/insurance/coverages/${coverageId}/authorizations`)).data).map(authorizationFrom),

  /** Accord préalable : l'acte est désigné par son identifiant dans le catalogue (le code seul reste possible pour d'anciens accords). */
  grantAuthorization: async (coverageId: string, target: { catalogItemId?: string; itemCode?: string }, note: string): Promise<ApiAuthorization> =>
    authorizationFrom(rec((await healthClient.post<Row>(`/insurance/coverages/${coverageId}/authorizations`, {
      ...(target.catalogItemId ? { catalog_item_id: Number(target.catalogItemId) } : { item_code: (target.itemCode ?? '').trim() }), ...(note.trim() ? { note: note.trim() } : {}),
    })).data)),

  /** Recherche d'actes par nom ou code d'examen (autocomplétion) ; 15 résultats au plus, rien avant 2 caractères. */
  searchActs: async (q: string): Promise<ApiCatalogHit[]> => (q.trim().length < 2 ? [] : rows((await healthClient.get<Row[]>('/insurance/catalog-search', { params: { q: q.trim() } })).data).map(catalogHitFrom)),
  /** Relit des actes connus par leur identifiant (affichage des règles et accords déjà enregistrés). */
  actsByIds: async (ids: string[]): Promise<ApiCatalogHit[]> => (ids.length === 0 ? [] : rows((await healthClient.get<Row[]>('/insurance/catalog-search', { params: { ids: ids.slice(0, 100).join(',') } })).data).map(catalogHitFrom)),

  statement: async (orgId: string, from: string, to: string): Promise<Statement> =>
    statementFrom(rec((await healthClient.get<Row>(`/insurance/organizations/${orgId}/statement`, { params: { from, to } })).data)),

  /** Relevé imprimé par le serveur (PDF A4). */
  statementPdf: async (orgId: string, from: string, to: string, kind: StatementKind = 'synthetic'): Promise<Blob> =>
    new Blob([(await healthClient.raw.get<Blob>(`/insurance/organizations/${orgId}/statement/pdf`, { params: { from, to, ...(kind === 'detailed' ? { kind } : {}) }, responseType: 'blob', headers: { Accept: 'application/pdf' } })).data], { type: 'application/pdf' }),

  /** Derniers envois du relevé à l'organisme (l'envoi part en arrière-plan : on lit ici son état). */
  statementMails: async (orgId: string): Promise<OutboxMail[]> => rows((await healthClient.get<Row[]>(`/insurance/organizations/${orgId}/statement/mails`)).data).map(outboxFrom),

  /** Envoie le relevé en PDF par e-mail. Adresse vide : celle de l'organisme. La clé évite un double envoi sur double clic. */
  sendStatement: async (orgId: string, i: StatementMailInput, key: string): Promise<{ email: string }> => {
    const r = rec((await healthClient.post<Row>(`/insurance/organizations/${orgId}/statement/send`, statementMailPayload(i), { headers: { 'Idempotency-Key': key } })).data);
    return { email: text(r.email) };
  },

  /** La clé d'idempotence rend l'envoi sûr : un clic double ou un rejeu après coupure ne crée jamais deux règlements. */
  settle: async (orgId: string, i: SettleInput, key: string): Promise<SettleResult> =>
    settleResultFrom(rec((await healthClient.post<Row>(`/insurance/organizations/${orgId}/settlements`, settlePayload(i), { headers: { 'Idempotency-Key': key } })).data)),

  reject: async (dueId: string, reason: string, amountMinor?: number): Promise<void> => {
    await healthClient.post(`/insurance/dues/${dueId}/reject`, amountMinor ? { reason: reason.trim(), amount_minor: amountMinor } : { reason: reason.trim() });
  },
};
