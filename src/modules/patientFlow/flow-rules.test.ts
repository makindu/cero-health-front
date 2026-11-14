import { describe, expect, it } from 'vitest';
import * as R from './flow-rules';

const empty: R.FlowSources = { appointments: [], triage: [], consultations: [], rx: [], lab: [], dispensations: [], invoices: [], payments: [], admissions: [] };
const at = (h: number, m = 0, day = 14) => new Date(2026, 10, day, h, m).toISOString();
const NOW = new Date(2026, 10, 14, 15, 0);
const P = { patientId: 'P1', patientName: 'Patient Un' };

describe('suivi des patients', () => {
  it('la dernière position est l’événement le plus récent, tous modules confondus', () => {
    const events = R.buildEvents({
      ...empty,
      appointments: [{ ...P, arrivedAt: at(8, 0), status: 'arrived', service: 'generalMedicine' }],
      consultations: [{ id: 'c1', ...P, date: at(8, 30), status: 'inProgress' }],
      lab: [{ number: 'LAB-1', ...P, requestedAt: at(9, 0), collected: { at: at(9, 20) } }],
      dispensations: [{ number: 'DIS-1', ...P, preparedAt: at(10, 0) }],
    });
    expect(events.map((e) => `${e.place}:${e.step}`)).toEqual(['pharmacy:prepared', 'laboratory:collected', 'laboratory:requested', 'consultation:inProgress', 'reception:arrived']);
    const board = R.buildBoard(events, [], NOW);
    expect(board).toHaveLength(1);
    expect(board[0]!.last).toMatchObject({ place: 'pharmacy', step: 'prepared', ref: 'DIS-1' });
    expect(board[0]!.todayCount).toBe(5);
  });

  it('paiement : rattaché au numéro de facture ; seuls les vrais paiements comptent', () => {
    const events = R.buildEvents({
      ...empty,
      invoices: [{ id: 'i1', number: 'FAC-1', ...P, createdAt: at(9, 0) }],
      payments: [{ kind: 'payment', at: at(9, 30), patientId: 'P1', invoiceId: 'i1' }, { kind: 'refund', at: at(9, 40), patientId: 'P1', invoiceId: 'i1' }],
      names: new Map([['P1', 'Patient Un']]),
    });
    expect(events.map((e) => e.step)).toEqual(['paid', 'invoiced']);
    expect(events[0]).toMatchObject({ place: 'cashier', ref: 'FAC-1', patientName: 'Patient Un' });
  });

  it('hospitalisation : admission, transfert, sortie ; un patient hospitalisé reste au tableau même sans événement du jour', () => {
    const adm: R.SrcAdmission = { number: 'ADM-1', ...P, ward: 'maternity', status: 'admitted', admittedAt: at(8, 0, 12), stays: [{ from: at(8, 0, 12) }, { from: at(10, 0, 13) }] };
    const events = R.buildEvents({ ...empty, admissions: [adm] });
    expect(events.map((e) => e.step)).toEqual(['transferred', 'admitted']);
    const board = R.buildBoard(events, [adm], NOW);
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ inpatientWard: 'maternity', todayCount: 0 });
    // sorti : plus au tableau s'il n'y a rien aujourd'hui
    const out: R.SrcAdmission = { ...adm, status: 'discharged', discharge: { at: at(9, 0, 13) } };
    expect(R.buildBoard(R.buildEvents({ ...empty, admissions: [out] }), [out], NOW)).toHaveLength(0);
  });

  it('un patient sans événement aujourd’hui n’apparaît pas ; les événements futurs et les dates invalides sont ignorés', () => {
    const events = R.buildEvents({
      ...empty,
      appointments: [{ ...P, arrivedAt: at(8, 0, 10), status: 'done' }, { patientId: 'P2', patientName: 'Deux', arrivedAt: 'pas une date', status: 'arrived' }],
      consultations: [{ id: 'c', patientId: 'P3', patientName: 'Trois', date: at(18, 0), status: 'draft' }],
    });
    expect(events.some((e) => e.patientId === 'P2')).toBe(false);
    expect(R.buildBoard(events, [], NOW)).toHaveLength(0);
  });

  it('trie le tableau par dernière activité et fournit l’historique d’un patient', () => {
    const events = R.buildEvents({
      ...empty,
      appointments: [{ ...P, arrivedAt: at(8, 0), status: 'arrived' }, { patientId: 'P2', patientName: 'Deux', arrivedAt: at(9, 0), status: 'arrived' }],
      triage: [{ ...P, arrivedAt: at(8, 15), status: 'waiting' }],
    });
    expect(R.buildBoard(events, [], NOW).map((r) => r.patientId)).toEqual(['P2', 'P1']);
    expect(R.historyOf(events, 'P1', NOW).map((e) => e.place)).toEqual(['triage', 'reception']);
    expect(R.minutesSince(at(14, 35), NOW)).toBe(25);
    expect(R.minutesSince(at(16, 0), NOW)).toBe(0);
  });
});
