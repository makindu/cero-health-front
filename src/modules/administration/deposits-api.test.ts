import { describe, expect, it } from 'vitest';
import { canEnterStock, depositFrom, entryBody, memberFrom, membersBody, membersProblem, receiveUnits, stockItemFrom, stockLineFrom, stockText } from './deposits-api';

describe('dépôts de stock', () => {
  it('lit un dépôt et un membre de l\'API', () => {
    expect(depositFrom({ id: 4, name: 'Pharmacie', description: null, members_count: 3, chief_name: 'Dr Z' }))
      .toEqual({ id: '4', name: 'Pharmacie', description: '', membersCount: 3, chiefName: 'Dr Z', myLevel: '' });
    expect(depositFrom({ id: 4, name: 'P', my_level: 'all' }).myLevel).toBe('all');
    expect(depositFrom({ id: 4, name: 'P', my_level: 'root' }).myLevel).toBe('');
    expect(memberFrom({ staff_id: 9, name: 'Ana', level: 'all' })).toEqual({ staffId: '9', name: 'Ana', level: 'all' });
    expect(memberFrom({ staff_id: 9, name: 'Ana', level: 'inconnu' }).level).toBe('entry');
  });

  it('exige exactement un chef, des membres complets et sans doublon', () => {
    expect(membersProblem([])).toBe('empty');
    expect(membersProblem([{ staffId: '1', level: '' }])).toBe('incomplete');
    expect(membersProblem([{ staffId: '', level: 'chief' }])).toBe('incomplete');
    expect(membersProblem([{ staffId: '1', level: 'chief' }, { staffId: '1', level: 'entry' }])).toBe('duplicate');
    expect(membersProblem([{ staffId: '1', level: 'all' }])).toBe('noChief');
    expect(membersProblem([{ staffId: '1', level: 'chief' }, { staffId: '2', level: 'chief' }])).toBe('manyChiefs');
    expect(membersProblem([{ staffId: '1', level: 'chief' }, { staffId: '2', level: 'entry' }, { staffId: '3', level: 'withdraw' }])).toBeNull();
  });

  it('envoie les identifiants en nombres', () => {
    expect(membersBody([{ staffId: '12', level: 'chief' }])).toEqual({ members: [{ staff_id: 12, level: 'chief' }] });
  });

  it('seuls les niveaux entrée, tout et chef peuvent enregistrer une entrée de stock', () => {
    expect([canEnterStock('entry'), canEnterStock('all'), canEnterStock('chief')]).toEqual([true, true, true]);
    expect([canEnterStock('withdraw'), canEnterStock('')]).toEqual([false, false]);
  });

  it('prépare le corps d\'une entrée sans champ vide', () => {
    expect(entryBody({ depositId: '3', catalogItemId: '8', quantity: 12, unit: 'base', unitCost: '', expirationDate: '', reference: ' ' })).toEqual({ catalog_item_id: 8, quantity: 12 });
    expect(entryBody({ depositId: '3', catalogItemId: '8', quantity: 5, unit: 'pack', unitCost: '1,50', expirationDate: '2030-01-31', reference: ' BL-1 ' }))
      .toEqual({ catalog_item_id: 8, quantity: 5, unit: 'pack', unit_cost: '1.50', expiration_date: '2030-01-31', reference: 'BL-1' });
    // une unité dérivée n'envoie pas d'unité : le serveur la déduit du produit
    expect(entryBody({ depositId: '3', catalogItemId: '9', quantity: 1, unit: 'derived', unitCost: '', expirationDate: '', reference: '' })).toEqual({ catalog_item_id: 9, quantity: 1 });
    expect(stockLineFrom({ service_id: 7, name: 'CATHETER', available: 15 })).toEqual({ serviceId: '7', name: 'CATHETER', available: 15, perPack: 1, packLabel: '', baseLabel: '' });
  });

  it('affiche le stock en unité de base et en conditionnement', () => {
    const l = (available: number, perPack = 100) => stockLineFrom({ service_id: 1, name: 'Paracétamol', available, per_pack: perPack, pack_label: 'boîte', base_label: 'comprimé' });
    expect(stockText(l(235))).toBe('235 comprimé (2 boîte + 35 comprimé)');
    expect(stockText(l(200))).toBe('200 comprimé (2 boîte)');
    expect(stockText(l(35))).toBe('35 comprimé');
    expect(stockText(l(235, 1))).toBe('235 comprimé');
    expect(stockText(stockLineFrom({ service_id: 2, name: 'Gants', available: 4 }))).toBe('4');
  });

  it('propose les unités de réception définies dans le pricing', () => {
    const main = stockItemFrom({ id: 1, generic_name: 'Paracétamol', nature: 'medication', unit_label: 'boîte', base_unit_label: 'comprimé', stock_per_unit: 100, stock_item_id: null });
    expect(receiveUnits(main, 'unité')).toEqual([{ value: 'base', label: 'comprimé', factor: 1 }, { value: 'pack', label: 'boîte', factor: 100 }]);
    const derived = stockItemFrom({ id: 2, generic_name: 'Plaquette', nature: 'medication', unit_label: 'plaquette', stock_per_unit: 10, stock_item_id: 1 });
    expect(derived.derived).toBe(true);
    expect(receiveUnits(derived, 'unité')).toEqual([{ value: 'derived', label: 'plaquette', factor: 10 }]);
    const plain = stockItemFrom({ id: 3, generic_name: 'Gants', nature: 'consumable', unit_label: null, stock_per_unit: 1, stock_item_id: 3 });
    expect(plain.derived).toBe(false);
    expect(receiveUnits(plain, 'unité')).toEqual([{ value: 'base', label: 'unité', factor: 1 }]);
  });
});
