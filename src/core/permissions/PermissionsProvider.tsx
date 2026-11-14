import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type GrantedPermissions,
} from './permissions';

interface PermissionsContextValue {
  /** Vrai si l'utilisateur dispose de la permission (ou de toutes celles de la liste). */
  can: (required: string | readonly string[]) => boolean;
  canAny: (required: readonly string[]) => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

/**
 * Fournit les permissions à l'interface. Les permissions viennent de la session CERO ID CORE
 * (phase 2) et peuvent être absentes, expirées ou modifiées : on retombe alors sur [] (rien d'autorisé).
 */
export function PermissionsProvider({
  granted,
  children,
}: {
  granted: GrantedPermissions;
  children: ReactNode;
}) {
  const value = useMemo<PermissionsContextValue>(
    () => ({
      can: (required) =>
        typeof required === 'string'
          ? hasPermission(granted, required)
          : hasAllPermissions(granted, required),
      canAny: (required) => hasAnyPermission(granted, required),
    }),
    [granted],
  );
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  const context = useContext(PermissionsContext);
  if (!context) throw new Error('usePermissions doit être utilisé dans <PermissionsProvider>.');
  return context;
}

/** Affiche ses enfants seulement si la permission est accordée (confort d'interface, pas sécurité). */
export function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: string | readonly string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can } = usePermissions();
  return <>{can(permission) ? children : fallback}</>;
}
