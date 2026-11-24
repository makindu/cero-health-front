import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { ApiError, healthClient } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { mergeItems } from '@/core/live/new-arrivals';
import { usePreferences } from '@/core/preferences/preferences-store';
import type { CatalogItem } from '@/core/pricing/types';
import { referenceFromApi } from '../_shared/reference-data';

/**
 * Catalogue des examens de laboratoire sur l'API réelle : la liste vient de /lab-tests, le tarif de l'élément de catalogue lié à chaque examen
 * (/catalog-items?kind=lab, prix UZISHA). Création, modification et importation passent par /lab-tests/import (code, désignation, prix, état).
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const list = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);
const MAX_PAGES = 30;

export interface ApiLabCatalog {
  items: CatalogItem[];
  /** Devise du catalogue ; null tant qu'aucun tarif n'existe (les prix ne sont alors pas affichés). */
  currency: string | null;
}

/** Un examen du serveur + le tarif de son élément de catalogue (s'il en a un) → ligne du catalogue. Sans tarif : montant nul (affiché « — »). */
export function labExamFromApi(exam: Row, priceByItem: ReadonlyMap<string, { minor: number; currency: string }>, fallbackCurrency: string): CatalogItem {
  const price = priceByItem.get(text(exam.catalog_item_id));
  return {
    id: text(exam.id),
    code: text(exam.code),
    label: text(exam.label),
    category: 'laboratory',
    price: { minor: price?.minor ?? 0, currency: price?.currency ?? fallbackCurrency },
    active: exam.is_active !== false,
  };
}

async function pages(path: string, params: Record<string, unknown>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await healthClient.get<Row[]>(path, { params: { ...params, page } });
    rows.push(...list(res.data));
    if (page >= (res.meta?.lastPage ?? 1)) break;
  }
  return rows;
}

export async function fetchLabCatalog(): Promise<ApiLabCatalog> {
  const [exams, items] = await Promise.all([pages('/lab-tests', { per_page: 200 }), pages('/catalog-items', { per_page: 100, kind: 'lab' })]);
  const priceByItem = new Map<string, { minor: number; currency: string }>();
  for (const r of items) priceByItem.set(text(r.id), { minor: Number(r.price_minor) || 0, currency: text(r.currency) });
  const currency = items.map((r) => text(r.currency)).find((c) => c !== '') ?? null;
  return { items: exams.map((e) => labExamFromApi(e, priceByItem, currency ?? '')).sort((a, b) => a.label.localeCompare(b.label)), currency };
}

/** Examens de l'établissement actif avec leur tarif ; se relit sur les signaux temps réel (entités lab_tests et catalog_items). */
export function useLabCatalog() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'lab-catalog', 'list'),
    queryFn: fetchLabCatalog,
    enabled: referenceFromApi(),
  });
}

/**
 * Après « Voir » d'un bandeau « nouvel examen » : lit UNIQUEMENT les examens annoncés et le tarif de leur élément de catalogue (deux appels ciblés),
 * puis les range dans la liste affichée. Sans liste en mémoire, ou pour un très gros import, la liste est relue.
 */
export async function loadLabArrivals(queryClient: QueryClient, facilityId: string | null, ids: readonly number[]): Promise<void> {
  const key = queryKeys.scoped(facilityId, 'lab-catalog', 'list');
  const cached = queryClient.getQueryData<ApiLabCatalog>(key);
  const have = new Set(cached?.items.map((i) => i.id) ?? []);
  const missing = ids.filter((id) => !have.has(String(id)));
  if (missing.length === 0) return;
  if (!cached || missing.length > 300) {
    await queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  const found: CatalogItem[] = [];
  for (let i = 0; i < missing.length; i += 100) {
    const exams = list((await healthClient.get<Row[]>('/lab-tests', { params: { ids: missing.slice(i, i + 100).join(',') } })).data);
    const itemIds = exams.map((e) => text(e.catalog_item_id)).filter((v) => v !== '');
    const priceByItem = new Map<string, { minor: number; currency: string }>();
    if (itemIds.length > 0) {
      const res = await healthClient.get<Row[]>('/catalog-items', { params: { ids: itemIds.join(','), per_page: 100, kind: 'lab' } });
      for (const r of list(res.data)) priceByItem.set(text(r.id), { minor: Number(r.price_minor) || 0, currency: text(r.currency) });
    }
    for (const e of exams) found.push(labExamFromApi(e, priceByItem, cached.currency ?? ''));
  }
  if (found.length > 0) queryClient.setQueryData<ApiLabCatalog>(key, (old) => (old ? { ...old, items: mergeItems(old.items, found, (a, b) => a.label.localeCompare(b.label)) } : old));
}

export interface ImportLabExam {
  code: string;
  label: string;
  /** Montant décimal. */
  price: number;
  active: boolean;
}

const minor = (amount: number): number => Math.round(amount * 100);

/** Corps d'une ligne d'importation : montants en unités mineures, noms de champs du serveur. */
export function labRowToWire(e: ImportLabExam): Record<string, unknown> {
  return { code: e.code, label: e.label, price_minor: minor(e.price), is_active: e.active };
}

/** Importe (crée ou met à jour) des examens avec leur prix ; tout ou rien côté serveur. */
export async function importLabCatalog(input: { items: ImportLabExam[] }): Promise<{ created: number; updated: number; unchanged: number }> {
  const res = await healthClient.post<Record<string, unknown>>('/lab-tests/import', { items: input.items.map(labRowToWire) });
  const d = rec(res.data);
  return { created: Number(d.created) || 0, updated: Number(d.updated) || 0, unchanged: Number(d.unchanged) || 0 };
}

/** Un seul examen (formulaire « Ajouter / Modifier ») : même chemin que l'importation, une ligne. */
export const saveLabExam = (e: ImportLabExam) => importLabCatalog({ items: [e] });

/** Mutation du catalogue des examens : relit la liste, le laboratoire, la file « à valider » et la facturation, puis confirme. */
export function useLabCatalogMutation<I, R>(run: (input: I) => Promise<R>, options: { successTitle: string; onDone?: (result: R) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      for (const scope of ['lab-catalog', 'laboratory', 'review', 'finance']) void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, scope) });
      toast({ tone: 'success', title: options.successTitle });
      options.onDone?.(result);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'lab-catalog') });
      const server = error instanceof ApiError && error.status && error.status < 500 ? error.message : undefined;
      toast({ tone: 'danger', title: server ?? t('module.saveFailed'), description: server ? undefined : t('module.saveFailedHint') });
    },
  });
}
