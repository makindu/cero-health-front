import { CircleCheck, Pencil, UserPlus, UserX, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Column } from '@/components/tables/data-table';
import { PersonName } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { StatusBadge } from '@/components/ui/badge';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ResourcePage } from '../_shared/ResourcePage';
import { useCareUnits } from '../_shared/reference-data';
import { StaffFunctionsDialog } from './StaffFunctionsDialog';
import { StaffProfileDialog } from './StaffProfileDialog';
import { STAFF_TYPES, staffMemberService, type StaffMemberRow } from './staff-api';

/** Personnel de l'établissement (API réelle) : profils liés aux comptes CERO. Les comptes eux-mêmes se gèrent dans le portail CERO ID. */
export function StaffApiScreen() {
  const { t } = useTranslation('administration');
  const units = useCareUnits();
  const unitName = (id: string): string => units.data?.find((u) => u.id === id)?.name ?? '';
  const [editing, setEditing] = useState<StaffMemberRow | 'new' | null>(null);
  const [managing, setManaging] = useState(false);
  const typeLabel = (type: string): string => (type ? t(`staff.types.${type}`, { defaultValue: type }) : t('staff.noProfile'));
  const columns: Column<StaffMemberRow>[] = [
    { id: 'name', header: t('users.name'), cell: (s) => <PersonName name={s.name} />, primary: true },
    { id: 'type', header: t('staff.type'), cell: (s) => s.functionLabel || typeLabel(s.type) },
    { id: 'specialty', header: t('users.specialty'), cell: (s) => s.specialty || '—' },
    { id: 'unit', header: t('users.service'), cell: (s) => unitName(s.careUnitId) || '—' },
    {
      id: 'status',
      header: t('users.status'),
      cell: (s) =>
        s.hasProfile ? (
          <StatusBadge tone={s.active ? 'success' : 'warning'} icon={s.active ? CircleCheck : UserX}>
            {t(`users.statuses.${s.active ? 'active' : 'suspended'}`)}
          </StatusBadge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'edit',
      header: '',
      className: 'w-px whitespace-nowrap text-end',
      cell: (s) => (
        <Can permission={P.administration.manageUsers}>
          <Button size="sm" variant="ghost" className="whitespace-nowrap" leftIcon={s.hasProfile ? <Pencil className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />} onClick={() => setEditing(s)}>{s.hasProfile ? t('users.edit') : t('users.createProfile')}</Button>
        </Can>
      ),
    },
  ];
  return (
    <>
    <ResourcePage<StaffMemberRow>
      embedded
      name="staff"
      service={staffMemberService}
      title={t('tabs.users')}
      searchLabel={t('users.search')}
      columns={columns}
      filters={[
        { id: 'type', label: t('staff.type'), options: STAFF_TYPES.map((k) => ({ value: k, label: typeLabel(k) })) },
        { id: 'status', label: t('users.status'), options: [{ value: 'active', label: t('users.statuses.active') }, { value: 'inactive', label: t('users.statuses.suspended') }] },
      ]}
      actions={
        <Can permission={P.administration.manageUsers}>
          <Button variant="outline" leftIcon={<Users className="size-4" aria-hidden />} onClick={() => setManaging(true)}>{t('functions.manage')}</Button>
          <Button leftIcon={<UserPlus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>{t('users.invite')}</Button>
        </Can>
      }
      detailTitle={(s) => s.name}
      renderDetail={(s) => (
        <>
          <DetailSection title={t('users.detail')}>
            <DescriptionList
              items={[
                { label: t('users.name'), value: s.owner ? `${s.name} (${t('staff.owner')})` : s.name },
                { label: t('staff.type'), value: s.functionLabel ? `${s.functionLabel} (${typeLabel(s.type)})` : typeLabel(s.type) },
                { label: t('staff.title'), value: s.title },
                { label: t('users.service'), value: unitName(s.careUnitId) },
                { label: t('users.specialty'), value: s.specialty },
                { label: t('users.registration'), value: s.registrationNumber },
                { label: t('users.status'), value: s.hasProfile ? t(`users.statuses.${s.active ? 'active' : 'suspended'}`) : '' },
              ]}
            />
          </DetailSection>
          <p className="mt-4 text-xs text-muted-foreground">{t('staff.managedByIdCore')}</p>
        </>
      )}
    />
    {managing && <StaffFunctionsDialog onClose={() => setManaging(false)} />}
    {editing && <StaffProfileDialog key={editing === 'new' ? 'new' : editing.id} member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
