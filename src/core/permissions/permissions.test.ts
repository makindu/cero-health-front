import { describe, expect, it } from 'vitest';
import { hasAllPermissions, hasAnyPermission, hasPermission } from './permissions';

describe('permissions', () => {
  it('refuse tout quand rien n’est accordé', () => {
    expect(hasPermission([], 'health.patients.view')).toBe(false);
  });
  it('accepte une permission exacte', () => {
    expect(hasPermission(['health.patients.view'], 'health.patients.view')).toBe(true);
    expect(hasPermission(['health.patients.view'], 'health.patients.create')).toBe(false);
  });
  it('gère les jokers « * » et « x.* »', () => {
    expect(hasPermission(['*'], 'health.audit.view')).toBe(true);
    expect(hasPermission(['health.patients.*'], 'health.patients.create')).toBe(true);
    expect(hasPermission(['health.patients.*'], 'health.billing.view')).toBe(false);
  });
  it('combine any / all', () => {
    const granted = ['a.b'];
    expect(hasAnyPermission(granted, ['x.y', 'a.b'])).toBe(true);
    expect(hasAllPermissions(granted, ['x.y', 'a.b'])).toBe(false);
  });
});
