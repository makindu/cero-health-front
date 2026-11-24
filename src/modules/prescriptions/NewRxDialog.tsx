import { Plus, Trash2 } from 'lucide-react';
import { PatientPicker } from '../_shared/pickers';
import { useMemo, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { Input, Textarea } from '@/components/forms/controls';
import { SuggestInput, type Suggestion } from '@/components/forms/suggest-input';
import { referenceFromApi } from '../_shared/reference-data';
import { addDrug, useDrugSuggestions, type DrugSuggestion } from './drug-suggestions';
import { Autocomplete } from '@/components/forms/autocomplete';
import { useToast } from '@/components/feedback/toast';
import { ApiError } from '@/core/api';
import { useMoney, useFinanceSnapshot } from '../finance/use-finance';
import { rx } from './rx';
import type { Rx, RxItem } from './rx-rules';
import { useRxMutation } from './use-rx';
import { NumberInput } from '@/components/forms/number-input';
import { isQuantity, parseNumberText } from '@/utils/numbers';
import { DraftNotice } from '@/components/feedback/draft-notice';
import { usePersistentState } from '@/core/drafts/use-persistent-state';

interface Row extends Omit<RxItem, 'quantity'> { key: number; quantity: string }
const empty = (key: number): Row => ({ key, label: '', dosage: '', frequency: '', duration: '', quantity: '1', instructions: '' });

/**
 * Désignation d'un médicament. API réelle : même recherche que les examens, avec les médicaments de la pharmacie et ceux déjà
 * prescrits ; un nom absent s'ajoute depuis la barre (« + Ajouter … ») et reste proposé aux confrères.
 * Mode local : saisie libre avec suggestions du catalogue.
 */
function DrugField({ local, value, onChange, ...rest }: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { local: readonly Suggestion[]; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation('prescriptions');
  const toast = useToast();
  const api = referenceFromApi();
  const [query, setQuery] = useState('');
  const remote = useDrugSuggestions(query);
  const items = useMemo<DrugSuggestion[]>(() => {
    const base = remote.data ?? [];
    // La valeur déjà choisie (ou restaurée d'un brouillon) doit toujours être reconnue, même hors des résultats de la recherche.
    return value && !base.some((d) => d.name === value) ? [{ name: value, source: 'prescribed' }, ...base] : base;
  }, [remote.data, value]);
  if (!api) return <SuggestInput {...rest} suggestions={local} value={value} onChange={onChange} placeholder={t('create.drugPlaceholder')} />;
  return (
    <Autocomplete<DrugSuggestion> {...rest} items={items} value={value} onChange={(key) => onChange(key)} getKey={(d) => d.name} getLabel={(d) => d.name} getSearch={(d) => d.name}
      renderOption={(d) => <span>{d.name}<span className="ms-2 text-xs text-muted-foreground">{t(`drugSource.${d.source}`)}</span></span>}
      emptyText={t('create.drugNoMatch')} placeholder={t('create.drugPlaceholder')} onQueryChange={setQuery}
      createLabel={(text) => t('create.addDrug', { label: text })}
      onCreate={async (text) => {
        try {
          const drug = await addDrug(text);
          onChange(drug.name);
        } catch (error) {
          toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('create.addDrugFailed') });
          throw error;
        }
      }} />
  );
}

export function NewRxDialog({ onClose, onCreated, initialPatientId, consultationId, visitId }: { onClose: () => void; onCreated: (r: Rx) => void; initialPatientId?: string; consultationId?: string; visitId?: string }) {
  const { t } = useTranslation('prescriptions');
  // Brouillon automatique : la saisie survit à une fermeture involontaire ou à une coupure (clé : patient + consultation d'origine).
  const [form, setForm, draft] = usePersistentState(`rx:new:${initialPatientId ?? ''}:${consultationId ?? ''}:${visitId ?? ''}`, {
    patientId: initialPatientId ?? '', rows: [empty(1)] as Row[], note: '', consult: consultationId ?? '',
  });
  const { patientId, rows, note, consult } = form;
  const setPatientId = (patientId: string): void => setForm((f) => ({ ...f, patientId }));
  const setRows = (rows: Row[]): void => setForm((f) => ({ ...f, rows }));
  const setNote = (note: string): void => setForm((f) => ({ ...f, note }));
  const setConsult = (consult: string): void => setForm((f) => ({ ...f, consult }));
  const snap = useFinanceSnapshot();
  const money = useMoney();
  // Suggestions : produits de la pharmacie du catalogue. La saisie libre reste possible (produit hors catalogue).
  const drugs = useMemo(() => (snap.data?.catalog ?? []).filter((c) => c.category === 'pharmacy').map((c) => ({ value: c.label, hint: `${c.code} · ${money(c.price.minor, c.price.currency)}` })), [snap.data, money]);
  const create = useRxMutation(rx.create, { successTitle: t('done.create'), onDone: (created) => { draft.clear(); onCreated(created); } });
  const set = (key: number, patch: Partial<Row>): void => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const items: RxItem[] = rows.map(({ key: _k, quantity, ...rest }) => { void _k; return { ...rest, quantity: parseNumberText(quantity) }; });
  const ready = patientId !== '' && rows.every((r) => r.label.trim() && r.dosage.trim() && r.frequency.trim() && isQuantity(parseNumberText(r.quantity)));
  return (
    <Dialog open onClose={onClose} title={t('create.title')} description={t('create.description')}
      footer={<>
        <Button variant="outline" onClick={() => { draft.clear(); onClose(); }}>{t('create.cancel')}</Button>
        <Button loading={create.isPending} disabled={!ready} onClick={() => create.mutate({ patientId, items, note, consultationId: consult.trim() || undefined, visitId })}>{t('create.submit')}</Button>
      </>}>
      <div className="space-y-4">
        {draft.restored && <DraftNotice onDiscard={draft.discard} />}
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
              <FormField label={t('fields.product')} required>{(c) => <DrugField {...c} local={drugs} value={r.label} onChange={(v) => set(r.key, { label: v })} />}</FormField>
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
          {!visitId && <FormField label={t('create.consultation')} hint={t('create.consultationHint')}>{(c) => <Input {...c} value={consult} onChange={(e) => setConsult(e.target.value)} />}</FormField>}
          <FormField label={t('create.note')}>{(c) => <Textarea {...c} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</FormField>
        </div>
      </div>
    </Dialog>
  );
}
