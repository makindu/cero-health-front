import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  preferencesStore,
  usePreferences,
  type ThemeMode,
} from '@/core/preferences/preferences-store';
import { applyDensity, applyTheme, resolveTheme, type ResolvedTheme } from './theme-utils';

const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  /** Choix de l'utilisateur : light, dark ou system. */
  mode: ThemeMode;
  /** Thème réellement appliqué. */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeSystemTheme(callback: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

const getSystemPrefersDark = (): boolean => window.matchMedia(DARK_QUERY).matches;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme, density } = usePreferences();
  const systemPrefersDark = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemPrefersDark,
    () => false,
  );
  const resolved = resolveTheme(theme, systemPrefersDark);

  useEffect(() => applyTheme(resolved), [resolved]);
  useEffect(() => applyDensity(density), [density]);

  const setMode = useCallback((mode: ThemeMode) => preferencesStore.set({ theme: mode }), []);
  const value = useMemo(() => ({ mode: theme, resolved, setMode }), [theme, resolved, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme doit être utilisé dans <ThemeProvider>.');
  return context;
}
