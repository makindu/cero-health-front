import { Plus, Trash2 } from 'lucide-react';
import { PatientPicker } from '../_shared/pickers';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { Input, Textarea } from '@/components/forms/controls';
import { SuggestInput } from '@/components/forms/suggest-input';
import { useMoney, useFinanceSnapshot } from '../finance/use-finance';
import { rx } from './rx';
import type { Rx, RxItem } from './rx-rules';
import { useRxMutation } from './use-rx';
import { NumberInput } from '@/components/forms/number-input';
import { isQuantity, parseNumberText } from '@/utils/numbers';

interface Row extends Omit<RxItem, 'quantity'> { key: number; quantity: string }
const empty = (key: number): Row => ({ key, label: '', dosage: '', frequency: '', duration: '', quantity: '1', instructions: '' });

export function NewRxDialog({ onClose, onCreated, initialPatientId, consultationId }: { onClose: () => void; onCreated: (r: Rx) => void; initialPatientId?: string; consultationId?: string }) {
  const { t } = useTranslation('prescriptions');
  const [patientId, setPatientId] = useState(initialPatientId ?? '');
  const [rows, setRows] = useState<Row[]>([empty(1)]);
  const [note, setNote] = useState('');
  const [consult, setConsult] = useState(consultationId ?? '');
  const snap = useFinanceSnapshot();
  const money = useMoney();
  // Suggestions : produits de la pharmacie du catalogue. La saisie libre reste possible (produit hors catalogue).
  const drugs = useMemo(() => (snap.data?.catalog ?? []).filter((c) => c.category === 'pharmacy').map((c) => ({ value: c.label, hint: `${c.code} · ${money(c.price.minor, c.price.currency)}` })), [snap.data, money]);
  const create = useRxMutation(rx.create, { successTitle: t('done.create'), onDone: onCreated });
  const set = (key: number, patch: Partial<Row>): void => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const items: RxItem[] = rows.map(({ key: _k, quantity, ...rest }) => { void _k; return { ...rest, quantity: parseNumberText(quantity) }; });
  const ready = patientId !== '' && rows.every((r) => r.label.trim() && r.dosage.trim() && r.frequency.trim() && isQuantity(parseNumberText(r.quantity)));
  return (
    <Dialog open onClose={onClose} title={t('create.title')} description={t('create.description')}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('create.cancel')}</Button>
        <Button loading={create.isPending} disabled={!ready} onClick={() => create.mutate({ patientId, items, note, consultationId: consult.trim() || undefined })}>{t('create.submit')}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label={t('columns.patient')} required>
          {(c) => (
            <PatientPicker {...c} value={patientId} onChange={setPatientId} disabled={Boolean(initialPatientId)} />
          )}
        </FormField>
        <p className="text-xs text-muted-foreground">{t('create.notice')}</p>
        {rows.map((r, index) => (
          <fieldset key={r.key} className="space-y-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">{t('create.line', { n: index + 1 })}</legend>
            <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
              <FormField label={t('fields.product')} required>{(c) => <SuggestInput {...c} suggestions={drugs} value={r.label} onChange={(v) => set(r.key, { label: v })} placeholder={t('create.drugPlaceholder')} />}</FormField>
              <FormField label={t('fields.quantity')} required>{(c) => <NumberInput {...c} decimal value={r.quantity} onValueChange={(v) => set(r.key, { quantity: v })} />}</FormField>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <FormField label={t('fields.dosage')} required>{(c) => <Input {...c} value={r.dosage} onChange={(e) => set(r.key, { dosage: e.target.value })} />}</FormField>
              <FormField label={t('fields.frequency')} required>{(c) => <Input {...c} value={r.frequency} onChange={(e) => set(r.key, { frequency: e.target.value })} />}</FormField>
              <FormField label={t('fields.duration')}>{(c) => <Input {...c} value={r.duration} onChange={(e) => set(r.key, { duration: e.target.value })} />}</FormField>
            </div>
            <FormField label={t('fields.instructions')}>{(c) => <Input {...c} value={r.instructions} onChange={(e) => set(r.key, { instructions: e.target.value })} />}</FormField>
            <Button size="sm" variant="ghost" disabled={rows.length === 1} leftIcon={<Trash2 className="size-4" />} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>{t('create.removeLine')}</Button>
          </fieldset>
        ))}
        <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => setRows([...rows, empty(Math.max(...rows.map((x) => x.key)) + 1)])}>{t('create.addLine')}</Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('create.consultation')} hint={t('create.consultationHint')}>{(c) => <Input {...c} value={consult} onChange={(e) => setConsult(e.target.value)} />}</FormField>
          <FormField label={t('create.note')}>{(c) => <Textarea {...c} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</FormField>
        </div>
      </div>
    </Dialog>
  );
}
