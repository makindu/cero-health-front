import { describe, expect, it } from 'vitest';
import { PENDING_TTL_MS, isIdempotentCreate, keepKeyAfter, pendingKey, releaseKey, requestId, type KeyStorage } from './idempotency';
import { createApiClient } from './create-api-client';
import { resourceNormalizer } from './normalizers';

const store = (): KeyStorage & { size(): number } => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), size: () => m.size };
};

describe('création sans doublon : clés', () => {
  it('ne concerne que les créations HEALTH qui acceptent la clé', () => {
    for (const u of ['/patients', 'patients', '/appointments', '/appointments/walk-in', '/triage-entries', '/consultations', '/prescriptions', '/lab-orders', '/admissions']) {
      expect(isIdempotentCreate('post', u)).toBe(true);
    }
    expect(isIdempotentCreate('POST', '/patients?x=1')).toBe(true);
    expect(isIdempotentCreate('get', '/patients')).toBe(false);
    expect(isIdempotentCreate('patch', '/patients')).toBe(false);
    expect(isIdempotentCreate('post', '/patients/5/documents')).toBe(false);
    expect(isIdempotentCreate('post', '/billing/links/3/payments')).toBe(false);
  });
  it('garde la même clé pour la même demande, jusqu\'à la réponse du serveur', () => {
    const s = store();
    const id = requestId('3', '/patients', { full_name: 'A' });
    const k1 = pendingKey(id, s, 1000);
    expect(pendingKey(id, s, 2000)).toBe(k1);
    releaseKey(id, s);
    expect(s.size()).toBe(0);
    expect(pendingKey(id, s, 3000)).not.toBe(k1);
  });
  it('change de clé si le contenu, le chemin ou l\'établissement change', () => {
    const s = store();
    const base = pendingKey(requestId('3', '/patients', { n: 1 }), s);
    expect(pendingKey(requestId('3', '/patients', { n: 2 }), s)).not.toBe(base);
    expect(pendingKey(requestId('4', '/patients', { n: 1 }), s)).not.toBe(base);
    expect(pendingKey(requestId('3', '/triage-entries', { n: 1 }), s)).not.toBe(base);
  });
  it('repart avec une nouvelle clé après 10 minutes', () => {
    const s = store();
    const id = requestId('3', '/patients', {});
    const k = pendingKey(id, s, 0);
    expect(pendingKey(id, s, PENDING_TTL_MS)).toBe(k);
    expect(pendingKey(id, s, PENDING_TTL_MS + 1)).not.toBe(k);
  });
  it('garde la clé sans réponse du serveur ou si le serveur traite encore la même clé', () => {
    expect(keepKeyAfter({})).toBe(true);
    expect(keepKeyAfter(null)).toBe(true);
    expect(keepKeyAfter({ status: 409, code: 'health.idempotency.in_progress' })).toBe(true);
    expect(keepKeyAfter({ status: 422 })).toBe(false);
    expect(keepKeyAfter({ status: 500 })).toBe(false);
  });
  it('supporte un stockage cassé', () => {
    const broken: KeyStorage = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(typeof pendingKey('id', broken)).toBe('string');
    expect(() => releaseKey('id', broken)).not.toThrow();
  });
});

describe('création sans doublon : envoi', () => {
  function client(handler: (headers: Record<string, unknown>) => { status: number; data?: unknown } | 'network') {
    const seen: Array<Record<string, unknown>> = [];
    const c = createApiClient({ source: 'health', baseURL: 'http://health.test', timeoutMs: 1000, normalize: resourceNormalizer, headers: () => ({ 'X-Enterprise-Id': '3' }) });
    c.raw.defaults.adapter = async (config) => {
      const h = { ...(config.headers as unknown as Record<string, unknown>) };
      const keyHeader = typeof (config.headers as { get?: (n: string) => unknown }).get === 'function' ? (config.headers as { get: (n: string) => unknown }).get('Idempotency-Key') : h['Idempotency-Key'];
      seen.push({ key: keyHeader });
      const r = handler(h);
      if (r === 'network') throw Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK', config });
      if (r.status >= 400) throw Object.assign(new Error('x'), { isAxiosError: true, config, response: { status: r.status, data: r.data ?? {}, headers: {}, config } });
      return { data: r.data ?? { data: { id: 1 } }, status: r.status, statusText: 'OK', headers: {}, config };
    };
    return { c, seen };
  }

  it('renvoie la même clé après une coupure, puis une nouvelle clé après la réponse du serveur', async () => {
    let step = 0;
    const { c, seen } = client(() => (++step === 1 ? 'network' : { status: 201 }));
    const body = { full_name: 'Alice' };
    await expect(c.post('/patients', body)).rejects.toBeDefined();
    await c.post('/patients', body);
    await c.post('/patients', body);
    expect(seen[0]!.key).toBeTruthy();
    expect(seen[1]!.key).toBe(seen[0]!.key);
    expect(seen[2]!.key).not.toBe(seen[0]!.key);
  });
  it('libère la clé après un refus du serveur et n\'ajoute rien aux autres routes', async () => {
    let step = 0;
    const { c, seen } = client(() => (++step === 1 ? { status: 422 } : { status: 200 }));
    await expect(c.post('/patients', { a: 1 })).rejects.toBeDefined();
    await c.post('/patients', { a: 1 });
    expect(seen[1]!.key).not.toBe(seen[0]!.key);
    await c.get('/patients');
    await c.post('/billing/links/1/payments', { amount_minor: 1 });
    expect(seen[2]!.key ?? null).toBeNull();
    expect(seen[3]!.key ?? null).toBeNull();
  });
});
