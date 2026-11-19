import { describe, expect, it } from 'vitest';
import { clearDraft, DRAFT_TTL_MS, fingerprint, loadDraft, saveDraft, type DraftStorage } from './draft-store';

function memory(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('brouillons locaux', () => {
  it('enregistre puis relit un brouillon', () => {
    const s = memory();
    expect(saveDraft('a', { x: '1' }, s, 1000)).toBe(true);
    expect(loadDraft<{ x: string }>('a', s, 2000)).toEqual({ x: '1' });
  });

  it('expire après le délai et nettoie', () => {
    const s = memory();
    saveDraft('a', { x: '1' }, s, 0);
    expect(loadDraft('a', s, DRAFT_TTL_MS + 1)).toBe(null);
    expect(s.data.size).toBe(0);
  });

  it('efface un brouillon', () => {
    const s = memory();
    saveDraft('a', 1, s, 0);
    clearDraft('a', s);
    expect(loadDraft('a', s, 1)).toBe(null);
  });

  it('survit à un stockage indisponible ou à un contenu corrompu', () => {
    expect(saveDraft('a', 1, null)).toBe(false);
    expect(loadDraft('a', null)).toBe(null);
    const s = memory();
    s.setItem('cero.draft.v1.a', '{pas du json');
    expect(loadDraft('a', s, 1)).toBe(null);
    const full: DraftStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => undefined };
    expect(saveDraft('a', 1, full)).toBe(false);
  });

  it('empreinte stable et discriminante', () => {
    expect(fingerprint({ a: 1 })).toBe(fingerprint({ a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});
