import { ApiError } from '@/core/api';
import type { ApiMapping } from '../_shared/resource-service';
import type { VitalsRecord } from './local-rules';

/** Champ de l'interface -> champ du serveur (bornes de plausibilité vérifiées par le serveur). */
const FIELDS = {
  temperature: 'temperature_c',
  pulse: 'pulse_bpm',
  systolic: 'systolic_mmhg',
  diastolic: 'diastolic_mmhg',
  respiratoryRate: 'respiratory_rate',
  spo2: 'spo2_percent',
  weight: 'weight_kg',
} as const;

const invalid = (message: string): never => {
  throw new ApiError('validation', message, { source: 'health', status: 422, code: 'invalid_input' });
};

/**
 * Constantes vitales d'un patient : GET/POST /patients/{patient}/vital-signs (ajout seul : une correction est une nouvelle ligne).
 * La saisie est rattachée à l'entrée de triage en cours. Le serveur fixe l'auteur et l'heure ; la note libre n'existe pas côté serveur.
 */
export function vitalsApi(patientId: string, triageEntryId: string): ApiMapping<VitalsRecord> {
  return {
    endpoint: `/patients/${encodeURIComponent(patientId)}/vital-signs`,
    fromApi: (r) => {
      const record: VitalsRecord = {
        id: String(r.id),
        entryId: r.triage_entry_id == null ? '' : String(r.triage_entry_id),
        recordedAt: String(r.recorded_at ?? ''),
        recordedBy: '',
      };
      for (const [front, back] of Object.entries(FIELDS)) {
        if (r[back] !== null && r[back] !== undefined) (record as unknown as Record<string, number>)[front] = Number(r[back]);
      }
      return record;
    },
    toApi: (i) => {
      const body: Record<string, unknown> = { triage_entry_id: Number(triageEntryId) };
      let count = 0;
      for (const [front, back] of Object.entries(FIELDS)) {
        const raw = (i[front] ?? '').trim().replace(',', '.');
        if (raw === '') continue;
        const value = Number(raw);
        if (!Number.isFinite(value)) invalid('Valeur numérique attendue.');
        body[back] = value;
        count += 1;
      }
      if (count === 0) invalid('Saisissez au moins une constante.');
      return body;
    },
    mapFilter: () => null, // l'API liste par patient : aucun filtre
  };
}
