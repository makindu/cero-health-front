import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom n'implémente pas matchMedia ni <dialog>.showModal.
Object.defineProperty(window, 'matchMedia', {
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
  window.localStorage.setItem('cero-health:preferences', JSON.stringify({ language: 'fr' }));
  const { initI18n } = await import('@/core/i18n');
  await initI18n();
});

afterEach(() => cleanup());
