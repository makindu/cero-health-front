import { useSyncExternalStore } from 'react';

/**
 * Droits par rôle modifiés par l'administrateur (mode local). Ils remplacent la liste par défaut d'un rôle et sont conservés sur l'appareil.
 * Ce n'est qu'un substitut : en production, les rôles et leurs droits viendront de CERO ID CORE.
 */
export const ROLE_OVERRIDES_KEY = 'cero-health:role-overrides';

export type RoleOverrides = Readonly<Record<string, readonly string[]>>;

const listeners = new Set<() => void>();

function load(): RoleOverrides {
  try {
    const raw = window.localStorage.getItem(ROLE_OVERRIDES_KEY);
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: Record<string, string[]> = {};
    for (const [role, list] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(list)) out[role] = list.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

let state: RoleOverrides = load();

function commit(next: RoleOverrides): void {
  state = next;
  try {
    window.localStorage.setItem(ROLE_OVERRIDES_KEY, JSON.stringify(state));
  } catch {
    /* modification non conservée après rechargement */
  }
  listeners.forEach((l) => l());
}

export function getRoleOverrides(): RoleOverrides {
  return state;
}

export function setRoleOverride(role: string, permissions: readonly string[]): void {
  commit({ ...state, [role]: [...new Set(permissions)].sort() });
}

export function resetRoleOverride(role: string): void {
  const next = { ...state };
  delete next[role];
  commit(next);
}

export function subscribeRoleOverrides(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRoleOverrides(): RoleOverrides {
  return useSyncExternalStore(subscribeRoleOverrides, getRoleOverrides);
}
