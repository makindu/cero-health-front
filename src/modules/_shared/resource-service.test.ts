import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  api: { idCore: null as string | null, uzisha: null as string | null, health: null as string | null },
  previewMode: false,
}));

vi.mock('@/core/config/env', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown> & { env: Record<string, unknown> }>();
  // Getter : le test modifie previewMode après la création du mock.
  const env = {
    ...original.env,
    api: mockEnv.api,
    // Ce test vérifie les modes aperçu/API : le mode local d'un .env.local de développeur ne doit pas le fausser.
    localMode: false,
    get previewMode() {
      return mockEnv.previewMode;
    },
  };
  return { ...original, env };
});

import { createResourceService, resolveMode, type ListParams } from './resource-service';

interface Row {
  id: string;
  name: string;
  status: string;
}

const ROWS: Row[] = [
  { id: 'DEMO-1', name: 'Bravo', status: 'open' },
  { id: 'DEMO-2', name: 'Alpha', status: 'closed' },
  { id: 'DEMO-3', name: 'Charlie', status: 'open' },
];

const base: ListParams = { page: 1, perPage: 2, search: '', filters: {}, sort: null };

const service = () =>
  createResourceService<Row>({ source: 'health', endpoint: '/health/things', demoRows: ROWS });

describe('resource-service', () => {
  beforeEach(() => {
    mockEnv.api.health = null;
    mockEnv.previewMode = false;
  });

  it('lève une erreur de configuration hors aperçu, sans inventer de données', async () => {
    await expect(service().list(base)).rejects.toMatchObject({ kind: 'config' });
    expect(() => resolveMode('health', '/x', true)).toThrow();
  });

  it('lève une erreur de configuration si aucune donnée de démo n’existe', () => {
    mockEnv.previewMode = true;
    expect(() => resolveMode('health', '/x', false)).toThrow();
  });

  it('renvoie des données marquées démo en mode aperçu, paginées', async () => {
    mockEnv.previewMode = true;
    const result = await service().list(base);
    expect(result.isDemo).toBe(true);
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(2);
    expect((await service().list({ ...base, page: 2 })).rows).toHaveLength(1);
  });

  it('filtre, recherche et trie en démo', async () => {
    mockEnv.previewMode = true;
    expect((await service().list({ ...base, filters: { status: 'open' } })).total).toBe(2);
    expect((await service().list({ ...base, search: 'alph' })).rows[0]?.id).toBe('DEMO-2');
    const sorted = await service().list({ ...base, sort: { columnId: 'name', direction: 'asc' } });
    expect(sorted.rows.map((row) => row.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('ne simule aucune écriture : create et command signalent la démo', async () => {
    mockEnv.previewMode = true;
    expect(await service().create({ name: 'x' })).toEqual({ isDemo: true });
    expect(await service().command('DEMO-1', 'close')).toEqual({ isDemo: true });
    expect(await service().update('DEMO-1', { name: 'y' })).toEqual({ isDemo: true });
  });

  it('get : introuvable en démo → erreur not_found', async () => {
    mockEnv.previewMode = true;
    await expect(service().get('nope')).rejects.toMatchObject({ kind: 'not_found' });
    expect((await service().get('DEMO-1')).item.name).toBe('Bravo');
  });

  it('passe en mode api dès que la base et l’endpoint sont connus', () => {
    mockEnv.api.health = 'https://api.example.org';
    expect(resolveMode('health', '/health/things', true)).toBe('api');
    expect(() => resolveMode('health', undefined, false)).toThrow();
  });
});
