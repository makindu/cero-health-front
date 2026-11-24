import { LoaderCircle, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDataUnavailable } from '@/core/connectivity/connectivity';
import { cn } from '@/utils/cn';

/** Indicateur de chargement annoncé aux lecteurs d'écran. */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-muted-foreground', className)}>
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
      <span className="text-sm">{label ?? t('states.loading')}</span>
    </span>
  );
}

/**
 * Bloc de substitution pendant le chargement (décoratif). Si la connexion est coupée, le chargement ne finira pas de lui-même :
 * le bloc devient fixe et le dit, au lieu de clignoter sans fin.
 */
export function Skeleton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const unavailable = useDataUnavailable();
  if (unavailable) {
    return (
      <div role="status" className={cn('flex items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-muted px-3 text-sm text-muted-foreground', className)}>
        <WifiOff aria-hidden className="size-4 shrink-0" />
        <span>{t('connection.unavailable')}</span>
      </div>
    );
  }
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-muted', className)} />;
}
