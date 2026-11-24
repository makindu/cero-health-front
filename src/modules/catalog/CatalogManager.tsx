import { Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { money as makeMoney } from '@/core/money/money';
import type { CatalogItem } from '@/core/pricing/types';
import { ActionDialog } from '../finance/ActionDialog';
import { finance } from '../finance/finance';
import { useFinanceMutation, useFinanceSnapshot, useMoney } from '../finance/use-finance';
import { pharmacy } from '../pharmacy/pharmacy';
import { holdsStock } from '../pharmacy/packaging';
import { usePharmacyMutation } from '../pharmacy/use-pharmacy';
import { loadPharmacyArrivals, usePharmacyCatalog } from '../pharmacy/catalog-api';
import { PharmacyCatalogImportDialog } from '../pharmacy/PharmacyCatalogImportDialog';
import { referenceFromApi } from '../_shared/reference-data';
import { fromMinor, toMinor } from '../insurance/Shared';
import { DraftNotice } from '@/components/feedback/draft-notice';
import { fingerprint } from '@/core/drafts/draft-store';
import { usePersistentState } from '@/core/drafts/use-persistent-state';
import { CatalogImportDialog } from './CatalogImportDialog';
import { checkCatalogDraft, matchesQuery, parsePrice, suggestCode, type CatalogProblem, type ManagedCategory } from './catalog-rules';

const PER_PAGE = 15;
const PERMISSION = { pharmacy: P.pharmacy.catalog, laboratory: P.laboratory.catalog } as const;

/** Liste + formulaire d'ajout/modification des médicaments ou des examens, avec leur prix. */
export function CatalogManager({ category }: { category: ManagedCategory }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const snapshot = useFinanceSnapshot();
  // API réelle : le catalogue de la pharmacie vient du serveur (prix UZISHA) ; mode local : instantané local.
  const apiPharmacy = referenceFromApi() && category === 'pharmacy';
  const apiCatalog = usePharmacyCatalog();
  const source = apiPharmacy ? apiCatalog : snapshot;
  const currencyKnown = !apiPharmacy || Boolean(apiCatalog.data?.currency);
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const all = apiPharmacy ? apiCatalog.data?.items ?? [] : snapshot.data?.catalog ?? [];
  const byCategory = all.filter((i) => i.category === category).sort((a, b) => a.label.localeCompare(b.label));
  const rows = byCategory.filter((i) => matchesQuery(search, i.label, i.code));
  const { activeFacilityId } = usePreferences();
  const queryClient = useQueryClient();
  const toast = useToast();
  const arrivals = useCatalogArrivals({ entities: ['catalog_items'], load: (ids) => loadPharmacyArrivals(queryClient, activeFacilityId, ids) });
  useArrivalFocus(arrivals, byCategory, { perPage: PER_PAGE, setPage, setSearch, onNone: () => toast({ tone: 'neutral', title: t('newArrival.none') }) });
  const arrivalMessage = arrivals.ids.length === 1 ? t('newArrival.item.one') : t('newArrival.item.many', { count: arrivals.ids.length });
  const permission = PERMISSION[category];
  const columns: Column<CatalogItem>[] = [
    { id: 'code', header: t('insurance.catalog.code'), cell: (i) => <code className="text-xs">{i.code}</code> },
    { id: 'label', header: t(`catalogManager.${category}.label`), cell: (i) => (arrivals.fresh.has(i.id) ? <span className="inline-flex flex-wrap items-center gap-2">{i.label}<StatusBadge tone="success">{t('newArrival.badge')}</StatusBadge></span> : i.label), primary: true },
    ...(category === 'pharmacy' ? [{ id: 'packaging', header: t('catalogManager.packaging.column'), cell: (i: CatalogItem) => packagingText(i, all, t) }] : []),
    { id: 'price', header: t('catalogManager.price'), cell: (i) => (i.price.currency && i.price.minor > 0 ? money(i.price.minor, i.price.currency) : '—'), className: 'text-end tabular-nums' },
    { id: 'active', header: t('columns.status'), cell: (i) => <StatusBadge tone={i.active ? 'success' : 'neutral'}>{i.active ? t('insurance.catalog.active') : t('insurance.catalog.inactive')}</StatusBadge> },
    { id: 'edit', header: '', cell: (i) => (holdsStock(i) ? <Can permission={permission}><Button size="sm" variant="outline" onClick={() => setEditing(i)}>{t('common.edit')}</Button></Can> : <span className="text-xs text-muted-foreground">{t('catalogManager.packaging.editViaProduct')}</span>) },
  ];
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t(`catalogManager.${category}.hint`)}</p>
        <div className="flex flex-wrap gap-2">
          {(category === 'laboratory' || apiPharmacy) && <Can permission={permission}><Button variant="outline" leftIcon={<Upload className="size-4" />} onClick={() => setImporting(true)}>{t('catalogImport.open')}</Button></Can>}
          <Can permission={permission}><Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>{t(`catalogManager.${category}.add`)}</Button></Can>
        </div>
      </div>
      {apiPharmacy && apiCatalog.data && all.length > 0 && !currencyKnown && <p role="status" className="mb-3 text-sm text-muted-foreground">{t('catalogManager.noCurrency')}</p>}
      {arrivals.ids.length > 0 && <NewArrivalsBanner message={arrivalMessage} viewLabel={t('newArrival.view')} closeLabel={t('newArrival.close')} loading={arrivals.viewing} onView={() => void arrivals.view().catch(() => toast({ tone: 'danger', title: t('newArrival.failed') }))} onClose={arrivals.dismiss} />}
      <div className="mb-3"><SearchInput label={t('catalogManager.search')} placeholder={t('catalogManager.search')} value={search} onChange={(v) => { setSearch(v); setPage(1); }} /></div>
      <DataTable caption={t(`catalogManager.${category}.title`)} columns={columns} rows={rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)} getRowId={(i) => i.id} rowClassName={(i) => (arrivals.fresh.has(i.id) ? 'bg-primary-soft' : undefined)}
        loading={source.isPending} error={source.error} onRetry={() => void source.refetch()} emptyTitle={t(`catalogManager.${category}.empty`)}
        pagination={{ page, perPage: PER_PAGE, total: rows.length, onPageChange: setPage }} />
      {importing && (apiPharmacy ? <PharmacyCatalogImportDialog existing={all} onClose={() => setImporting(false)} /> : <CatalogImportDialog existing={all} onClose={() => setImporting(false)} />)}
      {editing && (
        <CatalogItemForm key={editing === 'new' ? 'new' : editing.id} category={category} initial={editing === 'new' ? null : editing} existing={all}
          currency={all[0]?.price.currency || 'USD'} currencyKnown={currencyKnown} onClose={() => setEditing(null)} />
      )}
    </Card>
  );
}

