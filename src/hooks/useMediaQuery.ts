import { useCallback, useSyncExternalStore } from 'react';

/** Suit une media query CSS (ex. '(min-width: 768px)'). Faux côté serveur / sans matchMedia. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', callback);
      return () => list.removeEventListener('change', callback);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Points de rupture alignés sur Tailwind (md = 768px, lg = 1024px). */
export const BREAKPOINTS = { md: '(min-width: 768px)', lg: '(min-width: 1024px)' } as const;
