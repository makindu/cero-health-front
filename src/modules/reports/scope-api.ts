import { healthClient } from '@/core/api';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

export interface ReportScope { userId: string; careUnitIds: string[] }
export interface MyScope { restricted: boolean; careUnitIds: string[] }

export const scopeFrom = (r: Row): ReportScope => ({ userId: String(r.user_id ?? ''), careUnitIds: ids(r.care_unit_ids) });

export const apiScope = {
  /** Mes services : restricted=false → je vois tout. */
  me: async (): Promise<MyScope> => {
    const d = rec((await healthClient.get<Row>('/report-scopes/me')).data);
    return { restricted: d.restricted === true, careUnitIds: ids(d.care_unit_ids) };
  },
  /** Utilisateurs qui ont une restriction (les autres voient tout). */
  list: async (): Promise<ReportScope[]> => {
    const d = (await healthClient.get<Row[]>('/report-scopes')).data;
    return (Array.isArray(d) ? d : []).map((r) => scopeFrom(rec(r)));
  },
  /** Remplace les services d'un utilisateur ; liste vide = plus de restriction. */
  set: async (userId: string, careUnitIds: string[]): Promise<ReportScope> =>
    scopeFrom(rec((await healthClient.put<Row>(`/report-scopes/${userId}`, { care_unit_ids: careUnitIds.map(Number) })).data)),
};
