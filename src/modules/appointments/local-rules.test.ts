import { describe, expect, it } from 'vitest';
import type { Patient } from '../patients/data';
import type { Appointment } from './data';
import { applyAppointmentCommand, applyAppointmentUpdate, buildAppointment, type RuleContext } from './local-rules';

const NOW = new Date(2026, 10, 14, 10, 0, 0);
const ctx: RuleContext = { now: NOW, actor: { id: 'u', name: 'Réception (démo)' } };
const patient: Patient = {
  id: 'P-1', fileNumber: 'DOS-0001', fullName: 'Amani Alpha', sex: 'F', birthDate: '1990-01-01', phone: '', address: '',
  service: 'generalMedicine', status: 'active', insurer: '', emergencyContact: '', registeredAt: '2026-01-01', lastVisit: null,
};
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 10, 14 + dayOffset, h, m).toISOString();
const booking = { patient: 'P-1', service: 'generalMedicine', practitioner: 'Dr Démo', startsAt: at(11), durationMin: '30', reason: 'control' };

describe('rendez-vous — règles locales', () => {
  it('crée un rendez-vous planifié, rattaché au bon patient', () => {
    const a = buildAppointment(booking, ctx, [patient], [], 'A-1');
    expect(a).toMatchObject({ patientId: 'P-1', patientName: 'Amani Alpha', status: 'scheduled', durationMin: 30 });
    expect(a.history).toHaveLength(1);
  });

  it('refuse un chevauchement du praticien (conflit) et un double rendez-vous du patient', () => {
    const first = buildAppointment(booking, ctx, [patient], [], 'A-1');
    expect(() => buildAppointment({ ...booking, startsAt: at(11, 15), patient: 'P-2' }, ctx, [patient, { ...patient, id: 'P-2', fileNumber: 'DOS-2', fullName: 'Autre' }], [first], 'A-2')).toThrow(/slotTaken/);
    expect(() => buildAppointment({ ...booking, practitioner: 'Dr Autre', startsAt: at(11, 15) }, ctx, [patient], [first], 'A-2')).toThrow(/patientBusy/);
    expect(buildAppointment({ ...booking, startsAt: at(11, 30) }, ctx, [patient], [first], 'A-2').startsAt).toBe(at(11, 30));
  });

  it("refuse un rendez-vous avant aujourd'hui", () => {
    expect(() => buildAppointment({ ...booking, startsAt: at(9, 0, -1) }, ctx, [patient], [], 'A')).toThrow(/appointmentPast/);
  });

  it('accueil sans rendez-vous : arrivé immédiatement ; urgence → triage obligatoire', () => {
    const walk = { patient: 'DOS-0001', service: 'generalMedicine', reason: 'Fièvre depuis hier', urgency: 'standard', walkIn: 'true' };
    const a = buildAppointment(walk, ctx, [patient], [], 'A-1');
    expect(a).toMatchObject({ status: 'arrived', walkIn: true, reason: 'walkIn', practitioner: '' });
    expect(a.history.map((h) => h.type)).toEqual(['created', 'checkedIn']);
    expect(() => buildAppointment({ ...walk, urgency: 'urgent' }, ctx, [patient], [], 'A-2')).toThrow(/triageRequired/);
    expect(() => buildAppointment({ ...walk, urgency: 'immediate' }, ctx, [patient], [], 'A-2')).toThrow(/triageRequired/);
    expect(() => buildAppointment(walk, ctx, [patient], [a], 'A-3')).toThrow(/patientAlreadyInQueue/);
  });

  it("circuit d'accueil complet avec historique", () => {
    let a = buildAppointment(booking, ctx, [patient], [], 'A-1');
    a = { ...a, startsAt: at(10, 30) };
    for (const action of ['check-in', 'wait', 'start', 'complete']) a = applyAppointmentCommand(a, action, {}, ctx, [a]);
    expect(a.status).toBe('done');
    expect(a.arrivedAt).toBe(NOW.toISOString());
    expect(a.history.map((h) => h.type)).toEqual(['created', 'checkedIn', 'updated', 'updated', 'updated']);
  });

  it('refuse les transitions interdites et le check-in un autre jour', () => {
    const a = buildAppointment(booking, ctx, [patient], [], 'A-1');
    expect(() => applyAppointmentCommand(a, 'start', {}, ctx, [a])).toThrow(/invalidTransition/);
    expect(() => applyAppointmentCommand(a, 'complete', {}, ctx, [a])).toThrow(/invalidTransition/);
    const tomorrow: Appointment = { ...a, startsAt: at(11, 0, 1) };
    expect(() => applyAppointmentCommand(tomorrow, 'check-in', {}, ctx, [tomorrow])).toThrow(/checkInWrongDay/);
    expect(() => applyAppointmentCommand(a, 'inconnue', {}, ctx, [a])).toThrow(/unknownAction/);
  });

  it('annulation et report : motif obligatoire, ancien créneau conservé dans le journal', () => {
    const a = buildAppointment(booking, ctx, [patient], [], 'A-1');
    expect(() => applyAppointmentCommand(a, 'cancel', {}, ctx, [a])).toThrow(/reasonRequired/);
    expect(applyAppointmentCommand(a, 'cancel', { reason: 'patientRequest' }, ctx, [a])).toMatchObject({ status: 'cancelled' });
    const moved = applyAppointmentCommand(a, 'reschedule', { startsAt: at(14), reason: 'other' }, ctx, [a]);
    expect(moved.startsAt).toBe(at(14));
    expect(moved.history.at(-1)).toMatchObject({ type: 'rescheduled', from: at(11) });
  });

  it('modification : conflit contrôlé en ignorant le rendez-vous lui-même', () => {
    const a = buildAppointment(booking, ctx, [patient], [], 'A-1');
    expect(applyAppointmentUpdate(a, { practitioner: 'Dr Démo', durationMin: '45' }, ctx, [a]).durationMin).toBe(45);
    const done = { ...a, status: 'done' as const };
    expect(() => applyAppointmentUpdate(done, {}, ctx, [done])).toThrow(/invalidTransition/);
  });
});
