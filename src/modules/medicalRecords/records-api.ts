import { healthClient } from '@/core/api';
import type { RecordStatus } from './data';
import type { RecordAction } from './record-rules';

/** Dossiers médicaux lus sur le serveur : métadonnées et compteurs seulement, jamais de contenu clinique dans cette liste. */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);
const count = (v: unknown): number | null => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

export const RECORDS_PAGE = 25;
export const RECORD_STATUSES: readonly RecordStatus[] = ['active', 'archived', 'locked'];

export interface RecordCounts { consultations: number | null; prescriptions: number | null; labOrders: number | null; documents: number | null; admissions: number | null }
export interface RecordEvent { action: string; from: string; to: string; reason: string; actorId: string; at: string }
export interface ApiRecord {
  id: string; number: string; patientId: string; patientName: string; patientNumber: string; status: RecordStatus;
  openedAt: string; statusChangedAt: string; statusReason: string; lastAccessAt: string; lastExportAt: string;
  counts: RecordCounts; events: RecordEvent[];
}

const statusOf = (v: unknown): RecordStatus => (v === 'archived' || v === 'locked' ? v : 'active');

export function recordFrom(r: Row): ApiRecord {
  const p = rec(r.patient);
  const c = rec(r.counts);
  return {
    id: text(r.id), number: text(r.record_number), patientId: text(r.patient_id), patientName: text(p.full_name), patientNumber: text(p.patient_number),
    status: statusOf(r.status), openedAt: text(r.opened_at), statusChangedAt: text(r.status_changed_at), statusReason: text(r.status_reason),
    lastAccessAt: text(r.last_access_at), lastExportAt: text(r.last_export_at),
    counts: { consultations: count(c.consultations), prescriptions: count(c.prescriptions), labOrders: count(c.lab_orders), documents: count(c.documents), admissions: count(c.admissions) },
    events: rows(r.events).map((e) => ({ action: text(e.action), from: text(e.from_status), to: text(e.to_status), reason: text(e.reason), actorId: e.actor_user_id ? text(e.actor_user_id) : '', at: text(e.occurred_at) })),
  };
}

export interface RecordFilters { status: '' | RecordStatus; q: string }
export const NO_RECORD_FILTER: RecordFilters = { status: '', q: '' };

/** Le serveur ne cherche qu'à partir de 2 lettres : en dessous, la recherche n'est pas envoyée. */
export function recordParams(f: RecordFilters, page: number): Record<string, string | number> {
  const p: Record<string, string | number> = { per_page: RECORDS_PAGE, page };
  if (f.status) p.status = f.status;
  const q = f.q.trim();
  if (q.length >= 2) p.q = q;
  return p;
}

/** Motif facultatif : espaces retirés, vide = non envoyé, 255 caractères au plus. */
export function reasonBody(reason: string): { reason?: string } {
  const r = reason.trim();
  return r === '' ? {} : { reason: r.slice(0, 255) };
}
export const REASON_MAX = 255;

export const apiRecords = {
  list: async (f: RecordFilters, page: number): Promise<{ rows: ApiRecord[]; total: number }> => {
    const res = await healthClient.get<Row[]>('/medical-records', { params: recordParams(f, page) });
    const list = rows(res.data).map(recordFrom);
    return { rows: list, total: res.meta?.total ?? list.length };
  },
  get: async (id: string): Promise<ApiRecord> => recordFrom(rec((await healthClient.get<Row>(`/medical-records/${id}`)).data)),
  open: async (patientId: string): Promise<ApiRecord> => recordFrom(rec((await healthClient.post<Row>('/medical-records', { patient_id: Number(patientId) })).data)),
  act: async (id: string, action: RecordAction, reason: string): Promise<ApiRecord> =>
    recordFrom(rec((await healthClient.post<Row>(`/medical-records/${id}/actions/${action}`, reasonBody(reason))).data)),
};
