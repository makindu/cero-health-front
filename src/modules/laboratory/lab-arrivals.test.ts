import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/core/api', async (original) => ({ ...(await original<Record<string, unknown>>()), healthClient: client }));

import { queryKeys } from '@/core/api/query-client';
import type { CatalogItem } from '@/core/pricing/types';
import { loadLabArrivals, type ApiLabCatalog } from './lab-catalog-api';

const item = (id: string, label: string): CatalogItem => ({ id, code: label.slice(0, 3).toUpperCase(), label, category: 'laboratory', price: { minor: 100, currency: 'USD' }, active: true });

describe('loadLabArrivals (« Voir » du bandeau nouvel examen)', () => {
  const key = queryKeys.scoped('f1', 'lab-catalog', 'list');
  let qc: QueryClient;
  beforeEach(() => {
    client.get.mockReset();
    qc = new QueryClient();
    qc.setQueryData<ApiLabCatalog>(key, { items: [item('1', 'Amylase'), item('2', 'Urée')], currency: 'USD' });
  });

  it('ne lit que les examens annoncés, avec leur tarif, et les range par ordre alphabétique', async () => {
    client.get.mockImplementation(async (path: string) => (path === '/lab-tests'
      ? { data: [{ id: 9, code: 'GLY', label: 'Glycémie', is_active: true, catalog_item_id: 40 }] }
      : { data: [{ id: 40, price_minor: 800, currency: 'USD' }] }));
    await loadLabArrivals(qc, 'f1', [9]);
    expect(client.get).toHaveBeenCalledWith('/lab-tests', { params: { ids: '9' } });
    expect(client.get).toHaveBeenCalledWith('/catalog-items', { params: { ids: '40', per_page: 100, kind: 'lab' } });
    const items = qc.getQueryData<ApiLabCatalog>(key)!.items;
    expect(items.map((i) => i.label)).toEqual(['Amylase', 'Glycémie', 'Urée']);
    expect(items[1]!.price).toEqual({ minor: 800, currency: 'USD' });
  });

  it('ne lit rien quand l’examen est déjà dans la liste (celui qui vient de l’ajouter)', async () => {
    await loadLabArrivals(qc, 'f1', [1]);
    expect(client.get).not.toHaveBeenCalled();
  });

  it("n'ajoute rien si le serveur ne renvoie pas l'examen", async () => {
    client.get.mockResolvedValue({ data: [] });
    await loadLabArrivals(qc, 'f1', [77]);
    expect(qc.getQueryData<ApiLabCatalog>(key)!.items).toHaveLength(2);
  });
});
