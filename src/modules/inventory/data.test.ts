import { describe, expect, it } from 'vitest';
import { stockLevel, type Product } from './data';

const product = (patch: Partial<Product>): Product =>
  ({ id: 'DEMO-P', quantity: 50, minLevel: 10, expiresAt: null, ...patch }) as Product;

describe('stockLevel', () => {
  it('signale la rupture, le stock bas puis un stock correct', () => {
    expect(stockLevel(product({ quantity: 0 }))).toBe('out');
    expect(stockLevel(product({ quantity: 10 }))).toBe('low');
    expect(stockLevel(product({ quantity: 11 }))).toBe('ok');
  });
  it('signale une péremption proche', () => {
    const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    expect(stockLevel(product({ expiresAt: soon }))).toBe('expiring');
  });
});
