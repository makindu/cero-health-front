import { describe, expect, it } from 'vitest';
import { serviceFromApi, serviceRowToWire } from './services-catalog-api';

describe('catalogue des prestations (API)', () => {
  it('lit une ligne du serveur : code de l\'article, désignation, prix et état', () => {
    const item = serviceFromApi({ id: 7, nature: 'procedure', is_active: true, price_minor: 1500, article: { name: 'Consultation générale', code_manuel: 'CONS' } }, 'USD');
    expect(item).toEqual({ id: '7', code: 'CONS', label: 'Consultation générale', category: 'procedure', price: { minor: 1500, currency: 'USD' }, active: true });
  });

  it('un prix absent donne un montant nul et un code absent retombe sur l\'identifiant', () => {
    const item = serviceFromApi({ id: 9, is_active: false, generic_name: 'Pansement', article: {} }, 'CDF');
    expect(item.price.minor).toBe(0);
    expect(item.code).toBe('9');
    expect(item.label).toBe('Pansement');
    expect(item.active).toBe(false);
  });

  it('écrit une ligne d\'import en unités mineures, sans code quand il est vide', () => {
    expect(serviceRowToWire({ label: 'Échographie', price: 30.5, active: true })).toEqual({ label: 'Échographie', price_minor: 3050, is_active: true });
    expect(serviceRowToWire({ code: 'ECHO', label: 'Échographie', price: 0.1 + 0.2, active: false })).toEqual({ code: 'ECHO', label: 'Échographie', price_minor: 30, is_active: false });
  });
});
