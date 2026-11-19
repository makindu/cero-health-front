import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_ROWS, parseDay, planStockImport, stockSheet } from './stock-sheet';
import type { StockItemView } from './pharmacy-service';

const day = '2026-11-18';
const items: StockItemView[] = [
  { itemId: 'i1', label: 'Antalgique (boîte)', code: 'PHA-ANT', total: 90, usable: 60, usableUnits: 60, lots: [{ id: 'l1', itemId: 'i1', lotNumber: 'A1', expiresAt: '2028-01-31', quantity: 60 }, { id: 'l2', itemId: 'i1', lotNumber: 'OLD', expiresAt: '2024-01-31', quantity: 30 }] },
  { itemId: 'i2', label: 'Paracétamol 500 mg', code: 'PHA-001', total: 0, usable: 0, usableUnits: 0, lots: [] },
];
const L = { code: 'Code', item: 'Produit', lot: 'N° de lot', expiry: 'Péremption', quantity: 'Quantité', status: 'Statut', ok: 'Valide', expired: 'Périmé', out: 'Rupture' };
const head = ['Code', 'Produit', 'N° de lot', 'Péremption', 'Quantité'];
const headP = ['Code', 'Produit', 'Prix', 'N° de lot', 'Péremption', 'Quantité'];

describe('fiche de stock (export)', () => {
  it('une ligne par lot, statut périmé, produit sans lot en rupture', () => {
    const { header, rows } = stockSheet(items, day, L);
    expect(header).toEqual(['Code', 'Produit', 'N° de lot', 'Péremption', 'Quantité', 'Statut']);
    expect(rows).toEqual([
      ['PHA-ANT', 'Antalgique (boîte)', 'A1', '2028-01-31', 60, 'Valide'],
      ['PHA-ANT', 'Antalgique (boîte)', 'OLD', '2024-01-31', 30, 'Périmé'],
      ['PHA-001', 'Paracétamol 500 mg', '', '', 0, 'Rupture'],
    ]);
  });
});

describe('dates', () => {
  it('lit ISO, JJ/MM/AAAA et numéro de série Excel ; refuse le reste', () => {
    expect(parseDay('2029-03-05')).toBe('2029-03-05');
    expect(parseDay('05/03/2029')).toBe('2029-03-05');
    expect(parseDay('5-3-2029')).toBe('2029-03-05');
    expect(parseDay('47182')).toBe('2029-03-05');
    for (const bad of ['31/02/2029', '2029-13-01', 'demain', '123']) expect(parseDay(bad)).toBeUndefined();
  });
});

describe('importation — analyse avant écriture', () => {
  it('accepte des lignes valides, par code ou par désignation, colonnes dans le désordre', () => {
    const plan = planStockImport([['Quantité', 'Lot', 'Désignation', 'Code'], ['10', 'N1', '', 'pha-001'], ['5,0', 'N2', 'antalgique (BOÎTE)', '']], items, day);
    expect(plan.errors).toEqual([]);
    expect(plan.lines).toEqual([
      { row: 2, itemId: 'i2', itemLabel: 'Paracétamol 500 mg', lotNumber: 'N1', quantity: 10, expiresAt: null },
      { row: 3, itemId: 'i1', itemLabel: 'Antalgique (boîte)', lotNumber: 'N2', quantity: 5, expiresAt: null },
    ]);
  });

  it('signale chaque problème avec son numéro de ligne, sans bloquer les lignes valides', () => {
    const plan = planStockImport([head,
      ['PHA-001', '', 'N1', '2029-01-01', '10'],
      ['PHA-XXX', '', 'N2', '', '10'],
      ['PHA-001', '', '', '', '10'],
      ['PHA-001', '', 'N4', '', '0'],
      ['PHA-001', '', 'N5', '2020-01-01', '3'],
      ['PHA-001', '', 'N6', 'bientôt', '3'],
      ['PHA-001', '', 'n1', '', '2'],
      ['PHA-ANT', '', ' a1 ', '', '2'],
      ['', '', '', '', ''],
    ], items, day);
    expect(plan.lines.map((l) => l.row)).toEqual([2]);
    expect(plan.errors).toEqual([
      { row: 3, problem: 'itemUnknown', value: 'PHA-XXX' },
      { row: 4, problem: 'lotRequired' },
      { row: 5, problem: 'quantityInvalid', value: '0' },
      { row: 6, problem: 'alreadyExpired', value: '2020-01-01' },
      { row: 7, problem: 'dateInvalid', value: 'bientôt' },
      { row: 8, problem: 'duplicateInFile', value: 'n1' },
      { row: 9, problem: 'lotExists', value: 'a1' },
    ]);
  });

  it('produit absent du catalogue : il sera créé avec son prix (code proposé), une seule fois même sur plusieurs lots', () => {
    const plan = planStockImport([headP,
      ['', 'Amoxicilline 500 mg', '4,25', 'A1', '2029-01-01', '20'],
      ['', ' amoxicilline  500 MG ', '', 'A2', '', '5'],
      ['PHA-050', 'Ibuprofène 400 mg', '2', 'B1', '', '10'],
      ['PHA-001', '', '', 'C1', '', '7'],
    ], items, day);
    expect(plan.errors).toEqual([]);
    expect(plan.newItems).toEqual([{ code: 'PHA-002', label: 'Amoxicilline 500 mg', price: 4.25 }, { code: 'PHA-050', label: 'Ibuprofène 400 mg', price: 2 }]);
    expect(plan.lines.map((l) => [l.row, l.itemId, l.newItem?.code])).toEqual([[2, '', 'PHA-002'], [3, '', 'PHA-002'], [4, '', 'PHA-050'], [5, 'i2', undefined]]);
  });

  it('produit absent : prix obligatoire et valide, désignation obligatoire, code cohérent', () => {
    const plan = planStockImport([headP,
      ['', 'Nouveau 1', '', 'L1', '', '1'],
      ['', 'Nouveau 2', 'gratuit', 'L2', '', '1'],
      ['PHA-777', '', '3', 'L3', '', '1'],
      ['a b', 'Nouveau 3', '3', 'L4', '', '1'],
      ['PHA-XYZ', 'Paracétamol 500 mg', '3', 'L5', '', '1'],
    ], items, day);
    expect(plan.lines).toEqual([]);
    expect(plan.errors.map((e) => [e.row, e.problem])).toEqual([[2, 'priceRequired'], [3, 'priceInvalid'], [4, 'itemUnknown'], [5, 'codeInvalid'], [6, 'codeMismatch']]);
  });

  it('retrouve un produit existant malgré les accents et la casse (Paracetamol = Paracétamol)', () => {
    const plan = planStockImport([headP, ['', 'PARACETAMOL 500 mg', '', 'N1', '', '5'], ['', 'antalgique (boite)', '', 'N2', '', '5']], items, day);
    expect(plan.errors).toEqual([]);
    expect(plan.newItems).toEqual([]);
    expect(plan.lines.map((l) => l.itemId)).toEqual(['i2', 'i1']);
  });

  it('refuse un fichier sans les colonnes nécessaires, vide ou trop long', () => {
    expect(planStockImport([['Foo', 'Bar'], ['1', '2']], items, day).fatal).toBe('missingColumns');
    expect(planStockImport([['Code', 'Lot']], items, day).fatal).toBe('missingColumns');
    expect(planStockImport([head], items, day).fatal).toBe('empty');
    expect(planStockImport([], items, day).fatal).toBe('empty');
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ['PHA-001', '', `L${i}`, '', '1']);
    expect(planStockImport([head, ...many], items, day).fatal).toBe('tooMany');
  });
});
