import { describe, expect, it } from 'vitest';
import { planCatalogImport } from './catalog-sheet';

const item = (id: string, code: string, label: string, minor: number, category: 'laboratory' | 'pharmacy' = 'laboratory', active = true) =>
  ({ id, code, label, category, active, price: { minor, currency: 'USD' } }) as never;
const existing = [item('1', 'LAB-001', 'Glycémie', 500), item('2', 'LAB-002', 'Hémogramme', 1200, 'laboratory', false), item('3', 'PHA-001', 'Paracétamol', 300, 'pharmacy')];
const T = (...rows: string[][]): string[][] => [['Code', 'Examen', 'Prix', 'Actif'], ...rows];

describe('import des prestations (actes sans stock)', () => {
  const act = (id: string, code: string, label: string, minor: number) => ({ id, code, label, category: 'procedure', active: true, price: { minor, currency: 'USD' } }) as never;
  const acts = [act('1', 'SRV-001', 'Consultation générale', 1000)];

  it('propose des codes SRV-xxx et retrouve une prestation par sa désignation', () => {
    const p = planCatalogImport([['Prestation', 'Prix'], ['Échographie', '30'], ['consultation generale', '12']], acts, 'procedure');
    expect(p.errors).toEqual([]);
    expect(p.rows.map((r) => [r.action, r.code, r.price])).toEqual([['create', 'SRV-002', 30], ['update', 'SRV-001', 12]]);
  });
});

describe('import du catalogue et des prix (laboratoire)', () => {
  it('crée, met à jour et reconnaît les lignes inchangées', () => {
    const p = planCatalogImport(T(['LAB-001', 'Glycémie', '6,50', ''], ['', 'Hémogramme', '12', 'oui'], ['', 'Widal', '8', ''], ['LAB-001x', '', '', '']), existing, 'laboratory');
    expect(p.errors.length).toBe(1);
    expect(p.rows.map((r) => [r.action, r.code, r.price, r.active])).toEqual([['update', 'LAB-001', 6.5, true], ['update', 'LAB-002', 12, true], ['create', 'LAB-003', 8, true]]);
  });

  it('inchangé quand rien ne diffère ; l’état seul peut changer', () => {
    const p = planCatalogImport(T(['LAB-001', 'Glycémie', '5', ''], ['LAB-002', '', '12', 'non']), existing, 'laboratory');
    expect(p.rows.map((r) => r.action)).toEqual(['unchanged', 'unchanged']);
    const q = planCatalogImport(T(['LAB-001', '', '5', 'non']), existing, 'laboratory');
    expect(q.rows[0]!.action).toBe('update');
    expect(q.rows[0]!.active).toBe(false);
  });

  it('signale chaque erreur avec son numéro de ligne Excel', () => {
    const p = planCatalogImport(T(['PHA-001', 'X', '5', ''], ['', 'Widal', '', ''], ['', 'Widal2', 'abc', ''], ['LAB-009', 'Glycémie', '5', ''], ['', 'A', '5', ''], ['', 'Test', '5', 'peut-être'], ['??', 'Nouveau', '5', '']), existing, 'laboratory');
    expect(p.errors.map((e) => [e.row, e.problem])).toEqual([[2, 'codeTaken'], [3, 'priceRequired'], [4, 'priceInvalid'], [5, 'codeMismatch'], [6, 'labelLength'], [7, 'activeInvalid'], [8, 'codeInvalid']]);
    expect(p.rows.length).toBe(0);
  });

  it('refuse les doublons dans le fichier et une désignation déjà prise', () => {
    const p = planCatalogImport(T(['', 'Widal', '5', ''], ['', 'widal', '6', ''], ['LAB-001', 'Hémogramme', '5', ''], ['LAB-002', '', '6', ''], ['LAB-002', '', '7', '']), existing, 'laboratory');
    expect(p.errors.map((e) => [e.row, e.problem])).toEqual([[3, 'duplicateInFile'], [4, 'labelTaken'], [6, 'duplicateInFile']]);
  });

  it('erreurs globales : colonnes manquantes, fichier vide, trop de lignes', () => {
    expect(planCatalogImport([['Foo', 'Bar']], existing, 'laboratory').fatal).toBe('missingColumns');
    expect(planCatalogImport([['Code', 'Prix']], existing, 'laboratory').fatal).toBe('empty');
    expect(planCatalogImport([], existing, 'laboratory').fatal).toBe('empty');
    const many = [['Examen', 'Prix'], ...Array.from({ length: 501 }, (_, i) => [`Test ${i}`, '1'])];
    expect(planCatalogImport(many, existing, 'laboratory').fatal).toBe('tooMany');
  });

  it('relit les modèles téléchargés : leurs en-têtes complets sont reconnus', () => {
    for (const label of ["Désignation de l'examen", 'Désignation de la prestation', 'Désignation du médicament']) {
      const p = planCatalogImport([['Code', label, 'Prix', 'Actif'], ['TST-1', 'Test A', '5', 'oui']], [], 'laboratory');
      expect(p.fatal).toBeUndefined();
      expect(p.errors).toEqual([]);
      expect(p.rows).toHaveLength(1);
    }
  });
});
