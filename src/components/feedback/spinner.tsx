import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

/** Bloc de substitution pendant le chargement (décoratif). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-muted', className)} />;
}
