import { Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { NewArrivalsBanner } from '@/components/feedback/new-arrivals-banner';
import { useArrivalFocus, useCatalogArrivals } from '@/core/live/new-arrivals';
import { useToast } from '@/components/feedback/toast';
import { useQueryClient } from '@tanstack/react-query';
import { usePreferences } from '@/core/preferences/preferences-store';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/tables/data-table';
import { FormField } from '@/components/forms/form-field';
import { Input } from '@/components/forms/controls';
import { SearchInput } from '@/components/forms/search-input';
import { NumberInput } from '@/components/forms/number-input';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import type { CatalogItem } from '@/core/pricing/types';
import { checkCatalogDraft, matchesQuery, parsePrice, suggestCode, type CatalogProblem } from '../catalog/catalog-rules';
import { ActionDialog } from '../finance/ActionDialog';
import { useMoney } from '../finance/use-finance';
import { LabCatalogImportDialog } from './LabCatalogImportDialog';
import { fromMinor } from '../insurance/Shared';
import { loadLabArrivals, saveLabExam, useLabCatalog, useLabCatalogMutation } from './lab-catalog-api';

const PER_PAGE = 15;

/** Catalogue des examens de laboratoire (API réelle) : liste, ajout, modification et importation Excel, avec le prix. */
export function LabCatalogTab() {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const catalog = useLabCatalog();
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const all = catalog.data?.items ?? [];
  const currency = catalog.data?.currency ?? null;
  const rows = all.filter((i) => matchesQuery(search, i.label, i.code));
  const { activeFacilityId } = usePreferences();
  const queryClient = useQueryClient();
  const toast = useToast();
  const arrivals = useCatalogArrivals({ entities: ['lab_tests'], load: (ids) => loadLabArrivals(queryClient, activeFacilityId, ids) });
  useArrivalFocus(arrivals, all, { perPage: PER_PAGE, setPage, setSearch, onNone: () => toast({ tone: 'neutral', title: t('newArrival.none') }) });
  const arrivalMessage = arrivals.ids.length === 1 ? t('newArrival.lab.one') : t('newArrival.lab.many', { count: arrivals.ids.length });
  const columns: Column<CatalogItem>[] = [
    { id: 'code', header: t('insurance.catalog.code'), cell: (i) => <code className="text-xs">{i.code}</code> },
    { id: 'label', header: t('catalogManager.laboratory.label'), cell: (i) => (arrivals.fresh.has(i.id) ? <span className="inline-flex flex-wrap items-center gap-2">{i.label}<StatusBadge tone="success">{t('newArrival.badge')}</StatusBadge></span> : i.label), primary: true },
    { id: 'price', header: t('catalogManager.price'), cell: (i) => (i.price.currency && i.price.minor > 0 ? money(i.price.minor, i.price.currency) : '—'), className: 'text-end tabular-nums' },
    { id: 'active', header: t('columns.status'), cell: (i) => <StatusBadge tone={i.active ? 'success' : 'neutral'}>{i.active ? t('insurance.catalog.active') : t('insurance.catalog.inactive')}</StatusBadge> },
    { id: 'edit', header: '', cell: (i) => <Can permission={P.laboratory.catalog}><Button size="sm" variant="outline" onClick={() => setEditing(i)}>{t('common.edit')}</Button></Can> },
  ];
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('catalogManager.laboratory.hint')}</p>
        <Can permission={P.laboratory.catalog}>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" leftIcon={<Upload className="size-4" />} onClick={() => setImporting(true)}>{t('catalogImport.open')}</Button>
            <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>{t('catalogManager.laboratory.add')}</Button>
          </div>
        </Can>
      </div>
      {catalog.data && all.length > 0 && !currency && <p role="status" className="mb-3 text-sm text-muted-foreground">{t('labCatalog.noCurrency')}</p>}
      {arrivals.ids.length > 0 && <NewArrivalsBanner message={arrivalMessage} viewLabel={t('newArrival.view')} closeLabel={t('newArrival.close')} loading={arrivals.viewing} onView={() => void arrivals.view().catch(() => toast({ tone: 'danger', title: t('newArrival.failed') }))} onClose={arrivals.dismiss} />}
      <div className="mb-3"><SearchInput label={t('catalogManager.search')} placeholder={t('catalogManager.search')} value={search} onChange={(v) => { setSearch(v); setPage(1); }} /></div>
      <DataTable caption={t('catalogManager.laboratory.title')} columns={columns} rows={rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)} getRowId={(i) => i.id} rowClassName={(i) => (arrivals.fresh.has(i.id) ? 'bg-primary-soft' : undefined)}
        loading={catalog.isPending} error={catalog.error} onRetry={() => void catalog.refetch()} emptyTitle={t('catalogManager.laboratory.empty')}
        pagination={{ page, perPage: PER_PAGE, total: rows.length, onPageChange: setPage }} />
      {importing && <LabCatalogImportDialog existing={all} onClose={() => setImporting(false)} />}
      {editing && <LabExamForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} existing={all} currency={currency} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function LabExamForm({ initial, existing, currency, onClose }: { initial: CatalogItem | null; existing: CatalogItem[]; currency: string | null; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [v, setV] = useState({
    code: initial?.code ?? suggestCode('laboratory', existing),
    label: initial?.label ?? '',
    price: initial && initial.price.minor > 0 ? fromMinor(initial.price.minor).replace('.', ',') : '',
    active: initial?.active ?? true,
  });
  const [touched, setTouched] = useState(false);
  const save = useLabCatalogMutation(saveLabExam, { successTitle: t('done.saved'), onDone: onClose });
  const problems = checkCatalogDraft({ ...v, category: 'laboratory' }, existing, initial?.id);
  const has = (p: CatalogProblem) => touched && problems.includes(p);
  const err = (p: CatalogProblem, ...also: CatalogProblem[]) => ([p, ...also].some(has) ? t(`catalogManager.problem.${[p, ...also].find(has)!}`) : undefined);
  const submit = () => {
    setTouched(true);
    if (problems.length > 0) return;
    save.mutate({ code: v.code.trim().toUpperCase(), label: v.label.trim().replace(/\s+/g, ' '), price: parsePrice(v.price) as number, active: v.active });
  };
  return (
    <ActionDialog open onClose={onClose} title={t(initial ? 'catalogManager.laboratory.edit' : 'catalogManager.laboratory.add')} submitLabel={t('common.save')} pending={save.isPending} onSubmit={submit} onCancel={onClose}>
      <FormField label={t('catalogManager.laboratory.label')} required error={err('labelLength', 'labelTaken')}>
        {(c) => <Input {...c} autoFocus maxLength={120} value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={currency ? t('catalogManager.priceWithCurrency', { currency }) : t('catalogManager.price')} required error={err('priceInvalid')}>
          {(c) => <NumberInput {...c} decimal maxDecimals={2} value={v.price} onValueChange={(price) => setV({ ...v, price })} />}
        </FormField>
        <FormField label={t('insurance.catalog.code')} required hint={initial ? t('insurance.catalog.codeHint') : t('catalogManager.codeHint')} error={err('codeInvalid', 'codeTaken')}>
          {(c) => <Input {...c} disabled={Boolean(initial)} maxLength={20} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />}
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />{t('insurance.catalog.active')}</label>
          </ActionDialog>
  );
}
