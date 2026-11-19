import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

/** Fenêtre de saisie simple : le contenu est fourni, la soumission est gérée par l'appelant. */
export function ActionDialog({ open, onClose, title, description, submitLabel, pending, canSubmit = true, tone = 'primary', wide, dirty, onCancel, onSubmit, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  submitLabel: string;
  pending?: boolean;
  canSubmit?: boolean;
  tone?: 'primary' | 'danger';
  wide?: boolean;
  dirty?: boolean;
  /** Bouton « Annuler » explicite (abandon volontaire, ex. suppression du brouillon) ; par défaut : onClose. */
  onCancel?: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('finance');
  const submit = (e: FormEvent) => { e.preventDefault(); if (canSubmit && !pending) onSubmit(); };
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} wide={wide} dirty={dirty}
      footer={<>
        <Button variant="outline" onClick={onCancel ?? onClose}>{t('common.cancel')}</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={pending} disabled={!canSubmit} onClick={() => { if (canSubmit && !pending) onSubmit(); }}>{submitLabel}</Button>
      </>}>
      <form className="space-y-4" onSubmit={submit}>{children}</form>
    </Dialog>
  );
}
