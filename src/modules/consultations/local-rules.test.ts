import { describe, expect, it } from 'vitest';
import type { Patient } from '../patients/data';
import type { UserAccount } from '../administration/data';
import { applyConsultationCommand, buildConsultation } from './local-rules';

const patient = (over: Partial<Patient> = {}): Patient => ({ id: 'P1', fileNumber: 'D1', fullName: 'Amani Test', sex: 'M', birthDate: '2020-01-01', phone: '', address: '', service: 'emergency', status: 'active', insurer: '', emergencyContact: '', registeredAt: '2026-01-01', lastVisit: null, ...over });
const now = new Date(2026, 10, 14, 10);
const doc = (over: Partial<UserAccount> = {}): UserAccount => ({ id: 'D1', name: 'Dr Éloïse Test', email: '', role: 'doctor', status: 'active', lastLogin: null, service: 'emergency', ...over });
const staff = [doc(), doc({ id: 'N1', name: 'Infirmier Test', role: 'nurse' }), doc({ id: 'D2', name: 'Dr Suspendu', status: 'suspended' })];
const input = { patient: 'Amani Test', service: 'emergency', reason: 'firstVisit', practitioner: 'dr eloise test' };

describe('consultation locale', () => {
  it('refuse sans frais valides, accepte avec', () => {
    expect(() => buildConsultation(input, [patient()], { state: 'none' }, now, 'C1', staff)).toThrow('consultationFeeRequired');
    expect(() => buildConsultation(input, [patient()], { state: 'expired' }, now, 'C1', staff)).toThrow('consultationFeeExpired');
    const c = buildConsultation(input, [patient()], { state: 'valid' }, now, 'C1', staff);
    expect(c).toMatchObject({ id: 'C1', patientId: 'P1', status: 'draft', practitioner: 'Dr Éloïse Test', practitionerId: 'D1' });
  });
  it('valide service, motif et patient', () => {
    expect(() => buildConsultation({ ...input, service: 'zzz' }, [patient()], { state: 'valid' }, now, 'C', staff)).toThrow('consultationServiceInvalid');
    expect(() => buildConsultation({ ...input, reason: 'zzz' }, [patient()], { state: 'valid' }, now, 'C', staff)).toThrow('consultationReasonInvalid');
    expect(() => buildConsultation({ ...input, patient: 'Inconnu' }, [patient()], { state: 'valid' }, now, 'C', staff)).toThrow();
    expect(() => buildConsultation(input, [patient({ status: 'inactive' })], { state: 'valid' }, now, 'C', staff)).toThrow('patientInactive');
  });
  it('le praticien doit être un médecin actif de l’annuaire', () => {
    for (const bad of ['', 'Inconnu', 'Infirmier Test', 'Dr Suspendu']) {
      expect(() => buildConsultation({ ...input, practitioner: bad }, [patient()], { state: 'valid' }, now, 'C', staff)).toThrow('consultationPractitionerInvalid');
    }
  });
  it('transitions cliniques contrôlées', () => {
    const c = buildConsultation(input, [patient()], { state: 'valid' }, now, 'C1', staff);
    expect(() => applyConsultationCommand(c, 'sign')).toThrow('consultationTransitionInvalid');
    const s = applyConsultationCommand(applyConsultationCommand(applyConsultationCommand(c, 'start'), 'submit'), 'sign');
    expect(s.status).toBe('signed');
    expect(applyConsultationCommand(s, 'close').status).toBe('closed');
    expect(() => applyConsultationCommand(s, 'start')).toThrow('consultationTransitionInvalid');
    expect(() => applyConsultationCommand(c, 'nope')).toThrow('consultationTransitionInvalid');
  });
});
