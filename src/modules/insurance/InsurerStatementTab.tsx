import { Banknote, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { DateField, Select } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { env } from '@/core/config/env';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { isoDay } from '@/utils/dates';
import { PDF_MIME, XLSX_MIME, downloadBytes, safeFilename } from '../_shared/export/download';
import { buildPdf } from '../_shared/export/pdf';
import { buildXlsx } from '../_shared/export/xlsx';
import { useMoney } from '../finance/use-finance';
import { OrganizationPaymentDialog } from './OrganizationPaymentDialog';
import { insurerStatement, type StatementEntry, type StatementInvoice } from './insurer-statement';
import type { FinanceSnapshot } from './types';

/** Situation d'un organisme : tout ce qui le concerne dans le système, sur une période, avec relevé exportable. */
export function InsurerStatementTab({ data }: { data: FinanceSnapshot }) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation();
  const f = useFormatters();
  const money = useMoney();
  const toast = useToast();
  const currency = data.invoices[0]?.invoice.currency ?? 'USD';
  const [orgId, setOrgId] = useState(data.organizations[0]?.id ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paying, setPaying] = useState(false);
  const { can } = usePermissions();
  const period = useMemo(() => ({ from: from || undefined, to: to || undefined }), [from, to]);
  const st = useMemo(() => (orgId ? insurerStatement(data, orgId, { from: from || undefined, to: to || undefined }) : null), [data, orgId, from, to]);
  const org = data.organizations.find((o) => o.id === orgId);

  const invoiceCols: Column<StatementInvoice>[] = [
    { id: 'n', header: t('columns.number'), cell: (r) => <code className="text-xs">{r.number}</code>, primary: true },
    { id: 'd', header: t('columns.date'), cell: (r) => f.date(r.date) },
    { id: 'p', header: t('columns.patient'), cell: (r) => r.patientName },
    { id: 'due', header: t('insurance.statement.due'), cell: (r) => money(r.due, currency), className: 'text-end tabular-nums' },
    { id: 'set', header: t('insurance.statement.settled'), cell: (r) => money(r.settled, currency), className: 'text-end tabular-nums' },
    { id: 'dis', header: t('insurance.statement.disputed'), cell: (r) => money(r.disputed + r.transferred, currency), className: 'text-end tabular-nums' },
    { id: 'out', header: t('insurance.statement.outstanding'), cell: (r) => <StatusBadge tone={r.outstanding > 0 ? 'warning' : 'success'}>{money(r.outstanding, currency)}</StatusBadge>, className: 'text-end' },
  ];
  const entryCols: Column<StatementEntry>[] = [
    { id: 'at', header: t('columns.date'), cell: (e) => f.dateTime(e.at), primary: true },
    { id: 'k', header: t('insurance.statement.kind'), cell: (e) => <StatusBadge tone={e.kind === 'insurerSettlement' ? 'success' : 'danger'}>{t(`ledger.${e.kind}`)}</StatusBadge> },
    { id: 'i', header: t('columns.number'), cell: (e) => <code className="text-xs">{e.invoiceNumber}</code> },
    { id: 'p', header: t('columns.patient'), cell: (e) => e.patientName },
    { id: 'a', header: t('insurance.statement.amount'), cell: (e) => <span className={e.reversed ? 'line-through' : ''}>{money(e.amount, currency)}</span>, className: 'text-end tabular-nums' },
    { id: 'r', header: t('detail.reference'), cell: (e) => e.reference ?? e.reason ?? '—' },
  ];

  function run(format: 'xlsx' | 'pdf'): void {
    if (!st || !org) return;
    try {
      const title = t('insurance.statement.title', { name: org.name });
      const now = new Date();
      const period = from || to ? `${from || '…'} → ${to || '…'}` : t('insurance.statement.allTime');
      const notes = [`${t('insurance.statement.period')} : ${period}`, `${tc('export.generatedAt')} ${f.dateTime(now)}`, ...(env.localMode ? [tc('export.demoMark')] : [])];
      const header = [t('columns.number'), t('columns.date'), t('columns.patient'), t('insurance.statement.due'), t('insurance.statement.settled'), t('insurance.statement.disputed'), t('insurance.statement.outstanding')];
      const m = (n: number): string => (n / 100).toFixed(2);
      const body = st.invoices.map((r) => [r.number, r.date.slice(0, 10), r.patientName, m(r.due), m(r.settled), m(r.disputed + r.transferred), m(r.outstanding)]);
      const total = [t('insurance.statement.total'), '', '', m(st.totals.due), m(st.totals.settled), m(st.totals.disputed + st.totals.transferred), m(st.totals.outstanding)];
      const name = safeFilename(`${t('insurance.statement.filename')}-${org.code}`, format, isoDay(0, now));
      if (format === 'xlsx') downloadBytes(name, buildXlsx(title, [[title], ...notes.map((n) => [n]), [], header, ...body, total]), XLSX_MIME);
      else downloadBytes(name, buildPdf({ title, notes, header, rows: [...body, total] }), PDF_MIME);
      toast({ tone: 'success', title: tc('export.done') });
    } catch {
      toast({ tone: 'danger', title: tc('export.failed') });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('insurance.statement.organization')}>
          {(c) => <Select {...c} value={orgId} onChange={(e) => setOrgId(e.target.value)}>{data.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}
        </FormField>
        <FormField label={t('insurance.statement.from')}>{(c) => <DateField {...c} value={from} onChange={(e) => setFrom(e.target.value)} />}</FormField>
        <FormField label={t('insurance.statement.to')}>{(c) => <DateField {...c} value={to} onChange={(e) => setTo(e.target.value)} />}</FormField>
        {can(P.billing.settle) && st && st.totals.outstanding > 0 && (
          <Button onClick={() => setPaying(true)}><Banknote aria-hidden className="size-4" />{t('orgPay.open')}</Button>
        )}
        <Dropdown label={t('insurance.statement.export')} trigger={<><Download aria-hidden className="size-4" /><span className="px-1 text-sm">{t('insurance.statement.export')}</span></>}>
          {(close) => (
            <>
              <DropdownItem icon={<FileSpreadsheet className="size-4" />} onClick={() => { close(); run('xlsx'); }}>{tc('export.excel')}</DropdownItem>
              <DropdownItem icon={<FileText className="size-4" />} onClick={() => { close(); run('pdf'); }}>{tc('export.pdf')}</DropdownItem>
            </>
          )}
        </Dropdown>
      </div>
      {paying && orgId && <OrganizationPaymentDialog data={data} organizationId={orgId} period={period} onClose={() => setPaying(false)} />}
      {st && org && (
        <>
          <Card title={org.name} description={`${t(`insurance.orgKind.${org.kind}`)} · ${t(`insurance.orgStatus.${org.status}`)} · ${org.contactPerson} ${org.phone}`}>
            <dl className="grid gap-3 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {([
                ['insurance.statement.invoices', String(st.totals.invoices)],
                ['insurance.statement.due', money(st.totals.due, currency)],
                ['insurance.statement.settled', money(st.totals.settled, currency)],
                ['insurance.statement.disputed', money(st.totals.disputed + st.totals.transferred, currency)],
                ['insurance.statement.outstanding', money(st.totals.outstanding, currency)],
                ['insurance.statement.patients', t('insurance.statement.patientsValue', { active: st.activeCoveredPatients, total: st.coveredPatients })],
              ] as const).map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{t(k)}</dt><dd className="text-base font-semibold tabular-nums">{v}</dd></div>)}
            </dl>
          </Card>
          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('insurance.statement.contracts')}</h3>
            {st.contracts.length === 0 ? <p className="text-sm text-muted-foreground">{t('insurance.statement.noContracts')}</p> : (
              <ul className="space-y-0.5 text-sm">{st.contracts.map((c) => <li key={c.id}>{c.label} · {c.validFrom} → {c.validTo} · {t(`insurance.contractStatus.${c.status}`)}</li>)}</ul>
            )}
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('insurance.statement.invoicesTitle')}</h3>
            <DataTable caption={t('insurance.statement.invoicesTitle')} columns={invoiceCols} rows={st.invoices} getRowId={(r) => r.invoiceId} emptyTitle={t('insurance.statement.empty')} />
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('insurance.statement.entriesTitle')}</h3>
            <DataTable caption={t('insurance.statement.entriesTitle')} columns={entryCols} rows={st.entries} getRowId={(e) => e.id} emptyTitle={t('insurance.statement.noEntries')} />
          </section>
        </>
      )}
    </div>
  );
}
