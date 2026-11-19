import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDirtySource } from '@/core/unsaved/use-dirty-source';
import { cn } from '@/utils/cn';
import { Button } from './button';

type DialogVariant = 'center' | 'drawer' | 'detail';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Titre visible (fenêtre centrée). Sans titre visible, fournir `ariaLabel`. */
  title?: string;
  /** Élément placé avant le titre (ex. avatar de la personne concernée). */
  leading?: ReactNode;
  ariaLabel?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Actions (boutons-icônes) placées dans l'en-tête, avant le bouton de fermeture. */
  headerActions?: ReactNode;
  /** « drawer » : menu mobile ; « detail » : fiche en volet droit. Par défaut : fenêtre centrée, feuille basse sur mobile. */
  variant?: DialogVariant;
  /** Affiche le bouton de fermeture dans le coin. */
  showClose?: boolean;
  /**
   * Protège la saisie : si l'utilisateur a modifié un champ, fermer par clic à côté, Échap ou la croix
   * demande confirmation (règle du projet). `false` pour une fenêtre sans saisie à protéger.
   */
  guard?: boolean;
  /** Force l'état « modifié » (saisie faite autrement que par un champ : boutons de remplissage, sélections…). */
  dirty?: boolean;
  /** Fenêtre centrée large (tableaux de saisie). */
  wide?: boolean;
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
  leading,
  ariaLabel,
  description,
  children,
  footer,
  headerActions,
  variant = 'center',
  showClose = true,
  guard = true,
  dirty: forcedDirty = false,
  wide = false,
}: DialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const guarded = guard && open && (dirty || forcedDirty);
  useDirtySource(guarded);

  useEffect(() => {
    if (!open) {
      setDirty(false);
      setConfirming(false);
    }
  }, [open]);

  /** Fermeture demandée par l'utilisateur (clic à côté, Échap, croix) : confirmation si saisie en cours. */
  const requestClose = () => {
    if (guarded) setConfirming(true);
    else onClose();
  };

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
    <>
    <dialog
      ref={ref}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Échap avec une saisie en cours : on garde la fenêtre et on demande confirmation.
        if (guarded) {
          event.preventDefault();
          setConfirming(true);
        }
      }}
      onClose={() => {
        if (!open) return;
        if (guarded) {
          // Certains navigateurs ferment malgré tout au second Échap : on rouvre pour ne rien perdre.
          ref.current?.showModal();
          setConfirming(true);
          return;
        }
        onClose();
      }}
      onInput={(event) => {
        if (!guard || dirty) return;
        const target = event.target as HTMLElement;
        if (target instanceof HTMLInputElement && target.type === 'search') return;
        if (target.closest('[data-no-guard]')) return;
        setDirty(true);
      }}
      onClick={(event) => {
        // Un clic sur le fond (le <dialog> lui-même, hors de son contenu) ferme la fenêtre.
        if (event.target === ref.current) requestClose();
      }}
      className={cn(
        'max-h-[100dvh] overflow-hidden border border-border bg-surface p-0 text-foreground shadow-popover',
        'backdrop:bg-black/50',
        variantClasses[variant],
        wide && variant === 'center' && 'sm:max-w-4xl',
      )}
    >
      <div className={cn('flex max-h-[inherit] flex-col', variant !== 'center' && 'h-full')}>
        {variant !== 'drawer' && (title || showClose) && (
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {leading}
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
            </div>
            {(showClose || headerActions) && (
              <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-1">
                {headerActions}
                {showClose && (
                  <Button variant="ghost" size="icon" aria-label={t('dialog.close')} onClick={requestClose}>
                    <X aria-hidden className="size-5" />
                  </Button>
                )}
              </div>
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
    {confirming && (
      <ConfirmDialog
        open
        tone="danger"
        title={t('unsaved.title')}
        description={t('unsaved.body')}
        cancelLabel={t('unsaved.stay')}
        confirmLabel={t('unsaved.leave')}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          setDirty(false);
          onClose();
        }}
      />
    )}
    </>
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
