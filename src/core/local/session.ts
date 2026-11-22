import { useSyncExternalStore } from 'react';
import { ApiError } from '@/core/api/types';
import { hasPermission } from '@/core/permissions/permissions';
import { DEFAULT_LOCAL_USER, LOCAL_USERS, type LocalUser } from './roles';
import { getRoleOverrides, subscribeRoleOverrides } from './role-overrides';

/**
 * Session locale : choix de l'utilisateur de démonstration (préférence conservée sur l'appareil).
 * Ce n'est PAS une authentification : l'identité réelle viendra de CERO ID CORE.
 */
export const LOCAL_SESSION_KEY = 'cero-health:local-user';

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): LocalUser {
  try {
    const id = window.localStorage.getItem(LOCAL_SESSION_KEY);
    return LOCAL_USERS.find((u) => u.id === id) ?? DEFAULT_LOCAL_USER;
  } catch {
    return DEFAULT_LOCAL_USER;
  }
}

/** Droits effectifs : ceux du rôle, remplacés par la liste modifiée par l'administrateur (le rôle admin n'est jamais restreint). */
function resolve(user: LocalUser): LocalUser {
  const custom = user.role === 'admin' ? undefined : getRoleOverrides()[user.role];
  return custom ? { ...user, permissions: custom } : user;
}

let current: LocalUser = resolve(read());
subscribeRoleOverrides(() => {
  current = resolve(LOCAL_USERS.find((u) => u.id === current.id) ?? DEFAULT_LOCAL_USER);
  listeners.forEach((l) => l());
});

export function getLocalSession(): { user: LocalUser } {
  return { user: current };
}

export function setLocalUser(userId: string): void {
  const next = LOCAL_USERS.find((u) => u.id === userId);
  if (!next) return;
  current = resolve(next);
  try {
    window.localStorage.setItem(LOCAL_SESSION_KEY, next.id);
  } catch {
    /* préférence non conservée */
  }
  listeners.forEach((l) => l());
}

export function useLocalUser(): LocalUser {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** À appeler dans les services métier : refuse l'opération (et pas seulement le bouton) sans la permission. */
export function assertPermission(permission: string | undefined): void {
  if (!permission) return;
  if (!hasPermission(current.permissions, permission)) {
    throw new ApiError('forbidden', `Permission requise : ${permission}`, { source: 'health', status: 403, code: 'local_forbidden' });
  }
}
