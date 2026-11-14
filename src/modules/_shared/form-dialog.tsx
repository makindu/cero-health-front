import { useTranslation } from 'react-i18next';
import { describeBusinessError } from './business-error';
import { useToast } from '@/components/feedback/toast';
import { Dialog } from '@/components/ui/dialog';
import { DynamicForm, type FieldDef } from './dynamic-form';
import type { ResourceService } from './resource-service';
import { useCreateResource } from './use-resource';

interface FormDialogProps<T extends { id: string }> {
  open: boolean;
  onClose: () => void;
  /** Nom de la ressource dans le cache (invalidé après un enregistrement réel). */
  name: string;
  service: ResourceService<T>;
  title: string;
  submitLabel: string;
  fields: readonly FieldDef[];
  defaultValues?: Record<string, string>;
  /** Textes propres à l'action (ex. « Rapport demandé »). Par défaut : enregistrement générique. */
  successTitle?: string;
  demoTitle?: string;
  demoHint?: string;
}

interface SubmitTexts {
  successTitle?: string;
  demoTitle?: string;
  demoHint?: string;
}

/** Soumission honnête d'un formulaire : API réelle si disponible, sinon « rien n'a été enregistré ». */
export function useFormSubmit<T extends { id: string }>(
  name: string,
  service: ResourceService<T>,
  texts: SubmitTexts = {},
  onDone?: () => void,
) {
  const { t } = useTranslation();
  const toast = useToast();
  const mutation = useCreateResource(name, service);
  const submit = async (values: Record<string, string>) => {
    try {
      const result = await mutation.mutateAsync(values);
      onDone?.();
      if (result.isDemo) {
        toast({
          tone: 'warning',
          title: texts.demoTitle ?? t('module.demoNotSaved'),
          description: texts.demoHint ?? t('module.demoNotSavedHint'),
        });
      } else {
        toast({ tone: 'success', title: texts.successTitle ?? t('module.saved') });
      }
    } catch (error) {
      toast({ tone: 'danger', title: t('module.saveFailed'), description: describeBusinessError(t, error) ?? t('module.saveFailedHint') });
    }
  };
  return { submit, pending: mutation.isPending };
}

/**
 * Fenêtre de saisie reliée à un service : valide, envoie à l'API si elle existe, sinon dit clairement
 * que RIEN n'a été enregistré (démonstration). N'annonce jamais un succès simulé.
 */
export function FormDialog<T extends { id: string }>({
  open,
  onClose,
  name,
  service,
  title,
  submitLabel,
  fields,
  defaultValues,
  successTitle,
  demoTitle,
  demoHint,
}: FormDialogProps<T>) {
  const { submit, pending } = useFormSubmit(name, service, { successTitle, demoTitle, demoHint }, onClose);

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {open && (
        <DynamicForm
          fields={fields}
          defaultValues={defaultValues}
          submitLabel={submitLabel}
          submitting={pending}
          onSubmit={submit}
          onCancel={onClose}
        />
      )}
    </Dialog>
  );
}
