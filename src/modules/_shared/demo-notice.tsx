import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Bandeau obligatoire sur toute page qui affiche des données fictives. */
export function DemoNotice({ endpoint }: { endpoint?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      className="no-print mb-5 flex items-start gap-3 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning-ink"
    >
      <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{t('module.demo.title')}</p>
        <p>{t('module.demo.body')}</p>
        {endpoint && (
          <p className="mt-1 text-xs">
            {t('module.demo.endpoint')} <code>{endpoint}</code>
          </p>
        )}
      </div>
    </div>
  );
}
