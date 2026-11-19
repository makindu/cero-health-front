import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '@/components/ui/dialog';
import { hasUnsavedChanges, subscribeDirty } from './dirty-registry';

/**
 * Garde globale (monté une seule fois dans la mise en page) :
 *  - fermeture / rechargement de l'onglet → confirmation du navigateur ;
 *  - changement de page dans l'application → confirmation dans l'application.
 * Les écrans déclarent leurs modifications via `useDirtySource`.
 */
export function UnsavedChangesGuard() {
  const { t } = useTranslation();
  const dirty = useSyncExternalStore(subscribeDirty, hasUnsavedChanges, () => false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges() && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (blocker.state !== 'blocked') return null;
  return (
    <ConfirmDialog
      open
      tone="danger"
      title={t('unsaved.title')}
      description={t('unsaved.body')}
      cancelLabel={t('unsaved.stay')}
      confirmLabel={t('unsaved.leave')}
      onCancel={() => blocker.reset()}
      onConfirm={() => blocker.proceed()}
    />
  );
}
