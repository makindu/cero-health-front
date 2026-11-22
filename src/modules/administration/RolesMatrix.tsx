import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { env } from '@/core/config/env';
import { resetRoleOverride, setRoleOverride, useRoleOverrides } from '@/core/local/role-overrides';
import { DEFAULT_ROLE_PERMISSIONS, LOCAL_ROLES, ROLE_LABELS, type LocalRole } from '@/core/local/roles';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS, hasPermission } from '@/core/permissions/permissions';

/** Regroupe les codes de permission par module à partir de la source unique : PERMISSIONS. */
const GROUPS = Object.entries(PERMISSIONS).map(([module, actions]) => ({
  module,
  items: Object.entries(actions).map(([action, code]) => ({ action, code: code as string })),
}));
const ALL_CODES = GROUPS.flatMap((g) => g.items.map((i) => i.code));

/**
 * Droits par rôle. En mode local, l'administrateur coche ou décoche chaque droit : le changement est appliqué tout de suite
 * (les services vérifient les droits, pas seulement les boutons) et conservé sur l'appareil. Le rôle Administrateur reste complet
 * pour ne jamais se verrouiller. Les droits réels viendront de CERO ID CORE.
 */
export function RolesMatrix() {
  const { t } = useTranslation('administration');
  const { can } = usePermissions();
  const overrides = useRoleOverrides();
  const editable = env.localMode && can(PERMISSIONS.administration.manageUsers);

  const listOf = (role: LocalRole): readonly string[] => (role === 'admin' ? ['*'] : overrides[role] ?? DEFAULT_ROLE_PERMISSIONS[role]);
  const toggle = (role: LocalRole, code: string, on: boolean): void => {
    const granted = ALL_CODES.filter((c) => hasPermission(listOf(role), c));
    setRoleOverride(role, on ? [...granted, code] : granted.filter((c) => c !== code));
  };

  return (
    <div>
      <p role="note" className="mb-4 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning-ink">
        {editable
          ? t('roles.editNote', { defaultValue: "Cochez ou décochez un droit : le changement est appliqué immédiatement aux utilisateurs de ce rôle. Le rôle Administrateur garde tous les droits. Mode local : les réglages sont conservés sur cet appareil ; en production, les rôles viendront de CERO ID CORE." })
          : t('roles.note')}
      </p>
      <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
        <table className="w-full min-w-[48rem] text-sm">
          <caption className="sr-only">{t('roles.caption')}</caption>
          <thead className="bg-surface-muted text-xs tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="sticky start-0 bg-surface-muted px-4 py-2 text-start font-medium uppercase">{t('roles.permission')}</th>
              {LOCAL_ROLES.map((role) => (
                <th key={role} scope="col" className="px-3 py-2 text-center font-medium">
                  <span className="block uppercase">{t(`roles.names.${role}`, { defaultValue: ROLE_LABELS[role] })}</span>
                  {editable && overrides[role] && (
                    <Button size="sm" variant="ghost" className="mt-1" onClick={() => resetRoleOverride(role)}>
                      <RotateCcw className="size-3" aria-hidden /> {t('roles.reset', { defaultValue: 'Rétablir' })}
                    </Button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((group) => (
            <tbody key={group.module} className="divide-y divide-border border-t border-border">
              <tr>
                <th scope="colgroup" colSpan={LOCAL_ROLES.length + 1} className="bg-surface-muted/60 px-4 py-1.5 text-start text-xs font-semibold">
                  {t(`roles.modules.${group.module}`)}
                </th>
              </tr>
              {group.items.map(({ action, code }) => (
                <tr key={code}>
                  <th scope="row" className="sticky start-0 bg-surface px-4 py-1.5 text-start font-normal">{t(`roles.permissions.${group.module}.${action}`)}</th>
                  {LOCAL_ROLES.map((role) => {
                    const granted = hasPermission(listOf(role), code);
                    return (
                      <td key={role} className="px-3 py-1.5 text-center">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-primary,#0f766e)]"
                          checked={granted}
                          disabled={!editable || role === 'admin'}
                          onChange={(e) => toggle(role, code, e.target.checked)}
                          aria-label={`${t(`roles.names.${role}`, { defaultValue: ROLE_LABELS[role] })} — ${t(`roles.permissions.${group.module}.${action}`)}`}
                        />
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
