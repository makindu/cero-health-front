import { describe, expect, it } from 'vitest';
import { labExamFromApi, labRowToWire } from './lab-catalog-api';

describe('catalogue des examens (API)', () => {
  const prices = new Map([['7', { minor: 300, currency: 'USD' }]]);
  it('un examen reprend le tarif de son élément de catalogue', () => {
    expect(labExamFromApi({ id: 4, code: 'GLY', label: 'Glycémie', is_active: true, catalog_item_id: 7 }, prices, 'USD'))
      .toEqual({ id: '4', code: 'GLY', label: 'Glycémie', category: 'laboratory', price: { minor: 300, currency: 'USD' }, active: true });
  });
  it('un examen sans tarif (ajouté en consultation) a un montant nul', () => {
    const e = labExamFromApi({ id: 5, code: 'AUTO-1', label: 'Test rapide', is_active: true, catalog_item_id: null }, prices, 'USD');
    expect(e.price).toEqual({ minor: 0, currency: 'USD' });
  });
  it('un examen inactif est marqué comme tel', () => {
    expect(labExamFromApi({ id: 6, code: 'X', label: 'X', is_active: false }, prices, '').active).toBe(false);
  });
  it('la ligne d\'importation est en unités mineures avec les champs du serveur', () => {
    expect(labRowToWire({ code: 'GLY', label: 'Glycémie', price: 3.5, active: true })).toEqual({ code: 'GLY', label: 'Glycémie', price_minor: 350, is_active: true });
  });
});
