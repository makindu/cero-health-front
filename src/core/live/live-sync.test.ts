import { describe, expect, it } from 'vitest';
import { queriesToRefresh } from './live-sync';

describe('queriesToRefresh', () => {
  it('relit file d\'attente, accueil et tableau de bord quand un rendez-vous change', () => {
    const names = queriesToRefresh([{ entity: 'appointments' }]);
    expect(names).toEqual(expect.arrayContaining(['appointments', 'triage', 'dashboard']));
  });
  it('fusionne les signaux sans doublon et ignore les types inconnus', () => {
    const names = queriesToRefresh([{ entity: 'appointments' }, { entity: 'triage_entries' }, { entity: 'audit_events' }]);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain('audit_events');
  });
  it('ne relit jamais le dossier clinique en cours de saisie', () => {
    const names = queriesToRefresh([{ entity: 'consultations' }, { entity: 'diagnoses' }, { entity: 'consultation_addenda' }]);
    expect(names).not.toContain('consultation-records');
  });
});
