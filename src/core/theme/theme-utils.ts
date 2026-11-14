import type { ThemeMode } from '@/core/preferences/preferences-store';

export type ResolvedTheme = 'light' | 'dark';

/** Résout le mode choisi ('system' suit le thème du système d'exploitation). */
export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
  return mode;
}

/** Applique le thème sur <html> : classe .dark (tokens CSS) et color-scheme (contrôles natifs). */
export function applyTheme(resolved: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

export function applyDensity(
  density: 'comfortable' | 'compact',
  root: HTMLElement = document.documentElement,
): void {
  if (density === 'compact') root.dataset.density = 'compact';
  else delete root.dataset.density;
}
