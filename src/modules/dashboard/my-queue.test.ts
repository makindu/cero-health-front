import { describe, expect, it } from 'vitest';
import type { Appointment } from '../appointments/data';
import type { Consultation } from '../consultations/data';
import { findMyStaff, myConsultations, myQueue, unassignedQueue } from './my-queue';

const appt = (id: string, status: string, arrivedAt?: string): Appointment => ({
  id, patientId: id, patientName: `P${id}`, service: 'generalMedicine', practitioner: 'Dr', startsAt: '2026-11-21T08:00:00Z',
  durationMin: 30, reason: 'followUp', status: status as Appointment['status'], arrivedAt, history: [],
});
const consult = (id: string, status: string, date: string): Consultation => ({
  id, patientId: id, patientName: `P${id}`, practitioner: 'Dr', service: 'generalMedicine', date, reason: 'followUp', status: status as Consultation['status'],
});

describe('file d’attente du médecin', () => {
  it('ne garde que les patients présents : les plus anciens d’abord, ceux déjà appelés à la fin', () => {
    const rows = [appt('1', 'scheduled'), appt('2', 'waiting', '2026-11-21T09:30:00Z'), appt('3', 'inProgress', '2026-11-21T08:10:00Z'), appt('4', 'arrived', '2026-11-21T09:00:00Z'), appt('5', 'done'), appt('6', 'cancelled')];
    expect(myQueue(rows).map((a) => a.id)).toEqual(['4', '2', '3']);
  });
  it('place les plus urgents en tête, puis l’ordre d’arrivée à gravité égale', () => {
    const u = (id: string, urgency: string | undefined, at: string): Appointment => ({ ...appt(id, 'arrived', at), urgency });
    const rows = [u('1', 'standard', '2026-11-21T08:00:00Z'), u('2', 'urgent', '2026-11-21T10:00:00Z'), u('3', undefined, '2026-11-21T07:00:00Z'), u('4', 'immediate', '2026-11-21T11:00:00Z'), u('5', 'urgent', '2026-11-21T09:00:00Z'), u('6', 'nonUrgent', '2026-11-21T06:00:00Z')];
    expect(myQueue(rows).map((a) => a.id)).toEqual(['4', '5', '2', '3', '1', '6']);
  });
  it('sépare les consultations à reprendre et à signer', () => {
    const r = myConsultations([consult('1', 'draft', '2026-11-20T10:00:00Z'), consult('2', 'toValidate', '2026-11-21T10:00:00Z'), consult('3', 'signed', '2026-11-21T11:00:00Z'), consult('4', 'inProgress', '2026-11-21T09:00:00Z')]);
    expect(r.open.map((c) => c.id)).toEqual(['4', '1']);
    expect(r.toSign.map((c) => c.id)).toEqual(['2']);
  });
  it('retrouve le profil du compte connecté', () => {
    const staff = [{ id: '3', userId: '12', name: 'Dr A', type: 'doctor' }, { id: '4', userId: '13', name: 'Dr B', type: 'doctor' }];
    expect(findMyStaff(staff, 13)?.id).toBe('4');
    expect(findMyStaff(staff, 99)).toBeUndefined();
    expect(findMyStaff(staff, undefined)).toBeUndefined();
  });
  it('liste à part les patients présents sans médecin assigné', () => {
    const free = (id: string, status: string, at: string): Appointment => ({ ...appt(id, status, at), practitionerId: undefined });
    const rows = [{ ...appt('1', 'waiting', '2026-11-21T09:00:00Z'), practitionerId: '3' }, free('2', 'arrived', '2026-11-21T09:30:00Z'), free('3', 'waiting', '2026-11-21T08:50:00Z'), free('4', 'scheduled', '2026-11-21T08:00:00Z'), free('5', 'inProgress', '2026-11-21T08:00:00Z')];
    expect(unassignedQueue(rows).map((a) => a.id)).toEqual(['3', '2']);
  });
});
