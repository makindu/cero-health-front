import { describe, expect, it } from 'vitest';
import { careUnitTypeFrom, careUnitTypeOptions } from './care-unit-types';

describe('care-unit-types', () => {
  it('lit un type du serveur', () => {
    expect(careUnitTypeFrom({ id: 1, code: 'c_dialyse', label: 'Dialyse' })).toEqual({ code: 'c_dialyse', label: 'Dialyse' });
    expect(careUnitTypeFrom({})).toEqual({ code: '', label: '' });
  });
  it('place les types communs d’abord, puis ceux de l’établissement, sans doublon', () => {
    const opts = careUnitTypeOptions(['consultation', 'other'], (c) => c.toUpperCase(), [
      { code: 'c_dialyse', label: 'Dialyse' },
      { code: 'other', label: 'Doublon' },
      { code: '', label: 'Vide' },
    ]);
    expect(opts).toEqual([
      { value: 'consultation', label: 'CONSULTATION' },
      { value: 'other', label: 'OTHER' },
      { value: 'c_dialyse', label: 'Dialyse' },
    ]);
  });
});
