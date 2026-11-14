import { Bell, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dropdown } from '@/components/ui/dropdown';

/** Sélecteur d'établissement : squelette. Liste réelle et changement : phase 2 (dépend de CERO ID CORE). */
export function FacilitySwitcher() {
  const { t } = useTranslation();
  return (
    <Dropdown
      label={t('facility.label')}
      align="start"
      trigger={
        <>
          <Building2 aria-hidden className="size-5" />
          <span className="hidden max-w-40 truncate text-sm sm:inline">{t('facility.notConnected')}</span>
        </>
      }
    >
      <p className="px-3 py-2 text-sm text-muted-foreground">{t('facility.none')}</p>
    </Dropdown>
  );
}

/** Centre de notifications : squelette vide (aucune donnée réelle tant que l'API n'existe pas). */
export function NotificationCenter() {
  const { t } = useTranslation();
  return (
    <Dropdown label={t('notifications.title')} trigger={<Bell aria-hidden className="size-5" />}>
      <div className="px-3 py-4 text-center">
        <p className="text-sm font-medium">{t('notifications.empty')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('notifications.emptyHint')}</p>
      </div>
    </Dropdown>
  );
}
