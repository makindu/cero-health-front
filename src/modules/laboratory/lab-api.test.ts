import { describe, expect, it } from 'vitest';
import { labOrderFrom } from './lab-api';

describe('labOrderFrom', () => {
  it('convertit une demande du serveur, sans inventer de résultat', () => {
    const v = labOrderFrom({
      id: 7, number: 'LAB-2026-00007', patient_id: 3, patient: { full_name: 'Amani Kasongo' }, priority: 'urgent', status: 'inProgress',
      requested_at: '2026-11-21T08:00:00Z', clinical_note: null,
      tests: [{ code: 'GLY', label: 'Glycémie', value: null, flag: 'unspecified' }, { code: 'HB', label: 'Hémoglobine', value: '12', unit: 'g/dL', reference_range: '12-16', flag: 'normal' }],
    });
    expect(v.order.id).toBe('7');
    expect(v.order.patientName).toBe('Amani Kasongo');
    expect(v.order.priority).toBe('urgent');
    expect(v.order.tests.map((t) => t.code)).toEqual(['GLY', 'HB']);
    expect(v.order.results).toHaveLength(1);
    expect(v.order.results[0]).toMatchObject({ code: 'HB', value: '12', referenceRange: '12-16', flag: 'normal' });
    expect(v.serverSide).toBe(true);
  });

  it('garde les rectifications avec les anciennes valeurs', () => {
    const v = labOrderFrom({ id: 1, status: 'validated', tests: [], amendments: [{ amended_at: 'x', reason: 'faute', previous: [{ code: 'HB', value: '9', flag: 'bad' }] }] });
    expect(v.order.amendments[0].previous[0]).toMatchObject({ code: 'HB', value: '9', flag: 'unspecified' });
  });
});
