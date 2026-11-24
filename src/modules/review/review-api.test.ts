import { describe, expect, it } from 'vitest';
import { catalogChoiceFrom, drugFrom, examFrom } from './review-api';
import { drugPatch, examPatch, tidy } from './review-rules';

describe('file « à valider » : lecture', () => {
  it('lit un médicament à valider', () => {
    expect(drugFrom({ id: 4, name: 'Amoxicilline 500', origin: 'prescription', needs_review: true, uses: 3, catalog_item_id: null, created_at: '2026-11-22 09:00:00' }))
      .toEqual({ id: '4', name: 'Amoxicilline 500', origin: 'prescription', needsReview: true, uses: 3, catalogItemId: '', createdAt: '2026-11-22 09:00:00' });
    expect(drugFrom({}).needsReview).toBe(false);
  });
  it('lit un examen à valider, actif par défaut', () => {
    expect(examFrom({ id: 2, code: 'CRP', label: 'CRP', is_active: true, origin: 'doctor', needs_review: true, catalog_item_id: 9 }))
      .toEqual({ id: '2', code: 'CRP', label: 'CRP', isActive: true, origin: 'doctor', needsReview: true, catalogItemId: '9' });
    expect(examFrom({ id: 3, is_active: false }).isActive).toBe(false);
    expect(examFrom({ id: 3 }).isActive).toBe(true);
  });
  it('compose le libellé d\'un article du catalogue', () => {
    expect(catalogChoiceFrom({ id: 7, generic_name: 'Amoxicilline', strength: '500 mg', nature: 'medication' })).toEqual({ id: '7', label: 'Amoxicilline 500 mg', nature: 'medication' });
    expect(catalogChoiceFrom({ id: 8 }).label).toBe('#8');
  });
});

describe('file « à valider » : saisie', () => {
  it('retire les espaces superflus', () => {
    expect(tidy('  Amoxicilline   500 \n mg ')).toBe('Amoxicilline 500 mg');
  });
  it('valide un médicament sans rien changer d\'autre', () => {
    expect(drugPatch({ name: 'Ferreux sulfate', catalogItemId: '' }, { name: 'Ferreux sulfate', catalogItemId: '' })).toEqual({ needs_review: false });
  });
  it('envoie le nom corrigé et le lien seulement s\'ils ont changé', () => {
    expect(drugPatch({ name: 'amoxicilne', catalogItemId: '' }, { name: '  Amoxicilline  500 ', catalogItemId: '7' })).toEqual({ needs_review: false, name: 'Amoxicilline 500', catalog_item_id: 7 });
    expect(drugPatch({ name: 'x y', catalogItemId: '7' }, { name: 'x y', catalogItemId: '' })).toEqual({ needs_review: false, catalog_item_id: null });
  });
  it('refuse un nom de médicament trop court ou trop long', () => {
    expect(drugPatch({ name: 'ab', catalogItemId: '' }, { name: ' a ', catalogItemId: '' })).toBeNull();
    expect(drugPatch({ name: 'ab', catalogItemId: '' }, { name: 'x'.repeat(256), catalogItemId: '' })).toBeNull();
  });
  it('valide ou corrige un examen, libellé de 1 à 150 caractères', () => {
    expect(examPatch({ label: 'crp', catalogItemId: '' }, { name: 'CRP quantitative', catalogItemId: '9' })).toEqual({ needs_review: false, label: 'CRP quantitative', catalog_item_id: 9 });
    expect(examPatch({ label: 'CRP', catalogItemId: '' }, { name: 'CRP', catalogItemId: '' })).toEqual({ needs_review: false });
    expect(examPatch({ label: 'CRP', catalogItemId: '' }, { name: '   ', catalogItemId: '' })).toBeNull();
    expect(examPatch({ label: 'CRP', catalogItemId: '' }, { name: 'x'.repeat(151), catalogItemId: '' })).toBeNull();
  });
});
