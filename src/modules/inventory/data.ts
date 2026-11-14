import { isoDay } from '@/utils/dates';
import { createResourceService } from '../_shared/resource-service';
import { pick } from '../_shared/demo-people';

export type ProductCategory = 'pharmacy' | 'consumables' | 'reagents' | 'equipment';
export type StockLevel = 'ok' | 'low' | 'out' | 'expiring';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  unit: string;
  quantity: number;
  minLevel: number;
  expiresAt: string | null;
  supplier: string;
  location: string;
}

export const CATEGORIES: readonly ProductCategory[] = ['pharmacy', 'consumables', 'reagents', 'equipment'];

const SOON_MS = 90 * 24 * 3600 * 1000;
const AT_LOAD = Date.now();

/** Niveau de stock déduit des quantités et de la péremption. */
export function stockLevel(product: Product): StockLevel {
  if (product.quantity <= 0) return 'out';
  if (product.quantity <= product.minLevel) return 'low';
  if (product.expiresAt && new Date(product.expiresAt).getTime() - AT_LOAD < SOON_MS) return 'expiring';
  return 'ok';
}

/** FICTIF : articles de démonstration, quantités arbitraires. */
export const DEMO_PRODUCTS: readonly Product[] = Array.from({ length: 30 }, (_, i) => {
  const category = pick(CATEGORIES, i);
  const minLevel = 10 + (i % 4) * 5;
  const quantity = pick([0, 4, 12, 40, 75, 120, 8, 200], i * 3 + 1);
  return {
    id: `DEMO-S-${String(i + 1).padStart(3, '0')}`,
    name: `Article démo ${String(i + 1).padStart(2, '0')}`,
    category,
    unit: pick(['boîte', 'flacon', 'unité', 'carton'], i),
    quantity,
    minLevel,
    expiresAt: category === 'equipment' ? null : isoDay(20 + ((i * 37) % 400)),
    supplier: `Fournisseur démo ${(i % 4) + 1}`,
    location: `Rayon ${String.fromCharCode(65 + (i % 5))}`,
  };
});

/**
 * Source : application de stock CERO UZISHA. Ses routes ne sont pas connues (routes/api.php non fourni) :
 * AUCUN endpoint n'est supposé. Tant qu'il n'est pas confirmé, seule la démonstration est disponible.
 */
export const productService = createResourceService<Product>({
  source: 'uzisha',
  endpoint: undefined,
  demoRows: DEMO_PRODUCTS,
  searchText: (p) => `${p.name} ${p.id} ${p.supplier}`,
  matchFilter: (p, filter, value) =>
    filter === 'level' ? stockLevel(p) === value : String((p as unknown as Record<string, unknown>)[filter]) === value,
  sortValue: (p, column) =>
    column === 'quantity' ? p.quantity : String((p as unknown as Record<string, unknown>)[column] ?? ''),
});
