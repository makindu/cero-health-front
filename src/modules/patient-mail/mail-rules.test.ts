import { describe, expect, it } from 'vitest';
import { buildMail, checkMail, isDue, isEmail, mailtoHref, reminderTime } from './mail-rules';

const base = { id: 'm1', now: '2026-11-18T10:00:00.000Z', by: 'Dr A', patientId: 'p1', patientName: 'Jean', to: 'jean@example.org', kind: 'free' as const, subject: 'Bonjour', body: 'Texte' };

describe('mail rules', () => {
  it('valide une adresse e-mail', () => {
    expect(isEmail('a@b.cd')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('')).toBe(false);
    expect(isEmail(undefined)).toBe(false);
  });
  it('refuse destinataire, objet ou corps invalides', () => {
    expect(checkMail({ to: 'x', subject: ' ', body: '' }, [])).toEqual(['recipientInvalid', 'subjectRequired', 'bodyRequired']);
    expect(checkMail({ to: 'a@b.cd', subject: 's', body: 'b' }, [])).toEqual([]);
  });
  it('évite de mettre deux fois le même rappel en file', () => {
    const queued = buildMail({ ...base, sourceRef: 'appt:1' });
    expect(checkMail({ to: 'a@b.cd', subject: 's', body: 'b', sourceRef: 'appt:1' }, [queued])).toEqual(['alreadyQueued']);
    expect(checkMail({ to: 'a@b.cd', subject: 's', body: 'b', sourceRef: 'appt:1' }, [{ ...queued, status: 'cancelled' }])).toEqual([]);
  });
  it('calcule la date d\'un rappel (jours ou heures avant)', () => {
    expect(reminderTime('2026-11-20T09:00:00.000Z', { days: 2 })).toBe('2026-11-18T09:00:00.000Z');
    expect(reminderTime('2026-11-20T09:00:00.000Z', { hours: 3 })).toBe('2026-11-20T06:00:00.000Z');
  });
  it('un message programmé est dû une fois l\'échéance passée', () => {
    const m = buildMail({ ...base, scheduledFor: '2026-11-19T08:00:00.000Z' });
    expect(isDue(m, '2026-11-18T10:00:00.000Z')).toBe(false);
    expect(isDue(m, '2026-11-19T08:00:00.000Z')).toBe(true);
    expect(isDue({ ...m, status: 'handedOff' }, '2030-01-01T00:00:00.000Z')).toBe(false);
  });
  it('encode le lien mailto', () => {
    const href = mailtoHref({ to: 'a@b.cd', subject: 'Rendez-vous & suivi', body: 'Ligne 1\nLigne 2' });
    expect(href).toContain('subject=Rendez-vous%20%26%20suivi');
    expect(href).toContain('body=Ligne%201%0ALigne%202');
  });
});
