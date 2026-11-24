import { describe, expect, it } from 'vitest';
import { staffMemberFrom } from './staff-api';

describe('staffMemberFrom', () => {
  it('un membre CERO ID sans profil HEALTH est listé, sans type ni statut', () => {
    const m = staffMemberFrom({ id: 5, user_id: 5, display_name: 'Marie', is_owner: true, profile_id: null, staff_type: null, is_active: null });
    expect(m).toMatchObject({ id: '5', name: 'Marie', owner: true, hasProfile: false, type: '', active: false });
  });
  it('un membre avec profil reprend ses informations HEALTH', () => {
    const m = staffMemberFrom({ id: 9, user_id: 9, display_name: 'Jean', profile_id: 3, staff_type: 'nurse', specialty: 'Pédiatrie', care_unit_id: 2, is_active: true });
    expect(m).toMatchObject({ id: '9', hasProfile: true, type: 'nurse', specialty: 'Pédiatrie', careUnitId: '2', active: true, owner: false });
  });
});
