import type { CatalogItem } from '@/core/pricing/types';
import { BusinessRuleError } from '../_shared/business-error';

/**
 * Conditionnement des produits : un même produit se vend à plusieurs niveaux (boîte, sachet, comprimé), chacun avec son prix.
 * Le stock est compté dans la plus petite unité (« unité de base ») : chaque vente en retire le bon nombre.
 */
export interface StockLink { stockId: string; factor: number }

/** Article qui porte le stock, et nombre d'unités de base retirées par unité vendue. */
export const stockLink = (item: Pick<CatalogItem, 'id' | 'stock'>): StockLink => ({ stockId: item.stock?.itemId ?? item.id, factor: item.stock?.perUnit ?? 1 });

/** Vrai pour un article qui porte son propre stock (produit principal) ; faux pour une unité dérivée (sachet, comprimé…). */
export const holdsStock = (item: Pick<CatalogItem, 'id' | 'stock'>): boolean => stockLink(item).stockId === item.id;

export interface PackagingView { perUnit: number; unit: string; baseUnit: string }

/** « 12 boîtes + 5 comprimés » (ou seulement l'un des deux) ; sans conditionnement, le nombre brut. */
export function formatStock(quantity: number, p: PackagingView | undefined): string {
  if (!p || p.perUnit <= 1) return String(quantity);
  const packs = Math.floor(quantity / p.perUnit);
  const loose = quantity - packs * p.perUnit;
  if (packs === 0) return `${loose} ${p.baseUnit}`;
  return loose === 0 ? `${packs} ${p.unit}` : `${packs} ${p.unit} + ${loose} ${p.baseUnit}`;
}

export interface ExtraUnit { id?: string; label: string; perUnit: number; price: number }
export interface PackagingInput { perPack: number; unit: string; baseUnit: string; extras: ExtraUnit[] }

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Valide le conditionnement. `perPack` = 1 : produit sans conditionnement (comportement historique). */
export function checkPackaging(p: PackagingInput): PackagingInput {
  const perPack = Number(p.perPack);
  if (!Number.isInteger(perPack) || perPack < 1 || perPack > 100000) throw new BusinessRuleError('packagingPerPackInvalid');
  const unit = clean(p.unit);
  const baseUnit = clean(p.baseUnit);
  if (perPack > 1 && (unit === '' || baseUnit === '')) throw new BusinessRuleError('packagingLabelsRequired');
  if (perPack > 1 && unit.toLowerCase() === baseUnit.toLowerCase()) throw new BusinessRuleError('packagingLabelsDifferent');
  const extras = perPack === 1 ? [] : p.extras.map((e) => ({ ...e, label: clean(e.label) }));
  const seenLabels = new Set<string>([unit.toLowerCase()]);
  const seenSizes = new Set<number>([perPack]);
  for (const e of extras) {
    if (e.label === '' || !Number.isInteger(e.perUnit) || e.perUnit < 1 || e.perUnit >= perPack) throw new BusinessRuleError('packagingExtraInvalid', { label: e.label || '?' });
    if (!(e.price > 0)) throw new BusinessRuleError('packagingExtraPrice', { label: e.label });
    if (seenLabels.has(e.label.toLowerCase()) || seenSizes.has(e.perUnit)) throw new BusinessRuleError('packagingExtraDuplicate', { label: e.label });
    seenLabels.add(e.label.toLowerCase());
    seenSizes.add(e.perUnit);
  }
  return { perPack, unit, baseUnit: perPack === 1 ? '' : baseUnit, extras };
}

const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8);

/** Articles dérivés (sachet, comprimé…) : mêmes règles de catégorie, stock partagé avec le produit principal. */
export function deriveUnits(product: CatalogItem, extras: readonly (ExtraUnit & { id: string; minor: number })[], taken: ReadonlySet<string>): CatalogItem[] {
  const used = new Set(taken);
  return extras.map((e) => {
    let code = `${product.code}-${slug(e.label) || 'U'}`.slice(0, 20);
    for (let i = 2; used.has(code.toUpperCase()); i += 1) code = `${product.code}-${slug(e.label) || 'U'}`.slice(0, 17) + `-${i}`;
    used.add(code.toUpperCase());
    return {
      id: e.id, code, label: `${product.label} — ${e.label}`, category: 'pharmacy' as const,
      price: { minor: e.minor, currency: product.price.currency }, active: product.active,
      stock: { itemId: product.id, perUnit: e.perUnit }, unit: e.label,
    };
  });
}
