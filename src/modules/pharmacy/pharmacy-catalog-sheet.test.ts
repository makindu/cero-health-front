import { describe, expect, it } from 'vitest';
import { planPharmacyImport, unitsText } from './pharmacy-catalog-sheet';

const item = (id: string, code: string, label: string, minor: number, over: Record<string, unknown> = {}) =>
  ({ id, code, label, category: 'pharmacy', active: true, price: { minor, currency: 'USD' }, ...over }) as never;
// Produit principal conditionné (boîte de 100 comprimés) + deux unités dérivées ; un produit simple.
const existing = [
  item('1', 'AMX', 'Amoxicilline 500 mg', 5000, { stock: { itemId: '1', perUnit: 100 }, unit: 'Boîte', baseUnit: 'Comprimé' }),
  item('2', 'AMX-PLAQUET', 'Amoxicilline 500 mg — Plaquette', 600, { stock: { itemId: '1', perUnit: 10 }, unit: 'Plaquette' }),
  item('3', 'AMX-COMPRIME', 'Amoxicilline 500 mg — Comprimé', 70, { stock: { itemId: '1', perUnit: 1 }, unit: 'Comprimé' }),
  item('4', 'PHA-001', 'Paracétamol 500 mg', 300),
];
const H = ['Code', 'Désignation', 'Prix', 'Actif', 'Unité', 'Unité de base', 'Contenu', 'Sous-unité 1', 'Contenu 1', 'Prix 1', 'Sous-unité 2', 'Contenu 2', 'Prix 2'];
const T = (...rows: string[][]): string[][] => [H, ...rows.map((r) => [...r, ...Array(H.length - r.length).fill('')])];

describe('import des médicaments, prix et unités (pharmacie)', () => {
  it('crée un produit simple et un produit multi-unités', () => {
    const p = planPharmacyImport(T(['', 'Ibuprofène 400 mg', '8,5'], ['IBU-100', 'Ibuprofène sirop', '12', 'non', 'Flacon', 'ml', '100', 'Dose', '5', '1,5']), existing);
    expect(p.errors).toEqual([]);
    expect(p.rows.map((r) => [r.action, r.code, r.price, r.active, r.perPack])).toEqual([['create', 'PHA-002', 8.5, true, 1], ['create', 'IBU-100', 12, false, 100]]);
    expect(p.rows[1]!.extras).toEqual([{ label: 'Dose', perUnit: 5, price: 1.5 }]);
    expect(unitsText(p.rows[1]!)).toBe('1 Flacon = 100 ml · Dose ×5');
  });

  it('reconnaît un produit inchangé, y compris ses unités dérivées', () => {
    const p = planPharmacyImport(T(['AMX', 'Amoxicilline 500 mg', '50', '', 'Boîte', 'Comprimé', '100', 'plaquette', '10', '6', 'Comprimé', '1', '0,7']), existing);
    expect(p.errors).toEqual([]);
    expect(p.rows.map((r) => r.action)).toEqual(['unchanged']);
  });

  it('met à jour un prix d\'unité dérivée ou ajoute une unité', () => {
    const price = planPharmacyImport(T(['AMX', '', '50', '', '', '', '', 'Plaquette', '10', '6,5']), existing);
    expect(price.rows[0]!.action).toBe('update');
    const added = planPharmacyImport(T(['AMX', '', '50', '', '', '', '', 'Sachet', '5', '3.5']), existing);
    expect(added.rows[0]!.action).toBe('update');
    expect(added.rows[0]!.extras).toEqual([{ label: 'Sachet', perUnit: 5, price: 3.5 }]);
  });

  it('une cellule de conditionnement vide conserve celui du produit', () => {
    const p = planPharmacyImport(T(['AMX', '', '55']), existing);
    expect(p.rows[0]).toMatchObject({ action: 'update', perPack: 100, unit: 'Boîte', baseUnit: 'Comprimé', price: 55 });
  });

  it('retrouve un produit par sa désignation sans code, accents et casse ignorés', () => {
    const p = planPharmacyImport(T(['', 'PARACETAMOL 500 MG', '3,5']), existing);
    expect(p.rows.map((r) => [r.action, r.code, r.price])).toEqual([['update', 'PHA-001', 3.5]]);
  });

  it('signale chaque erreur avec son numéro de ligne Excel', () => {
    const p = planPharmacyImport(T(
      ['a b', 'Code invalide', '5'],                                                           // 2
      ['AMX-PLAQUET', 'Autre', '5'],                                                           // 3 : code d'une unité dérivée
      ['', 'X', '5'],                                                                          // 4
      ['', 'Sans prix', ''],                                                                   // 5
      ['', 'Prix faux', 'abc'],                                                                // 6
      ['', 'Actif faux', '5', 'peut-être'],                                                    // 7
      ['', 'Contenu faux', '5', '', 'Boîte', 'Comprimé', '0,5'],                               // 8
      ['', 'Sans libellés', '5', '', '', '', '10'],                                            // 9
      ['', 'Libellés égaux', '5', '', 'Boîte', 'boîte', '10'],                                 // 10
      ['', 'Sous-unité trop grande', '5', '', 'Boîte', 'Comprimé', '10', 'Gros', '10', '1'],   // 11
      ['', 'Sous-unité sans prix', '5', '', 'Boîte', 'Comprimé', '10', 'Demi', '5', ''],       // 12
      ['', 'Sous-unités en double', '5', '', 'Boîte', 'Comprimé', '10', 'Demi', '5', '1', 'demi', '2', '1'], // 13
      ['', 'Sous-unité sans boîte', '5', '', '', '', '', 'Demi', '1', '1'],                    // 14
      ['XYZ', 'Paracétamol 500 mg', '5'],                                                      // 15 : désignation déjà sous un autre code
    ), existing);
    expect(p.errors.map((e) => [e.row, e.problem])).toEqual([
      [2, 'codeInvalid'], [3, 'codeTaken'], [4, 'labelLength'], [5, 'priceRequired'], [6, 'priceInvalid'], [7, 'activeInvalid'], [8, 'perPackInvalid'],
      [9, 'packagingLabelsRequired'], [10, 'packagingLabelsDifferent'], [11, 'extraInvalid'], [12, 'extraPriceInvalid'], [13, 'extraDuplicate'],
      [14, 'extrasNeedPackaging'], [15, 'codeMismatch'],
    ]);
    expect(p.rows.length).toBe(0);
  });

  it('refuse les doublons dans le fichier', () => {
    const p = planPharmacyImport(T(['', 'Nouveau', '5'], ['', 'NOUVEAU', '6'], ['PHA-001', '', '4'], ['', 'Paracétamol 500 mg', '4']), existing);
    expect(p.errors.map((e) => [e.row, e.problem])).toEqual([[3, 'duplicateInFile'], [5, 'duplicateInFile']]);
  });

  it('erreurs globales : colonnes manquantes, fichier vide, trop de lignes', () => {
    expect(planPharmacyImport([['Foo', 'Bar']], existing).fatal).toBe('missingColumns');
    expect(planPharmacyImport([['Code', 'Prix']], existing).fatal).toBe('empty');
    expect(planPharmacyImport([], existing).fatal).toBe('empty');
    expect(planPharmacyImport([['Désignation', 'Prix'], ...Array.from({ length: 501 }, (_, i) => [`P ${i}`, '1'])], existing).fatal).toBe('tooMany');
  });
});
