import { afterEach, describe, expect, it } from 'vitest';
import { resetReference, setReferenceForTests } from '../_shared/reference-data';
import { CONSULTATION_API } from './data';

const UNITS = [{ id: '7', code: 'pediatrics', name: 'Pédiatrie', type: 'outpatient', active: true }];
const STAFF = [{ id: '3', userId: '12', name: 'Dr Mwamba', type: 'doctor' }];

describe('consultations : correspondance avec l’API réelle', () => {
  afterEach(() => resetReference());

  it('traduit une consultation du serveur', () => {
    setReferenceForTests(UNITS, STAFF);
    const c = CONSULTATION_API.fromApi({
      id: 4, patient_id: 9, patient: { full_name: 'Marie Test' }, practitioner_staff_id: 3, care_unit_id: 7, reason_code: 'followUp',
      origin: 'walkIn', status: 'toValidate', started_at: '2026-11-21T08:00:00Z', triage_entry_id: 11,
    });
    expect(c).toMatchObject({
      id: '4', patientName: 'Marie Test', practitioner: 'Dr Mwamba', service: 'pediatrics', serviceLabel: 'Pédiatrie',
      date: '2026-11-21T08:00:00Z', reason: 'followUp', status: 'toValidate', origin: 'walkIn', triageEntryId: '11',
    });
  });

  it('construit le corps d’ouverture (statut et origine imposés par le serveur)', () => {
    setReferenceForTests(UNITS, STAFF);
    const body = CONSULTATION_API.toApi({ patient: '9', service: 'pediatrics', practitioner: 'dr mwamba', reason: 'control' });
    expect(body).toEqual({ patient_id: 9, practitioner_staff_id: 3, care_unit_id: 7, reason_code: 'control' });
    expect(CONSULTATION_API.toApi({ patient: '9', service: '7', practitioner: 'Dr Mwamba', reason: 'control', triageEntryId: '11' })).toMatchObject({ triage_entry_id: 11 });
  });

  it('refuse une saisie sans correspondance dans l’établissement', () => {
    setReferenceForTests(UNITS, STAFF);
    expect(() => CONSULTATION_API.toApi({ patient: 'Marie', service: '7', practitioner: 'Dr Mwamba', reason: 'control' })).toThrow(/patient/i);
    expect(() => CONSULTATION_API.toApi({ patient: '9', service: 'zzz', practitioner: 'Dr Mwamba', reason: 'control' })).toThrow(/Service inconnu/);
    expect(() => CONSULTATION_API.toApi({ patient: '9', service: '7', practitioner: 'Inconnu', reason: 'control' })).toThrow(/Praticien inconnu/);
  });

  it('étapes : chemin du serveur, filtre de service par identifiant', () => {
    setReferenceForTests(UNITS, STAFF);
    expect(CONSULTATION_API.commandPath?.('4', 'sign')).toBe('/consultations/4/actions/sign');
    expect(CONSULTATION_API.mapFilter?.('service', 'pediatrics')).toEqual({ care_unit_id: '7' });
    expect(CONSULTATION_API.mapFilter?.('status', 'signed')).toBeUndefined();
  });
});
