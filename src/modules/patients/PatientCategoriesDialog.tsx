import { Plus, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { ActionFormDialog } from '../_shared/action-form-dialog';
import type { FieldDef } from '../_shared/dynamic-form';
import { patientCategoryService, usePatientCategories } from './category-data';
import type { PatientCategory } from './categories';

/**
 * Configuration des catégories de patients. Ajouter une catégorie = remplir ce formulaire (libellé + obligations),
 * sans modifier le code : les règles de paiement lisent ces réglages.
 */
export function PatientCategoriesButton() {
  const { t } = useTranslation('patients');
  const [open, setOpen] = useState(false);
  return (
    <Can permission={PERMISSIONS.administration.manageSettings}>
      <Button variant="outline" leftIcon={<Settings2 className="size-4" />} onClick={() => setOpen(true)}>{t('categories.button')}</Button>
      {open && <CategoriesDialog onClose={() => setOpen(false)} />}
    </Can>
  );
}

function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('patients');
  const { all } = usePatientCategories();
  const [editing, setEditing] = useState<PatientCategory | 'new' | null>(null);
  const yesNo = [{ value: 'true', label: t('categories.yes') }, { value: 'false', label: t('categories.no') }];
  const fields: FieldDef[] = [
    { name: 'label', label: t('categories.label'), type: 'text', required: true, span: 2 },
    { name: 'description', label: t('categories.description'), type: 'text', span: 2 },
    { name: 'payConsultation', label: t('categories.payConsultation'), type: 'select', required: true, options: yesNo },
    { name: 'payLab', label: t('categories.payLab'), type: 'select', required: true, options: yesNo },
    { name: 'payMedication', label: t('categories.payMedication'), type: 'select', required: true, options: yesNo },
    ...(editing && editing !== 'new' ? [{ name: 'active', label: t('categories.active'), type: 'select' as const, required: true, options: yesNo }] : []),
  ];
  const flag = (v: boolean) => (v ? 'true' : 'false');
  const row = editing && editing !== 'new' ? editing : null;
  const obligation = (v: boolean) => <StatusBadge tone={v ? 'warning' : 'success'}>{v ? t('categories.mustPay') : t('categories.deferred')}</StatusBadge>;
  return (
    <Dialog open onClose={onClose} title={t('categories.title')} description={t('categories.hint')}>
      <div className="space-y-3">
        <ul className="space-y-2">
          {all.map((c) => (
            <li key={c.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{c.label} {!c.active && <StatusBadge tone="neutral">{t('categories.inactive')}</StatusBadge>}</p>
                <Button size="sm" variant="outline" onClick={() => setEditing(c)}>{t('categories.edit')}</Button>
              </div>
              {c.description && <p className="text-muted-foreground">{c.description}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span>{t('categories.consultation')} : {obligation(c.payConsultation)}</span>
                <span>{t('categories.lab')} : {obligation(c.payLab)}</span>
                <span>{t('categories.medication')} : {obligation(c.payMedication)}</span>
              </div>
            </li>
          ))}
        </ul>
        <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>{t('categories.add')}</Button>
        <p className="text-xs text-muted-foreground">{t('categories.hospitalizedNote')}</p>
      </div>
      {editing && (
        <ActionFormDialog
          key={row?.id ?? 'new'}
          open
          onClose={() => setEditing(null)}
          invalidate={['patient-categories', 'patients']}
          title={row ? t('categories.editTitle', { name: row.label }) : t('categories.addTitle')}
          submitLabel={t('categories.save')}
          fields={fields}
          defaultValues={row
            ? { label: row.label, description: row.description, payConsultation: flag(row.payConsultation), payLab: flag(row.payLab), payMedication: flag(row.payMedication), active: flag(row.active) }
            : { payConsultation: 'true', payLab: 'true', payMedication: 'true' }}
          execute={(v) => (row ? patientCategoryService.update(row.apiId ?? row.id, v) : patientCategoryService.create(v))}
        />
      )}
    </Dialog>
  );
}
