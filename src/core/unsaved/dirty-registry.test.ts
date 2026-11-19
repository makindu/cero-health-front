import { describe, expect, it } from 'vitest';
import {
  hasUnsavedChanges,
  resetDirtySources,
  setDirtySource,
  subscribeDirty,
} from './dirty-registry';

describe('registre des modifications non enregistrées', () => {
  it('est propre au départ', () => {
    resetDirtySources();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('reste sale tant qu\'une source l\'est', () => {
    resetDirtySources();
    setDirtySource('a', true);
    setDirtySource('b', true);
    setDirtySource('a', false);
    expect(hasUnsavedChanges()).toBe(true);
    setDirtySource('b', false);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('ne notifie que les vrais changements', () => {
    resetDirtySources();
    let calls = 0;
    const off = subscribeDirty(() => {
      calls += 1;
    });
    setDirtySource('a', true);
    setDirtySource('a', true);
    setDirtySource('a', false);
    setDirtySource('a', false);
    off();
    setDirtySource('a', true);
    expect(calls).toBe(2);
    resetDirtySources();
  });
});
