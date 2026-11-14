import {
  Activity,
  BedDouble,
  Boxes,
  CalendarClock,
  FlaskConical,
  ScrollText,
  Wallet,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { env } from '@/core/config/env';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { FormDialog } from '../_shared/form-dialog';
import { createResourceService } from '../_shared/resource-service';

type ReportId = 'activity' | 'appointments' | 'stock' | 'finance' | 'cash' | 'laboratory' | 'hospitalization' | 'audit';

const REPORTS: readonly { id: ReportId; icon: LucideIcon }[] = [
  { id: 'activity', icon: Activity },
  { id: 'appointments', icon: CalendarClock },
  { id: 'hospitalization', icon: BedDouble },
  { id: 'laboratory', icon: FlaskConical },
  { id: 'stock', icon: Boxes },
  { id: 'finance', icon: TrendingUp },
  { id: 'cash', icon: Wallet },
  { id: 'audit', icon: ScrollText },
];

/** Catalogue de rapports. La génération dépend d'un endpoint de rapport (contrat à valider). */
export default function ReportsPage() {
  const { t } = useTranslation('reports');
  const [running, setRunning] = useState<ReportId | null>(null);

  const service = useMemo(
    () =>
      createResourceService<{ id: string }>({
        source: 'health',
        endpoint: running ? HEALTH_ENDPOINTS.administration.reportRun(running) : undefined,
        demoRows: [],
      }),
    [running],
  );

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {!env.api.health && (
        <p role="note" className="mb-5 rounded-md bg-info-soft px-4 py-3 text-sm text-info-ink">
          {t('apiNote')}
        </p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map(({ id, icon: Icon }) => (
          <li key={id}>
            <Card className="h-full">
              <div className="flex h-full flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-ink">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold">{t(`items.${id}.title`)}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t(`items.${id}.description`)}</p>
                  </div>
                </div>
                <div className="mt-auto">
                  <Can permission={PERMISSIONS.reports.view}>
                    <Button variant="outline" size="sm" onClick={() => setRunning(id)}>
                      {t('generate')}
                    </Button>
                  </Can>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <FormDialog
        open={running !== null}
        onClose={() => setRunning(null)}
        name="reports"
        service={service}
        title={running ? t(`items.${running}.title`) : ''}
        submitLabel={t('generate')}
        successTitle={t('requested')}
        demoTitle={t('demoTitle')}
        demoHint={t('demoHint')}
        fields={[
          { name: 'from', label: t('fields.from'), type: 'date', required: true },
          { name: 'to', label: t('fields.to'), type: 'date', required: true },
          {
            name: 'format',
            label: t('fields.format'),
            type: 'select',
            required: true,
            options: [
              { value: 'screen', label: t('formats.screen') },
              { value: 'pdf', label: t('formats.pdf') },
              { value: 'csv', label: t('formats.csv') },
            ],
          },
        ]}
      />
    </>
  );
}
