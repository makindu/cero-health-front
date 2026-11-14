import { Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LOCAL_USERS } from '@/core/local/roles';
import { setLocalUser, useLocalUser } from '@/core/local/session';

/**
 * Bandeau permanent du mode local : les données restent sur CET appareil, rien n'est envoyé aux API.
 * Le sélecteur de rôle sert à tester les permissions (utilisateurs FICTIFS ; ce n'est pas une authentification).
 */
export function LocalModeBanner() {
  const { t } = useTranslation();
  const user = useLocalUser();
  return (
    <div
      role="status"
      className="no-print flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-warning/40 bg-warning/15 px-4 py-1.5 text-xs font-medium text-foreground"
    >
      <span className="inline-flex items-center gap-1.5">
        <Database aria-hidden className="size-3.5" />
        {t('local.banner')}
      </span>
      <span className="ms-auto flex items-center gap-2">
        <label htmlFor="local-role" className="text-muted-foreground">
          {t('local.roleLabel')}
        </label>
        <select
          id="local-role"
          value={user.id}
          onChange={(event) => setLocalUser(event.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs"
        >
          {LOCAL_USERS.map((u) => (
            <option key={u.id} value={u.id}>
              {t(`local.roles.${u.role}`)}
            </option>
          ))}
        </select>
        <Link to="/local-data" className="underline underline-offset-2">
          {t('local.manage')}
        </Link>
      </span>
    </div>
  );
}
