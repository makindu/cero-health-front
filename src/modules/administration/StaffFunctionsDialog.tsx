import { CheckCheck, ListPlus, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/form-field';
import { Input, Select } from '@/components/forms/controls';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { STAFF_TYPES } from './staff-api';
import { addSuggestedFunctions, createStaffFunction, deleteStaffFunction, useFunctionMutation, useStaffFunctions } from './staff-functions';

/**
 * Fonctions du personnel de l'établissement : on en crée, on en supprime (si personne ne l'utilise) et on ajoute d'un coup des fonctions courantes.
 * Chaque fonction se comporte comme un type commun (médecin, technicien de laboratoire…), qui décide des règles métier.
 */
export function StaffFunctionsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('administration');
  const data = useStaffFunctions();
  const [label, setLabel] = useState('');
  const [baseType, setBaseType] = useState('other');
  const [picked, setPicked] = useState<string[]>([]);
  const typeName = (k: string): string => t(`staff.types.${k}`, { defaultValue: k });
  const add = useFunctionMutation(createStaffFunction, { successTitle: t('functions.added'), onDone: () => setLabel('') });
  const addMany = useFunctionMutation(addSuggestedFunctions, { successTitle: t('functions.added'), onDone: () => setPicked([]) });
  const remove = useFunctionMutation(deleteStaffFunction, { successTitle: t('functions.deleted') });
  const functions = data.data?.functions ?? [];
  const open = (data.data?.suggestions ?? []).filter((s) => !s.added);
  const toggle = (key: string): void => setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  return (
    <Dialog open onClose={onClose} wide title={t('functions.title')} description={t('functions.hint')} footer={<Button variant="outline" onClick={onClose}>{t('functions.close')}</Button>}>
      <div className="space-y-5">
        <section aria-labelledby="fn-mine" className="space-y-2">
          <h3 id="fn-mine" className="text-sm font-semibold">{t('functions.custom')}</h3>
          {functions.length === 0 ? <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">{t('functions.empty')}</p> : (
            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {functions.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{f.label}</span>
                    <span className="block text-xs text-muted-foreground">{typeName(f.baseType)}{f.used > 0 ? ` · ${t('functions.inUse', { count: f.used })}` : ''}</span>
                  </span>
                  <Button size="sm" variant="ghost" disabled={f.used > 0 || remove.isPending} aria-label={`${t('functions.delete')} ${f.label}`} title={f.used > 0 ? t('functions.inUseHint') : t('functions.delete')}
                    onClick={() => remove.mutate(f.id)}><Trash2 className="size-4" aria-hidden /></Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="fn-add" className="space-y-3 border-t border-border pt-5">
          <h3 id="fn-add" className="text-sm font-semibold">{t('functions.addTitle')}</h3>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (label.trim().length >= 2 && !add.isPending) add.mutate({ label, baseType }); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t('functions.label')}>
                {(c) => <Input {...c} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />}
              </FormField>
              <FormField label={t('functions.baseType')}>
                {(c) => (
                  <Select {...c} value={baseType} onChange={(e) => setBaseType(e.target.value)}>
                    {STAFF_TYPES.map((k) => <option key={k} value={k}>{typeName(k)}</option>)}
                  </Select>
                )}
              </FormField>
            </div>
            <p className="text-xs text-muted-foreground">{t('functions.baseTypeHint')}</p>
            <div className="flex justify-end">
              <Button type="submit" leftIcon={<Plus className="size-4" aria-hidden />} loading={add.isPending} disabled={label.trim().length < 2}>{t('functions.add')}</Button>
            </div>
          </form>
        </section>

        <section aria-labelledby="fn-suggested" className="space-y-3 border-t border-border pt-5">
          <h3 id="fn-suggested" className="text-sm font-semibold">{t('functions.suggested')}</h3>
          {open.length === 0 ? <p className="text-sm text-muted-foreground">{t('functions.allAdded')}</p> : (
            <>
              <p className="text-xs text-muted-foreground">{t('functions.suggestedHint')}</p>
              <div className="grid max-h-56 gap-x-4 gap-y-1.5 overflow-y-auto sm:grid-cols-2">
                {open.map((s) => (
                  <label key={s.key} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5" checked={picked.includes(s.key)} onChange={() => toggle(s.key)} />
                    <span>{s.label}<span className="block text-xs text-muted-foreground">{typeName(s.baseType)}</span></span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" leftIcon={picked.length === open.length ? <X className="size-4" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />} onClick={() => setPicked(picked.length === open.length ? [] : open.map((s) => s.key))}>
                  {picked.length === open.length ? t('functions.selectNone') : t('functions.selectAll')}
                </Button>
                <Button size="sm" leftIcon={<ListPlus className="size-4" aria-hidden />} loading={addMany.isPending} disabled={picked.length === 0} onClick={() => addMany.mutate(picked)}>{t('functions.addSelected', { count: picked.length })}</Button>
              </div>
            </>
          )}
        </section>
      </div>
    </Dialog>
  );
}
