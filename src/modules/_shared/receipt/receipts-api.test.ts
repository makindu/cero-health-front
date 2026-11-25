import { describe, expect, it } from 'vitest';
import { copyFrom } from './receipts-api';

describe('numéro de copie du reçu', () => {
  it('la première impression est l\'original', () => {
    expect(copyFrom({ kind: 'settlement', id: 8, copy_number: 1, is_duplicate: false, first_printed_at: null })).toEqual({ kind: 'settlement', id: '8', copyNumber: 1, isDuplicate: false, firstPrintedAt: null });
  });
  it('les suivantes sont des duplicata', () => {
    expect(copyFrom({ kind: 'payment', id: 3, copy_number: 2, is_duplicate: true, first_printed_at: '2026-11-25T10:00:00Z' })).toMatchObject({ copyNumber: 2, isDuplicate: true, firstPrintedAt: '2026-11-25T10:00:00Z' });
  });
  it('une réponse incomplète retombe sur l\'original', () => {
    expect(copyFrom({})).toMatchObject({ copyNumber: 1, isDuplicate: false });
  });
});
