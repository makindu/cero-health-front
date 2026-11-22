import { UserRound } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/core/auth/cero-id';
import { env } from '@/core/config/env';
import { LOCAL_USERS } from '@/core/local/roles';
import { useLocalUser } from '@/core/local/session';
import { useTranslation } from 'react-i18next';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { preferencesStore, usePreferences } from '@/core/preferences/preferences-store';

/** Menu utilisateur. Identité réelle et déconnexion : phase 2 (CERO ID CORE). */
export function UserMenu() {
  return env.ssoEnabled ? <SsoUserMenu /> : <DemoUserMenu />;
}

/** Menu avec la vraie session CERO CEPATEC : identité, établissement actif, déconnexion. */
function SsoUserMenu() {
  const { t } = useTranslation();
  const { density } = usePreferences();
  const { user, facilities, activeFacility, selectFacility, logout } = useAuth();
  const allowed = facilities.filter((f) => f.allowed);
  return (
    <Dropdown label={t('user.menu')} trigger={<Avatar name={user?.name ?? '?'} />}>
      {(close) => (
        <>
          <div className="px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium"><Avatar name={user?.name ?? '?'} />{user?.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">@{user?.userName}</p>
          </div>
          {allowed.length > 1 && (
            <>
              <div className="my-1 border-t border-border" />
              <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('user.facility', { defaultValue: 'Établissement' })}
              </p>
              {allowed.map((f) => (
                <DropdownItem key={f.id} selected={activeFacility?.id === f.id} onClick={() => { selectFacility(f.id); close(); }}>
                  {f.name}
                </DropdownItem>
              ))}
            </>
          )}
          {allowed.length === 1 && (
            <p className="px-3 pb-1 text-xs text-muted-foreground">{activeFacility?.name}</p>
          )}
          <div className="my-1 border-t border-border" />
          <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('density.label')}</p>
          {(['comfortable', 'compact'] as const).map((option) => (
            <DropdownItem key={option} selected={density === option} onClick={() => { preferencesStore.set({ density: option }); close(); }}>
              {t(`density.${option}`)}
            </DropdownItem>
          ))}
          <div className="my-1 border-t border-border" />
          <DropdownItem onClick={() => { close(); void logout(); }}>
            {t('user.signOut', { defaultValue: 'Se déconnecter' })}
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}

function DemoUserMenu() {
  const { t } = useTranslation();
  const { density } = usePreferences();
  const local = useLocalUser();
  const who = env.localMode ? LOCAL_USERS.find((u) => u.id === local.id)?.name : undefined;
  return (
    <Dropdown label={t('user.menu')} trigger={who ? <Avatar name={who} /> : <UserRound aria-hidden className="size-5" />}>
      {(close) => (
        <>
          <div className="px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium">{who && <Avatar name={who} />}{who ?? t('user.guest')}</p>
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
