import { describe, expect, it } from 'vitest';
import { functionOption, optionOf, resolveFunctionOption, staffFunctionFrom, suggestionFrom, typeOption } from './staff-functions';

const functions = [staffFunctionFrom({ id: 12, code: 'f_dentiste', label: 'Dentiste', base_type: 'doctor', used: 2 })];

describe('fonctions du personnel', () => {
  it('lit une fonction et une suggestion du serveur', () => {
    expect(functions[0]).toEqual({ id: '12', code: 'f_dentiste', label: 'Dentiste', baseType: 'doctor', used: 2 });
    expect(suggestionFrom({ key: 'dentist', label: 'Dentiste', base_type: 'doctor', added: true })).toEqual({ key: 'dentist', label: 'Dentiste', baseType: 'doctor', added: true });
    expect(suggestionFrom({ key: 'x', label: 'X', base_type: 'other' }).added).toBe(false);
  });
  it('un type commun ne porte pas de fonction', () => {
    expect(resolveFunctionOption(typeOption('nurse'), functions)).toEqual({ type: 'nurse', functionId: '' });
  });
  it('une fonction de l\'établissement reprend le type de base', () => {
    expect(resolveFunctionOption(functionOption('12'), functions)).toEqual({ type: 'doctor', functionId: '12' });
  });
  it('une valeur inconnue ne choisit rien', () => {
    expect(resolveFunctionOption('f:99', functions)).toEqual({ type: '', functionId: '' });
    expect(resolveFunctionOption('', functions)).toEqual({ type: '', functionId: '' });
  });
  it('retrouve l\'option d\'un profil', () => {
    expect(optionOf('doctor', '12')).toBe('f:12');
    expect(optionOf('nurse', '')).toBe('t:nurse');
    expect(optionOf('', '')).toBe('');
  });
});