function CatalogItemForm({ category, initial, existing, currency, currencyKnown, onClose }: {
  category: ManagedCategory; initial: CatalogItem | null; existing: CatalogItem[]; currency: string; currencyKnown: boolean; onClose: () => void;
}) {
  const { t } = useTranslation('finance');
  // Brouillon automatique (clé : catégorie + fiche + état de la fiche à l'ouverture).
  const draftKey = `catalog:${category}:${initial?.id ?? 'new'}:${fingerprint(initial ? [initial.label, initial.price.minor, initial.active, initial.unit, initial.stock] : null)}`;
  const [v, setV, dv] = usePersistentState(`${draftKey}:main`, {
    code: initial?.code ?? suggestCode(category, existing),
    label: initial?.label ?? '',
    price: initial ? fromMinor(initial.price.minor).replace('.', ',') : '',
    active: initial?.active ?? true,
  });
  const derived = initial ? existing.filter((i) => i.stock && i.stock.itemId === initial.id && i.id !== initial.id && i.active) : [];
  const [pack, setPack, dp] = usePersistentState(`${draftKey}:pack`, {
    perPack: String(initial?.stock?.perUnit ?? 1), unit: initial?.unit ?? '', baseUnit: initial?.baseUnit ?? '',
    extras: derived.map((d) => ({ key: d.id, id: d.id, label: d.unit ?? '', perUnit: String(d.stock!.perUnit), price: fromMinor(d.price.minor).replace('.', ',') })),
  });
  const packaged = category === 'pharmacy' && Number(pack.perPack) > 1;
  const [touched, setTouched] = useState(false);
  const clearDraft = (): void => { dv.clear(); dp.clear(); };
  const discardDraft = (): void => { dv.discard(); dp.discard(); };
  const save = useFinanceMutation(finance.saveCatalogItem, { successTitle: t('done.saved'), onDone: () => { clearDraft(); onClose(); } });
  const savePharmacy = usePharmacyMutation(pharmacy.saveProduct, { successTitle: t('done.saved'), onDone: () => { clearDraft(); onClose(); } });
  const problems = checkCatalogDraft({ ...v, category }, existing, initial?.id);
  const has = (p: CatalogProblem) => touched && problems.includes(p);
  const err = (p: CatalogProblem, ...also: CatalogProblem[]) => ([p, ...also].some(has) ? t(`catalogManager.problem.${[p, ...also].find(has)!}`) : undefined);
  const submit = () => {
    setTouched(true);
    if (problems.length > 0) return;
    const item: CatalogItem = { id: initial?.id ?? `cat-${globalThis.crypto.randomUUID().slice(0, 8)}`, code: v.code.trim().toUpperCase(), label: v.label.trim().replace(/\s+/g, ' '), category, price: makeMoney(toMinor(String(parsePrice(v.price))), currency), active: v.active };
    if (category !== 'pharmacy') return save.mutate(item);
    savePharmacy.mutate({
      item,
      packaging: {
        perPack: Number(pack.perPack || 1), unit: pack.unit, baseUnit: pack.baseUnit,
        extras: pack.extras.map((e) => ({ id: e.id, label: e.label, perUnit: Number(e.perUnit), price: parsePrice(e.price) ?? 0 })),
      },
    });
  };
  return (
    <ActionDialog open onClose={onClose} title={t(`catalogManager.${category}.${initial ? 'edit' : 'add'}`)} submitLabel={t('common.save')} pending={save.isPending || savePharmacy.isPending} onSubmit={submit} onCancel={() => { clearDraft(); onClose(); }}>
      {(dv.restored || dp.restored) && <DraftNotice onDiscard={discardDraft} />}
      <FormField label={t(`catalogManager.${category}.label`)} required error={err('labelLength', 'labelTaken')}>
        {(c) => <Input {...c} autoFocus maxLength={120} value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={currencyKnown ? t('catalogManager.priceWithCurrency', { currency }) : t('catalogManager.price')} required error={err('priceInvalid')}>
          {(c) => <NumberInput {...c} decimal maxDecimals={2} value={v.price} onValueChange={(price) => setV({ ...v, price })} />}
        </FormField>
        <FormField label={t('insurance.catalog.code')} required hint={initial ? t('insurance.catalog.codeHint') : t('catalogManager.codeHint')} error={err('codeInvalid', 'codeTaken')}>
          {(c) => <Input {...c} disabled={Boolean(initial)} maxLength={20} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />}
        </FormField>
      </div>
      {category === 'pharmacy' && (
        <fieldset className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t('catalogManager.packaging.title')}</legend>
          <p className="text-xs text-muted-foreground">{t('catalogManager.packaging.hint')}</p>
          <FormField label={t('catalogManager.packaging.perPack')} hint={t('catalogManager.packaging.perPackHint')}>
            {(c) => <NumberInput {...c} className="max-w-40" value={pack.perPack} onValueChange={(perPack) => setPack({ ...pack, perPack })} />}
          </FormField>
          {packaged && (
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <FormField label={t('catalogManager.packaging.unit')} required>{(c) => <Input {...c} maxLength={30} placeholder={t('catalogManager.packaging.unitExample')} value={pack.unit} onChange={(e) => setPack({ ...pack, unit: e.target.value })} />}</FormField>
              <FormField label={t('catalogManager.packaging.baseUnit')} required>{(c) => <Input {...c} maxLength={30} placeholder={t('catalogManager.packaging.baseExample')} value={pack.baseUnit} onChange={(e) => setPack({ ...pack, baseUnit: e.target.value })} />}</FormField>
            </div>
          )}
          {packaged && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('catalogManager.packaging.extras')}</p>
              {pack.extras.map((e) => (
                <div key={e.key} className="grid grid-cols-[1fr_6rem_6rem_auto] items-end gap-2">
                  <FormField label={t('catalogManager.packaging.extraLabel')}>{(c) => <Input {...c} maxLength={30} placeholder={pack.baseUnit} value={e.label} onChange={(ev) => setPack({ ...pack, extras: pack.extras.map((x) => (x.key === e.key ? { ...x, label: ev.target.value } : x)) })} />}</FormField>
                  <FormField label={t('catalogManager.packaging.extraContent', { unit: pack.baseUnit || '…' })}>{(c) => <NumberInput {...c} value={e.perUnit} onValueChange={(perUnit) => setPack({ ...pack, extras: pack.extras.map((x) => (x.key === e.key ? { ...x, perUnit } : x)) })} />}</FormField>
                  <FormField label={currencyKnown ? t('catalogManager.packaging.extraPrice', { currency }) : t('catalogManager.price')}>{(c) => <NumberInput {...c} decimal maxDecimals={2} value={e.price} onValueChange={(price) => setPack({ ...pack, extras: pack.extras.map((x) => (x.key === e.key ? { ...x, price } : x)) })} />}</FormField>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPack({ ...pack, extras: pack.extras.filter((x) => x.key !== e.key) })}>{t('catalogManager.packaging.remove')}</Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" disabled={pack.extras.length >= 4} onClick={() => setPack({ ...pack, extras: [...pack.extras, { key: `new-${Date.now()}`, id: undefined as unknown as string, label: '', perUnit: '1', price: '' }] })}>{t('catalogManager.packaging.addExtra')}</Button>
            </div>
          )}
        </fieldset>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />{t('insurance.catalog.active')}</label>
      <p className="text-xs text-muted-foreground">{t('insurance.catalog.hint')}</p>
    </ActionDialog>
  );
}

/** « 1 boîte = 100 comprimés » pour un produit conditionné ; « Unité de … » pour une unité dérivée. */
function packagingText(i: CatalogItem, all: readonly CatalogItem[], t: TFunction): string {
  if (!holdsStock(i)) {
    const parent = all.find((x) => x.id === i.stock?.itemId);
    return t('catalogManager.packaging.derived', { unit: i.unit ?? '', perUnit: i.stock?.perUnit ?? 1, product: parent?.label ?? '' });
  }
  return i.stock && i.stock.perUnit > 1 ? `1 ${i.unit ?? ''} = ${i.stock.perUnit} ${i.baseUnit ?? ''}` : '—';
}
