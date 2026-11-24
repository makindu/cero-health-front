import { useState } from 'react';
import { MultiPicker } from '@/components/forms/autocomplete';
import { PatientPicker } from '../_shared/pickers';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { Input, Select, Textarea } from '@/components/forms/controls';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { referenceFromApi } from '../_shared/reference-data';
import { apiLab } from './lab-api';
import { lab } from './lab';
import type { LabOrderView } from './lab-service';
import { useLabCatalog, useLabMutation } from './use-lab';

export function NewLabOrderDialog({ onClose, onCreated, initialPatientId, consultationId, visitId }: { onClose: () => void; onCreated: (v: LabOrderView) => void; initialPatientId?: string; consultationId?: string; visitId?: string }) {
  const { t } = useTranslation('laboratory');
  const catalog = useLabCatalog();
  const [patientId, setPatientId] = useState(initialPatientId ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [priority, setPriority] = useState<'routine' | 'urgent'>('routine');
  const [note, setNote] = useState('');
  const [consult, setConsult] = useState(consultationId ?? '');
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const addMissing = useLabMutation(apiLab.addTest, {
    successTitle: t('create.addedMissing'),
    onDone: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'laboratory', 'catalog') });
    },
  });
  const create = useLabMutation(lab.order, { successTitle: t('done.order'), onDone: onCreated });
  const ready = patientId !== '' && selected.length > 0;
  return (
    <Dialog open onClose={onClose} title={t('create.title')} description={t('create.description')}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('create.cancel')}</Button>
        <Button loading={create.isPending} disabled={!ready} onClick={() => create.mutate({ patientId, testItemIds: selected, priority, clinicalNote: note, consultationId: consult.trim() || undefined, visitId })}>{t('create.submit')}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label={t('columns.patient')} required>
          {(c) => (
            <PatientPicker {...c} value={patientId} onChange={setPatientId} disabled={Boolean(initialPatientId)} />
          )}
        </FormField>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('create.tests')}</legend>
          <MultiPicker<{ id: string; label: string; code?: string }> items={catalog.data ?? []} value={selected} onChange={setSelected} getKey={(c) => c.id} getLabel={(c) => c.label}
            getSearch={(c) => `${c.label} ${c.code ?? ''}`} emptyText={t('module.itemNoMatch')} placeholder={t('module.itemSearchPlaceholder')} removeLabel={t('module.remove')} aria-label={t('create.tests')}
            onCreate={referenceFromApi() ? (label) => addMissing.mutateAsync(label) : undefined} createLabel={(text) => t('create.addOption', { label: text })} alreadyText={t('create.alreadyAdded')} />
          {catalog.data?.length === 0 && <p className="text-sm text-muted-foreground">{t('create.noCatalog')}</p>}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('columns.priority')}>
            {(c) => (
              <Select {...c} value={priority} onChange={(e) => setPriority(e.target.value as 'routine' | 'urgent')}>
                <option value="routine">{t('priority.routine')}</option>
                <option value="urgent">{t('priority.urgent')}</option>
              </Select>
            )}
          </FormField>
          {!visitId && <FormField label={t('create.consultation')} hint={t('create.consultationHint')}>{(c) => <Input {...c} value={consult} onChange={(e) => setConsult(e.target.value)} />}</FormField>}
        </div>
        <FormField label={t('create.note')}>{(c) => <Textarea {...c} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</FormField>
        {!referenceFromApi() && <p className="text-xs text-muted-foreground">{t('create.invoiceNotice')}</p>}
      </div>
    </Dialog>
  );
}
