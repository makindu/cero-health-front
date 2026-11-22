import { HeartPulse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import type { FieldDef } from '../_shared/dynamic-form';
import { FormDialog } from '../_shared/form-dialog';
import { createResourceService } from '../_shared/resource-service';
import type { TriageEntry } from './data';
import { buildVitals, type VitalsRecord } from './local-rules';
import { VITALS_COLLECTION } from './VitalsHistory';
import { vitalsApi } from './vitals-api';

/** Saisie des constantes d'un patient de la file, sans passer par la page « Triage ». */
export function VitalsEntryButton({ entry }: { entry: TriageEntry }) {
  const { t } = useTranslation('nursing');
  const [open, setOpen] = useState(false);
  const service = useMemo(
    () =>
      createResourceService<VitalsRecord>({
        source: 'health',
        endpoint: HEALTH_ENDPOINTS.triage.vitals(entry.id),
        demoRows: [],
        api: vitalsApi(entry.patientId, entry.id),
        local: {
          collection: VITALS_COLLECTION,
          create: (input, ctx) => buildVitals(input, entry.id, ctx, `VIT-LOC-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`),
          permissions: { create: PERMISSIONS.nursing.record },
        },
      }),
    [entry.id, entry.patientId],
  );
  const fields: FieldDef[] = [
    { name: 'temperature', label: t('vitals.temperature'), type: 'number', hint: t('vitals.unit.temperature') },
    { name: 'pulse', label: t('vitals.pulse'), type: 'number', hint: t('vitals.unit.pulse') },
    { name: 'systolic', label: t('vitals.systolic'), type: 'number', hint: t('vitals.unit.pressure') },
    { name: 'diastolic', label: t('vitals.diastolic'), type: 'number', hint: t('vitals.unit.pressure') },
    { name: 'respiratoryRate', label: t('vitals.respiratoryRate'), type: 'number', hint: t('vitals.unit.respiratory') },
    { name: 'spo2', label: t('vitals.spo2'), type: 'number', hint: t('vitals.unit.spo2') },
    { name: 'weight', label: t('vitals.weight'), type: 'number', hint: t('vitals.unit.weight') },
    { name: 'note', label: t('vitals.note'), type: 'textarea', span: 2 },
  ];
  return (
    <Can permission={PERMISSIONS.nursing.record}>
      <Button size="sm" variant="outline" leftIcon={<HeartPulse className="size-4" />} onClick={() => setOpen(true)}>
        {t('detail.enterVitals')}
      </Button>
      <FormDialog open={open} onClose={() => setOpen(false)} name="triage" service={service} title={t('vitals.title')} submitLabel={t('vitals.submit')} fields={fields} />
    </Can>
  );
}
