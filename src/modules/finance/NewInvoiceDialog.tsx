import { Plus, Trash2 } from 'lucide-react';
import { PatientPicker } from '../_shared/pickers';
import { Autocomplete } from '@/components/forms/autocomplete';
import type { CatalogItem } from '@/core/pricing/types';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { Input, Select } from '@/components/forms/controls';
import { queryKeys } from '@/core/api/query-client';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { finance } from './finance';
import type { InvoiceView, PriceRequest } from './finance-service';
import { reasonText } from './reasons';
import { useBusinessMessage, useFinanceMutation, useFinanceSnapshot, useMoney } from './use-finance';
import { FeeStatusLine } from './FeeStatusLine';
import { NumberInput } from '@/components/forms/number-input';
import { DraftNotice } from '@/components/feedback/draft-notice';
import { usePersistentState } from '@/core/drafts/use-persistent-state';

interface Row { key: number; itemId: string; quantity: string }

export function NewInvoiceDialog({ onClose, onCreated, initialPatientId }: { onClose: () => void; onCreated: (view: InvoiceView) => void; initialPatientId?: string }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const describe = useBusinessMessage();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const snap = useFinanceSnapshot();
  // Brouillon automatique : la facture en cours de saisie survit à une fermeture involontaire ou à une coupure.
  const [form, setForm, draft] = usePersistentState(`invoice:new:${initialPatientId ?? ''}`, {
    patientId: initialPatientId ?? '', rows: [{ key: 1, itemId: '', quantity: '1' }] as Row[], primary: '', secondary: '', episodeId: '', forcePrivate: false,
  });
  const { patientId, rows, primary, secondary, episodeId, forcePrivate } = form;
  const setPatientId = (patientId: string): void => setForm((f) => ({ ...f, patientId }));
  const setRows = (rows: Row[]): void => setForm((f) => ({ ...f, rows }));
  const setPrimary = (primary: string): void => setForm((f) => ({ ...f, primary }));
  const setSecondary = (secondary: string): void => setForm((f) => ({ ...f, secondary }));
  const setEpisodeId = (episodeId: string): void => setForm((f) => ({ ...f, episodeId }));
  const setForcePrivate = (forcePrivate: boolean): void => setForm((f) => ({ ...f, forcePrivate }));

  const catalog = snap.data?.catalog.filter((c) => c.active) ?? [];
  const mine = useMemo(() => (snap.data?.coverages ?? []).filter((c) => c.patientId === patientId || c.beneficiaryIds.includes(patientId)), [snap.data, patientId]);
  const orgName = (id: string) => snap.data?.organizations.find((o) => o.id === id)?.name ?? id;

  const lines = rows.filter((r) => r.itemId && Number(r.quantity) > 0 && Number.isInteger(Number(r.quantity))).map((r) => ({ itemId: r.itemId, quantity: Number(r.quantity) }));
  const request: PriceRequest | null = patientId && lines.length > 0 && lines.length === rows.length
    ? { patientId, lines, primaryCoverageId: primary || undefined, secondaryCoverageId: secondary || undefined, episodeId: episodeId.trim() || undefined, forcePrivate: forcePrivate || undefined }
    : null;
  const preview = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'finance', 'preview', request),
    queryFn: () => finance.preview(request as PriceRequest),
    enabled: request !== null,
    retry: false,
  });
  const create = useFinanceMutation(finance.createInvoice, { successTitle: t('done.invoice'), onDone: (view) => { draft.clear(); onCreated(view); } });
  const previewError = preview.error ? (describe(preview.error) ?? t('preview.failed')) : null;

  return (
    <Dialog open onClose={onClose} title={t('new.title')} description={t('new.description')}
      footer={<>
        <Button variant="outline" onClick={() => { draft.clear(); onClose(); }}>{t('common.cancel')}</Button>
        <Button loading={create.isPending} disabled={!request || !preview.data || Boolean(previewError)} onClick={() => request && create.mutate(request)}>{t('new.submit')}</Button>
      </>}>
      <div className="space-y-4">
        {draft.restored && <DraftNotice onDiscard={draft.discard} />}
        <FormField label={t('columns.patient')} required>
          {(c) => (
            <PatientPicker {...c} value={patientId} onChange={(id) => { setPatientId(id); setPrimary(''); setSecondary(''); }} />
          )}
        </FormField>
        {patientId && <FeeStatusLine patientId={patientId} />}

        {mine.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {([['primary', primary, setPrimary], ['secondary', secondary, setSecondary]] as const).map(([name, value, set]) => (
              <FormField key={name} label={t(`new.${name}Coverage`)} hint={name === 'primary' ? t('new.primaryHint') : t('new.secondaryHint')}>
                {(c) => (
                  <Select {...c} value={value} onChange={(e) => set(e.target.value)}>
                    <option value="">{name === 'primary' ? t('new.autoCoverage') : t('new.noCoverage')}</option>
                    {mine.map((cov) => <option key={cov.id} value={cov.id}>{orgName(cov.organizationId)} · {t(`validation.${cov.status}`)}</option>)}
                  </Select>
                )}
              </FormField>
            ))}
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('new.lines')}</legend>
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_5rem_auto] items-end gap-2">
              <FormField label={t('detail.item')}>
                {(c) => (
                  <Autocomplete<CatalogItem> {...c} items={catalog} value={r.itemId} onChange={(id) => setRows(rows.map((x) => (x.key === r.key ? { ...x, itemId: id } : x)))}
                    getKey={(i) => i.id} getLabel={(i) => i.label} getSearch={(i) => `${i.label} ${i.code} ${i.category}`} emptyText={t('module.itemNoMatch')} placeholder={t('module.itemSearchPlaceholder')}
                    renderOption={(i) => <><span className="font-medium">{i.label}</span><span className="ms-2 text-xs text-muted-foreground">{i.code} · {money(i.price.minor, i.price.currency)}</span></>} />
                )}
              </FormField>
              <FormField label={t('detail.qty')}>
                {(c) => <NumberInput {...c} value={r.quantity} onValueChange={(v) => setRows(rows.map((x) => (x.key === r.key ? { ...x, quantity: v } : x)))} />}
              </FormField>
              <Button variant="ghost" size="icon" aria-label={t('new.removeLine')} disabled={rows.length === 1} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => setRows([...rows, { key: Math.max(...rows.map((x) => x.key)) + 1, itemId: '', quantity: '1' }])}>{t('new.addLine')}</Button>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('new.episode')} hint={t('new.episodeHint')}>{(c) => <Input {...c} value={episodeId} onChange={(e) => setEpisodeId(e.target.value)} />}</FormField>
          {can(P.insurance.authorize) && (
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={forcePrivate} onChange={(e) => setForcePrivate(e.target.checked)} />{t('new.forcePrivate')}</label>
          )}
        </div>

        {previewError && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger-ink">{previewError}</p>}
        {preview.data && !previewError && (
          <section aria-live="polite" className="space-y-2 rounded-md border border-border p-3 text-sm">
            <h3 className="font-semibold">{t('preview.title')}</h3>
            {preview.data.results.map((r, i) => (
              <div key={i} className="border-b border-border pb-2 last:border-0">
                <div className="flex justify-between font-medium"><span>{preview.data.items[i]?.label} × {r.quantity}</span><span className="tabular-nums">{money(r.billable.minor, r.currency)}</span></div>
                <div className="text-xs text-muted-foreground">
                  {t('detail.insurer')} {money(r.insurerShares.reduce((s, x) => s + x.amount.minor, 0), r.currency)} · {t('detail.subscription')} {money(r.subscriptionShare.minor, r.currency)} · {t('detail.patientShare')} {money(r.patientShare.minor, r.currency)}
                </div>
                {r.needsAuthorization && <StatusBadge tone="warning">{t('detail.needsAuthorization')}</StatusBadge>}
                <ul className="mt-1 list-disc ps-5 text-xs text-muted-foreground">{r.justification.map((j, k) => <li key={k}>{reasonText(t, j, (n) => money(n, r.currency))}</li>)}</ul>
              </div>
            ))}
            <div className="flex justify-between text-base font-semibold"><span>{t('preview.patientPays')}</span><span className="tabular-nums">{money(preview.data.totals.patient, preview.data.results[0]?.currency)}</span></div>
            <p className="text-xs text-muted-foreground">{t('preview.notConfirmed')}</p>
          </section>
        )}
      </div>
    </Dialog>
  );
}
