import { describe, expect, it } from 'vitest';
import { buildSchema, type FieldDef } from './dynamic-form';

const fields: FieldDef[] = [
  { name: 'name', label: 'Nom', type: 'text', required: true },
  { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'qty', label: 'Quantité', type: 'number' },
  { name: 'day', label: 'Date', type: 'date' },
];

const messages = (values: Record<string, string>) => {
  const result = buildSchema(fields).safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => `${String(issue.path[0])}:${issue.message}`);
};

describe('buildSchema', () => {
  it('accepte des valeurs valides et des champs optionnels vides', () => {
    expect(messages({ name: 'Ada', email: '', qty: '', day: '' })).toEqual([]);
    expect(messages({ name: 'Ada', email: 'a@b.invalid', qty: '12,5', day: '2026-01-31' })).toEqual([]);
  });
  it('exige les champs obligatoires, y compris composés d’espaces', () => {
    expect(messages({ name: '   ', email: '', qty: '', day: '' })).toEqual(['name:validation.required']);
  });
  it('valide e-mail, nombre et date avec des clés i18n', () => {
    expect(messages({ name: 'A', email: 'x', qty: 'abc', day: 'pas-une-date' })).toEqual([
      'email:validation.email',
      'qty:validation.number',
      'day:validation.invalidDate',
    ]);
  });
  it('applique un format optionnel, sans l’exiger quand le champ est vide', () => {
    const schema = buildSchema([{ name: 'ref', label: 'Réf', type: 'text', pattern: /^[A-Z]{3}$/, patternMessage: 'validation.fileNumber' }]);
    expect(schema.safeParse({ ref: '' }).success).toBe(true);
    expect(schema.safeParse({ ref: 'ABC' }).success).toBe(true);
    const bad = schema.safeParse({ ref: 'ab' });
    expect(bad.success ? '' : bad.error.issues[0]?.message).toBe('validation.fileNumber');
  });
});
