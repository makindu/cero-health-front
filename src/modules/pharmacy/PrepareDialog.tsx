import { useState } from 'react';
import { Autocomplete } from '@/components/forms/autocomplete';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { pharmacy } from './pharmacy';
import type { DispensationView, QueueRow, StockItemView } from './pharmacy-service';
import { usePharmacyMutation } from './use-pharmacy';
import { Input } from '@/components/forms/controls';
import { deviationKinds, MAX_DEVIATION_REASON, type DeviationKind } from './pharmacy-rules';
import { NumberInput } from '@/components/forms/number-input';
import { formatQty, isQuantity, parseNumberText } from '@/utils/numbers';

interface Row { rxLineIndex: number; itemId: string; quantity: string; reason: string }

/** Le pharmacien choisit LUI-MÊME le produit du stock correspondant à chaque ligne prescrite : aucune correspondance automatique. */
export function PrepareDialog({ row, items, onClose, onDone }: { row: QueueRow; items: StockItemView[]; onClose: () => void; onDone: (v: DispensationView) => void }) {
  const { t } = useTranslation('pharmacy');
  const rx = row.prescription;
  const [rows, setRows] = useState<Row[]>(rx.items.map((_i, k) => ({ rxLineIndex: k, itemId: '', quantity: row.remaining[k]! > 0 ? formatQty(row.remaining[k]!) : '0', reason: '' })));
  const create = usePharmacyMutation(pharmacy.prepare, { successTitle: t('done.prepare'), onDone });
  const chosen = rows.filter((r) => r.itemId && parseNumberText(r.quantity) > 0);
  const kindsOf = (r: Row): DeviationKind[] => {
    const item = items.find((i) => i.itemId === r.itemId);
    const q = parseNumberText(r.quantity);
    return item && isQuantity(q) ? deviationKinds({ rxLabel: rx.items[r.rxLineIndex]!.label, itemLabel: item.label, quantity: q, remaining: row.remaining[r.rxLineIndex]! }) : [];
  };
  const valid = chosen.length > 0 && chosen.every((r) => isQuantity(parseNumberText(r.quantity)) && parseNumberText(r.quantity) <= row.remaining[r.rxLineIndex]! && (kindsOf(r).length === 0 || r.reason.trim() !== ''));
  const set = (k: number, patch: Partial<Row>): void => setRows(rows.map((r) => (r.rxLineIndex === k ? { ...r, ...patch } : r)));
  return (
    <Dialog open onClose={onClose} title={t('prepare.title', { number: rx.number })} description={t('prepare.description')}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate({ prescriptionId: rx.id, lines: chosen.map((r) => ({ rxLineIndex: r.rxLineIndex, itemId: r.itemId, quantity: parseNumberText(r.quantity), reason: kindsOf(r).length > 0 ? r.reason : undefined })) })}>{t('prepare.submit')}</Button>
      </>}>
      <div className="space-y-3">
        <p className="text-sm font-medium">{rx.patientName}</p>
        {rx.items.map((it, k) => (
          <fieldset key={k} className="space-y-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">{it.label} × {it.quantity}</legend>
            <p className="text-xs text-muted-foreground">{[it.dosage, it.frequency, it.duration].filter(Boolean).join(' · ')} — {t('prepare.remaining', { count: row.remaining[k] })}</p>
            {row.remaining[k]! > 0 && (
              <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
                <FormField label={t('prepare.product')}>
                  {(c) => (
                    <Autocomplete {...c} items={items} value={rows[k]!.itemId} onChange={(id) => set(k, { itemId: id })} getKey={(i) => i.itemId} getLabel={(i) => i.label} getSearch={(i) => i.label}
                      emptyText={t('module.itemNoMatch')} placeholder={t('prepare.skip')}
                      renderOption={(i) => <><span className="font-medium">{i.label}</span><span className="ms-2 text-xs text-muted-foreground">{t('prepare.usable', { count: i.usable })}</span></>} />
                  )}
                </FormField>
                <FormField label={t('prepare.quantity')}>{(c) => <NumberInput {...c} decimal value={rows[k]!.quantity} onValueChange={(v) => set(k, { quantity: v })} />}</FormField>
              </div>
            )}
            {row.remaining[k]! > 0 && kindsOf(rows[k]!).length > 0 && (
              <FormField label={t('prepare.reason')} required hint={kindsOf(rows[k]!).map((x) => t(`prepare.deviation.${x}`)).join(' · ')}>
                {(c) => <Input {...c} maxLength={MAX_DEVIATION_REASON} placeholder={t('prepare.reasonPlaceholder')} value={rows[k]!.reason} onChange={(e) => set(k, { reason: e.target.value })} />}
              </FormField>
            )}
          </fieldset>
        ))}
        <p className="text-xs text-muted-foreground">{t('prepare.notice')}</p>
      </div>
    </Dialog>
  );
}
