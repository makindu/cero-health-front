import { useQuery } from '@tanstack/react-query';
import { healthClient } from '@/core/api';
import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { queryKeys } from '@/core/api/query-client';
import { env } from '@/core/config/env';
import { usePreferences } from '@/core/preferences/preferences-store';
import { ensureReference } from '../_shared/reference-data';
import { localRepositoryFor } from '../_shared/resource-service';
import { authorName, VITALS_API_FIELDS as API_FIELDS } from './record-api';
import { triageRepo } from '../nursing/data';
import type { VitalsRecord } from '../nursing/local-rules';
import { VITALS_COLLECTION } from '../nursing/VitalsHistory';
import type { Vitals } from './clinical/model';

/** Une prise de constantes au triage, exprimée dans les champs (texte) de l'examen clinique. */
export interface TriageReading { id: string; entryId: string; recordedAt: string; author: string; values: Partial<Vitals> }

const KEYS = ['systolic', 'diastolic', 'pulse', 'temperature', 'respiratoryRate', 'spo2', 'weight'] as const;

/** Convertit un enregistrement du triage (nombres) en valeurs de formulaire ; ne garde que ce qui a été réellement mesuré. */
export function toReading(r: Pick<VitalsRecord, 'id' | 'entryId' | 'recordedAt' | 'recordedBy'> & Partial<Record<(typeof KEYS)[number], number>>): TriageReading {
  const values: Partial<Vitals> = {};
  for (const k of KEYS) if (r[k] !== undefined && Number.isFinite(r[k])) values[k] = String(r[k]);
  return { id: r.id, entryId: r.entryId, recordedAt: r.recordedAt, author: r.recordedBy, values };
}

const sameDay = (a: string, b: string): boolean => new Date(a).toDateString() === new Date(b).toDateString();

/** Dernière prise du jour de la consultation (la plus récente) : c'est celle qui est reprise automatiquement. */
export function latestReadingOn(readings: readonly TriageReading[], day: string): TriageReading | undefined {
  return [...readings].filter((r) => sameDay(r.recordedAt, day) && Object.keys(r.values).length > 0).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
}

const vitalsRepo = localRepositoryFor<VitalsRecord>(HEALTH_ENDPOINTS.triage.collection, [], VITALS_COLLECTION);

/** Mode local : constantes prises au triage pour ce patient (ou pour la fiche de triage liée à la consultation). */
export function useLocalTriageVitals(patientId: string, triageEntryId?: string) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'triage', 'consultation-vitals', patientId, triageEntryId ?? ''),
    enabled: env.localMode,
    queryFn: async (): Promise<TriageReading[]> => {
      const entries = await triageRepo.list();
      const ids = new Set(entries.filter((e) => (triageEntryId ? e.id === triageEntryId : e.patientId === patientId)).map((e) => e.id));
      return (await vitalsRepo.list()).filter((v) => ids.has(v.entryId)).map(toReading);
    },
  });
}

/** Prises de constantes du serveur -> lectures de l'examen. Une ligne corrigée par une autre est écartée (ajout seul côté serveur). */
export function readingsFromApi(rows: readonly Record<string, unknown>[], nameOf: (userId: unknown) => string): TriageReading[] {
  const corrected = new Set(rows.map((r) => r.corrects_vital_sign_id).filter((v) => v !== null && v !== undefined).map(String));
  return rows
    .filter((r) => !corrected.has(String(r.id)))
    .map((r) => {
      const values: Partial<Vitals> = {};
      for (const [key, field] of Object.entries(API_FIELDS) as [keyof Vitals, string][]) {
        const raw = r[field];
        if (raw !== null && raw !== undefined && Number.isFinite(Number(raw))) values[key] = String(Number(raw));
      }
      return { id: String(r.id), entryId: r.triage_entry_id == null ? '' : String(r.triage_entry_id), recordedAt: String(r.recorded_at ?? ''), author: nameOf(r.recorded_by_user_id), values };
    });
}

/** API réelle : constantes prises pour ce patient (au triage ou ailleurs), relues quand le serveur signale un changement. */
export function useApiPatientVitals(patientId: string) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'triage-vitals', 'patient', patientId),
    enabled: !env.localMode && patientId !== '',
    queryFn: async (): Promise<TriageReading[]> => {
      await ensureReference();
      const res = await healthClient.get<Record<string, unknown>[]>(`/patients/${encodeURIComponent(patientId)}/vital-signs?per_page=50`);
      return readingsFromApi(Array.isArray(res.data) ? res.data : [], authorName);
    },
  });
}
