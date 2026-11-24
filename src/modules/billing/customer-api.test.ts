import { describe, expect, it } from 'vitest';
import { candidateFrom, canLink } from './customer-api';

describe('customer-api', () => {
  it('lit un client proche renvoyé par le serveur', () => {
    const c = candidateFrom({ customer_id: 12, name: 'Louise', phone: '+243 810', linked_patient_id: null });
    expect(c).toEqual({ customerId: '12', name: 'Louise', phone: '+243 810', linkedPatientId: null });
    expect(canLink(c)).toBe(true);
  });

  it('refuse un client déjà lié à un autre patient', () => {
    const c = candidateFrom({ customer_id: 3, name: 'Louise', phone: null, linked_patient_id: 9 });
    expect(c.phone).toBe('');
    expect(canLink(c)).toBe(false);
  });
});
