import { useTranslation } from 'react-i18next';
import { SERVICE_KEYS } from '../_shared/demo-people';
import type { FieldDef } from '../_shared/dynamic-form';
import { FILE_NUMBER_PATTERN } from './duplicates';

/** Champs administratifs d'un patient, communs à la création et à la modification (aucune donnée clinique). */
export function usePatientFields(): FieldDef[] {
  const { t } = useTranslation('patients');
  const serviceOptions = SERVICE_KEYS.map((key) => ({ value: key, label: t(`services.${key}`) }));
  return [
    { name: 'fullName', label: t('fields.fullName'), type: 'text', required: true, span: 2 },
    { name: 'sex', label: t('fields.sex'), type: 'select', required: true, options: [{ value: 'F', label: t('sex.F') }, { value: 'M', label: t('sex.M') }] },
    { name: 'birthDate', label: t('fields.birthDate'), type: 'date', required: true },
    { name: 'phone', label: t('fields.phone'), type: 'tel' },
    { name: 'fileNumber', label: t('fields.fileNumber'), type: 'text', hint: t('fields.fileNumberHint'), pattern: FILE_NUMBER_PATTERN, patternMessage: 'validation.fileNumber' },
    { name: 'service', label: t('fields.service'), type: 'select', options: serviceOptions },
    { name: 'address', label: t('fields.address'), type: 'text', span: 2 },
    { name: 'insurer', label: t('fields.insurer'), type: 'text' },
    { name: 'emergencyContact', label: t('fields.emergencyContact'), type: 'text' },
  ];
}
