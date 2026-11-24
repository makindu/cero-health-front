import { describe, expect, it } from 'vitest';
import { catalogItemFromApi, importRowToWire, productToImport } from './catalog-api';
import { holdsStock } from './packaging';

describe('catalogue de la pharmacie (API)', () => {
  it('produit principal conditionné : porte son propre stock', () => {
    const i = catalogItemFromApi({ id: 7, nature: 'medication', is_active: true, stock_per_unit: 100, unit_label: 'Boîte', base_unit_label: 'Comprimé', price_minor: 5000, article: { name: 'Amoxicilline', code_manuel: 'AMX' } }, 'USD');
    expect(i).toMatchObject({ id: '7', code: 'AMX', label: 'Amoxicilline', price: { minor: 5000, currency: 'USD' }, active: true, unit: 'Boîte', baseUnit: 'Comprimé', stock: { itemId: '7', perUnit: 100 } });
    expect(holdsStock(i)).toBe(true);
  });

  it('unité dérivée : puise dans le stock du produit principal', () => {
    const i = catalogItemFromApi({ id: 8, stock_item_id: 7, stock_per_unit: 10, unit_label: 'Plaquette', price_minor: 600, is_active: true, article: { name: 'Amoxicilline — Plaquette' } }, 'USD');
    expect(i.stock).toEqual({ itemId: '7', perUnit: 10 });
    expect(holdsStock(i)).toBe(false);
  });

  it('produit simple, sans prix ni code : valeurs sûres', () => {
    const i = catalogItemFromApi({ id: 3, generic_name: 'Paracétamol', is_active: false, stock_per_unit: 1, article: null }, '');
    expect(i).toMatchObject({ code: '3', label: 'Paracétamol', price: { minor: 0, currency: '' }, active: false });
    expect(i.stock).toBeUndefined();
  });

  it('corps d\'importation : unités mineures, extras seulement si conditionné', () => {
    const wire = importRowToWire({ code: 'AMX', label: 'Amoxicilline', price: 50, active: true, perPack: 100, unit: 'Boîte', baseUnit: 'Comprimé', extras: [{ label: 'Plaquette', perUnit: 10, price: 6.5 }] });
    expect(wire).toEqual({ code: 'AMX', label: 'Amoxicilline', price_minor: 5000, is_active: true, per_pack: 100, unit_label: 'Boîte', base_unit_label: 'Comprimé', extras: [{ label: 'Plaquette', per_unit: 10, price_minor: 650 }] });
    const simple = importRowToWire({ label: 'Zinc', price: 4.05, active: true, perPack: 1, unit: '', baseUnit: '', extras: [{ label: 'x', perUnit: 1, price: 1 }] });
    expect(simple).toEqual({ label: 'Zinc', price_minor: 405, is_active: true, per_pack: 1, unit_label: null, base_unit_label: null, extras: [] });
  });

  it('le formulaire d\'un produit passe par la même ligne d\'importation', () => {
    const p = productToImport({ code: 'AMX', label: 'Amoxicilline', price: { minor: 5000, currency: 'USD' }, active: true }, { perPack: 100, unit: 'Boîte', baseUnit: 'Comprimé', extras: [{ label: 'Plaquette', perUnit: 10, price: 6.5 }] });
    expect(p).toMatchObject({ code: 'AMX', price: 50, perPack: 100, extras: [{ label: 'Plaquette', perUnit: 10, price: 6.5 }] });
  });
});
