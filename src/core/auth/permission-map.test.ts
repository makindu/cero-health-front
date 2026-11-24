import { describe, expect, it } from 'vitest';
import { toUiPermissions } from './permission-map';

describe('permissions du catalogue vers l\'interface', () => {
  it('lire le personnel ou les unités de soins n\'ouvre pas le menu Administration', () => {
    const ui = toUiPermissions(['health.staff.read', 'health.care-units.read']);
    expect(ui).not.toContain('health.administration.view');
    expect(ui).toContain('health.staff.read');
  });
  it('gérer le personnel, les unités de soins ou les paramètres ouvre le menu Administration', () => {
    for (const code of ['health.staff.manage', 'health.care-units.manage', 'health.patients.categories']) {
      expect(toUiPermissions([code])).toContain('health.administration.view');
    }
  });
  it('gérer le personnel donne aussi la gestion des utilisateurs', () => {
    expect(toUiPermissions(['health.staff.manage'])).toContain('health.users.manage');
  });
});
