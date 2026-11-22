import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/feedback/toast';
import { createQueryClient } from '@/core/api';
import { env } from '@/core/config/env';
import { AuthGate } from '@/core/auth/AuthGate';
import { AuthProvider, useAuth } from '@/core/auth/cero-id';
import { useLocalUser } from '@/core/local/session';
import { PermissionsProvider } from '@/core/permissions/PermissionsProvider';
import { ThemeProvider } from '@/core/theme/ThemeProvider';

/**
 * En mode aperçu UNIQUEMENT, toutes les permissions sont accordées pour pouvoir voir l'interface.
 * Hors aperçu, aucune permission tant que la session CERO ID CORE (phase 2) n'existe pas.
 */
const PREVIEW_PERMISSIONS: readonly string[] = env.previewMode ? ['*'] : [];

/** Mode local : les permissions sont celles de l'utilisateur de démonstration choisi (et revérifiées dans les services). */
function ScopedPermissions({ children }: { children: ReactNode }) {
  const user = useLocalUser();
  return <PermissionsProvider granted={env.localMode ? user.permissions : PREVIEW_PERMISSIONS}>{children}</PermissionsProvider>;
}

/** Connexion réelle : les permissions viennent de l'établissement actif (CERO CEPATEC). */
function SsoPermissions({ children }: { children: ReactNode }) {
  const { permissions } = useAuth();
  return <PermissionsProvider granted={permissions}>{children}</PermissionsProvider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {env.ssoEnabled ? (
          <AuthProvider>
            <AuthGate>
              <SsoPermissions>
                <ToastProvider>{children}</ToastProvider>
              </SsoPermissions>
            </AuthGate>
          </AuthProvider>
        ) : (
          <ScopedPermissions>
            <ToastProvider>{children}</ToastProvider>
          </ScopedPermissions>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
