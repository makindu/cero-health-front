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
  it('les droits de dépôt et de mouvement de stock ouvrent le menu Stock, pas l\'Administration', () => {
    for (const code of ['health.deposits.read', 'health.deposits.manage', 'health.stock.move']) {
      const ui = toUiPermissions([code]);
      expect(ui).toContain('health.stock.view');
      expect(ui).toContain(code);
      expect(ui).not.toContain('health.administration.view');
    }
    // qui gère les dépôts ou passe des entrées peut aussi les voir (le serveur l'accepte de même)
    expect(toUiPermissions(['health.stock.move'])).toContain('health.deposits.read');
    expect(toUiPermissions(['health.deposits.manage'])).toContain('health.deposits.read');
  });
  it('gérer le personnel donne aussi la gestion des utilisateurs', () => {
    expect(toUiPermissions(['health.staff.manage'])).toContain('health.users.manage');
  });
});
