import { describe, expect, it } from 'vitest';
import type { Appointment } from './data';
import { canOpenConsultation, consultationInputFor, isUnassigned } from './start-consultation';

const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: '8', patientId: '9', patientName: 'Marie', service: 'pediatrics', practitioner: 'Dr Mwamba', startsAt: '2026-11-21T10:00:00Z',
  durationMin: 30, reason: 'followUp', status: 'arrived', careUnitId: '7', practitionerId: '3', history: [], ...over,
});

describe('ouverture d’une consultation depuis l’accueil', () => {
  it('reprend le patient, le service, le praticien et le rendez-vous', () => {
    expect(consultationInputFor(appt())).toEqual({ patient: '9', service: '7', practitioner: '3', reason: 'followUp', appointmentId: '8' });
  });
  it('le passage sans rendez-vous devient une première visite', () => {
    expect(consultationInputFor(appt({ reason: 'walkIn' })).reason).toBe('firstVisit');
  });
  it('seuls les patients présents peuvent être appelés', () => {
    expect(['scheduled', 'confirmed', 'arrived', 'waiting', 'inProgress', 'done', 'cancelled', 'noShow'].filter((s) => canOpenConsultation(appt({ status: s as Appointment['status'] })))).toEqual(['arrived', 'waiting', 'inProgress']);
  });
  it('sans praticien assigné, le médecin qui prend en charge devient le praticien', () => {
    const free = appt({ practitionerId: undefined, practitioner: '' });
    expect(isUnassigned(free)).toBe(true);
    expect(isUnassigned(appt())).toBe(false);
    expect(consultationInputFor(free, '5').practitioner).toBe('5');
    expect(consultationInputFor(appt(), '5').practitioner).toBe('3');
  });
});
