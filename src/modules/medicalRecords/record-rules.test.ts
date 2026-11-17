import { describe, expect, it } from 'vitest';
import { actionsFor, applyAction, buildRecord, createRecord, patientsWithoutRecord, recordIdFor, type PatientLite } from './record-rules';

const p = (id: string, over: Partial<PatientLite> = {}): PatientLite => ({ id, fullName: `Patient ${id}`, service: 'general' as PatientLite['service'], status: 'active', registeredAt: '2026-01-01', ...over });
const now = new Date('2026-11-17T10:00:00.000Z');

describe('dossier médical — règles', () => {
  it('un dossier neuf est actif, vide et rattaché au patient', () => {
    const r = buildRecord(p('P1'), now);
    expect(r).toMatchObject({ id: 'DOS-P1', patientId: 'P1', status: 'active', completeness: 'incomplete', openedAt: '2026-11-17' });
    expect(r.counts).toEqual({ consultations: 0, prescriptions: 0, labOrders: 0, documents: 0 });
    expect(recordIdFor('P1')).toBe('DOS-P1');
  });
  it('seuls les patients actifs, non fusionnés et sans dossier en reçoivent un', () => {
    const records = [buildRecord(p('P1'), now)];
    const missing = patientsWithoutRecord([p('P1'), p('P2'), p('P3', { status: 'inactive' }), p('P4', { mergedInto: 'P2' })], records);
    expect(missing.map((x) => x.id)).toEqual(['P2']);
  });
  it('archiver, verrouiller, rouvrir : transitions autorisées seulement', () => {
    const r = buildRecord(p('P1'), now);
    const locked = applyAction(r, 'lock', now);
    expect(locked.status).toBe('locked');
    expect(() => applyAction(locked, 'lock', now)).toThrow('wrongStatus');
    expect(applyAction(locked, 'archive', now).status).toBe('archived');
    expect(applyAction(applyAction(r, 'archive', now), 'reopen', now).status).toBe('active');
    expect(() => applyAction(r, 'reopen', now)).toThrow('wrongStatus');
  });
  it('actions proposées selon le statut', () => {
    expect(actionsFor('active')).toEqual(['archive', 'lock']);
    expect(actionsFor('locked')).toEqual(['archive', 'reopen']);
    expect(actionsFor('archived')).toEqual(['reopen']);
  });
  it('ouverture manuelle : un seul dossier par patient, jamais pour un patient inactif ou fusionné', () => {
    const first = createRecord(p('P1'), [], now);
    expect(first.id).toBe('DOS-P1');
    expect(() => createRecord(p('P1'), [first], now)).toThrow('alreadyExists');
    expect(() => createRecord(p('P2', { status: 'inactive' }), [], now)).toThrow('patientInactive');
    expect(() => createRecord(p('P3', { mergedInto: 'P1' }), [], now)).toThrow('patientInactive');
  });
});
