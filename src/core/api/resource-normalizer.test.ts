import { describe, expect, it } from 'vitest';
import { ApiError } from './types';
import { resourceNormalizer } from './normalizers';

const ctx = { source: 'health' as const, status: 200 };

describe('resourceNormalizer (API Laravel de HEALTH)', () => {
  it('lit une liste paginée { data, meta }', () => {
    const r = resourceNormalizer({ data: [{ id: 1 }], links: {}, meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 } }, ctx);
    expect(r.data).toEqual([{ id: 1 }]);
    expect(r.meta?.total).toBe(1);
  });

  it('lit un élément { data }', () => {
    expect(resourceNormalizer({ data: { id: 3 } }, ctx).data).toEqual({ id: 3 });
  });

  it('transforme { success: false } en erreur', () => {
    expect(() => resourceNormalizer({ success: false, code: 'x', message: 'Refusé' }, ctx)).toThrow(ApiError);
  });
});
