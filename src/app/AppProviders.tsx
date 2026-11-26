
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
import { DesktopUpdateManager } from '@/desktop/DesktopUpdateManager';

const PREVIEW_PERMISSIONS: readonly string[] = env.previewMode ? ['*'] : [];

function ScopedPermissions({ children }: { children: ReactNode }) {
  const user = useLocalUser();

  return (
    <PermissionsProvider
      granted={env.localMode ? user.permissions : PREVIEW_PERMISSIONS}
    >
      {children}
    </PermissionsProvider>
  );
}

function SsoPermissions({ children }: { children: ReactNode }) {
  const { permissions } = useAuth();

  return (
    <PermissionsProvider granted={permissions}>
      {children}
    </PermissionsProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <DesktopUpdateManager />

          {env.ssoEnabled ? (
            <AuthProvider>
              <AuthGate>
                <SsoPermissions>{children}</SsoPermissions>
              </AuthGate>
            </AuthProvider>
          ) : (
            <ScopedPermissions>{children}</ScopedPermissions>
          )}
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
