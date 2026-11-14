import { useTranslation } from 'react-i18next';
import { ActionFormDialog } from '../_shared/action-form-dialog';
import { DuplicateWarning } from './DuplicateWarning';
import { patientService, type Patient } from './data';
import { findDuplicatesOf } from './duplicates';
import { usePatientFields } from './form-fields';

/** Recherche des dossiers existants proches d'une saisie. N'empêche jamais l'enregistrement si la recherche échoue. */
async function lookup(values: Record<string, string>, selfId?: string) {
  const queries = [values.fileNumber, values.phone].map((v) => (v ?? '').trim()).filter(Boolean);
  try {
    const pages = await Promise.all(
      queries.map((search) => patientService.list({ page: 1, perPage: 20, search, filters: {}, sort: null })),
    );
    return findDuplicatesOf(
      { id: selfId, phone: values.phone ?? '', fileNumber: values.fileNumber ?? '' },
      pages.flatMap((page) => page.rows),
    );
  } catch {
    return [];
  }
}

export function PatientCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('patients');
  const fields = usePatientFields();
  return (
    <ActionFormDialog
      open={open}
      onClose={onClose}
      invalidate={['patients']}
      title={t('create.title')}
      submitLabel={t('create.submit')}
      overrideLabel={t('duplicates.createAnyway')}
      fields={fields}
      execute={(values) => patientService.create(values)}
      validate={async (values) => {
        const matches = await lookup(values);
        return matches.length > 0 ? { message: <DuplicateWarning matches={matches} />, overridable: true } : null;
      }}
    />
  );
}

export function PatientEditDialog({ patient, open, onClose }: { patient: Patient; open: boolean; onClose: () => void }) {
  const { t } = useTranslation('patients');
  const fields = usePatientFields();
  return (
    <ActionFormDialog
      open={open}
      onClose={onClose}
      invalidate={['patients']}
      title={t('edit.title')}
      description={t('edit.hint')}
      submitLabel={t('edit.submit')}
      overrideLabel={t('duplicates.saveAnyway')}
      fields={fields}
      defaultValues={{
        fullName: patient.fullName,
        sex: patient.sex,
        birthDate: patient.birthDate,
        phone: patient.phone,
        fileNumber: patient.fileNumber,
        service: patient.service,
        address: patient.address,
        insurer: patient.insurer,
        emergencyContact: patient.emergencyContact,
      }}
      execute={(values) => patientService.update(patient.id, values)}
      validate={async (values) => {
        const matches = await lookup(values, patient.id);
        return matches.length > 0 ? { message: <DuplicateWarning matches={matches} />, overridable: true } : null;
      }}
    />
  );
}
