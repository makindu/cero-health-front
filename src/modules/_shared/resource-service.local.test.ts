import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({ localMode: true }));

vi.mock('@/core/config/env', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown> & { env: Record<string, unknown> }>();
  const env = {
    ...original.env,
    get localMode() {
      return mockEnv.localMode;
    },
  };
  return { ...original, env };
});

import { createMemoryDatabase } from '@/core/local/memory-database';
import { setLocalDatabaseForTests } from '@/core/local/open';
import { setLocalUser } from '@/core/local/session';
import { createResourceService, type ListParams } from './resource-service';

interface Row {
  id: string;
  name: string;
  status: string;
}

const SEED: Row[] = [
  { id: 'DEMO-1', name: 'Alpha', status: 'open' },
  { id: 'DEMO-2', name: 'Bravo', status: 'closed' },
];
const params: ListParams = { page: 1, perPage: 10, search: '', filters: {}, sort: null };

const make = (withWrites: boolean) =>
  createResourceService<Row>({
    source: 'health',
    endpoint: '/health/things',
    demoRows: SEED,
    local: withWrites
      ? {
          create: (input, ctx) => ({ id: `T-${ctx.now.getTime()}`, name: input.name ?? '', status: 'open' }),
          commands: { close: (row) => ({ ...row, status: 'closed' }) },
          permissions: { create: 'health.things.create', commands: { close: 'health.things.close' } },
        }
      : undefined,
  });

describe('resource-service — mode local', () => {
  beforeEach(() => {
    mockEnv.localMode = true;
    setLocalDatabaseForTests(createMemoryDatabase());
    setLocalUser('local-user-admin');
  });
  afterEach(() => setLocalDatabaseForTests(null));

  it('lit le jeu fictif copié dans le stockage local, sans le marquer comme aperçu', async () => {
    const result = await make(false).list(params);
    expect(result.total).toBe(2);
    expect(result.isDemo).toBe(false);
  });

  it('refuse honnêtement une création que le module ne sait pas encore faire', async () => {
    await expect(make(false).create({ name: 'X' })).rejects.toMatchObject({ kind: 'validation', code: 'local_unsupported' });
  });

  it('persiste une création et une commande, et filtre', async () => {
    const service = make(true);
    await service.create({ name: 'Charlie' });
    expect((await service.list(params)).total).toBe(3);
    await service.command('DEMO-1', 'close');
    const closed = await service.list({ ...params, filters: { status: 'closed' } });
    expect(closed.rows.map((r) => r.id)).toContain('DEMO-1');
  });

  it("refuse l'opération (et pas seulement le bouton) sans la permission requise", async () => {
    setLocalUser('local-user-receptionist');
    await expect(make(true).command('DEMO-1', 'close')).rejects.toMatchObject({ kind: 'forbidden' });
    expect((await make(true).get('DEMO-1')).item.status).toBe('open');
  });
});
