import { healthClient } from '@/core/api';

/**
 * Facturation sur l'API HEALTH : une « facture » est le lien entre un acte (consultation, examen, dispensation) et la facture UZISHA.
 * Le serveur calcule les prix, vérifie les droits, refuse un trop-perçu et rejoue sans doublon une même clé d'idempotence :
 * l'interface ne calcule aucun montant, elle montre et envoie.
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);

export const PAGE = 25;
export const METHODS = ['cash', 'mobile_money', 'card', 'transfer'] as const;
export type Method = (typeof METHODS)[number];
export type LinkState = 'awaiting' | 'partial' | 'paid' | 'cancelled';

export interface BillingPayment { id: string; amountMinor: number; method: string; paidAt: string; groupId: string | null }
export interface BillingLink {
  id: string; sourceType: string; sourceId: string; patientId: string; patientName: string; currency: string; status: string;
  totalMinor: number; paidMinor: number; remainingMinor: number; createdAt: string; cancelReason: string; payments: BillingPayment[];
}

export function linkFrom(r: Row): BillingLink {
  return {
    id: text(r.id), sourceType: text(r.source_type), sourceId: text(r.source_id), patientId: text(r.patient_id),
    patientName: text(r.patient_name) || (r.patient_id ? `#${text(r.patient_id)}` : ''), currency: text(r.currency) || 'USD', status: text(r.status),
    totalMinor: num(r.total_minor), paidMinor: num(r.paid_minor), remainingMinor: num(r.remaining_minor), createdAt: text(r.created_at), cancelReason: text(r.cancel_reason),
    payments: rows(r.payments).map((p) => ({ id: text(p.id), amountMinor: num(p.amount_minor), method: text(p.method), paidAt: text(p.paid_at), groupId: p.group_id ? text(p.group_id) : null })),
  };
}

/** État lisible d'une facture : le serveur ne renvoie que « active » ou « cancelled » ; le reste se déduit des montants. */
export function stateOf(l: Pick<BillingLink, 'status' | 'totalMinor' | 'paidMinor' | 'remainingMinor'>): LinkState {
  if (l.status === 'cancelled') return 'cancelled';
  if (l.remainingMinor <= 0 && l.totalMinor > 0) return 'paid';
  return l.paidMinor > 0 ? 'partial' : 'awaiting';
}

export interface PatientBalance { currency: string; outstandingMinor: number }
export interface GroupShare { linkId: string; sourceType: string; amountMinor: number; remainingMinor: number }
export interface GroupReceipt { groupId: string; currency: string; totalMinor: number; shares: GroupShare[] }

export function balanceFrom(r: Row): PatientBalance[] {
  return rows(r.balances).map((b) => ({ currency: text(b.currency) || 'USD', outstandingMinor: num(b.outstanding_minor) })).filter((b) => b.outstandingMinor > 0);
}
export function receiptFrom(r: Row): GroupReceipt {
  return {
    groupId: text(r.group_id), currency: text(r.currency) || 'USD', totalMinor: num(r.total_minor),
    shares: rows(r.shares).map((x) => ({ linkId: text(x.link_id), sourceType: text(x.source_type), amountMinor: num(x.amount_minor), remainingMinor: num(x.remaining_minor) })),
  };
}

/** Réglages de facturation de l'établissement : pour l'instant le dépôt rattaché aux prestations sans stock propre. */
export interface BillingSettings { defaultDepositId: string | null; currency: string }
export function settingsFrom(r: unknown): BillingSettings {
  const o = rec(r);
  return { defaultDepositId: o.default_deposit_id === null || o.default_deposit_id === undefined ? null : text(o.default_deposit_id), currency: text(o.currency) };
}
/** « Automatique » (chaîne vide) = aucun dépôt imposé : le serveur prend celui des autres lignes, puis le premier de l'établissement. */
export function depositPayload(depositId: string): { default_deposit_id: number | null } {
  const n = Number(depositId);
  return { default_deposit_id: depositId !== '' && Number.isInteger(n) && n > 0 ? n : null };
}

export interface LinkQuery { status?: string; sourceType?: string; patientId?: string; page: number }

export const apiBilling = {
  settings: async (): Promise<BillingSettings> => settingsFrom((await healthClient.get<Row>('/billing/settings')).data),

  setDefaultDeposit: async (depositId: string): Promise<BillingSettings> => settingsFrom((await healthClient.put<Row>('/billing/settings', depositPayload(depositId))).data),

  list: async (q: LinkQuery): Promise<{ rows: BillingLink[]; total: number }> => {
    const params: Record<string, string | number> = { per_page: PAGE, page: q.page };
    if (q.status) params.status = q.status;
    if (q.sourceType) params.source_type = q.sourceType;
    if (q.patientId) params.patient_id = q.patientId;
    const res = await healthClient.get<Row[]>('/billing/links', { params });
    const list = rows(res.data).map(linkFrom);
    return { rows: list, total: res.meta?.total ?? list.length };
  },

  show: async (id: string): Promise<BillingLink> => linkFrom(rec((await healthClient.get<Row>(`/billing/links/${id}`)).data)),

  /** La clé d'idempotence rend l'envoi sûr : un clic double ou un rejeu après coupure ne crée jamais un second paiement. */
  pay: async (id: string, amountMinor: number, method: Method, key: string): Promise<BillingLink> =>
    linkFrom(rec((await healthClient.post<Row>(`/billing/links/${id}/payments`, { amount_minor: amountMinor, method }, { headers: { 'Idempotency-Key': key } })).data)),

  balance: async (patientId: string): Promise<PatientBalance[]> => balanceFrom(rec((await healthClient.get<Row>(`/patients/${patientId}/balance`)).data)),

  /** Un montant réparti par le serveur sur les factures dues (la plus ancienne d'abord) ; tout ou rien, rejouable avec la même clé. */
  payGroup: async (patientId: string, amountMinor: number, method: Method, currency: string, key: string): Promise<GroupReceipt> =>
    receiptFrom(rec((await healthClient.post<Row>(`/patients/${patientId}/billing/payments`, { amount_minor: amountMinor, method, currency }, { headers: { 'Idempotency-Key': key } })).data)),

  cancel: async (id: string, reason: string): Promise<BillingLink> =>
    linkFrom(rec((await healthClient.post<Row>(`/billing/links/${id}/cancel`, { reason })).data)),
};
