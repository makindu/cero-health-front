import { describe, expect, it } from 'vitest';
import type { Patient } from '../patients/data';
import type { TriageEntry } from './data';
import { applyTriageCommand, buildTriageEntry, buildVitals } from './local-rules';

const ctx = { now: new Date(2026, 10, 14, 10), actor: { id: 'n', name: 'Infirmier (démo)' } };
const patient: Patient = {
  id: 'P-1', fileNumber: 'DOS-0001', fullName: 'Amani Alpha', sex: 'F', birthDate: '1990-01-01', phone: '', address: '',
  service: 'generalMedicine', status: 'active', insurer: '', emergencyContact: '', registeredAt: '2026-01-01', lastVisit: null,
};

describe('triage — règles locales', () => {
  it("crée un passage en attente, refuse un patient déjà dans la file", () => {
    const e = buildTriageEntry({ patient: 'P-1', priority: 'urgent', source: 'walkIn', reason: 'Douleur' }, ctx, [patient], [], 'T-1');
    expect(e).toMatchObject({ patientId: 'P-1', priority: 'urgent', status: 'waiting', category: 'other', source: 'walkIn' });
    expect(() => buildTriageEntry({ patient: 'P-1' }, ctx, [patient], [e], 'T-2')).toThrow(/patientAlreadyInQueue/);
    expect(() => buildTriageEntry({ patient: 'P-1', priority: 'zzz' }, ctx, [patient], [], 'T-2')).toThrow(/urgencyInvalid/);
  });

  it('impose le circuit attente → triage → soins → sortie', () => {
    let e: TriageEntry = buildTriageEntry({ patient: 'P-1' }, ctx, [patient], [], 'T-1');
    expect(() => applyTriageCommand(e, 'send-to-care', ctx)).toThrow(/invalidTransition/);
    e = applyTriageCommand(e, 'start-triage', ctx);
    expect(e).toMatchObject({ status: 'inTriage', nurse: 'Infirmier (démo)' });
    e = applyTriageCommand(e, 'send-to-care', ctx);
    expect(applyTriageCommand(e, 'discharge', ctx).status).toBe('discharged');
    expect(applyTriageCommand(e, 'transfer', ctx).status).toBe('transferred');
  });

  it('constantes : bornes de plausibilité, au moins une valeur, aucune interprétation', () => {
    const v = buildVitals({ temperature: '38,5', pulse: '90', systolic: '120', diastolic: '80' }, 'T-1', ctx, 'V-1');
    expect(v).toMatchObject({ temperature: 38.5, pulse: 90, entryId: 'T-1' });
    expect(() => buildVitals({}, 'T-1', ctx, 'V')).toThrow(/vitalsEmpty/);
    expect(() => buildVitals({ temperature: '385' }, 'T-1', ctx, 'V')).toThrow(/vitalOutOfRange/);
    expect(() => buildVitals({ systolic: '80', diastolic: '90' }, 'T-1', ctx, 'V')).toThrow(/vitalPressureOrder/);
    expect(buildVitals({ temperature: '41' }, 'T-1', ctx, 'V').temperature).toBe(41);
  });
});
