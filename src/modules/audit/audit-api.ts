import { healthClient } from '@/core/api';

/** Journal d'audit (lecture seule) : qui a fait quoi, quand, avec quel résultat. Le serveur filtre et pagine. */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);

export const AUDIT_PAGE = 50;
export type AuditOutcome = 'success' | 'denied' | 'failed';
export const AUDIT_OUTCOMES: readonly AuditOutcome[] = ['success', 'denied', 'failed'];

export interface AuditRow {
  id: string; at: string; actorId: string; actorName: string; action: string; entityType: string; entityId: string;
  outcome: AuditOutcome; reason: string; requestId: string;
}
export interface AuditFilters { outcome: '' | AuditOutcome; action: string; from: string; to: string }
export const NO_AUDIT_FILTER: AuditFilters = { outcome: '', action: '', from: '', to: '' };

export function auditFrom(r: Row): AuditRow {
  const outcome = text(r.outcome);
  return {
    id: text(r.id), at: text(r.occurred_at), actorId: r.actor_user_id ? text(r.actor_user_id) : '', actorName: text(r.actor_name).trim(), action: text(r.action),
    entityType: text(r.entity_type), entityId: r.entity_id ? text(r.entity_id) : '',
    outcome: outcome === 'denied' || outcome === 'failed' ? outcome : 'success', reason: text(r.reason), requestId: text(r.request_id),
  };
}

/** Qui a agi : le nom si le serveur le connaît, sinon le numéro, sinon rien. */
export const actorLabel = (e: Pick<AuditRow, 'actorId' | 'actorName'>, fallback: (id: string) => string): string =>
  e.actorName || (e.actorId ? fallback(e.actorId) : '—');

/** Paramètres envoyés au serveur : seuls les filtres renseignés partent, la période couvre les journées entières. */
export function auditParams(f: AuditFilters, page: number): Record<string, string | number> {
  const p: Record<string, string | number> = { per_page: AUDIT_PAGE, page };
  if (f.outcome) p.outcome = f.outcome;
  if (f.action.trim()) p.action = f.action.trim();
  if (f.from) p.from = `${f.from}T00:00:00`;
  if (f.to) p.to = `${f.to}T23:59:59`;
  return p;
}

/** Période incohérente : la fin précède le début. */
export const periodInvalid = (f: AuditFilters): boolean => f.from !== '' && f.to !== '' && f.to < f.from;

/** « drug_name.reviewed » → « drug name reviewed » : lisible quand aucune traduction n'existe. */
export const actionLabel = (code: string): string => code.replace(/[._]+/g, ' ').trim();

export const apiAudit = {
  list: async (f: AuditFilters, page: number): Promise<{ rows: AuditRow[]; total: number }> => {
    const res = await healthClient.get<Row[]>('/audit-events', { params: auditParams(f, page) });
    const list = rows(res.data).map(auditFrom);
    return { rows: list, total: res.meta?.total ?? list.length };
  },
};
