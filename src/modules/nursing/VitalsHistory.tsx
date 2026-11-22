import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { useFormatters } from '@/core/i18n/useFormatters';
import { createResourceService } from '../_shared/resource-service';
import { useResourceList } from '../_shared/use-resource';
import type { VitalsRecord } from './local-rules';
import { vitalsApi } from './vitals-api';

export const VITALS_COLLECTION = 'health-triage-vitals';

const UNITS = { temperature: '°C', pulse: '/min', systolic: 'mmHg', diastolic: 'mmHg', respiratoryRate: '/min', spo2: '%', weight: 'kg' } as const;
const FIELDS = Object.keys(UNITS) as (keyof typeof UNITS)[];

/**
 * Constantes vitales saisies (mode local uniquement : la lecture API n'a pas de contrat défini).
 * Valeurs affichées telles que saisies : aucune interprétation, aucun diagnostic automatique.
 */
export function VitalsHistory({ entryId, patientId }: { entryId: string; patientId: string }) {
  const { t } = useTranslation('nursing');
  const f = useFormatters();
  const service = useMemo(
    () => createResourceService<VitalsRecord>({ source: 'health', endpoint: HEALTH_ENDPOINTS.triage.vitals(entryId), local: { collection: VITALS_COLLECTION }, api: vitalsApi(patientId, entryId) }),
    [entryId, patientId],
  );
  const list = useResourceList('triage', service, { page: 1, perPage: 50, search: '', filters: { entryId }, sort: { columnId: 'recordedAt', direction: 'desc' } });
  const rows = list.data?.rows ?? [];
  if (rows.length === 0) return <p className="mb-2 text-sm text-muted-foreground">{t('detail.noVitals')}</p>;
  return (
    <ul className="mb-3 space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="rounded-md border border-border p-2 text-sm">
          <p className="text-xs text-muted-foreground">
            {[f.dateTime(row.recordedAt), row.recordedBy].filter(Boolean).join(' · ')}
          </p>
          <p>
            {FIELDS.filter((field) => row[field] !== undefined)
              .map((field) => `${t(`vitals.${field}`)} ${row[field]} ${UNITS[field]}`)
              .join(' · ')}
          </p>
          {row.note && <p className="text-muted-foreground">{row.note}</p>}
        </li>
      ))}
    </ul>
  );
}
