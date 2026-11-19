import { describe, expect, it } from 'vitest';
import { applyCategoryUpdate, buildCategory, categoryIdFor, DEFAULT_CATEGORIES, mustPayBefore } from './categories';

describe('catégories de patients', () => {
  const [priv, subscriber, indigent] = DEFAULT_CATEGORIES;
  it('privé paie tout avant consommation, abonné et indigent non', () => {
    expect(mustPayBefore(priv, 'consultation')).toBe(true);
    expect(mustPayBefore(priv, 'lab')).toBe(true);
    expect(mustPayBefore(priv, 'medication')).toBe(true);
    expect(mustPayBefore(subscriber, 'lab')).toBe(false);
    expect(mustPayBefore(indigent, 'medication')).toBe(false);
  });
  it('sans catégorie connue : traité comme privé', () => {
    expect(mustPayBefore(undefined, 'consultation')).toBe(true);
  });
  it('ajoute une catégorie configurée sans toucher au code', () => {
    const c = buildCategory({ label: 'Personnel de l’hôpital', payConsultation: 'false', payLab: 'true', payMedication: 'false' }, DEFAULT_CATEGORIES);
    expect(c.id).toBe('PERSONNEL_DE_L_HOPITAL');
    expect(c.payConsultation).toBe(false);
    expect(c.payLab).toBe(true);
    expect(c.payMedication).toBe(false);
    expect(c.active).toBe(true);
  });
  it('refuse un libellé vide ou déjà utilisé', () => {
    expect(() => buildCategory({ label: ' ' }, DEFAULT_CATEGORIES)).toThrow();
    expect(() => buildCategory({ label: 'privé' }, DEFAULT_CATEGORIES)).toThrow();
    expect(categoryIdFor('Abonné')).toBe('ABONNE');
  });
  it('modifie les obligations ; la catégorie par défaut ne peut pas être désactivée', () => {
    const next = applyCategoryUpdate(subscriber!, { payLab: 'true' }, DEFAULT_CATEGORIES);
    expect(next.payLab).toBe(true);
    expect(() => applyCategoryUpdate(priv!, { active: 'false' }, DEFAULT_CATEGORIES)).toThrow();
  });
});
