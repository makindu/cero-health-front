import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Patient } from './data';
import type { DuplicateReason } from './duplicates';

/** Liste de dossiers qui ressemblent à celui en cours (même téléphone ou même numéro de dossier). */
export function DuplicateWarning({ matches }: { matches: readonly { reason: DuplicateReason; patient: Patient }[] }) {
  const { t } = useTranslation('patients');
  return (
    <div className="space-y-2">
      <p className="font-medium">{t('duplicates.found', { count: matches.length })}</p>
      <ul className="space-y-1">
        {matches.map(({ reason, patient }) => (
          <li key={`${reason}-${patient.id}`}>
            <Link to={`/patients/${encodeURIComponent(patient.id)}`} className="underline">
              {patient.fullName} · {patient.fileNumber}
            </Link>{' '}
            <span className="text-xs">({t(`duplicates.reason.${reason}`)})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
