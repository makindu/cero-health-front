import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '@/core/pricing/types';
import { checkPackaging, deriveUnits, formatStock, holdsStock, stockLink } from './packaging';

const box: CatalogItem = { id: 'p1', code: 'PHA-AMX', label: 'Amoxicilline 500', category: 'pharmacy', price: { minor: 10000, currency: 'USD' }, active: true, unit: 'boîte', baseUnit: 'comprimé', stock: { itemId: 'p1', perUnit: 100 } };

describe('packaging', () => {
  it('formate le stock en boîtes et comprimés', () => {
    const p = { perUnit: 100, unit: 'boîte', baseUnit: 'comprimé' };
    expect(formatStock(1205, p)).toBe('12 boîte + 5 comprimé');
    expect(formatStock(300, p)).toBe('3 boîte');
    expect(formatStock(7, p)).toBe('7 comprimé');
    expect(formatStock(7, undefined)).toBe('7');
  });
  it('un article dérivé puise dans le stock du produit principal', () => {
    const [sachet] = deriveUnits(box, [{ id: 's1', label: 'sachet', perUnit: 10, price: 12, minor: 1200 }], new Set());
    expect(stockLink(sachet!)).toEqual({ stockId: 'p1', factor: 10 });
    expect(holdsStock(sachet!)).toBe(false);
    expect(holdsStock(box)).toBe(true);
    expect(stockLink({ id: 'x' })).toEqual({ stockId: 'x', factor: 1 });
  });
  it('3 comprimés d\'un sachet de 10 : le stock baisse de 3 unités de base', () => {
    const [cp] = deriveUnits(box, [{ id: 'c1', label: 'comprimé', perUnit: 1, price: 1.5, minor: 150 }], new Set());
    expect(stockLink(cp!).factor * 3).toBe(3);
    expect(cp!.price.minor * 3).toBe(450);
  });
  it('valide le conditionnement', () => {
    expect(() => checkPackaging({ perPack: 0, unit: '', baseUnit: '', extras: [] })).toThrow();
    expect(() => checkPackaging({ perPack: 100, unit: '', baseUnit: 'cp', extras: [] })).toThrow();
    expect(() => checkPackaging({ perPack: 100, unit: 'boîte', baseUnit: 'boîte', extras: [] })).toThrow();
    expect(() => checkPackaging({ perPack: 100, unit: 'boîte', baseUnit: 'cp', extras: [{ label: 'sachet', perUnit: 100, price: 1 }] })).toThrow();
    expect(() => checkPackaging({ perPack: 100, unit: 'boîte', baseUnit: 'cp', extras: [{ label: 'sachet', perUnit: 10, price: 0 }] })).toThrow();
    expect(checkPackaging({ perPack: 1, unit: '', baseUnit: '', extras: [{ label: 'x', perUnit: 1, price: 1 }] }).extras).toEqual([]);
    expect(checkPackaging({ perPack: 100, unit: 'boîte', baseUnit: 'cp', extras: [{ label: 'sachet', perUnit: 10, price: 12 }] }).extras).toHaveLength(1);
  });
});
