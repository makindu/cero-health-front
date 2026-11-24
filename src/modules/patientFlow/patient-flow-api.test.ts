import { describe, expect, it } from 'vitest';
import { flowEventFrom, snapshotFrom } from './patient-flow-api';

const NOW = '2026-11-22T16:00:00Z';
const ev = (o: Record<string, unknown>) => ({ patient_id: 7, patient_name: 'Alice Mukendi', at: '2026-11-22T15:30:00Z', place: 'laboratory', step: 'collected', ref: 'LAB-1', detail: null, ...o });

describe('suivi des patients : lecture du serveur', () => {
  it('lit un événement et laisse de côté les champs vides', () => {
    expect(flowEventFrom(ev({}))).toEqual({ patientId: '7', patientName: 'Alice Mukendi', at: '2026-11-22T15:30:00Z', place: 'laboratory', step: 'collected', ref: 'LAB-1' });
    expect(flowEventFrom(ev({ ref: null, detail: 'Médecine' }))).toMatchObject({ detail: 'Médecine' });
    expect(flowEventFrom(ev({ ref: null }))).not.toHaveProperty('ref');
  });
  it('écarte un lieu inconnu, une date illisible ou un patient absent', () => {
    expect(flowEventFrom(ev({ place: 'parking' }))).toBeNull();
    expect(flowEventFrom(ev({ at: 'hier' }))).toBeNull();
    expect(flowEventFrom(ev({ patient_id: null }))).toBeNull();
  });
  it('construit le tableau du jour : dernière position, nombre d\'étapes, hospitalisés', () => {
    const s = snapshotFrom({
      now: NOW,
      events: [ev({ place: 'cashier', step: 'paid', at: '2026-11-22T15:50:00Z', ref: '#9' }), ev({}), ev({ patient_id: 8, patient_name: 'Bob', place: 'ward', step: 'admitted', at: '2026-11-10T08:00:00Z', detail: 'Médecine' })],
      inpatients: [{ patient_id: 8, status: 'admitted', ward: 'Médecine' }],
    });
    expect(s.events.map((e) => e.step)).toEqual(['paid', 'collected', 'admitted']);
    const alice = s.board.find((r) => r.patientId === '7');
    expect(alice).toMatchObject({ patientName: 'Alice Mukendi', todayCount: 2 });
    expect(alice?.last).toMatchObject({ place: 'cashier', step: 'paid' });
    const bob = s.board.find((r) => r.patientId === '8');
    expect(bob).toMatchObject({ inpatientWard: 'Médecine', todayCount: 0 });
  });
  it('trie du plus récent au plus ancien même si le serveur envoie dans le désordre', () => {
    const s = snapshotFrom({ now: NOW, events: [ev({ at: '2026-11-22T10:00:00Z', step: 'requested' }), ev({ at: '2026-11-22T15:00:00Z' })], inpatients: [] });
    expect(s.events.map((e) => e.step)).toEqual(['collected', 'requested']);
  });
  it('accepte une réponse vide ou malformée', () => {
    expect(snapshotFrom(null, new Date(NOW))).toMatchObject({ events: [], board: [] });
    expect(snapshotFrom({ events: 'x', inpatients: 3 }, new Date(NOW)).board).toEqual([]);
  });
});
