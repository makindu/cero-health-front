import { afterEach, describe, expect, it } from 'vitest';
import { resetReference, setReferenceForTests } from '../_shared/reference-data';
import { TRIAGE_API } from './data';
import { vitalsApi } from './vitals-api';

describe('triage : correspondance avec l’API réelle', () => {
  afterEach(() => resetReference());

  it('traduit une entrée de la file (infirmier par profil de personnel)', () => {
    setReferenceForTests([], [{ id: '4', userId: '2', name: 'Inf. Neema', type: 'nurse' }]);
    const e = TRIAGE_API.fromApi({
      id: 11, patient_id: 9, patient: { full_name: 'Marie Test' }, priority: 'urgent', category: 'fever', status: 'inTriage',
      source: 'walkIn', reason: 'Fièvre', nurse_staff_id: 4, arrived_at: '2026-11-21T08:00:00Z',
    });
    expect(e).toMatchObject({ id: '11', patientId: '9', patientName: 'Marie Test', priority: 'urgent', category: 'fever', status: 'inTriage', nurse: 'Inf. Neema', source: 'walkIn', reason: 'Fièvre' });
  });

  it('reprend la validation des soins par le médecin', () => {
    setReferenceForTests([], [{ id: '7', userId: '3', name: 'Dr Kabila', type: 'doctor' }]);
    const base = { id: 12, patient_id: 9, priority: 'urgent', category: 'fever', status: 'inTriage', arrived_at: '2026-11-21T08:00:00Z' };
    expect(TRIAGE_API.fromApi(base).careValidated).toBeUndefined();
    const e = TRIAGE_API.fromApi({ ...base, care_validated_at: '2026-11-21T08:10:00Z', care_validated_by_user_id: 3, care_instructions: 'Paracétamol 1 g' });
    expect(e.careValidated).toEqual({ at: '2026-11-21T08:10:00Z', by: 'Dr Kabila', instructions: 'Paracétamol 1 g' });
    expect(TRIAGE_API.commandPath?.('12', 'validate-care')).toBe('/triage-entries/12/actions/validate-care');
    expect(TRIAGE_API.commandBody?.('validate-care', { instructions: ' Surveiller ' })).toEqual({ instructions: 'Surveiller' });
    expect(TRIAGE_API.commandBody?.('validate-care', {})).toEqual({});
  });

  it('construit le corps de création avec des valeurs par défaut sûres', () => {
    expect(TRIAGE_API.toApi({ patient: '9', reason: ' Douleur ', priority: 'urgent', source: 'walkIn' })).toEqual({
      patient_id: 9, priority: 'urgent', category: 'other', source: 'walkIn', reason: 'Douleur',
    });
    expect(TRIAGE_API.toApi({ patient: '9', category: 'injury' })).toMatchObject({ category: 'injury', priority: 'standard' });
    expect(() => TRIAGE_API.toApi({ patient: 'Marie' })).toThrow(/patient/i);
  });

  it('actions : « send-to-care » devient « start-care » côté serveur', () => {
    expect(TRIAGE_API.commandPath?.('11', 'send-to-care')).toBe('/triage-entries/11/actions/start-care');
    expect(TRIAGE_API.commandPath?.('11', 'start-triage')).toBe('/triage-entries/11/actions/start-triage');
    expect(TRIAGE_API.commandBody?.('reprioritize', { priority: 'immediate' })).toEqual({ priority: 'immediate' });
    expect(TRIAGE_API.commandBody?.('discharge', {})).toEqual({});
  });

  it('envoi chez un médecin : le serveur reçoit l’identifiant du praticien choisi', () => {
    setReferenceForTests([], [{ id: '7', userId: '3', name: 'Dr Balegamire', type: 'doctor' }]);
    expect(TRIAGE_API.commandPath?.('11', 'send-to-doctor')).toBe('/triage-entries/11/actions/send-to-doctor');
    expect(TRIAGE_API.commandBody?.('send-to-doctor', { practitioner: 'Dr Balegamire' })).toEqual({ practitioner_staff_id: 7 });
    expect(() => TRIAGE_API.commandBody?.('send-to-doctor', { practitioner: 'Inconnu' })).toThrow(/médecin/);
  });
});

describe('constantes vitales : correspondance avec l’API réelle', () => {
  const api = vitalsApi('9', '11');

  it('cible les constantes du patient et rattache la saisie à l’entrée de triage', () => {
    expect(api.endpoint).toBe('/patients/9/vital-signs');
    expect(api.toApi({ temperature: '38,5', pulse: '90', systolic: '120', diastolic: '80', spo2: '97', note: 'ignorée' })).toEqual({
      triage_entry_id: 11, temperature_c: 38.5, pulse_bpm: 90, systolic_mmhg: 120, diastolic_mmhg: 80, spo2_percent: 97,
    });
  });

  it('refuse une saisie vide ou non numérique avant l’envoi', () => {
    expect(() => api.toApi({ note: 'rien' })).toThrow(/au moins une constante/);
    expect(() => api.toApi({ pulse: 'abc' })).toThrow(/numérique/);
  });

  it('traduit une ligne du serveur (valeurs absentes ignorées)', () => {
    const v = api.fromApi({ id: 3, triage_entry_id: 11, recorded_at: '2026-11-21T08:05:00Z', temperature_c: 37.2, pulse_bpm: null, weight_kg: 12.4 });
    expect(v).toMatchObject({ id: '3', entryId: '11', temperature: 37.2, weight: 12.4 });
    expect(v.pulse).toBeUndefined();
  });
});
