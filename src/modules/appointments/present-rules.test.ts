import { describe, expect, it } from 'vitest';
import type { TriageEntry } from '../nursing/data';
import type { Appointment } from './data';
import { buildPresent } from './present-rules';

const day = '2026-11-18';
const at = (hm: string): string => new Date(`${day}T${hm}:00`).toISOString();
const apt = (id: string, over: Partial<Appointment> = {}): Appointment => ({
  id, patientId: `P-${id}`, patientName: `Patient ${id}`, service: 'generalMedicine', practitioner: 'Dr A', startsAt: at('09:00'), durationMin: 30,
  reason: 'control', status: 'arrived', arrivedAt: at('08:55'), history: [], ...over,
});
const tri = (id: string, over: Partial<TriageEntry> = {}): TriageEntry => ({
  id, patientId: `P-${id}`, patientName: `Patient ${id}`, arrivedAt: at('08:30'), priority: 'standard', category: 'other', status: 'waiting', nurse: 'Inf', ...over,
});

describe('patients présents aujourd’hui', () => {
  it('réunit rendez-vous et passages sans rendez-vous, avec leur origine et leur orientation', () => {
    const rows = buildPresent(
      [apt('a1'), apt('a2', { walkIn: true, practitioner: '', urgency: 'nonUrgent', arrivedAt: at('09:10') }), apt('a3', { status: 'inProgress' })],
      [tri('t1')], day,
    );
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by['a:a1']).toMatchObject({ origin: 'appointment', orientation: 'consultation', stage: 'waiting' });
    expect(by['a:a2']).toMatchObject({ origin: 'walkIn', orientation: 'service', priority: 'nonUrgent' });
    expect(by['a:a3']).toMatchObject({ stage: 'inConsultation' });
    expect(by['t:t1']).toMatchObject({ origin: 'walkIn', orientation: 'triage', stage: 'waiting' });
  });

  it('exclut ceux qui ne sont pas là : à venir, terminés, annulés, triage clos ou d’un autre jour', () => {
    const rows = buildPresent(
      [apt('s', { status: 'scheduled' }), apt('c', { status: 'confirmed' }), apt('d', { status: 'done' }), apt('x', { status: 'cancelled' })],
      [tri('t2', { status: 'discharged' }), tri('t3', { status: 'transferred' }), tri('t4', { arrivedAt: new Date('2026-11-17T10:00:00').toISOString() }), tri('t5', { status: 'inTriage' }), tri('t6', { status: 'inCare' })],
      day,
    );
    expect(rows.map((r) => r.key)).toEqual(['t:t5', 't:t6']);
  });

  it('trie les plus urgents d’abord, puis par heure d’arrivée', () => {
    const rows = buildPresent(
      [apt('late', { arrivedAt: at('10:00') }), apt('early', { arrivedAt: at('08:00') })],
      [tri('urgent', { priority: 'urgent', arrivedAt: at('11:00') }), tri('red', { priority: 'immediate', arrivedAt: at('11:30') })], day,
    );
    expect(rows.map((r) => r.key)).toEqual(['t:red', 't:urgent', 'a:early', 'a:late']);
  });
});
