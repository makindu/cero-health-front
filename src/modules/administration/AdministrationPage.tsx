import { CircleCheck, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Column } from '@/components/tables/data-table';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { useAuth } from '@/core/auth/cero-id';
import { Tabs } from '@/components/ui/tabs';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { SERVICE_KEYS } from '../_shared/demo-people';
import { ResourcePage } from '../_shared/ResourcePage';
import { referenceFromApi } from '../_shared/reference-data';
import { StaffApiScreen } from './StaffApiScreen';
import { ServiceDepositCell } from './ServiceDeposit';
import { FacilityForm } from './FacilityForm';
import { careUnitTypeOptions, createCareUnitType, useCareUnitTypes, useRefreshCareUnitTypes } from './care-unit-types';
import { ReviewQueue } from '../review/ReviewQueue';
import { Can } from '@/core/permissions/PermissionsProvider';
import { BillingSettingsCard } from '../billing/BillingSettingsCard';
import { PersonName } from '@/components/ui/avatar';
import {
  CARE_UNIT_TYPES,
  hospitalServiceService,
  ROLE_IDS,
  userService,
  type HospitalService,
  type UserAccount,
} from './data';

function UsersTab() {
  // API réelle : profils du personnel (/staff-profiles) ; les comptes eux-mêmes restent gérés dans CERO ID.
  return referenceFromApi() ? <StaffApiScreen /> : <UsersScreen />;
}

function UsersScreen() {
  const { t } = useTranslation('administration');
  const columns: Column<UserAccount>[] = [
    { id: 'name', header: t('users.name'), cell: (u) => <PersonName name={u.name} />, sortable: true, primary: true },
    { id: 'email', header: t('users.email'), cell: (u) => u.email },
    { id: 'role', header: t('users.role'), cell: (u) => t(`roles.names.${u.role}`) },
    { id: 'service', header: t('users.service'), cell: (u) => (u.service ? t(`serviceNames.${u.service}`) : '—') },
    { id: 'specialty', header: t('users.specialty'), cell: (u) => u.specialty ?? '—' },
    {
      id: 'status',
      header: t('users.status'),
      cell: (u) => (
        <StatusBadge tone={u.status === 'active' ? 'success' : 'warning'} icon={u.status === 'active' ? CircleCheck : UserX}>
          {t(`users.statuses.${u.status}`)}
        </StatusBadge>
      ),
    },
  ];
  return (
    <ResourcePage<UserAccount>
      embedded
      name="users"
      service={userService}
      title={t('tabs.users')}
      searchLabel={t('users.search')}
      columns={columns}
      filters={[
        { id: 'role', label: t('users.role'), options: ROLE_IDS.map((r) => ({ value: r, label: t(`roles.names.${r}`) })) },
        { id: 'service', label: t('users.service'), options: SERVICE_KEYS.map((k) => ({ value: k, label: t(`serviceNames.${k}`) })) },
        { id: 'status', label: t('users.status'), options: [{ value: 'active', label: t('users.statuses.active') }, { value: 'suspended', label: t('users.statuses.suspended') }] },
      ]}
      detailTitle={(u) => u.name}
      renderDetail={(u) => (
        <>
          <DetailSection title={t('users.detail')}>
            <DescriptionList
              items={[
                { label: t('users.name'), value: u.name },
                { label: t('users.email'), value: u.email },
                { label: t('users.role'), value: t(`roles.names.${u.role}`) },
                { label: t('users.status'), value: t(`users.statuses.${u.status}`) },
                { label: t('users.service'), value: u.service ? t(`serviceNames.${u.service}`) : '' },
                { label: t('users.specialty'), value: u.specialty ?? '' },
                { label: t('users.registration'), value: u.registrationNumber ?? '' },
              ]}
            />
          </DetailSection>
          <p className="mt-4 text-xs text-muted-foreground">{t('users.managedByIdCore')}</p>
        </>
      )}
    />
  );
}

function ServicesTab() {
  const { t } = useTranslation('administration');
  const customTypes = useCareUnitTypes();
  const refreshTypes = useRefreshCareUnitTypes();
  const columns: Column<HospitalService>[] = [
    { id: 'key', header: t('services.name'), cell: (s) => <span className="font-medium">{s.name || t(`serviceNames.${s.key}`)}</span>, primary: true },
    { id: 'head', header: t('services.head'), cell: (s) => s.head },
    { id: 'beds', header: t('services.beds'), cell: (s) => s.beds, sortable: true, className: 'text-end tabular-nums' },
    ...(referenceFromApi() ? [{ id: 'deposit', header: t('services.deposit'), cell: (s: HospitalService) => <ServiceDepositCell service={s} /> }] : []),
    { id: 'status', header: t('users.status'), cell: (s) => t(`users.statuses.${s.status === 'active' ? 'active' : 'suspended'}`) },
  ];
  return (
    <ResourcePage<HospitalService>
      embedded
      name="services"
      service={hospitalServiceService}
      title={t('tabs.services')}
      searchLabel={t('services.search')}
      columns={columns}
      create={{
        permission: PERMISSIONS.administration.manageServices,
        buttonLabel: t('services.create'),
        title: t('services.createTitle'),
        submitLabel: t('services.createSubmit'),
        fields: referenceFromApi()
          ? [
              { name: 'name', label: t('services.name'), type: 'text', required: true, span: 2 },
              {
                name: 'unitType',
                label: t('services.type'),
                type: 'select',
                required: true,
                span: 2,
                options: careUnitTypeOptions(CARE_UNIT_TYPES, (k) => t(`services.types.${k}`), customTypes.data ?? []),
                // Un type absent de la liste s'ajoute ici même, sans quitter la fenêtre (propre à cet établissement).
                creatable: {
                  addLabel: t('services.addType'),
                  inputLabel: t('services.newTypeLabel'),
                  placeholder: t('services.newTypePlaceholder'),
                  confirmLabel: t('services.addTypeConfirm'),
                  cancelLabel: t('services.addTypeCancel'),
                  errorMessage: t('services.addTypeError'),
                  onCreate: async (label) => {
                    const created = await createCareUnitType(label);
                    refreshTypes();
                    return { value: created.code, label: created.label };
                  },
                },
              },
              { name: 'beds', label: t('services.beds'), type: 'number' },
            ]
          : [
              { name: 'name', label: t('services.name'), type: 'text', required: true },
              { name: 'head', label: t('services.head'), type: 'text' },
              { name: 'beds', label: t('services.beds'), type: 'number' },
            ],
      }}
    />
  );
}

export default function AdministrationPage() {
  const { t } = useTranslation('administration');
  const { activeFacility } = useAuth();
  return (
    // key : tout l'écran (onglets, recherche, pages, détail) repart à neuf quand on change d'établissement.
    <div key={activeFacility?.id ?? 'none'}>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Tabs
        ariaLabel={t('title')}
        tabs={[
          { id: 'facility', label: t('tabs.facility'), content: <FacilityForm /> },
          { id: 'users', label: t('tabs.users'), content: <UsersTab /> },
          { id: 'services', label: t('tabs.services'), content: <ServicesTab /> },
          ...(referenceFromApi() ? [{ id: 'billing', label: t('tabs.billing', { defaultValue: 'Facturation' }), content: <Can permission={PERMISSIONS.billing.configure}><BillingSettingsCard /></Can> }] : []),
          ...(referenceFromApi() ? [{ id: 'review', label: t('tabs.review', { defaultValue: 'À valider' }), content: <ReviewQueue /> }] : []),
        ]}
      />
    </div>
  );
}
