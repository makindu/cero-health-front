import { FileText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { isoDay } from '@/utils/dates';
import { PDF_MIME, downloadBytes, safeFilename } from '../_shared/export/download';
import { buildPdf } from '../_shared/export/pdf';
import type { Patient } from './data';

/** Export PDF de la fiche ADMINISTRATIVE d'un patient. Aucune donnée clinique n'y figure. */
export function PatientSheetExport({ patient, isDemo }: { patient: Patient; isDemo: boolean }) {
  const { t } = useTranslation('patients');
  const f = useFormatters();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  function run() {
    const rows: [string, string][] = [
      [t('fields.fullName'), patient.fullName],
      [t('columns.fileNumber'), patient.fileNumber],
      [t('fields.sex'), t(`sex.${patient.sex}`)],
      [t('fields.birthDate'), f.date(patient.birthDate)],
      [t('fields.phone'), patient.phone],
      [t('fields.address'), patient.address],
      [t('fields.emergencyContact'), patient.emergencyContact],
      [t('fields.service'), t(`services.${patient.service}`)],
      [t('fields.insurer'), patient.insurer],
      [t('detail.registeredAt'), f.date(patient.registeredAt)],
    ];
    const now = new Date();
    const bytes = buildPdf({
      title: `${t('sheet.title')} · ${patient.fullName}`,
      notes: [`${t('sheet.adminOnly')} · ${f.dateTime(now)}`, ...(isDemo ? [t('sheet.demoMark')] : [])],
      header: [t('sheet.field'), t('sheet.value')],
      rows,
    });
    downloadBytes(safeFilename(`fiche-${patient.id}`, 'pdf', isoDay(0, now)), bytes, PDF_MIME);
    toast({ tone: 'success', title: t('sheet.done') });
    setConfirming(false);
  }

  return (
    <Can permission={PERMISSIONS.patients.export}>
      <Button variant="outline" leftIcon={<FileText className="size-4" />} onClick={() => setConfirming(true)}>
        {t('sheet.button')}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t('sheet.confirmTitle')}
        description={t('sheet.confirmBody')}
        onConfirm={run}
        onCancel={() => setConfirming(false)}
      />
    </Can>
  );
}
