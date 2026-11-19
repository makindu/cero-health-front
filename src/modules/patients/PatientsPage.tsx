import { Copy, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Can } from '@/core/permissions/PermissionsProvider';
import type { Column } from '@/components/tables/data-table';
import { useFormatters } from '@/core/i18n/useFormatters';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { useAgeLabel } from '@/utils/age';
import { PatientCategoriesButton } from './PatientCategoriesDialog';
import { usePatientCategories } from './category-data';
import { SERVICE_KEYS } from '../_shared/demo-people';
import { ExportMenu } from '../_shared/export/ExportMenu';
import { ResourcePage } from '../_shared/ResourcePage';
import { DuplicatesDialog } from './DuplicatesDialog';
import { PatientCreateDialog } from './PatientFormDialogs';
import { patientService, type Patient } from './data';
import { PersonName } from '@/components/ui/avatar';

/**
 * Lisibilité selon la largeur : le tableau garde l'essentiel (nom, âge, téléphone, statut, dernière visite) dès
 * 768 px, ajoute le n° de dossier dès 1024 px et le reste dès 1280 px. Sur téléphone, chaque patient devient une
 * carte qui affiche TOUS les champs.
 */
const HIDE_BELOW_LG = 'hidden lg:table-cell';
const HIDE_BELOW_XL = 'hidden xl:table-cell';

export default function PatientsPage() {
  const { t } = useTranslation('patients');
  const f = useFormatters();
  const navigate = useNavigate();
  const ageLabel = useAgeLabel();
  const categories = usePatientCategories();
  const [creating, setCreating] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const serviceOptions = SERVICE_KEYS.map((key) => ({ value: key, label: t(`services.${key}`) }));

  const columns: Column<Patient>[] = [
    { id: 'fullName', header: t('columns.name'), cell: (p) => <PersonName name={p.fullName} />, sortable: true, primary: true },
    { id: 'fileNumber', header: t('columns.fileNumber'), cell: (p) => <code className="text-xs">{p.fileNumber}</code>, className: HIDE_BELOW_LG },
    { id: 'sex', header: t('columns.sex'), cell: (p) => t(`sex.${p.sex}`), className: HIDE_BELOW_XL },
    {
      id: 'age',
      header: t('columns.age'),
      sortable: true,
      cell: (p) => ageLabel(p.birthDate),
    },
    { id: 'category', header: t('columns.category'), cell: (p) => categories.byId.get(p.categoryId ?? 'PRIVATE')?.label ?? '—', className: HIDE_BELOW_XL },
    { id: 'phone', header: t('columns.phone'), cell: (p) => p.phone },
    { id: 'service', header: t('columns.service'), cell: (p) => t(`services.${p.service}`), className: HIDE_BELOW_XL },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (p) => <StatusBadge tone={p.status === 'active' ? 'success' : 'neutral'}>{t(`status.${p.status}`)}</StatusBadge>,
    },
    { id: 'registeredAt', header: t('columns.registeredAt'), cell: (p) => f.date(p.registeredAt), sortable: true, className: HIDE_BELOW_XL },
    { id: 'lastVisit', header: t('columns.lastVisit'), cell: (p) => (p.lastVisit ? f.date(p.lastVisit) : t('noVisit')), sortable: true },
  ];

  return (
    <>
      <ResourcePage<Patient>
        name="patients"
        service={patientService}
        title={t('title')}
        description={t('subtitle')}
        searchLabel={t('search')}
        columns={columns}
        defaultSort={{ columnId: 'fullName', direction: 'asc' }}
        actions={(current) => (
          <>
            <ExportMenu<Patient>
              service={patientService}
              params={current}
              permission={PERMISSIONS.patients.export}
              title={t('title')}
              filenameBase="patients"
              columns={[
                { header: t('columns.fileNumber'), value: (p) => p.fileNumber },
                { header: t('columns.name'), value: (p) => p.fullName },
                { header: t('columns.sex'), value: (p) => p.sex },
                { header: t('fields.birthDate'), value: (p) => f.date(p.birthDate) },
                { header: t('columns.phone'), value: (p) => p.phone },
                { header: t('columns.service'), value: (p) => t(`services.${p.service}`) },
                { header: t('columns.status'), value: (p) => t(`status.${p.status}`) },
                { header: t('columns.registeredAt'), value: (p) => f.date(p.registeredAt) },
              ]}
            />
            <PatientCategoriesButton />
            <Can permission={PERMISSIONS.patients.merge}>
              <Button variant="outline" leftIcon={<Copy className="size-4" />} onClick={() => setShowDuplicates(true)}>
                {t('duplicates.button')}
              </Button>
            </Can>
            <Can permission={PERMISSIONS.patients.create}>
              <Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                {t('create.button')}
              </Button>
            </Can>
          </>
        )}
        onOpen={(patient) => navigate(`/patients/${encodeURIComponent(patient.id)}`)}
        filters={[
          { id: 'sex', label: t('filters.sex'), options: [{ value: 'F', label: t('sex.F') }, { value: 'M', label: t('sex.M') }] },
          { id: 'status', label: t('filters.status'), options: [{ value: 'active', label: t('status.active') }, { value: 'inactive', label: t('status.inactive') }] },
          { id: 'service', label: t('filters.service'), options: serviceOptions },
          { id: 'registeredFrom', type: 'date', label: t('filters.registeredFrom') },
          { id: 'registeredTo', type: 'date', label: t('filters.registeredTo') },
        ]}
      />
      <PatientCreateDialog open={creating} onClose={() => setCreating(false)} />
      <DuplicatesDialog open={showDuplicates} onClose={() => setShowDuplicates(false)} />
    </>
  );
}
