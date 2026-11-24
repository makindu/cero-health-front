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
 * Catalogue des prestations sur l'API réelle (HEALTH /catalog-items?kind=service) : consultations, soins, hospitalisation, imagerie…
 * Un acte n'a ni stock ni lot ni unité ; son tarif vit dans UZISHA. Les examens de laboratoire n'en font pas partie.
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const list = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);
const MAX_PAGES = 30;

export interface ApiServicesCatalog {
  items: CatalogItem[];
  /** Devise du catalogue ; null tant qu'aucune devise par défaut n'est définie (les prix ne sont alors pas affichés). */
  currency: string | null;
}

/** Une ligne de /catalog-items → prestation. Un prix absent donne un montant nul (affiché « — »). */
export function serviceFromApi(r: Row, currency: string): CatalogItem {
  const article = rec(r.article);
  const id = text(r.id);
  return {
    id,
    code: text(article.code_manuel) || id,
    label: text(article.name) || text(r.generic_name),
    category: 'procedure',
    price: { minor: Number(r.price_minor) || 0, currency },
    active: r.is_active === true,
  };
}

export async function fetchServicesCatalog(): Promise<ApiServicesCatalog> {
  const rows: Row[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await healthClient.get<Row[]>('/catalog-items', { params: { per_page: 100, page, kind: 'service' } });
    rows.push(...list(res.data));
    if (page >= (res.meta?.lastPage ?? 1)) break;
  }
  const currency = rows.map((r) => text(r.currency)).find((c) => c !== '') ?? null;
  return { items: rows.map((r) => serviceFromApi(r, currency ?? '')).sort((a, b) => a.label.localeCompare(b.label)), currency };
}

/** Prestations de l'établissement actif ; se relit sur les signaux temps réel (entité catalog_items). */
export function useServicesCatalog() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'service-catalog', 'list'),
    queryFn: fetchServicesCatalog,
    enabled: referenceFromApi(),
  });
}

/** Après « Voir » d'un bandeau « nouvelle prestation » : lit seulement les éléments annoncés (appel ciblé) et les range dans la liste affichée. */
export async function loadServicesArrivals(queryClient: QueryClient, facilityId: string | null, ids: readonly number[]): Promise<void> {
  const key = queryKeys.scoped(facilityId, 'service-catalog', 'list');
  const cached = queryClient.getQueryData<ApiServicesCatalog>(key);
  const have = new Set(cached?.items.map((i) => i.id) ?? []);
  const missing = ids.filter((id) => !have.has(String(id)));
  if (missing.length === 0) return;
  if (!cached || missing.length > 300) {
    await queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  const found: CatalogItem[] = [];
  for (let i = 0; i < missing.length; i += 100) {
    // kind=service : un article qui n'est pas une prestation (médicament, examen) n'est pas renvoyé
    const res = await healthClient.get<Row[]>('/catalog-items', { params: { ids: missing.slice(i, i + 100).join(','), per_page: 100, kind: 'service' } });
    for (const r of list(res.data)) found.push(serviceFromApi(r, cached.currency ?? text(r.currency)));
  }
  if (found.length > 0) queryClient.setQueryData<ApiServicesCatalog>(key, (old) => (old ? { ...old, items: mergeItems(old.items, found, (a, b) => a.label.localeCompare(b.label)) } : old));
}

export interface ImportService {
  /** Absent : le serveur en crée un (SRV-001…). */
  code?: string;
  label: string;
  /** Montant décimal. */
  price: number;
  active: boolean;
}

const minor = (amount: number): number => Math.round(amount * 100);

/** Corps d'une ligne d'importation : montants en unités mineures, noms de champs du serveur. */
export function serviceRowToWire(s: ImportService): Record<string, unknown> {
  return { ...(s.code ? { code: s.code } : {}), label: s.label, price_minor: minor(s.price), is_active: s.active };
}

/** Importe (crée ou met à jour) des prestations avec leur tarif ; tout ou rien côté serveur. */
export async function importServicesCatalog(input: { items: ImportService[] }): Promise<{ created: number; updated: number; unchanged: number }> {
  const res = await healthClient.post<Record<string, unknown>>('/catalog-items/import-services', { items: input.items.map(serviceRowToWire) });
  const d = rec(res.data);
  return { created: Number(d.created) || 0, updated: Number(d.updated) || 0, unchanged: Number(d.unchanged) || 0 };
}

/** Une seule prestation (formulaire « Ajouter / Modifier ») : même chemin que l'importation, une ligne. */
export const saveService = (s: ImportService) => importServicesCatalog({ items: [s] });

/** Mutation du catalogue des prestations : relit la liste (et la facturation, qui en dépend) puis confirme. */
export function useServicesMutation<I, R>(run: (input: I) => Promise<R>, options: { successTitle: string; onDone?: (result: R) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      for (const scope of ['service-catalog', 'finance', 'insurance']) void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, scope) });
      toast({ tone: 'success', title: options.successTitle });
      options.onDone?.(result);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'service-catalog') });
      const server = error instanceof ApiError && error.status && error.status < 500 ? error.message : undefined;
      toast({ tone: 'danger', title: server ?? t('module.saveFailed'), description: server ? undefined : t('module.saveFailedHint') });
    },
  });
}
