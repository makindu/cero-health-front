import { UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { preferencesStore, usePreferences } from '@/core/preferences/preferences-store';

/** Menu utilisateur. Identité réelle et déconnexion : phase 2 (CERO ID CORE). */
export function UserMenu() {
  const { t } = useTranslation();
  const { density } = usePreferences();
  return (
    <Dropdown label={t('user.menu')} trigger={<UserRound aria-hidden className="size-5" />}>
      {(close) => (
        <>
          <div className="px-3 py-2">
            <p className="text-sm font-medium">{t('user.guest')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('user.authPending')}</p>
          </div>
          <div className="my-1 border-t border-border" />
          <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('density.label')}
          </p>
          {(['comfortable', 'compact'] as const).map((option) => (
            <DropdownItem
              key={option}
              selected={density === option}
              onClick={() => {
                preferencesStore.set({ density: option });
                close();
              }}
            >
              {t(`density.${option}`)}
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
