import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { env } from '@/core/config/env';
import { DemoNotice } from '../_shared/demo-notice';
import { DynamicForm, type FieldDef } from '../_shared/dynamic-form';
import { useFormSubmit } from '../_shared/form-dialog';
import { DEMO_FACILITY, facilityService } from './data';

/** Paramètres de l'établissement. Valeurs de démonstration seulement quand l'API HEALTH n'est pas configurée. */
export function FacilityForm() {
  const { t } = useTranslation('administration');
  const demo = env.previewMode && !env.api.health;
  const { submit, pending } = useFormSubmit('facility', facilityService);

  const fields: FieldDef[] = [
    { name: 'name', label: t('facility.name'), type: 'text', required: true, span: 2 },
    {
      name: 'type',
      label: t('facility.type'),
      type: 'select',
      required: true,
      options: (['hospital', 'healthCenter', 'clinic', 'dispensary'] as const).map((k) => ({ value: k, label: t(`facility.types.${k}`) })),
    },
    { name: 'phone', label: t('facility.phone'), type: 'tel' },
    { name: 'email', label: t('facility.email'), type: 'email' },
    { name: 'address', label: t('facility.address'), type: 'text' },
    { name: 'timeZone', label: t('facility.timeZone'), type: 'text', hint: t('facility.timeZoneHint') },
    { name: 'currency', label: t('facility.currency'), type: 'text', hint: t('facility.currencyHint') },
  ];

  return (
    <div>
      {demo && <DemoNotice endpoint={facilityService.endpoint} />}
      <Card title={t('facility.title')} description={t('facility.description')}>
        <DynamicForm
          fields={fields}
          defaultValues={demo ? DEMO_FACILITY : undefined}
          submitLabel={t('facility.save')}
          submitting={pending}
          onSubmit={submit}
        />
      </Card>
    </div>
  );
}
