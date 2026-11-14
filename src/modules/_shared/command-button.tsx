import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { queryKeys } from '@/core/api';
import { Can } from '@/core/permissions/PermissionsProvider';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from './business-error';
import type { ResourceService } from './resource-service';

interface CommandButtonProps<T extends { id: string }> {
  /** Nom de la ressource (cache) */
  name: string;
  service: ResourceService<T>;
  id: string;
  action: string;
  /** Données envoyées avec la commande (ex. motif). */
  payload?: Record<string, string>;
  label: string;
  /** Permission requise pour voir le bouton (l'API revérifie). */
  permission: string;
  confirmTitle: string;
  confirmDescription?: string;
  variant?: ButtonVariant;
  icon?: ReactNode;
  /** Appelé après une commande réellement exécutée par l'API. */
  onDone?: () => void;
}

/**
 * Bouton d'action métier avec confirmation. Honnête : sans API, il l'indique et ne change rien.
 */
export function CommandButton<T extends { id: string }>({
  name,
  service,
  id,
  action,
  payload,
  label,
  permission,
  confirmTitle,
  confirmDescription,
  variant = 'outline',
  icon,
  onDone,
}: CommandButtonProps<T>) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: () => service.command(id, action, payload),
    onSuccess: (result) => {
      setConfirming(false);
      if (result.isDemo) {
        toast({
          tone: 'warning',
          title: t('module.demoNotSaved'),
          description: t('module.demoNotSavedHint'),
        });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, name) });
      toast({ tone: 'success', title: t('module.saved') });
      onDone?.();
    },
    onError: (error) => {
      setConfirming(false);
      toast({ tone: 'danger', title: t('module.saveFailed'), description: describeBusinessError(t, error) ?? t('module.saveFailedHint') });
    },
  });

  return (
    <Can permission={permission}>
      <Button variant={variant} size="sm" leftIcon={icon} onClick={() => setConfirming(true)}>
        {label}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={confirmTitle}
        description={confirmDescription}
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </Can>
  );
}
