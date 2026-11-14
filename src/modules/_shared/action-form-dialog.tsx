import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ApiError, queryKeys } from '@/core/api';
import { describeBusinessError } from './business-error';
import { usePreferences } from '@/core/preferences/preferences-store';
import { DynamicForm, type FieldDef } from './dynamic-form';
import type { MutationResult } from './resource-service';

export interface ValidationProblem {
  message: ReactNode;
  /** Vrai : l'utilisateur peut passer outre après lecture (ex. doublon probable). Faux : bloquant (ex. conflit). */
  overridable?: boolean;
}

interface ActionFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Ressources dont le cache est invalidé après un enregistrement RÉEL. */
  invalidate: readonly string[];
  title: string;
  description?: string;
  submitLabel: string;
  fields: readonly FieldDef[];
  defaultValues?: Record<string, string>;
  /** Exécute l'action via un service (create, update, command…). */
  execute: (values: Record<string, string>) => Promise<MutationResult>;
  /** Contrôle métier avant l'envoi (conflit de réservation, doublon…). `null` = tout va bien. */
  validate?: (values: Record<string, string>) => Promise<ValidationProblem | null>;
  overrideLabel?: string;
  successTitle?: string;
}

/**
 * Fenêtre de saisie pour une action métier (création, modification, report, annulation avec motif).
 * Honnête : sans API, indique que RIEN n'a été enregistré. Un conflit renvoyé par l'API (409) est affiché.
 */
export function ActionFormDialog({
  open,
  onClose,
  invalidate,
  title,
  description,
  submitLabel,
  fields,
  defaultValues,
  execute,
  validate,
  overrideLabel,
  successTitle,
}: ActionFormDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const [problem, setProblem] = useState<ValidationProblem | null>(null);
  const [pending, setPending] = useState<Record<string, string> | null>(null);

  const mutation = useMutation({ mutationFn: execute });

  function close() {
    setProblem(null);
    setPending(null);
    onClose();
  }

  async function send(values: Record<string, string>) {
    try {
      const result = await mutation.mutateAsync(values);
      if (result.isDemo) {
        toast({ tone: 'warning', title: t('module.demoNotSaved'), description: t('module.demoNotSavedHint') });
      } else {
        for (const name of invalidate) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, name) });
        }
        toast({ tone: 'success', title: successTitle ?? t('module.saved') });
      }
      close();
    } catch (error) {
      const business = describeBusinessError(t, error);
      if (business) {
        setProblem({ message: business });
      } else if (error instanceof ApiError && error.kind === 'conflict') {
        setProblem({ message: t('module.conflict') });
      } else {
        toast({ tone: 'danger', title: t('module.saveFailed'), description: t('module.saveFailedHint') });
      }
    }
  }

  async function onSubmit(values: Record<string, string>) {
    setProblem(null);
    if (validate) {
      const found = await validate(values);
      if (found) {
        setProblem(found);
        setPending(found.overridable ? values : null);
        return;
      }
    }
    await send(values);
  }

  return (
    <Dialog open={open} onClose={close} title={title} description={description}>
      {open && (
        <div className="space-y-4">
          {problem && (
            <div role="alert" className="space-y-3 rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-warning-ink">
              <div>{problem.message}</div>
              {pending && (
                <Button size="sm" variant="outline" loading={mutation.isPending} onClick={() => void send(pending)}>
                  {overrideLabel ?? t('module.proceedAnyway')}
                </Button>
              )}
            </div>
          )}
          <DynamicForm
            fields={fields}
            defaultValues={defaultValues}
            submitLabel={submitLabel}
            submitting={mutation.isPending}
            onSubmit={onSubmit}
            onCancel={close}
          />
        </div>
      )}
    </Dialog>
  );
}
