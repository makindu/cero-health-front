import { describe, expect, it } from 'vitest';
import { checkCatalogDraft, matchesQuery, parsePrice, suggestCode } from './catalog-rules';

const existing = [
  { id: 'a', code: 'PHA-001', label: 'Paracétamol 500 mg', category: 'pharmacy' as const },
  { id: 'b', code: 'LAB-NFS', label: 'NFS', category: 'laboratory' as const },
  { id: 'c', code: 'PHA-007', label: 'Amoxicilline', category: 'pharmacy' as const },
];

describe('recherche', () => {
  it('ignore accents et casse, cherche dans plusieurs champs, vide = tout', () => {
    expect(matchesQuery('paracetamol', 'Paracétamol 500 mg', 'PHA-001')).toBe(true);
    expect(matchesQuery('  PHA-0 ', 'Autre', 'pha-001')).toBe(true);
    expect(matchesQuery('', 'x')).toBe(true);
    expect(matchesQuery('zzz', 'Paracétamol', null)).toBe(false);
  });
});

describe('catalogue — règles de saisie', () => {
  it('lit les prix avec virgule ou point et refuse le reste', () => {
    expect(parsePrice('12,5')).toBe(12.5);
    expect(parsePrice(' 3.50 ')).toBe(3.5);
    for (const bad of ['', '0', '-2', 'abc', '1,234', '1.2.3']) expect(parsePrice(bad)).toBeNull();
  });

  it('propose le code suivant sans réutiliser un existant', () => {
    expect(suggestCode('pharmacy', existing)).toBe('PHA-008');
    expect(suggestCode('laboratory', existing)).toBe('LAB-001');
  });

  it('accepte une saisie valide', () => {
    expect(checkCatalogDraft({ code: 'pha-010', label: 'Ibuprofène 400 mg', price: '2,5', category: 'pharmacy' }, existing)).toEqual([]);
  });

  it('refuse code et désignation déjà pris (sans tenir compte de la casse ni des espaces)', () => {
    const p = checkCatalogDraft({ code: 'pha-001', label: '  amoxicilline ', price: '1', category: 'pharmacy' }, existing);
    expect(p).toContain('codeTaken');
    expect(p).toContain('labelTaken');
  });

  it('une modification ne se heurte pas à elle-même', () => {
    expect(checkCatalogDraft({ code: 'PHA-001', label: 'Paracétamol 500 mg', price: '1', category: 'pharmacy' }, existing, 'a')).toEqual([]);
  });

  it('refuse code mal formé, désignation trop courte et prix nul', () => {
    expect(checkCatalogDraft({ code: 'a b', label: 'x', price: '0', category: 'laboratory' }, existing)).toEqual(['codeInvalid', 'labelLength', 'priceInvalid']);
  });

  it('les accents ne distinguent pas deux désignations', () => {
    expect(checkCatalogDraft({ code: 'PHA-020', label: 'Paracetamol 500 mg', price: '1', category: 'pharmacy' }, [...existing, { id: 'z', code: 'PHA-021', label: 'Paracétamol 500 mg', category: 'pharmacy' as const }])).toContain('labelTaken');
  });

  it('la même désignation peut exister dans une autre catégorie', () => {
    expect(checkCatalogDraft({ code: 'LAB-002', label: 'Amoxicilline', price: '1', category: 'laboratory' }, existing)).toEqual([]);
  });
});
