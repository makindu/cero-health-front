import { describe, expect, it } from 'vitest';
import { findStaff, findUnit, mapCareUnit, mapStaff, resetReference, setReferenceForTests, staffById, unitById } from './reference-data';

describe('données de référence API', () => {
  it('traduit une unité de soin', () => {
    expect(mapCareUnit({ id: 7, code: 'MG', name: 'Médecine générale', unit_type: 'outpatient', is_active: true })).toEqual({
      id: '7', code: 'MG', name: 'Médecine générale', type: 'outpatient', active: true,
    });
  });
  it('traduit un profil de personnel et choisit le meilleur nom', () => {
    const s = mapStaff({ id: 3, user_id: 12, staff_type: 'doctor', display_name: 'Dr Mwamba', specialty: 'Pédiatrie', registration_number: 'ORD-1', care_unit_id: 7 });
    expect(s).toMatchObject({ id: '3', userId: '12', name: 'Dr Mwamba', type: 'doctor', specialty: 'Pédiatrie', registrationNumber: 'ORD-1', careUnitId: '7' });
    expect(mapStaff({ id: 4, user_id: 1, staff_type: 'nurse', professional_title: 'Infirmière' }).name).toBe('Infirmière');
    expect(mapStaff({ id: 5, user_id: 1, staff_type: 'nurse' }).name).toBe('Personnel n°5');
  });

  it('retrouve unités et personnel par identifiant, code ou nom (sans accents ni casse)', () => {
    setReferenceForTests(
      [{ id: '7', code: 'pediatrics', name: 'Pédiatrie', type: 'outpatient', active: true }],
      [{ id: '3', userId: '12', name: 'Dr Éloïse Mwamba', type: 'doctor' }],
    );
    expect(findUnit('7')?.name).toBe('Pédiatrie');
    expect(findUnit('Pediatrics')?.id).toBe('7');
    expect(findUnit('inconnu')).toBeUndefined();
    expect(findStaff('dr eloise  MWAMBA')?.id).toBe('3');
    expect(unitById('7')?.code).toBe('pediatrics');
    expect(staffById('3')?.userId).toBe('12');
    resetReference();
    expect(findUnit('7')).toBeUndefined();
  });
});
