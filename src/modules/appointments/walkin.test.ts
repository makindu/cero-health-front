import { describe, expect, it } from 'vitest';
import { isDestinationAllowed, requiresTriage, suggestDestination } from './walkin';

describe('parcours sans rendez-vous', () => {
  it('impose le triage pour les urgences', () => {
    for (const u of ['immediate', 'veryUrgent', 'urgent']) {
      expect(requiresTriage(u)).toBe(true);
      expect(suggestDestination(u)).toBe('triage');
      expect(isDestinationAllowed(u, 'service')).toBe(false);
    }
  });
  it('laisse le choix pour les cas standards', () => {
    for (const u of ['standard', 'nonUrgent']) {
      expect(suggestDestination(u)).toBe('service');
      expect(isDestinationAllowed(u, 'service')).toBe(true);
      expect(isDestinationAllowed(u, 'triage')).toBe(true);
    }
  });
});
