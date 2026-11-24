import { healthClient } from '@/core/api';

/**
 * File « à valider » : médicaments et examens ajoutés à la volée par le personnel. Le gestionnaire du catalogue les confirme,
 * corrige le nom ou les relie à un article réel. Rien n'est supprimé : une ordonnance garde le texte prescrit.
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);

export const REVIEW_PAGE = 25;

export interface DrugNameRow { id: string; name: string; origin: string; needsReview: boolean; uses: number; catalogItemId: string; createdAt: string }
export interface ExamRow { id: string; code: string; label: string; isActive: boolean; origin: string; needsReview: boolean; catalogItemId: string }
export interface CatalogChoice { id: string; label: string; nature: string }

export function drugFrom(r: Row): DrugNameRow {
  return { id: text(r.id), name: text(r.name), origin: text(r.origin), needsReview: Boolean(r.needs_review), uses: num(r.uses), catalogItemId: r.catalog_item_id ? text(r.catalog_item_id) : '', createdAt: text(r.created_at) };
}
export function examFrom(r: Row): ExamRow {
  return { id: text(r.id), code: text(r.code), label: text(r.label), isActive: r.is_active !== false, origin: text(r.origin), needsReview: Boolean(r.needs_review), catalogItemId: r.catalog_item_id ? text(r.catalog_item_id) : '' };
}
export function catalogChoiceFrom(r: Row): CatalogChoice {
  return { id: text(r.id), label: [text(r.generic_name), text(r.strength)].filter(Boolean).join(' ') || `#${text(r.id)}`, nature: text(r.nature) };
}

export interface DrugPatch { name?: string; needs_review?: boolean; catalog_item_id?: number | null }
export interface ExamPatch { label?: string; needs_review?: boolean; catalog_item_id?: number | null }

export const apiReview = {
  drugs: async (needsReview: boolean, page: number): Promise<{ rows: DrugNameRow[]; total: number }> => {
    const res = await healthClient.get<Row[]>('/drug-names', { params: { needs_review: needsReview ? 'true' : 'false', per_page: REVIEW_PAGE, page } });
    const list = rows(res.data).map(drugFrom);
    return { rows: list, total: res.meta?.total ?? list.length };
  },
  updateDrug: async (id: string, patch: DrugPatch): Promise<DrugNameRow> => drugFrom(rec((await healthClient.patch<Row>(`/drug-names/${id}`, patch)).data)),

  exams: async (needsReview: boolean): Promise<ExamRow[]> => rows((await healthClient.get<Row[]>('/lab-tests', { params: { needs_review: needsReview ? 'true' : 'false' } })).data).map(examFrom),
  updateExam: async (id: string, patch: ExamPatch): Promise<ExamRow> => examFrom(rec((await healthClient.patch<Row>(`/lab-tests/${id}`, patch)).data)),

  /** Articles actifs du catalogue dont le nom contient le texte (pour relier un médicament ou un examen à un vrai article). */
  catalogItems: async (q: string): Promise<CatalogChoice[]> =>
    rows((await healthClient.get<Row[]>('/catalog-items', { params: { is_active: 'true', per_page: 10, q } })).data).map(catalogChoiceFrom),
};
