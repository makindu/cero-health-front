import type { ReactNode } from 'react';
import { ErrorState } from '@/components/feedback/error-state';
import { ApiError } from '@/core/api';
import { usePermissions } from '@/core/permissions/PermissionsProvider';

/**
 * Garde de route : confort d'interface uniquement (l'API revérifie TOUJOURS les droits).
 * Évite d'afficher une page vide à un utilisateur qui saisit l'adresse à la main.
 */
export function ModuleRoute({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = usePermissions();
  if (!can(permission)) {
    return <ErrorState error={new ApiError('forbidden', 'forbidden', { source: 'health' })} />;
  }
  return <>{children}</>;
}
