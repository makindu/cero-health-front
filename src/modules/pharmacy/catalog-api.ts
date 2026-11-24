import { useQuery, type QueryClient } from '@tanstack/react-query';
import { healthClient } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { mergeItems } from '@/core/live/new-arrivals';
import { usePreferences } from '@/core/preferences/preferences-store';
import type { CatalogItem } from '@/core/pricing/types';
import { referenceFromApi } from '../_shared/reference-data';
import type { PackagingInput } from './packaging';

/**
 * Catalogue de la pharmacie sur l'API réelle (HEALTH /catalog-items) : médicaments et consommables avec leur prix (UZISHA),
 * leur conditionnement (boîte = N comprimés) et leurs unités de vente dérivées. Les lots et quantités ne sont pas lus ici.
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const list = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);
const STOCKED = ['medication', 'consumable', 'medical_device'];
const MAX_PAGES = 30;

export interface ApiCatalog {
  items: CatalogItem[];
  /** Devise de facturation de l'établissement ; null tant qu'elle n'est pas réglée (les prix ne sont alors pas affichés). */
  currency: string | null;
}

/** Une ligne de /catalog-items → article du catalogue. Un prix absent donne un montant nul (affiché « — »). */
export function catalogItemFromApi(r: Row, currency: string): CatalogItem {
  const article = rec(r.article);
  const id = text(r.id);
  const perUnit = Number(r.stock_per_unit) || 1;
  const unit = text(r.unit_label);
  const base = text(r.base_unit_label);
  const holder = r.stock_item_id ? text(r.stock_item_id) : '';
  return {
    id,
    code: text(article.code_manuel) || id,
    label: text(article.name) || text(r.generic_name),
    category: 'pharmacy',
    price: { minor: Number(r.price_minor) || 0, currency },
    active: r.is_active === true,
    ...(holder ? { stock: { itemId: holder, perUnit } } : perUnit > 1 ? { stock: { itemId: id, perUnit } } : {}),
    ...(unit ? { unit } : {}),
    ...(base ? { baseUnit: base } : {}),
  };
}

export async function fetchPharmacyCatalog(): Promise<ApiCatalog> {
  const rows: Row[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await healthClient.get<Row[]>('/catalog-items', { params: { per_page: 100, page } });
    rows.push(...list(res.data));
    if (page >= (res.meta?.lastPage ?? 1)) break;
  }
  const stocked = rows.filter((r) => STOCKED.includes(text(r.nature)));
  const currency = rows.map((r) => text(r.currency)).find((c) => c !== '') ?? null;
  const items = stocked.map((r) => catalogItemFromApi(r, currency ?? '')).sort((a, b) => a.label.localeCompare(b.label));
  return { items, currency };
}

/** Catalogue de la pharmacie de l'établissement actif ; se relit sur les signaux temps réel (entité catalog_items). */
export function usePharmacyCatalog() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'pharmacy', 'catalog'),
    queryFn: fetchPharmacyCatalog,
    enabled: referenceFromApi(),
  });
}

const BY_LABEL = (a: CatalogItem, b: CatalogItem) => a.label.localeCompare(b.label);

/**
 * Après le clic sur « Voir » d'un bandeau « nouvel article » : lit UNIQUEMENT les éléments annoncés (un appel ciblé, prix compris) et les range
 * dans la liste déjà affichée, à leur place alphabétique. Sans liste en mémoire, ou pour un très gros import, la liste est relue.
 */
export async function loadPharmacyArrivals(queryClient: QueryClient, facilityId: string | null, ids: readonly number[]): Promise<void> {
  const key = queryKeys.scoped(facilityId, 'pharmacy', 'catalog');
  const cached = queryClient.getQueryData<ApiCatalog>(key);
  const have = new Set(cached?.items.map((i) => i.id) ?? []);
  const missing = ids.filter((id) => !have.has(String(id)));
  if (missing.length === 0) return;
  if (!cached || missing.length > 300) {
    await queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  const found: CatalogItem[] = [];
  for (let i = 0; i < missing.length; i += 100) {
    const res = await healthClient.get<Row[]>('/catalog-items', { params: { ids: missing.slice(i, i + 100).join(','), per_page: 100 } });
    for (const r of list(res.data)) if (STOCKED.includes(text(r.nature))) found.push(catalogItemFromApi(r, cached.currency ?? text(r.currency)));
  }
  if (found.length > 0) queryClient.setQueryData<ApiCatalog>(key, (old) => (old ? { ...old, items: mergeItems(old.items, found, BY_LABEL) } : old));
}

export interface ImportProduct {
  /** Absent : le serveur en crée un (PHA-001…). */
  code?: string;
  label: string;
  /** Montant décimal de l'unité principale. */
  price: number;
  active: boolean;
  perPack: number;
  unit: string;
  baseUnit: string;
  extras: { label: string; perUnit: number; price: number }[];
}

const minor = (amount: number): number => Math.round(amount * 100);

/** Corps d'une ligne d'importation : montants en unités mineures, noms de champs du serveur. */
export function importRowToWire(p: ImportProduct): Record<string, unknown> {
  return {
    ...(p.code ? { code: p.code } : {}),
    label: p.label,
    price_minor: minor(p.price),
    is_active: p.active,
    per_pack: p.perPack,
    unit_label: p.unit || null,
    base_unit_label: p.perPack > 1 ? p.baseUnit : null,
    extras: p.perPack > 1 ? p.extras.map((e) => ({ label: e.label, per_unit: e.perUnit, price_minor: minor(e.price) })) : [],
  };
}

/** Importe (crée ou met à jour) des médicaments avec leurs prix et unités ; tout ou rien côté serveur. */
export async function importPharmacyCatalog(input: { items: ImportProduct[] }): Promise<{ created: number; updated: number; unchanged: number }> {
  const res = await healthClient.post<Record<string, unknown>>('/catalog-items/import', { items: input.items.map(importRowToWire) });
  const d = rec(res.data);
  return { created: Number(d.created) || 0, updated: Number(d.updated) || 0, unchanged: Number(d.unchanged) || 0 };
}

/** Un seul produit (formulaire « Ajouter / Modifier un médicament ») : même chemin que l'importation, une ligne. */
export function productToImport(item: Pick<CatalogItem, 'code' | 'label' | 'price' | 'active'>, packaging: PackagingInput): ImportProduct {
  return {
    code: item.code,
    label: item.label,
    price: item.price.minor / 100,
    active: item.active,
    perPack: packaging.perPack,
    unit: packaging.unit,
    baseUnit: packaging.baseUnit,
    extras: packaging.extras.map((e) => ({ label: e.label, perUnit: e.perUnit, price: e.price })),
  };
}
