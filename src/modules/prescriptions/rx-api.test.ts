import { afterEach, describe, expect, it } from 'vitest';
import { resetReference, setReferenceForTests } from '../_shared/reference-data';
import { rxFromApi, rxToApi } from './rx-api';

const ITEM = { label: 'Paracétamol', dosage: '500 mg', frequency: '3/j', duration: '3 j', quantity: 9, instructions: ' après repas ' };

describe('ordonnances : correspondance avec l’API réelle', () => {
  afterEach(() => resetReference());

  it('traduit une ordonnance du serveur (prescripteur par profil, validation, annulation)', () => {
    setReferenceForTests([], [{ id: '3', userId: '12', name: 'Dr Mwamba', type: 'doctor' }]);
    const rx = rxFromApi({
      id: 8, number: 'RX-2026-00001', patient_id: 9, patient: { full_name: 'Marie Test' }, prescriber_staff_id: 3, prescriber_user_id: 12,
      prescribed_at: '2026-11-21T08:00:00Z', status: 'cancelled', note: 'n', cancelled_at: '2026-11-21T09:00:00Z', cancel_reason: 'Erreur',
      items: [{ label: 'Paracétamol', dosage: '500 mg', frequency: '3/j', duration: '3 j', quantity: 9, instructions: null }],
    });
    expect(rx).toMatchObject({ id: '8', number: 'RX-2026-00001', patientName: 'Marie Test', prescriber: 'Dr Mwamba', status: 'cancelled' });
    expect(rx.items[0]).toMatchObject({ label: 'Paracétamol', quantity: 9, instructions: '' });
    expect(rx.cancellation).toEqual({ at: '2026-11-21T09:00:00Z', by: '', reason: 'Erreur' });
    expect(rx.validation).toBeUndefined();
  });

  it('un statut inconnu retombe sur « à valider » (jamais sur validé)', () => {
    expect(rxFromApi({ id: 1, patient_id: 1, status: 'zzz' }).status).toBe('toValidate');
  });

  it('construit le corps de création sans statut ni numéro (imposés par le serveur)', () => {
    const body = rxToApi({ patientId: '9', items: [ITEM], note: ' note ', consultationId: '4' });
    expect(body).toEqual({
      patient_id: 9, note: 'note', consultation_id: 4,
      items: [{ label: 'Paracétamol', dosage: '500 mg', frequency: '3/j', duration: '3 j', quantity: 9, instructions: 'après repas' }],
    });
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('number');
    expect(rxToApi({ patientId: '9', items: [ITEM], note: '' })).not.toHaveProperty('note');
    expect(() => rxToApi({ patientId: 'Marie', items: [ITEM], note: '' })).toThrow(/patient/i);
  });
});
