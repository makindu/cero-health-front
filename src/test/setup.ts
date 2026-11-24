import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom n'implémente pas matchMedia ni <dialog>.showModal.
const hasDom = typeof window !== 'undefined';

if (hasDom) Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

beforeAll(async () => {
  // Suites « @vitest-environment node » : pas de DOM, pas de i18n à initialiser.
  if (!hasDom) return;
  window.localStorage.setItem('cero-health:preferences', JSON.stringify({ language: 'fr' }));
  const { initI18n } = await import('@/core/i18n');
  await initI18n();
});

afterEach(() => cleanup());
