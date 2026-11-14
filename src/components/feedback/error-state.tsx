import { CircleAlert, LockKeyhole, SearchX, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError, type ApiErrorKind } from '@/core/api/types';
import { Button } from '@/components/ui/button';

const icons: Partial<Record<ApiErrorKind, typeof CircleAlert>> = {
  network: WifiOff,
  timeout: WifiOff,
  forbidden: LockKeyhole,
  unauthorized: LockKeyhole,
  not_found: SearchX,
};

/** Affiche une erreur API normalisée : message adapté au type, référence de requête, bouton Réessayer. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const kind: ApiErrorKind | 'generic' = error instanceof ApiError ? error.kind : 'generic';
  const Icon = (kind !== 'generic' && icons[kind]) || CircleAlert;
  const base = kind === 'generic' ? 'errors.generic' : `errors.kind.${kind}`;
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
        <Icon aria-hidden className="size-6" />
      </span>
      <h3 className="text-base font-semibold text-foreground">{t(`${base}.title`)}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{t(`${base}.description`)}</p>
      {requestId && (
        <p className="text-xs text-muted-foreground">{t('errors.reference', { id: requestId })}</p>
      )}
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {t('actions.retry')}
        </Button>
      )}
    </div>
  );
}
