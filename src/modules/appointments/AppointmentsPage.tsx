import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { AppointmentCreateDialog } from './AppointmentDialogs';
import { AppointmentsCalendar } from './AppointmentsCalendar';
import { AppointmentsList } from './AppointmentsList';
import { ReceptionPanel } from './ReceptionPanel';

/** Rendez-vous et accueil : file d'accueil du jour, calendriers (jour / semaine / mois, planning par praticien) et liste. */
export default function AppointmentsPage() {
  const { t } = useTranslation('appointments');
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Can permission={PERMISSIONS.appointments.create}>
            <Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t('create.button')}
            </Button>
          </Can>
        }
      />
      <Tabs
        ariaLabel={t('title')}
        tabs={[
          { id: 'reception', label: t('tabs.reception'), content: <ReceptionPanel /> },
          { id: 'calendar', label: t('tabs.calendar'), content: <AppointmentsCalendar /> },
          { id: 'list', label: t('tabs.list'), content: <AppointmentsList /> },
        ]}
      />
      <AppointmentCreateDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
