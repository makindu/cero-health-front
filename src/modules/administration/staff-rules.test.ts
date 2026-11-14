import { describe, expect, it } from 'vitest';
import type { UserAccount } from './data';
import { activeDoctors, applyStaffUpdate, buildStaff, findDoctor, setStaffStatus } from './staff-rules';

const now = new Date(2026, 10, 14, 10);
const base = { name: 'Dr Éloïse Mwamba', role: 'doctor', service: 'pediatrics', specialty: 'Pédiatrie', registrationNumber: 'ORD-1' };
const make = (over: Record<string, string> = {}, existing: UserAccount[] = [], id = 'S1') => buildStaff({ ...base, ...over }, existing, id, now);

describe('annuaire du personnel local', () => {
  it('crée un médecin avec son profil, actif, sans mot de passe', () => {
    const d = make();
    expect(d).toMatchObject({ id: 'S1', role: 'doctor', status: 'active', service: 'pediatrics', registrationNumber: 'ORD-1' });
    expect(Object.keys(d)).not.toContain('password');
  });
  it('valide nom, catégorie, courriel, service du médecin', () => {
    expect(() => make({ name: ' ' })).toThrow('staffNameRequired');
    expect(() => make({ role: 'ninja' })).toThrow('staffRoleInvalid');
    expect(() => make({ email: 'pas-un-courriel' })).toThrow('staffEmailInvalid');
    expect(() => make({ service: '' })).toThrow('staffServiceRequired');
    expect(() => make({ service: 'zzz' })).toThrow('staffServiceInvalid');
    expect(make({ role: 'nurse', service: '' }).service).toBeUndefined();
  });
  it('refuse un courriel ou un numéro d’inscription déjà utilisé', () => {
    const a = make({ email: 'A@x.org' });
    expect(() => make({ email: 'a@X.org', registrationNumber: 'ORD-2' }, [a], 'S2')).toThrow('staffEmailTaken');
    expect(() => make({ registrationNumber: 'ord-1' }, [a], 'S2')).toThrow('staffRegistrationTaken');
  });
  it('la modification garde l’unicité (hors soi-même)', () => {
    const a = make({ email: 'a@x.org' });
    const b = make({ name: 'Dr Autre', registrationNumber: 'ORD-9', email: 'b@x.org' }, [a], 'S2');
    expect(applyStaffUpdate(a, { specialty: 'Néonatologie' }, [a, b]).specialty).toBe('Néonatologie');
    expect(() => applyStaffUpdate(b, { registrationNumber: 'ORD-1' }, [a, b])).toThrow('staffRegistrationTaken');
  });
  it('suspension et réactivation ; seuls les médecins actifs sont cherchables', () => {
    const d = make();
    const n = make({ name: 'Infirmier X', role: 'nurse', service: '', registrationNumber: '' }, [d], 'S2');
    const s = setStaffStatus(d, 'suspended');
    expect(() => setStaffStatus(s, 'suspended')).toThrow('staffAlreadySuspended');
    expect(() => setStaffStatus(d, 'active')).toThrow('staffAlreadyActive');
    expect(activeDoctors([d, n]).map((u) => u.id)).toEqual(['S1']);
    expect(activeDoctors([s, n])).toEqual([]);
    expect(findDoctor('dr eloise  mwamba', [d, n])?.id).toBe('S1');
    expect(findDoctor('Infirmier X', [d, n])).toBeUndefined();
    expect(findDoctor('Dr Éloïse Mwamba', [s])).toBeUndefined();
  });
});
