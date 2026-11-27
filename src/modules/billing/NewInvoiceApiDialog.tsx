import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Autocomplete } from '@/components/forms/autocomplete';
import { Input, Select } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { NumberInput } from '@/components/forms/number-input';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ApiError, healthClient } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useCareUnits } from '../_shared/reference-data';
import { PatientPicker } from '../_shared/pickers';
import { useMoney } from '../finance/use-finance';
import { apiDirect } from './billing-api';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const MAX_PAGES = 30;

/** Un article vendable : prestation, ou produit vendu par boîte / par comprimé (chaque unité est un article du catalogue). */
export interface Sellable { id: string; label: string; unit: string; stocked: boolean; priceMinor: number | null; currency: string }

const STOCKED = ['medication', 'consumable', 'medical_device'];

export function sellableFrom(r: Row): Sellable {
  const a = rec(r.article);
  const name = s(a.name) || s(r.generic_name);
  const strength = s(r.strength);
  const unit = s(r.unit_label);
  const price = r.price_minor === null || r.price_minor === undefined ? null : Number(r.price_minor);
  return {
    id: s(r.id),
    label: strength && !name.includes(strength) ? `${name} ${strength}` : name,
    unit,
    stocked: STOCKED.includes(s(r.nature)),
    priceMinor: price !== null && Number.isFinite(price) ? price : null,
    currency: s(r.currency),
  };
}

async function fetchSellables(): Promise<Sellable[]> {
  const out: Sellable[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await healthClient.get<Row[]>('/catalog-items', { params: { per_page: 100, page, is_active: 'true' } });
    for (const r of Array.isArray(res.data) ? res.data : []) out.push(sellableFrom(rec(r)));
    if (page >= (res.meta?.lastPage ?? 1)) break;
  }
  return out.filter((i) => i.label !== '').sort((a, b) => a.label.localeCompare(b.label));
}

interface Line { key: number; itemId: string; quantity: string }

/**
 * Nouvelle facture directe (comptoir, mode API) : patient, prestations et produits du catalogue (boîte, comprimé…), quantité, épisode.
 * Le serveur calcule les prix, applique l'assurance et la remise, puis sort le stock du dépôt (lots les plus proches de la péremption d'abord).
 */
