import { describe, expect, it } from 'vitest';
import { STAFF_API, STAFF_TYPES, staffBody, staffFromApi, staffMemberFrom, staffUpdateBody } from './staff-api';

describe('personnel (API)', () => {
  it('lit un profil du serveur', () => {
    const s = staffFromApi({ id: 4, user_id: 9, staff_type: 'doctor', display_name: 'Dr Mukendi', specialty: 'Pédiatrie', care_unit_id: 2, is_active: false });
    expect(s).toMatchObject({ id: '4', userId: '9', name: 'Dr Mukendi', type: 'doctor', specialty: 'Pédiatrie', careUnitId: '2', active: false });
  });
  it('retombe sur le titre puis sur un libellé neutre quand le nom manque', () => {
    expect(staffFromApi({ id: 1, professional_title: 'Dr' }).name).toBe('Dr');
    expect(staffFromApi({ id: 7 }).name).toBe('Personnel n°7');
  });
  it('crée avec le compte, sans envoyer les champs vides', () => {
    expect(staffBody({ userId: '12', type: 'nurse', title: ' ', specialty: '', registrationNumber: 'N-1', careUnitId: '3' }, true))
      .toEqual({ staff_type: 'nurse', user_id: 12, registration_number: 'N-1', care_unit_id: 3 });
  });
  it('ne renvoie jamais le compte à la modification', () => {
    expect('user_id' in staffBody({ userId: '12', type: 'nurse' }, false)).toBe(false);
  });
  it('traduit le filtre de statut et le type', () => {
    expect(STAFF_API.mapFilter?.('status', 'active')).toEqual({ is_active: 'true' });
    expect(STAFF_API.mapFilter?.('status', 'inactive')).toEqual({ is_active: 'false' });
    expect(STAFF_API.mapFilter?.('type', 'doctor')).toBeUndefined();
    expect(STAFF_API.filterMap?.type).toBe('staff_type');
  });
  it('propose les types du serveur', () => {
    expect(STAFF_TYPES).toContain('doctor');
    expect(STAFF_TYPES).toHaveLength(9);
  });
  it('modification : un champ vidé est effacé, le compte n\'est pas renvoyé', () => {
    const body = staffUpdateBody({ userId: '12', profileId: '4', type: 'lab_technician', title: ' ', specialty: '', registrationNumber: 'L-9', careUnitId: '', functionId: '7', active: false });
    expect(body).toEqual({ staff_type: 'lab_technician', function_id: 7, professional_title: null, specialty: null, registration_number: 'L-9', care_unit_id: null, is_active: false });
    expect('user_id' in body).toBe(false);
  });
  it('un membre garde l\'identifiant de son profil, vide s\'il n\'en a pas', () => {
    expect(staffMemberFrom({ user_id: 5, profile_id: 8, staff_type: 'nurse', is_active: true }).profileId).toBe('8');
    expect(staffMemberFrom({ user_id: 6, profile_id: null }).profileId).toBe('');
  });
  it('un membre reprend sa fonction propre à l\'établissement', () => {
    expect(staffMemberFrom({ user_id: 5, profile_id: 8, staff_type: 'other', function_id: 3, function_label: 'Dentiste' })).toMatchObject({ functionId: '3', functionLabel: 'Dentiste' });
    expect(staffMemberFrom({ user_id: 6, profile_id: 9, staff_type: 'nurse' })).toMatchObject({ functionId: '', functionLabel: '' });
  });
});
