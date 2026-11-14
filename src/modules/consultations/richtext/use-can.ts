import { usePermissions } from '@/core/permissions/PermissionsProvider';

/** Raccourci : l'utilisateur a-t-il cette permission ? (l'API revérifie toujours). */
export function usePermissionsCan(permission: string): boolean {
  return usePermissions().can(permission);
}
