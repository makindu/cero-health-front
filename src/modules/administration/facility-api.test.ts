import { describe, expect, it } from 'vitest';
import { logoUrl, profileFrom } from './facility-api';

describe('facility-api', () => {
  it('traduit la fiche CERO ID et neutralise les valeurs absentes', () => {
    const p = profileFrom({ id: 7, name: ' Clinique X ', adresse: 'Av. 1', phone: null, linkdin: 'in/x', num_impot: 'A1' });
    expect(p).toMatchObject({ id: 7, name: 'Clinique X', address: 'Av. 1', phone: '', linkedin: 'in/x', taxNumber: 'A1' });
  });
  it('construit l’adresse du logo, ou rien sans base ni identifiant valide', () => {
    expect(logoUrl(7, 'https://id.example/')).toBe('https://id.example/api/v1/enterprise-logos/7');
    expect(logoUrl(0, 'https://id.example')).toBeNull();
    expect(logoUrl(7, null)).toBeNull();
  });
});
