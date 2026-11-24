import { Activity, BedDouble, CalendarClock, FileSpreadsheet, FileText, FlaskConical, ScrollText, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/forms/controls';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { useAuth } from '@/core/auth/cero-id';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { buildDocumentPdf } from '../_shared/export/document-pdf';
import { PDF_MIME, XLSX_MIME, downloadBytes, safeFilename } from '../_shared/export/download';
import { buildXlsx } from '../_shared/export/xlsx';
import { useMoney } from '../finance/use-finance';
import { API_REPORTS, defaultPeriod, fetchReport, periodError, reportBlocks, reportGrid, type ApiReportId, type ReportResult } from './reports-api';

const ICONS: Record<ApiReportId, LucideIcon> = { activity: Activity, appointments: CalendarClock, laboratory: FlaskConical, hospitalization: BedDouble, finance: TrendingUp };
/** Rapports qui ont déjà leur propre écran (avec leurs exports) : on y renvoie au lieu de les refaire. */
const OTHER_SCREENS: readonly { id: 'cash' | 'audit'; icon: LucideIcon; path: string }[] = [
  { id: 'cash', icon: Wallet, path: '/cash' },
  { id: 'audit', icon: ScrollText, path: '/audit' },
];

/** Rapports (API réelle) : comptages et totaux de l'établissement sur une période, avec export Excel. */
export function ReportsApiScreen() {
  const { t } = useTranslation('reports');
  const { t: tc } = useTranslation();
  const f = useFormatters();
  const money = useMoney();
  const { activeFacilityId } = usePreferences();
  const { activeFacility } = useAuth();
  const [period, setPeriod] = useState(defaultPeriod);
  const [selected, setSelected] = useState<ApiReportId | null>(null);
  const invalid = periodError(period.from, period.to);

  const query = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'reports', selected, period.from, period.to),
    queryFn: () => fetchReport(selected as ApiReportId, period.from, period.to),
    enabled: selected !== null && invalid === null,
    retry: false,
  });

  const valueLabel = (v: string) => t(`values.${v}`, { defaultValue: v });
  const cell = (section: string, col: string, row: Record<string, string | number>): string => {
    const v = row[col];
    if (col === 'key') {
      if (section === 'summary') return t(`metrics.${String(v)}`, { defaultValue: String(v) });
      if (section === 'byDay') return f.date(String(v));
      if (section === 'byStatus' || section === 'byPriority') return valueLabel(String(v));
      return String(v);
    }
    if (col === 'status' || col === 'method') return valueLabel(String(v));
    if (col.endsWith('_minor')) return money(Number(v), String(row.currency ?? 'USD'));
    if (col === 'count' && section === 'summary' && row.key === 'avgMinutes') return t('minutes', { count: Number(v) });
    return typeof v === 'number' ? f.number(v) : String(v ?? '');
  };
  const labels = (result: ReportResult) => ({
    title: t(`items.${result.report}.title`),
    section: (k: string) => t(`sections.${k}`, { defaultValue: k }),
    column: (c: string) => t(`cols.${c}`, { defaultValue: c }),
    cell,
  });

  const exportXlsx = (result: ReportResult) => {
    const bytes = buildXlsx(t(`items.${result.report}.title`).slice(0, 30), reportGrid(result, labels(result)));
    downloadBytes(safeFilename(`rapport-${result.report}`, 'xlsx', result.to), bytes, XLSX_MIME);
  };

  const exportPdf = (result: ReportResult) => {
    const title = t(`items.${result.report}.title`);
    const name = activeFacility?.name ?? '';
    const bytes = buildDocumentPdf(reportBlocks(result, labels(result)), {
      title,
      footer: `${title} ${result.from} – ${result.to}`,
      letterhead: name !== '' ? { name, lines: [] } : undefined,
      confidential: t('pdfConfidential'),
      pageLabel: t('pdfPage'),
    });
    downloadBytes(safeFilename(`rapport-${result.report}`, 'pdf', result.to), bytes, PDF_MIME);
  };

  const error = query.error ? describeBusinessError(tc, query.error) ?? tc('module.saveFailedHint') : null;

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitleApi')} />
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            {t('fields.from')}
            <Input type="date" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} />
          </label>
          <label className="flex flex-col text-sm">
            {t('fields.to')}
            <Input type="date" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} />
          </label>
          {invalid && <p role="alert" className="text-sm text-danger-ink">{t(`period.${invalid}`)}</p>}
        </div>
      </Card>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {API_REPORTS.map((id) => {
          const Icon = ICONS[id];
          return (
            <li key={id}>
              <Card className="h-full">
                <div className="flex h-full flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-ink"><Icon aria-hidden className="size-5" /></span>
                    <div>
                      <h2 className="font-semibold">{t(`items.${id}.title`)}</h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">{t(`items.${id}.descriptionApi`)}</p>
                    </div>
                  </div>
                  <div className="mt-auto">
                    <Can permission={PERMISSIONS.reports.view}>
                      <Button variant={selected === id ? 'primary' : 'outline'} size="sm" onClick={() => setSelected(id)} disabled={invalid !== null}>{t('generate')}</Button>
                    </Can>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
        {OTHER_SCREENS.map(({ id, icon: Icon, path }) => (
          <li key={id}>
            <Card className="h-full">
              <div className="flex h-full flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-ink"><Icon aria-hidden className="size-5" /></span>
                  <div>
                    <h2 className="font-semibold">{t(`items.${id}.title`)}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t(`otherScreen.${id}`)}</p>
                  </div>
                </div>
                <div className="mt-auto"><Link to={path} className="text-sm font-medium text-primary underline">{t('open')}</Link></div>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {selected && (
        <section className="mt-6" aria-live="polite" aria-busy={query.isPending && query.fetchStatus !== 'idle'}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t(`items.${selected}.title`)}</h2>
            {query.data && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" leftIcon={<FileText className="size-4" />} onClick={() => exportPdf(query.data)}>{t('exportPdf')}</Button>
                <Button variant="outline" size="sm" leftIcon={<FileSpreadsheet className="size-4" />} onClick={() => exportXlsx(query.data)}>{t('exportXlsx')}</Button>
              </div>
            )}
          </div>
          {query.isFetching && <p className="text-sm text-muted-foreground">{t('loading')}</p>}
          {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
          {query.data && !query.isFetching && query.data.sections.every((s) => s.rows.length === 0) && <EmptyState title={t('empty')} />}
          {query.data && !query.isFetching && (
            <div className="space-y-5">
              {query.data.sections.filter((s) => s.rows.length > 0).map((s) => (
                <Card key={s.key}>
                  <h3 className="mb-2 font-medium">{t(`sections.${s.key}`, { defaultValue: s.key })}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-start text-muted-foreground">
                          {s.columns.map((c) => <th key={c} scope="col" className={`py-1 pe-4 font-medium ${c === 'key' || c === 'currency' || c === 'status' || c === 'method' ? 'text-start' : 'text-end'}`}>{t(`cols.${c}`, { defaultValue: c })}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {s.rows.map((row, i) => (
                          <tr key={i} className="border-t border-border">
                            {s.columns.map((c) => <td key={c} className={`py-1.5 pe-4 ${c === 'key' || c === 'currency' || c === 'status' || c === 'method' ? '' : 'text-end tabular-nums'}`}>{cell(s.key, c, row)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
