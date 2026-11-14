import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Spinner } from '@/components/feedback/spinner';
import { useToast } from '@/components/feedback/toast';
import { DateField, Input, Select, Textarea } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { SearchInput } from '@/components/forms/search-input';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column, type SortState } from '@/components/tables/data-table';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Tabs } from '@/components/ui/tabs';
import { ApiError } from '@/core/api/types';

/** DONNÉES FICTIVES de démonstration : aucun patient réel. */
interface DemoRow {
  id: string;
  name: string;
  service: string;
  status: 'validated' | 'pending' | 'critical';
  lastVisit: string;
}
const DEMO_ROWS: DemoRow[] = Array.from({ length: 23 }, (_, i) => ({
  id: `DEMO-${String(i + 1).padStart(3, '0')}`,
  name: `Patient fictif ${i + 1}`,
  service: ['Médecine générale', 'Pédiatrie', 'Maternité'][i % 3] as string,
  status: (['validated', 'pending', 'critical'] as const)[i % 3] as DemoRow['status'],
  lastVisit: new Date(2025, 0, 1 + i).toISOString(),
}));
const PER_PAGE = 5;
const STATUS_TONE: Record<DemoRow['status'], StatusTone> = {
  validated: 'success',
  pending: 'warning',
  critical: 'danger',
};
const SWATCHES = ['primary', 'nav', 'success', 'warning', 'danger', 'info', 'neutral'] as const;

export default function DesignSystemPage() {
  const { t } = useTranslation('designSystem');
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>(null);

  const rows = useMemo(() => {
    const filtered = DEMO_ROWS.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()));
    if (!sort) return filtered;
    const key = sort.columnId as keyof DemoRow;
    return [...filtered].sort(
      (a, b) => String(a[key]).localeCompare(String(b[key])) * (sort.direction === 'asc' ? 1 : -1),
    );
  }, [query, sort]);

  const columns: Column<DemoRow>[] = [
    { id: 'name', header: t('table.name'), cell: (r) => r.name, sortable: true, primary: true },
    { id: 'id', header: t('table.id'), cell: (r) => r.id },
    { id: 'service', header: t('table.service'), cell: (r) => r.service, sortable: true },
    {
      id: 'status',
      header: t('table.status'),
      cell: (r) => <StatusBadge tone={STATUS_TONE[r.status]}>{t(`badges.${r.status}`)}</StatusBadge>,
    },
    { id: 'lastVisit', header: t('table.lastVisit'), cell: (r) => r.lastVisit.slice(0, 10) },
  ];

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <p role="note" className="mb-6 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning-ink">
        {t('demoBanner')}
      </p>

      <div className="space-y-6">
        <Card title={t('colors.title')} description={t('colors.description')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {SWATCHES.map((tone) => (
              <div key={tone} className="space-y-1.5 text-xs">
                <div
                  className="h-12 rounded-md border border-border"
                  style={{ background: `var(--${tone})` }}
                />
                <p className="font-medium">{tone}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('buttons.title')}>
          <div className="flex flex-wrap gap-3">
            <Button leftIcon={<Plus className="size-4" />}>{t('buttons.withIcon')}</Button>
            <Button variant="secondary">{t('buttons.secondary')}</Button>
            <Button variant="outline">{t('buttons.outline')}</Button>
            <Button variant="ghost">{t('buttons.ghost')}</Button>
            <Button variant="danger">{t('buttons.danger')}</Button>
            <Button loading>{t('buttons.loading')}</Button>
            <Button disabled>{t('buttons.disabled')}</Button>
          </div>
        </Card>

        <Card title={t('forms.title')}>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label={t('forms.fullName')} hint={t('forms.fullNameHint')} required>
              {(c) => <Input {...c} />}
            </FormField>
            <FormField label={t('forms.birthDate')}>{(c) => <DateField {...c} />}</FormField>
            <FormField label={t('forms.service')}>
              {(c) => (
                <Select {...c} defaultValue="">
                  <option value="" disabled>
                    {t('forms.servicePlaceholder')}
                  </option>
                  <option>{t('forms.serviceGeneral')}</option>
                  <option>{t('forms.servicePediatrics')}</option>
                  <option>{t('forms.serviceMaternity')}</option>
                </Select>
              )}
            </FormField>
            <FormField label={t('forms.withError')} error="validation.required" required>
              {(c) => <Input {...c} />}
            </FormField>
            <FormField label={t('forms.notes')} className="md:col-span-2">
              {(c) => <Textarea {...c} />}
            </FormField>
          </div>
        </Card>

        <Card title={t('badges.title')} description={t('badges.description')}>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="success">{t('badges.validated')}</StatusBadge>
            <StatusBadge tone="warning">{t('badges.pending')}</StatusBadge>
            <StatusBadge tone="danger">{t('badges.critical')}</StatusBadge>
            <StatusBadge tone="info">{t('badges.info')}</StatusBadge>
            <StatusBadge tone="neutral">{t('badges.inactive')}</StatusBadge>
          </div>
        </Card>

        <Card title={t('feedback.title')}>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-center rounded-md border border-border">
              <Spinner label={t('feedback.loading')} className="py-10" />
            </div>
            <div className="rounded-md border border-border">
              <EmptyState
                title={t('feedback.emptyTitle')}
                description={t('feedback.emptyDescription')}
              />
            </div>
            <div className="rounded-md border border-border">
              <ErrorState error={new ApiError('network', 'demo', { source: 'health' })} onRetry={() => undefined} />
            </div>
          </div>
        </Card>

        <Card title={t('dialogs.title')}>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setDialog(true)}>
              {t('dialogs.openDialog')}
            </Button>
            <Button variant="outline" onClick={() => setConfirm(true)}>
              {t('dialogs.openConfirm')}
            </Button>
          </div>
        </Card>

        <Card title={t('tabs.title')}>
          <Tabs
            ariaLabel={t('tabs.title')}
            tabs={[
              { id: 'identity', label: t('tabs.identity'), content: <p>{t('tabs.identityBody')}</p> },
              { id: 'clinical', label: t('tabs.clinical'), content: <p>{t('tabs.clinicalBody')}</p> },
              { id: 'billing', label: t('tabs.billing'), content: <p>{t('tabs.billingBody')}</p> },
            ]}
          />
        </Card>

        <Card title={t('toasts.title')}>
          <div className="flex flex-wrap gap-3">
            {(['success', 'warning', 'danger', 'info'] as const).map((tone) => (
              <Button
                key={tone}
                variant="outline"
                onClick={() => toast({ tone, title: t(`toasts.${tone}`), description: t('toasts.details') })}
              >
                {t(`toasts.${tone}`)}
              </Button>
            ))}
          </div>
        </Card>

        <Card
          title={t('table.title')}
          actions={
            <SearchInput
              label={t('table.searchLabel')}
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
            />
          }
          className="[&>div]:p-0"
        >
          <DataTable
            caption={t('table.caption')}
            columns={columns}
            rows={rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)}
            getRowId={(r) => r.id}
            emptyDescription={t('table.emptyFilter')}
            sort={sort}
            onSortChange={setSort}
            pagination={{ page, perPage: PER_PAGE, total: rows.length, onPageChange: setPage }}
          />
        </Card>
      </div>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title={t('dialogs.dialogTitle')}
        footer={<Button onClick={() => setDialog(false)}>OK</Button>}
      >
        <p className="text-sm">{t('dialogs.dialogBody')}</p>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        tone="danger"
        title={t('dialogs.confirmTitle')}
        description={t('dialogs.confirmBody')}
        confirmLabel={t('dialogs.confirmAction')}
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
