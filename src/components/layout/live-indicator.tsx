import { useTranslation } from 'react-i18next';
import { useLiveState } from '@/core/live/live-status';

/** Petit voyant du temps réel : vert = les écrans se mettent à jour seuls ; absent si le temps réel n'est pas actif. */
export function LiveIndicator() {
  const { t } = useTranslation();
  const state = useLiveState();
  if (state === 'off') return null;
  const on = state === 'on';
  return (
    <span className="me-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted-foreground" title={t(on ? 'live.onHint' : 'live.connectingHint')} role="status">
      <span aria-hidden className={`size-2 rounded-full ${on ? 'bg-success' : 'bg-warning'}`} />
      <span className="hidden sm:inline">{t(on ? 'live.on' : 'live.connecting')}</span>
    </span>
  );
}
