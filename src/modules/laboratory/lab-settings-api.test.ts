import { describe, expect, it } from 'vitest';
import { labSettingsFrom } from './lab-settings-api';

describe('réglages du laboratoire (API)', () => {
  it('traduit la règle appliquée, la règle par défaut et le choix de l\'établissement', () => {
    expect(labSettingsFrom({ require_distinct_validator: false, default: true, overridden: true })).toEqual({ requireDistinctValidator: false, defaultRule: true, overridden: true });
    expect(labSettingsFrom({ require_distinct_validator: true, default: true, overridden: false })).toEqual({ requireDistinctValidator: true, defaultRule: true, overridden: false });
  });
  it('reste prudent : une réponse vide garde la règle de double contrôle', () => {
    expect(labSettingsFrom(undefined)).toEqual({ requireDistinctValidator: true, defaultRule: true, overridden: false });
  });
});
