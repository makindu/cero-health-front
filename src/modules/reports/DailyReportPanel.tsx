import { FileSpreadsheet, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { useMoney } from '../finance/use-finance';
import { DAILY_COLUMNS, apiDaily, dailyPeriodError, type DailyLine } from './daily-report-api';

const LABEL: Record<string, string> = { consultation: 'Consultation', laboratory: 'Laboratoire', care: 'Soins', medications: 'Médicaments', hospitalization: 'Hospitalisation et dette payée' };

/**
 * Rapport journalier : recettes par nature d'acte, sorties et solde, dans la devise par défaut de l'établissement.
 * Les chiffres viennent du serveur (qui convertit chaque montant au taux de son jour) ; l'écran n'additionne rien.
 */
export function DailyReportPanel({ from, to, units }: { from: string; to: string; units: string[] }) {
  const { t } = useTranslation('reports');
  const { t: tc } = useTranslation();
  const f = useFormatters();
  const money = useMoney();
  const toast = useToast();
  const { activeFacilityId } = usePreferences();
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const invalid = dailyPeriodError(from, to);
  const query = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'reports', 'daily', from, to, units.join(',')),
    queryFn: () => apiDaily.report(from, to, units),
    enabled: invalid === null, retry: false,
  });
  const r = query.data;
  const col = (c: string): string => t(`daily.cols.${c}`, { defaultValue: LABEL[c] ?? c });
  const error = query.error ? describeBusinessError(tc, query.error) ?? tc('module.saveFailedHint') : null;

  const download = async (format: 'xlsx' | 'pdf'): Promise<void> => {
    setBusy(format);
    try { await apiDaily.download(format, from, to, units); } catch (e) {
      toast({ tone: 'danger', title: describeBusinessError(tc, e) ?? tc('module.saveFailed') });
    } finally { setBusy(null); }
  };

  const cells = (l: DailyLine, bold = false) => (
    <>
      {DAILY_COLUMNS.map((c) => <td key={c} className="py-1.5 pe-3 text-end tabular-nums">{money(l.amounts[c], r?.currency)}</td>)}
      <td className="py-1.5 pe-3 text-end font-semibold tabular-nums">{money(l.receiptsMinor, r?.currency)}</td>
      <td className="py-1.5 pe-3 text-end tabular-nums">{money(l.expensesMinor, r?.currency)}</td>
      <td className={`py-1.5 pe-3 text-end tabular-nums ${bold ? 'font-semibold' : ''}`}>{money(l.balanceMinor, r?.currency)}</td>
    </>
  );
  const head = (first: string[]) => (
    <tr className="text-muted-foreground">
      {first.map((h) => <th key={h} scope="col" className="py-1 pe-3 text-start font-medium">{h}</th>)}
      {DAILY_COLUMNS.map((c) => <th key={c} scope="col" className="py-1 pe-3 text-end font-medium">{col(c)}</th>)}
      <th scope="col" className="py-1 pe-3 text-end font-medium">{t('daily.cols.receipts', { defaultValue: 'Total recettes' })}</th>
      <th scope="col" className="py-1 pe-3 text-end font-medium">{t('daily.cols.expenses', { defaultValue: 'Sorties / dépenses' })}</th>
      <th scope="col" className="py-1 pe-3 text-end font-medium">{t('daily.cols.balance', { defaultValue: 'Solde du jour' })}</th>
    </tr>
  );

  return (
    <section className="mt-6" aria-live="polite" aria-busy={query.isFetching}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t('daily.title', { defaultValue: 'Rapport journalier' })}</h2>
          {r && <p className="text-sm text-muted-foreground">{t('daily.currency', { defaultValue: 'Montants en {{currency}}, convertis au taux de change de chaque jour.', currency: r.currency })}</p>}
        </div>
        {r && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" loading={busy === 'pdf'} leftIcon={<FileText className="size-4" />} onClick={() => void download('pdf')}>{t('exportPdf')}</Button>
            <Button variant="outline" size="sm" loading={busy === 'xlsx'} leftIcon={<FileSpreadsheet className="size-4" />} onClick={() => void download('xlsx')}>{t('exportXlsx')}</Button>
          </div>
        )}
      </div>
      {invalid && <p role="alert" className="text-sm text-danger-ink">{t(`daily.period.${invalid}`, { defaultValue: invalid === 'tooLong' ? 'Le rapport journalier couvre 31 jours au plus.' : 'Choisissez une période valide.' })}</p>}
      {query.isFetching && <p className="text-sm text-muted-foreground">{t('loading')}</p>}
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      {r && r.warnings.length > 0 && <p role="alert" className="mb-3 rounded-md border border-border p-3 text-sm">{r.warnings.join(' ')}</p>}
      {r && !query.isFetching && r.days.every((d) => d.receiptsMinor === 0 && d.expensesMinor === 0) && <EmptyState title={t('empty')} />}
      {r && !query.isFetching && (
        <div className="space-y-5">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>{head([t('daily.cols.date', { defaultValue: 'Date' })])}</thead>
                <tbody>
                  {r.days.map((d) => (
                    <tr key={d.date} className="border-t border-border align-top">
                      <th scope="row" className="py-1.5 pe-3 text-start font-normal">{f.date(d.date)}</th>{cells(d)}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-semibold">
                    <th scope="row" className="py-1.5 pe-3 text-start">{t('daily.total', { defaultValue: 'Total' })}</th>{cells(r.totals, true)}
                  </tr>
                </tbody>
              </table>
            </div>
            {r.days.some((d) => d.observations !== '') && (
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {r.days.filter((d) => d.observations !== '').map((d) => <li key={d.date}><span className="font-medium text-foreground">{f.date(d.date)}</span> : {d.observations}</li>)}
              </ul>
            )}
          </Card>
          {r.byUnit.length > 0 && (
            <Card>
              <h3 className="mb-2 font-medium">{t('daily.byUnit', { defaultValue: 'Par service et par date' })}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>{head([t('daily.cols.date', { defaultValue: 'Date' }), t('daily.cols.unit', { defaultValue: 'Service' })])}</thead>
                  <tbody>
                    {r.byUnit.map((u) => (
                      <tr key={`${u.date}|${u.unit}`} className="border-t border-border">
                        <th scope="row" className="py-1.5 pe-3 text-start font-normal">{f.date(u.date)}</th>
                        <td className="py-1.5 pe-3">{u.unit !== '' ? u.unit : t('values.noUnit', { defaultValue: 'Sans service' })}</td>{cells(u)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
