import { describe, expect, it } from 'vitest';
import { accountFrom, admissionFrom, hospRequestFrom } from './hospital-api';

describe('admissionFrom', () => {
  it('traduit une admission du serveur', () => {
    const a = admissionFrom({
      id: 7, number: 'ADM-2026-00001', patient_id: 3, patient: { full_name: 'Awa K.' }, care_unit_id: 2, status: 'dischargePending',
      admitted_at: '2026-11-21T08:00:00Z', reason: 'Surveillance', expected_discharge: '2026-11-25',
      stays: [{ bed_id: 4, room_id: 1, started_at: '2026-11-21T08:00:00Z', ended_at: null }],
    });
    expect(a.id).toBe('7');
    expect(a.patientName).toBe('Awa K.');
    expect(a.ward).toBe('2');
    expect(a.status).toBe('dischargePending');
    expect(a.stays[0]?.to).toBeUndefined();
  });

  it("traduit une demande d'hospitalisation et qui peut la décider", () => {
    const r = hospRequestFrom({ id: 4, patient_id: 3, patient: { full_name: 'Louise T.' }, care_unit_id: 2, reason: 'Césarienne', status: 'pending', requested_at: '2026-11-24T08:00:00Z', can_decide: true });
    expect(r).toMatchObject({ id: '4', patientName: 'Louise T.', careUnitId: '2', status: 'pending', canDecide: true, admissionId: undefined });
    expect(hospRequestFrom({ id: 5, patient_id: 3, status: 'approved', decision_note: 'Indiqué', admission_id: 9 })).toMatchObject({ status: 'approved', canDecide: false, decisionNote: 'Indiqué', admissionId: '9' });
    expect(hospRequestFrom({ id: 6, patient_id: 3, status: 'inconnu' }).status).toBe('pending');
  });

  it('range une admission clôturée parmi les sorties', () => {
    expect(admissionFrom({ id: 1, status: 'closed', stays: [] }).status).toBe('discharged');
  });
});

describe('compte du séjour', () => {
  it('traduit le compte du serveur', () => {
    const v = accountFrom({
      admission_id: 7, pending_days: 2, pending_consumption_lines: 3,
      links: [{ id: 5, source_type: 'admission_days', status: 'active', currency: 'USD', total_minor: 20000, paid_minor: 5000, remaining_minor: 15000, created_at: '2026-11-22T08:00:00Z' }, { id: 6, source_type: 'visit_consumption', status: 'active', currency: 'USD', total_minor: 900, paid_minor: 900, remaining_minor: 0 }],
      balances: [{ currency: 'USD', outstanding_minor: 15000 }],
    });
    expect(v.pendingDays).toBe(2);
    expect(v.pendingLines).toBe(3);
    expect(v.links.map((l) => [l.id, l.kind, l.remaining])).toEqual([['5', 'roomDays', 15000], ['6', 'consumptions', 0]]);
    expect(v.balances).toEqual([{ currency: 'USD', outstanding: 15000 }]);
  });

  it("garde la clôture et sa dérogation sur l'admission", () => {
    const a = admissionFrom({ id: 1, status: 'closed', stays: [], closure: { closed_at: '2026-11-22T10:00:00Z', closed_by_user_id: null, note: 'RAS', exception_reason: 'Famille en route' } });
    expect(a.closure).toMatchObject({ at: '2026-11-22T10:00:00Z', note: 'RAS', exception: { reason: 'Famille en route' } });
    expect(admissionFrom({ id: 2, status: 'discharged', stays: [] }).closure).toBeUndefined();
  });
});
