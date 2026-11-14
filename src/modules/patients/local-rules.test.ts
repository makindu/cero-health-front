import { describe, expect, it } from 'vitest';
import type { Patient } from './data';
import { applyPatientUpdate, buildPatient, civilDay, markMerged, nextFileNumber, planMerge, resolvePatient } from './local-rules';

const NOW = new Date(2026, 10, 14, 10, 0, 0);
const base: Patient = {
  id: 'P-1', fileNumber: 'DOS-0001', fullName: 'Amani Alpha', sex: 'F', birthDate: '1990-01-01', phone: '+000 000 0001',
  address: '', service: 'generalMedicine', status: 'active', insurer: '', emergencyContact: '', registeredAt: '2026-01-01', lastVisit: null,
};
const input = { fullName: '  Neema   Bravo ', sex: 'F', birthDate: '2000-05-05', phone: '', service: 'pediatrics' };

describe('patients — règles locales', () => {
  it('normalise la saisie et génère un numéro de dossier continu', () => {
    const first = buildPatient(input, [base], NOW, 'P-2');
    expect(first.fullName).toBe('Neema Bravo');
    expect(first.fileNumber).toBe('DOS-LOC-2026-0001');
    expect(first.registeredAt).toBe(civilDay(NOW));
    const second = buildPatient(input, [base, first], NOW, 'P-3');
    expect(second.fileNumber).toBe('DOS-LOC-2026-0002');
    expect(nextFileNumber([], 2026)).toBe('DOS-LOC-2026-0001');
  });

  it('refuse sans inventer : sexe absent, date future ou invalide', () => {
    expect(() => buildPatient({ ...input, sex: '' }, [], NOW, 'x')).toThrow();
    expect(() => buildPatient({ ...input, birthDate: '2027-01-01' }, [], NOW, 'x')).toThrow();
    expect(() => buildPatient({ ...input, birthDate: '2001-02-31' }, [], NOW, 'x')).toThrow();
    expect(() => buildPatient({ ...input, fullName: 'A' }, [], NOW, 'x')).toThrow();
  });

  it('accepte une naissance le jour même (jour civil local)', () => {
    expect(buildPatient({ ...input, birthDate: civilDay(NOW) }, [], NOW, 'x').birthDate).toBe(civilDay(NOW));
  });

  it('refuse un numéro de dossier déjà attribué, même écrit autrement', () => {
    expect(() => buildPatient({ ...input, fileNumber: 'dos-0001' }, [base], NOW, 'x')).toThrow();
  });

  it('modification : un doublon hérité ne bloque pas, un nouveau doublon si', () => {
    const twin = { ...base, id: 'P-9' };
    expect(applyPatientUpdate(base, { ...input, fileNumber: 'DOS-0001' }, [base, twin], NOW).fullName).toBe('Neema Bravo');
    expect(() => applyPatientUpdate(base, { ...input, fileNumber: 'DOS-0777' }, [base, { ...twin, fileNumber: 'DOS-0777' }], NOW)).toThrow();
  });

  it('retrouve un patient par identifiant, dossier ou nom exact, sans choisir au hasard', () => {
    const other = { ...base, id: 'P-2', fileNumber: 'DOS-0002', fullName: 'Zawadi Écho' };
    expect(resolvePatient('p-1', [base, other]).id).toBe('P-1');
    expect(resolvePatient('dos 0002', [base, other]).id).toBe('P-2');
    expect(resolvePatient('zawadi echo', [base, other]).id).toBe('P-2');
    expect(() => resolvePatient('Amani Alpha', [base, { ...base, id: 'P-3', fileNumber: 'DOS-0003' }])).toThrow();
    expect(() => resolvePatient('inconnu', [base])).toThrow();
    expect(() => resolvePatient('P-1', [{ ...base, status: 'inactive' }])).toThrow();
  });

  it('fusion : motif obligatoire, dossiers désactivés et jamais supprimés', () => {
    const dup = { ...base, id: 'P-2', fileNumber: 'DOS-0002' };
    expect(() => planMerge(base, { duplicateIds: 'P-2' }, [base, dup])).toThrow();
    expect(() => planMerge(base, { duplicateIds: 'P-1', reason: 'x' }, [base, dup])).toThrow();
    const plan = planMerge(base, { duplicateIds: 'P-2', reason: 'Doublon confirmé' }, [base, dup]);
    expect(plan.duplicateIds).toEqual(['P-2']);
    expect(markMerged(dup, 'P-1')).toMatchObject({ status: 'inactive', mergedInto: 'P-1' });
  });
});
