import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { ActionFormDialog } from '../_shared/action-form-dialog';
import { triageService, type TriageEntry } from './data';

/**
 * Le médecin valide les soins d'un patient en triage, avec une consigne écrite facultative.
 * Tant que ce n'est pas fait, l'infirmier ne peut démarrer aucun soin (le serveur le refuse aussi).
 */
export function ValidateCareButton({ entry }: { entry: TriageEntry }) {
  const { t } = useTranslation('nursing');
  const [open, setOpen] = useState(false);
  return (
    <Can permission={PERMISSIONS.nursing.validateCare}>
      <Button size="sm" variant="primary" leftIcon={<ShieldCheck className="size-4" />} onClick={() => setOpen(true)}>
        {t('validateCare.button', { defaultValue: 'Valider les soins' })}
      </Button>
      <ActionFormDialog
        open={open}
        onClose={() => setOpen(false)}
        invalidate={['triage']}
        title={t('validateCare.title', { defaultValue: 'Valider les soins' })}
        description={t('validateCare.hint', { name: entry.patientName, defaultValue: 'Vous autorisez l\'infirmier à démarrer les soins de {{name}}. La consigne est facultative.' })}
        submitLabel={t('validateCare.submit', { defaultValue: 'Valider' })}
        fields={[{ name: 'instructions', label: t('validateCare.instructions', { defaultValue: 'Consigne pour l\'infirmier' }), type: 'textarea', span: 2 }]}
        execute={(v) => triageService.command(entry.id, 'validate-care', { instructions: v.instructions ?? '' })}
      />
    </Can>
  );
}
