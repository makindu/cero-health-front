import { Check, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS, hasPermission } from '@/core/permissions/permissions';
import { DEMO_ROLES, ROLE_IDS } from './data';

/** Regroupe les codes de permission par module à partir de la source unique : PERMISSIONS. */
const GROUPS = Object.entries(PERMISSIONS).map(([module, actions]) => ({
  module,
  codes: Object.values(actions) as string[],
}));

/**
 * Matrice permissions × rôles. Les CODES sont réels (src/core/permissions) ; l'attribution aux rôles
 * est une PROPOSITION illustrative, non appliquée. Case cochée = icône + texte masqué pour lecteur d'écran.
 */
export function RolesMatrix() {
  const { t } = useTranslation('administration');
  return (
    <div>
      <p role="note" className="mb-4 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning-ink">
        {t('roles.note')}
      </p>
      <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">{t('roles.caption')}</caption>
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="sticky start-0 bg-surface-muted px-4 py-2 text-start font-medium">
                {t('roles.permission')}
              </th>
              {ROLE_IDS.map((role) => (
                <th key={role} scope="col" className="px-3 py-2 text-center font-medium">
                  {t(`roles.names.${role}`)}
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((group) => (
            <tbody key={group.module} className="divide-y divide-border border-t border-border">
              <tr>
                <th scope="colgroup" colSpan={ROLE_IDS.length + 1} className="bg-surface-muted/60 px-4 py-1.5 text-start text-xs font-semibold">
                  {t(`roles.modules.${group.module}`)}
                </th>
              </tr>
              {group.codes.map((code) => (
                <tr key={code}>
                  <th scope="row" className="sticky start-0 bg-surface px-4 py-1.5 text-start font-normal">
                    <code className="text-xs">{code}</code>
                  </th>
                  {ROLE_IDS.map((role) => {
                    const granted = hasPermission(DEMO_ROLES[role], code);
                    return (
                      <td key={role} className="px-3 py-1.5 text-center">
                        {granted ? (
                          <Check aria-hidden className="mx-auto size-4 text-success-ink" />
                        ) : (
                          <Minus aria-hidden className="mx-auto size-4 text-muted-foreground" />
                        )}
                        <span className="sr-only">{granted ? t('common.yes') : t('common.no')}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
