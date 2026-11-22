import { describe, expect, it } from 'vitest';
import { careUnitCode, HOSPITAL_SERVICE_API } from './data';

describe('services de l’établissement : correspondance avec les unités de soin', () => {
  it('traduit une unité de soin du serveur', () => {
    expect(HOSPITAL_SERVICE_API.fromApi({ id: 7, code: 'pediatrics', name: 'Pédiatrie', unit_type: 'pediatrics', capacity: 12, is_active: true })).toMatchObject({
      id: '7', key: 'pediatrics', name: 'Pédiatrie', code: 'pediatrics', unitType: 'pediatrics', beds: 12, status: 'active',
    });
    expect(HOSPITAL_SERVICE_API.fromApi({ id: 8, code: 'LAB-1', name: 'Labo', unit_type: 'laboratory', is_active: false }).status).toBe('inactive');
  });

  it('dérive un code valide du nom (sans accents, tirets, 30 caractères)', () => {
    expect(careUnitCode('Médecine générale')).toBe('Medecine-generale');
    expect(careUnitCode('  Soins  intensifs / adultes !! ')).toBe('Soins-intensifs-adultes');
    expect(careUnitCode('A'.repeat(50))).toHaveLength(30);
    expect(careUnitCode('Médecine générale')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('construit le corps de création (code dérivé, type par défaut, lits facultatifs)', () => {
    expect(HOSPITAL_SERVICE_API.toApi({ name: ' Maternité ', unitType: 'maternity', beds: '10' })).toEqual({ name: 'Maternité', code: 'Maternite', unit_type: 'maternity', capacity: 10 });
    expect(HOSPITAL_SERVICE_API.toApi({ name: 'Autre', beds: '' })).toEqual({ name: 'Autre', code: 'Autre', unit_type: 'other' });
    expect(HOSPITAL_SERVICE_API.toApi({ name: 'X', code: 'MG-1', unitType: 'consultation', beds: '-3' })).toEqual({ name: 'X', code: 'MG-1', unit_type: 'consultation' });
  });
});
