import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { Button } from './button';

type DialogVariant = 'center' | 'drawer' | 'detail';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Titre visible (fenêtre centrée). Sans titre visible, fournir `ariaLabel`. */
  title?: string;
  ariaLabel?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** « drawer » : menu mobile ; « detail » : fiche en volet droit. Par défaut : fenêtre centrée, feuille basse sur mobile. */
  variant?: DialogVariant;
  /** Affiche le bouton de fermeture dans le coin. */
  showClose?: boolean;
}

const variantClasses: Record<DialogVariant, string> = {
  center:
    'm-auto w-full max-w-lg rounded-card max-sm:mb-0 max-sm:max-w-none max-sm:rounded-b-none',
  drawer: 'm-0 mr-auto h-dvh max-h-none w-72 max-w-[85vw] rounded-none',
  /** Volet latéral droit pour une fiche détaillée (plein écran sur mobile). */
  detail: 'm-0 ms-auto h-dvh max-h-none w-[32rem] max-w-full rounded-none',
};

/**
 * Fenêtre modale basée sur l'élément natif <dialog> : piège le focus, se ferme avec Échap,
 * rend le reste de la page inerte et est annoncée correctement par les lecteurs d'écran.
 */
export function Dialog({
  open,
  onClose,
  title,
  ariaLabel,
  description,
  children,
  footer,
  variant = 'center',
  showClose = true,
}: DialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
      aria-describedby={description ? descriptionId : undefined}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        // Un clic sur le fond (le <dialog> lui-même, hors de son contenu) ferme la fenêtre.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'max-h-[100dvh] overflow-hidden border border-border bg-surface p-0 text-foreground shadow-popover',
        'backdrop:bg-black/50',
        variantClasses[variant],
      )}
    >
      <div className={cn('flex max-h-[inherit] flex-col', variant !== 'center' && 'h-full')}>
        {variant !== 'drawer' && (title || showClose) && (
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              {title && (
                <h2 id={titleId} className="text-lg font-semibold">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {showClose && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('dialog.close')}
                onClick={onClose}
                className="-mr-2 -mt-1"
              >
                <X aria-hidden className="size-5" />
              </Button>
            )}
          </header>
        )}
        <div className={cn('overflow-y-auto', variant === 'drawer' ? 'flex-1' : 'px-5 py-4', variant === 'detail' && 'flex-1')}>
          {children}
        </div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** « danger » pour une action destructrice ou irréversible. */
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation d'action : à utiliser avant toute opération sensible ou irréversible. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel ?? t('actions.cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel ?? t('actions.confirm')}
          </Button>
        </>
      }
    />
  );
}
