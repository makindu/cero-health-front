import { afterEach, describe, expect, it } from 'vitest';
import { resetReference, setReferenceForTests } from '../_shared/reference-data';
import { APPOINTMENT_API } from './data';

const UNITS = [{ id: '7', code: 'pediatrics', name: 'Pédiatrie', type: 'outpatient', active: true }];
const STAFF = [{ id: '3', userId: '12', name: 'Dr Mwamba', type: 'doctor' }];

describe('rendez-vous : correspondance avec l’API réelle', () => {
  afterEach(() => resetReference());

  it('traduit une ligne du serveur (service et praticien par identifiants)', () => {
    setReferenceForTests(UNITS, STAFF);
    const a = APPOINTMENT_API.fromApi({
      id: 5, patient_id: 9, patient: { full_name: 'Marie Test' }, care_unit_id: 7, practitioner_staff_id: 3,
      starts_at: '2026-11-21T08:00:00Z', duration_min: 30, reason_code: 'followUp', status: 'scheduled', walk_in: false,
    });
    expect(a).toMatchObject({
      id: '5', patientId: '9', patientName: 'Marie Test', service: 'pediatrics', serviceLabel: 'Pédiatrie',
      careUnitId: '7', practitioner: 'Dr Mwamba', practitionerId: '3', durationMin: 30, reason: 'followUp', status: 'scheduled',
    });
  });

  it('une unité sans clé connue garde son libellé réel', () => {
    setReferenceForTests([{ ...UNITS[0]!, code: 'URG-2', name: 'Urgences B' }], STAFF);
    const a = APPOINTMENT_API.fromApi({ id: 1, patient_id: 1, care_unit_id: 7, status: 'arrived', reason_code: 'walkIn', walk_in: true });
    expect(a.serviceLabel).toBe('Urgences B');
    expect(a.walkIn).toBe(true);
    expect(a.practitioner).toBe('');
  });

  it('construit le corps de création et celui du passage sans rendez-vous', () => {
    setReferenceForTests(UNITS, STAFF);
    expect(
      APPOINTMENT_API.toApi({ patient: '9', service: 'pediatrics', practitioner: 'dr mwamba', startsAt: '2026-11-21T08:00:00Z', durationMin: '30', reason: 'control' }),
    ).toEqual({ patient_id: 9, care_unit_id: 7, practitioner_staff_id: 3, starts_at: '2026-11-21T08:00:00Z', duration_min: 30, reason_code: 'control' });
    expect(APPOINTMENT_API.createPath?.({ walkIn: 'true' })).toBe('/appointments/walk-in');
    expect(APPOINTMENT_API.toApi({ patient: '9', service: '7', reason: ' Fièvre ', urgency: 'urgent', walkIn: 'true' })).toEqual({
      patient_id: 9, care_unit_id: 7, urgency: 'urgent', visit_reason: 'Fièvre',
    });
  });

  it('refuse une saisie qui ne correspond à rien du serveur', () => {
    setReferenceForTests(UNITS, STAFF);
    expect(() => APPOINTMENT_API.toApi({ patient: 'Marie', service: '7', practitioner: 'Dr Mwamba', startsAt: 'x', durationMin: '30', reason: 'control' })).toThrow(/patient/i);
    expect(() => APPOINTMENT_API.toApi({ patient: '9', service: 'zzz', practitioner: 'Dr Mwamba', startsAt: 'x', durationMin: '30', reason: 'control' })).toThrow(/Service inconnu/);
    expect(() => APPOINTMENT_API.toApi({ patient: '9', service: '7', practitioner: 'Dr Inconnu', startsAt: 'x', durationMin: '30', reason: 'control' })).toThrow(/Praticien inconnu/);
  });

  it('la modification n’envoie ni l’heure ni le praticien', () => {
    setReferenceForTests(UNITS, STAFF);
    expect(APPOINTMENT_API.toApiUpdate?.({ service: 'pediatrics', practitioner: 'Dr Mwamba', startsAt: 'x', durationMin: '45', reason: 'followUp' })).toEqual({
      care_unit_id: 7, duration_min: 45, reason_code: 'followUp',
    });
  });

  it('actions : chemin, motif obligatoire à l’annulation, report avec nouvelle heure', () => {
    setReferenceForTests(UNITS, STAFF);
    expect(APPOINTMENT_API.commandPath?.('5', 'cancel')).toBe('/appointments/5/actions/cancel');
    expect(APPOINTMENT_API.commandBody?.('cancel', { reason: 'patientRequest', note: 'Voyage' })).toEqual({ reason: 'patientRequest — Voyage' });
    expect(APPOINTMENT_API.commandBody?.('check-in', {})).toEqual({});
    expect(APPOINTMENT_API.commandBody?.('reschedule', { startsAt: '2026-11-22T09:00:00Z', reason: 'other', practitioner: 'Dr Mwamba' })).toEqual({
      starts_at: '2026-11-22T09:00:00Z', reason: 'other', practitioner_staff_id: 3,
    });
  });

  it('filtres : période et jours en bornes locales, praticien et service par identifiant', () => {
    setReferenceForTests(UNITS, STAFF);
    const today = APPOINTMENT_API.mapFilter?.('period', 'today');
    expect(Date.parse(today!.to!) - Date.parse(today!.from!)).toBeGreaterThanOrEqual(23 * 3600_000);
    expect(Object.keys(APPOINTMENT_API.mapFilter!('period', 'upcoming')!)).toEqual(['from']);
    expect(Object.keys(APPOINTMENT_API.mapFilter!('period', 'past')!)).toEqual(['to']);
    const day = APPOINTMENT_API.mapFilter?.('from', '2026-11-21');
    expect(day).toEqual({ from: new Date('2026-11-21T00:00:00').toISOString() });
    expect(APPOINTMENT_API.mapFilter?.('to', '2026-11-21')).toEqual({ to: new Date('2026-11-22T00:00:00').toISOString() });
    expect(APPOINTMENT_API.mapFilter?.('practitioner', 'Dr Mwamba')).toEqual({ practitioner_staff_id: '3' });
    expect(APPOINTMENT_API.mapFilter?.('service', 'pediatrics')).toEqual({ care_unit_id: '7' });
    expect(APPOINTMENT_API.mapFilter?.('patientId', '9')).toEqual({ patient_id: '9' });
    expect(APPOINTMENT_API.mapFilter?.('status', 'done')).toBeUndefined();
  });
});