export function NewInvoiceApiDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (linkId: string) => void }) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const money = useMoney();
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const units = useCareUnits();
  const [patientId, setPatientId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: 1, itemId: '', quantity: '1' }]);
  const [episode, setEpisode] = useState('');
  const [careUnit, setCareUnit] = useState('');
  const [forcePrivate, setForcePrivate] = useState(false);
  const [discount, setDiscount] = useState('');
  const [reason, setReason] = useState('');
  const idemKey = useRef(`dir-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

  const catalog = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'billing', 'sellables'),
    queryFn: fetchSellables,
    staleTime: 30_000,
  });
  const items = catalog.data ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const chosen = lines.filter((l) => l.itemId !== '');
  const needsUnit = chosen.some((l) => byId.get(l.itemId)?.stocked);
  const valid = patientId !== '' && chosen.length > 0 && chosen.length === lines.length
    && lines.every((l) => Number.isInteger(Number(l.quantity)) && Number(l.quantity) >= 1 && Number(l.quantity) <= 999)
    && (!needsUnit || careUnit !== '');
  const discountBp = Math.round(Math.max(0, Math.min(100, Number(discount.replace(',', '.')) || 0)) * 100);
  const canDiscount = can(P.billing.discount);

  const create = useMutation({
    mutationFn: () => apiDirect.create(patientId, {
      lines: lines.map((l) => ({ catalog_item_id: Number(l.itemId), quantity: Number(l.quantity) })),
      ...(careUnit ? { care_unit_id: Number(careUnit) } : {}),
      ...(episode.trim() ? { episode: episode.trim() } : {}),
      ...(forcePrivate ? { force_private: true } : {}),
      ...(discountBp > 0 ? { discount_bp: discountBp, discount_reason: reason.trim() } : {}),
    }, idemKey.current),
    onSuccess: (link) => {
      void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'billing') });
      toast({ tone: 'success', title: t('apiBilling.invoiceCreated', { defaultValue: 'Facture créée' }) });
      onCreated(link.id);
    },
    onError: (error) => {
      idemKey.current = `dir-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      if (error instanceof ApiError && (error.kind === 'forbidden' || error.kind === 'unauthorized' || error.kind === 'rate_limited')) {
        // Refus de droits : message clair et traduit (jamais le texte technique « Erreur serveur »).
        toast({ tone: 'danger', title: tc(`errors.kind.${error.kind}.title`), description: error.kind === 'forbidden' ? t('apiBilling.noInvoiceRight', { defaultValue: 'Il vous manque le droit de créer une facture (health.billing.invoice). Demandez à l’administrateur de l’ajouter à votre rôle.' }) : tc(`errors.kind.${error.kind}.description`) });
        return;
      }
      toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('module.saveFailed'), description: error instanceof ApiError ? undefined : t('module.saveFailedHint') });
    },
  });

  const setLine = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const optionText = (i: Sellable) => (i.unit ? `${i.label} — ${i.unit}` : i.label);

  return (
    <Dialog open onClose={onClose} variant="center" title={t('new.title')} description={t('new.description')}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('common.cancel', { defaultValue: 'Annuler' })}</Button>
        <Button loading={create.isPending} disabled={!valid || (discountBp > 0 && reason.trim() === '')} onClick={() => create.mutate()}>{t('new.submit')}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label={t('columns.patient')} required>
          {(c) => <PatientPicker {...c} value={patientId} onChange={setPatientId} />}
        </FormField>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('new.lines')}</legend>
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-[1fr_5rem_auto] items-end gap-2">
              <FormField label={t('detail.item')}>
                {(c) => (
                  <Autocomplete<Sellable> {...c} items={items} value={l.itemId} onChange={(id) => setLine(l.key, { itemId: id })}
                    getKey={(i) => i.id} getLabel={optionText} getSearch={(i) => `${i.label} ${i.unit}`}
                    emptyText={t('module.itemNoMatch')} placeholder={t('module.itemSearchPlaceholder')}
                    renderOption={(i) => <><span className="font-medium">{optionText(i)}</span>{i.priceMinor !== null && <span className="ms-2 text-xs text-muted-foreground">{money(i.priceMinor, i.currency || undefined)}</span>}</>} />
                )}
              </FormField>
              <FormField label={t('detail.qty')}>
                {(c) => <NumberInput {...c} value={l.quantity} onValueChange={(v) => setLine(l.key, { quantity: v })} />}
              </FormField>
              <Button variant="ghost" size="icon" aria-label={t('new.removeLine')} disabled={lines.length === 1} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => setLines([...lines, { key: Math.max(...lines.map((x) => x.key)) + 1, itemId: '', quantity: '1' }])}>{t('new.addLine')}</Button>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('new.episode')} hint={t('new.episodeHint')}>{(c) => <Input {...c} value={episode} onChange={(e) => setEpisode(e.target.value)} />}</FormField>
          {(
            <FormField label={needsUnit ? t('apiBilling.careUnit', { defaultValue: 'Unité de soin (dépôt du stock)' }) : t('apiBilling.service', { defaultValue: 'Service (pour les rapports)' })} required={needsUnit}>
              {(c) => (
                <Select {...c} value={careUnit} onChange={(e) => setCareUnit(e.target.value)}>
                  <option value="">{t('apiBilling.chooseUnit', { defaultValue: 'Choisir une unité' })}</option>
                  {(units.data ?? []).filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              )}
            </FormField>
          )}
        </div>

        {(canDiscount || can(P.insurance.authorize)) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {canDiscount && (
              <>
                <FormField label={t('apiBilling.discount', { defaultValue: 'Remise (%)' })}>{(c) => <NumberInput {...c} decimal maxDecimals={2} value={discount} onValueChange={setDiscount} />}</FormField>
                {discountBp > 0 && <FormField label={t('apiBilling.discountReason', { defaultValue: 'Motif de la remise' })} required>{(c) => <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>}
              </>
            )}
            {can(P.insurance.authorize) && (
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={forcePrivate} onChange={(e) => setForcePrivate(e.target.checked)} />{t('new.forcePrivate')}</label>
            )}
          </div>
        )}
        {needsUnit && <p className="text-xs text-muted-foreground">{t('apiBilling.stockOut', { defaultValue: 'Les produits sortent du stock dès la création de la facture (lots les plus proches de la péremption d’abord).' })}</p>}
      </div>
    </Dialog>
  );
}
